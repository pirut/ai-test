package local

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"rsc.io/qr"
)

const (
	hotspotAddress = "10.42.0.1"
	hotspotURL     = "http://" + hotspotAddress + "/"
	// How long an unclaimed screen stays offline before opening the hotspot,
	// so saved networks and Ethernet get a chance at boot.
	hotspotGrace = 30 * time.Second
	// While the hotspot is up and nobody is using it, saved networks are
	// retried this often (the radio cannot join and host at the same time).
	savedNetworkRetry = 3 * time.Minute
	phoneIdleBefore   = 2 * time.Minute
	networkCacheTTL   = 20 * time.Second
)

type hotspotInfo struct {
	SSID     string   `json:"ssid"`
	Password string   `json:"password"`
	URL      string   `json:"url"`
	JoinQR   []string `json:"joinQr,omitempty"`
	PageQR   []string `json:"pageQr,omitempty"`
}

// networkManager is the slice of NetworkManager the setup flow uses, so tests
// can run without nmcli.
type networkManager interface {
	devices(ctx context.Context) (deviceSummary, error)
	scan(ctx context.Context, iface string, rescan bool) ([]wifiNetwork, error)
	startHotspot(ctx context.Context, iface, ssid, password string) error
	stopHotspot(ctx context.Context) error
	connect(ctx context.Context, request wifiConfigureRequest) error
	savedWiFiCount(ctx context.Context) int
	hardwareSuffix(iface string) string
}

// wifiSetup owns first-time Wi-Fi setup: a cached scan list for the on-screen
// picker and, when enabled, a hotspot with a phone setup page.
type wifiSetup struct {
	nm             networkManager
	hotspotEnabled bool
	needsSetup     func() bool
	now            func() time.Time

	mu            sync.Mutex
	networks      []wifiNetwork
	scannedAt     time.Time
	scanning      bool
	connecting    bool
	attempt       *wifiAttempt
	active        bool
	activeSince   time.Time
	ssid          string
	password      string
	offlineSince  time.Time
	phoneActiveAt time.Time
	portal        *http.Server
	startPortal   func(handler http.Handler) (*http.Server, error)
	// onOnline runs when the screen gets a network, so pairing can start
	// at once instead of on its next poll.
	onOnline  func()
	wasOnline bool
}

func newWiFiSetup(nm networkManager, hotspotEnabled bool, needsSetup func() bool) *wifiSetup {
	return &wifiSetup{
		nm:             nm,
		hotspotEnabled: hotspotEnabled,
		needsSetup:     needsSetup,
		now:            time.Now,
		startPortal:    listenPortal,
	}
}

// Run drives the hotspot until ctx ends. It does nothing unless the image
// turned the hotspot on.
func (m *wifiSetup) Run(ctx context.Context) {
	if !m.hotspotEnabled {
		return
	}
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		m.tick(ctx)
		select {
		case <-ctx.Done():
			m.mu.Lock()
			m.stopLocked(context.Background())
			m.mu.Unlock()
			return
		case <-ticker.C:
		}
	}
}

func (m *wifiSetup) tick(ctx context.Context) {
	devices, err := m.nm.devices(ctx)
	if err != nil || devices.wifi == nil {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.connecting {
		return
	}
	now := m.now()
	online := devices.online()
	if online && !m.wasOnline {
		m.notifyOnline()
	}
	m.wasOnline = online
	if online || !m.needsSetup() {
		m.offlineSince = time.Time{}
		if m.active {
			log.Printf("wifi setup: online, closing setup hotspot")
			m.stopLocked(ctx)
		}
		return
	}

	if m.active {
		if !devices.hotspotUp() && now.Sub(m.activeSince) > 30*time.Second {
			log.Printf("wifi setup: hotspot dropped, reopening")
			m.startLocked(ctx, devices.wifi.name)
			return
		}
		if now.Sub(m.activeSince) >= savedNetworkRetry && now.Sub(m.phoneActiveAt) >= phoneIdleBefore && m.nm.savedWiFiCount(ctx) > 0 {
			// Give saved networks a turn; the grace period reopens the
			// hotspot if none of them come back.
			log.Printf("wifi setup: retrying saved networks")
			m.stopLocked(ctx)
			m.offlineSince = now
		}
		return
	}

	if m.offlineSince.IsZero() {
		m.offlineSince = now
		return
	}
	if now.Sub(m.offlineSince) < hotspotGrace {
		return
	}
	m.startLocked(ctx, devices.wifi.name)
}

func (m *wifiSetup) startLocked(ctx context.Context, iface string) {
	// Scan first: the radio cannot scan well while it hosts the hotspot.
	if networks, err := m.nm.scan(ctx, iface, true); err == nil {
		m.networks = networks
		m.scannedAt = m.now()
	}
	if m.ssid == "" {
		m.ssid = "Showroom-" + m.nm.hardwareSuffix(iface)
		m.password = randomPassword(8)
	}
	if err := m.nm.startHotspot(ctx, iface, m.ssid, m.password); err != nil {
		log.Printf("wifi setup: hotspot failed: %v", err)
		// Try again after another grace period rather than every tick.
		m.offlineSince = m.now()
		return
	}
	m.active = true
	m.activeSince = m.now()
	m.phoneActiveAt = time.Time{}
	if m.portal == nil && m.startPortal != nil {
		portal, err := m.startPortal(m.portalRoutes())
		if err != nil {
			log.Printf("wifi setup: setup page unavailable: %v", err)
		}
		m.portal = portal
	}
	log.Printf("wifi setup: hotspot %s is open", m.ssid)
}

func (m *wifiSetup) stopLocked(ctx context.Context) {
	if m.portal != nil {
		_ = m.portal.Close()
		m.portal = nil
	}
	if !m.active {
		return
	}
	m.active = false
	if err := m.nm.stopHotspot(ctx); err != nil {
		log.Printf("wifi setup: closing hotspot: %v", err)
	}
}

// connect joins a network, closing the hotspot first if it is open. On
// failure the hotspot reopens so the phone (or keyboard) can try again.
func (m *wifiSetup) connect(ctx context.Context, request wifiConfigureRequest) error {
	m.mu.Lock()
	if m.connecting {
		m.mu.Unlock()
		return errors.New("Already connecting. Try again in a moment.")
	}
	m.connecting = true
	wasActive := m.active
	if wasActive {
		m.stopLocked(ctx)
	}
	if known := m.knownNetworkLocked(request.SSID); known == nil && len(m.networks) > 0 {
		request.Hidden = true
	}
	m.mu.Unlock()

	err := m.nm.connect(ctx, request)

	m.mu.Lock()
	defer m.mu.Unlock()
	m.connecting = false
	attempt := &wifiAttempt{SSID: request.SSID, OK: err == nil, At: m.now().UTC().Format(time.RFC3339)}
	if err != nil {
		err = friendlyConnectError(request.SSID, err)
		attempt.Message = err.Error()
	}
	m.attempt = attempt
	if err != nil && wasActive && m.needsSetup() {
		if devices, devErr := m.nm.devices(ctx); devErr == nil && devices.wifi != nil && !devices.online() {
			m.startLocked(ctx, devices.wifi.name)
		}
	}
	if err == nil {
		m.offlineSince = time.Time{}
		m.wasOnline = true
		m.notifyOnline()
	}
	return err
}

func (m *wifiSetup) notifyOnline() {
	if m.onOnline != nil {
		go m.onOnline()
	}
}

func friendlyConnectError(ssid string, err error) error {
	message := err.Error()
	lower := strings.ToLower(message)
	switch {
	case strings.Contains(lower, "secrets were required") || strings.Contains(lower, "802-1x supplicant") ||
		strings.Contains(lower, "invalid password") || strings.Contains(lower, "psk: property is invalid"):
		return fmt.Errorf("Couldn't join %s. Check the password and try again.", ssid)
	case strings.Contains(lower, "no network with ssid"):
		return fmt.Errorf("Couldn't find %s. Move closer to the router or check the name.", ssid)
	case strings.Contains(lower, "timeout") || strings.Contains(lower, "timed out"):
		return fmt.Errorf("%s didn't answer in time. Try again.", ssid)
	}
	return errors.New(message)
}

// decorate adds the scan list and hotspot details to a status snapshot.
func (m *wifiSetup) decorate(status *wifiStatus) {
	if m == nil || !status.Supported || status.Interface == "" {
		return
	}
	// Only unclaimed screens show the picker, so screens in service never
	// scan on its behalf.
	if !status.Connected && m.needsSetup() {
		status.Networks = m.networkList(context.Background())
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	status.Connecting = m.connecting
	if m.attempt != nil {
		attempt := *m.attempt
		status.LastAttempt = &attempt
	}
	if m.active {
		status.Hotspot = m.hotspotInfoLocked()
	}
}

func (m *wifiSetup) hotspotInfoLocked() *hotspotInfo {
	return &hotspotInfo{
		SSID:     m.ssid,
		Password: m.password,
		URL:      hotspotURL,
		JoinQR:   qrRows(wifiQRPayload(m.ssid, m.password)),
		PageQR:   qrRows(hotspotURL),
	}
}

// networkList returns cached scan results, refreshing them in the background
// when stale. While the hotspot is up the cache is kept as is.
func (m *wifiSetup) networkList(ctx context.Context) []wifiNetwork {
	m.mu.Lock()
	stale := m.now().Sub(m.scannedAt) > networkCacheTTL
	networks := append([]wifiNetwork(nil), m.networks...)
	m.mu.Unlock()
	if stale {
		go m.refreshNetworks(context.Background(), false)
	}
	return networks
}

func (m *wifiSetup) refreshNetworks(ctx context.Context, rescan bool) {
	m.mu.Lock()
	if m.scanning || m.active || m.connecting {
		m.mu.Unlock()
		return
	}
	m.scanning = true
	m.mu.Unlock()

	var networks []wifiNetwork
	var err error
	devices, devErr := m.nm.devices(ctx)
	if devErr == nil && devices.wifi != nil {
		networks, err = m.nm.scan(ctx, devices.wifi.name, rescan)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.scanning = false
	if devErr == nil && devices.wifi != nil && err == nil {
		m.networks = networks
	}
	// Even a failed scan waits out the TTL so nmcli is not hammered.
	m.scannedAt = m.now()
}

func (m *wifiSetup) knownNetwork(ssid string) *wifiNetwork {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.knownNetworkLocked(ssid)
}

func (m *wifiSetup) knownNetworkLocked(ssid string) *wifiNetwork {
	for _, network := range m.networks {
		if network.SSID == ssid {
			found := network
			return &found
		}
	}
	return nil
}

func (m *wifiSetup) markPhoneActive() {
	m.mu.Lock()
	m.phoneActiveAt = m.now()
	m.mu.Unlock()
}

// wifiQRPayload is the Wi-Fi QR format phone cameras understand.
func wifiQRPayload(ssid, password string) string {
	escape := strings.NewReplacer(`\`, `\\`, `;`, `\;`, `,`, `\,`, `:`, `\:`, `"`, `\"`)
	return "WIFI:T:WPA;S:" + escape.Replace(ssid) + ";P:" + escape.Replace(password) + ";;"
}

// qrRows encodes text as QR modules, one string of 0s and 1s per row, so the
// players can draw it without a QR library.
func qrRows(text string) []string {
	code, err := qr.Encode(text, qr.M)
	if err != nil {
		return nil
	}
	rows := make([]string, code.Size)
	var row strings.Builder
	for y := 0; y < code.Size; y++ {
		row.Reset()
		for x := 0; x < code.Size; x++ {
			if code.Black(x, y) {
				row.WriteByte('1')
			} else {
				row.WriteByte('0')
			}
		}
		rows[y] = row.String()
	}
	return rows
}

// randomPassword avoids look-alike characters so it can be typed from the
// screen when a phone cannot scan the QR code.
func randomPassword(length int) string {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	var out strings.Builder
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			out.WriteByte(alphabet[i%len(alphabet)])
			continue
		}
		out.WriteByte(alphabet[n.Int64()])
	}
	return out.String()
}

// listenPortal serves the phone setup page on the hotspot address. The address
// appears a moment after NetworkManager brings the hotspot up.
func listenPortal(handler http.Handler) (*http.Server, error) {
	var listener net.Listener
	var err error
	for attempt := 0; attempt < 10; attempt++ {
		listener, err = net.Listen("tcp", hotspotAddress+":80")
		if err == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if err != nil {
		return nil, err
	}
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      20 * time.Second,
	}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("wifi setup: setup page stopped: %v", err)
		}
	}()
	return server, nil
}

// nmcli implements networkManager with NetworkManager's command line.
type nmcli struct{}

func (nmcli) devices(ctx context.Context) (deviceSummary, error) {
	return networkDevices(ctx)
}

func (nmcli) scan(ctx context.Context, iface string, rescan bool) ([]wifiNetwork, error) {
	return scanWiFiNetworks(ctx, iface, rescan)
}

func (nmcli) startHotspot(ctx context.Context, iface, ssid, password string) error {
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	_ = exec.CommandContext(ctx, "nmcli", "radio", "wifi", "on").Run()
	_ = exec.CommandContext(ctx, "nmcli", "connection", "delete", setupConnectionName).Run()
	add := []string{
		"connection", "add", "type", "wifi", "ifname", iface, "con-name", setupConnectionName,
		"autoconnect", "no", "ssid", ssid,
		"802-11-wireless.mode", "ap", "802-11-wireless.band", "bg", "802-11-wireless.channel", "6",
		"ipv4.method", "shared", "ipv4.addresses", hotspotAddress + "/24", "ipv6.method", "disabled",
		"wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password,
		"wifi-sec.proto", "rsn", "wifi-sec.pairwise", "ccmp", "wifi-sec.group", "ccmp",
		// Many phones fail to join a Raspberry Pi hotspot with PMF on.
		"wifi-sec.pmf", "disable",
	}
	if output, err := exec.CommandContext(ctx, "nmcli", add...).CombinedOutput(); err != nil {
		return commandError(err, output)
	}
	if output, err := exec.CommandContext(ctx, "nmcli", "--wait", "20", "connection", "up", setupConnectionName).CombinedOutput(); err != nil {
		_ = exec.CommandContext(ctx, "nmcli", "connection", "delete", setupConnectionName).Run()
		return commandError(err, output)
	}
	return nil
}

func (nmcli) stopHotspot(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, "nmcli", "connection", "delete", setupConnectionName).CombinedOutput()
	if err != nil {
		return commandError(err, output)
	}
	return nil
}

func (nmcli) connect(ctx context.Context, request wifiConfigureRequest) error {
	before := connectionNames(ctx)
	err := configureWiFi(ctx, request.SSID, request.Password, request.Priority, request.Hidden)
	if err != nil && !before[request.SSID] && connectionNames(ctx)[request.SSID] {
		// Don't keep a profile with a wrong password: it would keep
		// autoconnecting and failing.
		_ = exec.CommandContext(ctx, "nmcli", "connection", "delete", "id", request.SSID).Run()
	}
	return err
}

func (nmcli) savedWiFiCount(ctx context.Context) int {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, "nmcli", "--escape", "yes", "-t", "-f", "NAME,TYPE", "connection", "show").Output()
	if err != nil {
		return 0
	}
	count := 0
	for _, line := range strings.Split(string(output), "\n") {
		fields := splitNmcliFields(line)
		if len(fields) == 2 && fields[1] == "802-11-wireless" && fields[0] != setupConnectionName {
			count++
		}
	}
	return count
}

func (nmcli) hardwareSuffix(iface string) string {
	raw, err := os.ReadFile("/sys/class/net/" + iface + "/address")
	address := strings.ReplaceAll(strings.TrimSpace(string(raw)), ":", "")
	if err != nil || len(address) < 4 {
		return strings.ToUpper(randomPassword(4))
	}
	return strings.ToUpper(address[len(address)-4:])
}

func connectionNames(ctx context.Context) map[string]bool {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	names := map[string]bool{}
	output, err := exec.CommandContext(ctx, "nmcli", "-g", "NAME", "connection", "show").Output()
	if err != nil {
		return names
	}
	for _, line := range strings.Split(string(output), "\n") {
		// -g escapes colons; names here are compared whole.
		names[strings.ReplaceAll(strings.TrimSpace(line), `\:`, ":")] = true
	}
	return names
}

func commandError(err error, output []byte) error {
	message := strings.TrimSpace(string(output))
	if message == "" {
		return err
	}
	return errors.New(message)
}
