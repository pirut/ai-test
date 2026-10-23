package local

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"
)

// setupConnectionName is the NetworkManager profile for the setup hotspot. A
// Wi-Fi radio "connected" to it is hosting phones, not online.
const setupConnectionName = "showroom-setup"

type wifiStatus struct {
	Supported bool   `json:"supported"`
	Connected bool   `json:"connected"`
	Interface string `json:"interface,omitempty"`
	SSID      string `json:"ssid,omitempty"`
	Error     string `json:"error,omitempty"`

	// Setup details, filled in by wifiSetup. Older players ignore them.
	Networks    []wifiNetwork `json:"networks,omitempty"`
	Hotspot     *hotspotInfo  `json:"hotspot,omitempty"`
	Connecting  bool          `json:"connecting,omitempty"`
	LastAttempt *wifiAttempt  `json:"lastAttempt,omitempty"`
}

type wifiNetwork struct {
	SSID     string `json:"ssid"`
	Signal   int    `json:"signal"`
	Security string `json:"security,omitempty"`
	Secure   bool   `json:"secure"`
	InUse    bool   `json:"inUse,omitempty"`
}

type wifiAttempt struct {
	SSID    string `json:"ssid"`
	OK      bool   `json:"ok"`
	Message string `json:"message,omitempty"`
	At      string `json:"at"`
}

type wifiConfigureRequest struct {
	SSID     string `json:"ssid"`
	Password string `json:"password"`
	Priority int    `json:"priority,omitempty"`
	Hidden   bool   `json:"hidden,omitempty"`
}

func (s *Server) handleWiFiStatus(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Content-Type", "application/json")
	status := s.readWiFiStatus()
	_ = json.NewEncoder(w).Encode(status)
}

func (s *Server) handleWiFiNetworks(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Content-Type", "application/json")
	if r.URL.Query().Get("rescan") == "1" {
		s.wifi.refreshNetworks(r.Context(), true)
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"networks": nonNilNetworks(s.wifi.networkList(r.Context())),
	})
}

func (s *Server) handleWiFiConfigure(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request wifiConfigureRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	request.SSID = strings.TrimSpace(request.SSID)
	if request.Priority == 0 {
		request.Priority = 100
	}
	if message := validateWiFiRequest(request, s.wifi.knownNetwork(request.SSID)); message != "" {
		http.Error(w, message, http.StatusBadRequest)
		return
	}

	if err := s.wifi.connect(r.Context(), request); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(s.readWiFiStatus())
}

// validateWiFiRequest returns a message for the person typing, or "". Open
// networks need no password; known secured ones and WPA keys need 8 to 63.
func validateWiFiRequest(request wifiConfigureRequest, known *wifiNetwork) string {
	if request.SSID == "" {
		return "Choose a Wi-Fi network."
	}
	if len(request.SSID) > 32 {
		return "Wi-Fi names are at most 32 bytes."
	}
	if request.Password == "" {
		if known != nil && known.Secure {
			return "Enter the password for " + request.SSID + "."
		}
		return ""
	}
	if len(request.Password) < 8 || len(request.Password) > 63 {
		return "Wi-Fi passwords are 8 to 63 characters."
	}
	return ""
}

func (s *Server) readWiFiStatus() wifiStatus {
	status, err := wifiStatusSnapshot(context.Background())
	if err != nil {
		status = wifiStatus{Supported: false, Error: err.Error()}
	}
	s.wifi.decorate(&status)
	return status
}

func wifiStatusSnapshot(ctx context.Context) (wifiStatus, error) {
	devices, err := networkDevices(ctx)
	if err != nil {
		return wifiStatus{}, err
	}

	status := wifiStatus{Supported: true}
	wifi := devices.wifi
	if wifi == nil {
		status.Error = "no wifi interface found"
		return status, nil
	}
	status.Interface = wifi.name
	status.Connected = wifi.connected && wifi.connection != setupConnectionName
	if status.Connected {
		status.SSID = wifi.connection
	}
	return status, nil
}

type networkDevice struct {
	name       string
	kind       string
	connected  bool
	connection string
}

type deviceSummary struct {
	wifi  *networkDevice
	wired bool
}

// online reports a usable uplink: Ethernet, or Wi-Fi that is not the setup
// hotspot.
func (d deviceSummary) online() bool {
	return d.wired || (d.wifi != nil && d.wifi.connected && d.wifi.connection != setupConnectionName)
}

func (d deviceSummary) hotspotUp() bool {
	return d.wifi != nil && d.wifi.connected && d.wifi.connection == setupConnectionName
}

func networkDevices(ctx context.Context) (deviceSummary, error) {
	if _, err := exec.LookPath("nmcli"); err != nil {
		return deviceSummary{}, errors.New("nmcli not found")
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	output, err := exec.CommandContext(ctx, "nmcli", "--escape", "yes", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status").Output()
	if err != nil {
		return deviceSummary{}, err
	}
	return parseDeviceStatus(string(output)), nil
}

func parseDeviceStatus(output string) deviceSummary {
	var summary deviceSummary
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		fields := splitNmcliFields(line)
		if len(fields) < 3 {
			continue
		}
		device := networkDevice{
			name:      fields[0],
			kind:      fields[1],
			connected: fields[2] == "connected",
		}
		if len(fields) > 3 {
			device.connection = fields[3]
		}
		switch device.kind {
		case "wifi":
			if summary.wifi == nil {
				summary.wifi = &device
			}
		case "ethernet":
			if device.connected {
				summary.wired = true
			}
		}
	}
	return summary
}

// splitNmcliFields splits nmcli's terse output, where "\:" and "\\" are a
// literal colon and backslash inside a field.
func splitNmcliFields(line string) []string {
	var fields []string
	var current strings.Builder
	escaped := false
	for _, r := range line {
		switch {
		case escaped:
			current.WriteRune(r)
			escaped = false
		case r == '\\':
			escaped = true
		case r == ':':
			fields = append(fields, current.String())
			current.Reset()
		default:
			current.WriteRune(r)
		}
	}
	return append(fields, current.String())
}

func scanWiFiNetworks(ctx context.Context, iface string, rescan bool) ([]wifiNetwork, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	args := []string{"--escape", "yes", "-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "auto"}
	if rescan {
		args[len(args)-1] = "yes"
	}
	if iface != "" {
		args = append(args, "ifname", iface)
	}
	output, err := exec.CommandContext(ctx, "nmcli", args...).Output()
	if err != nil {
		return nil, err
	}
	return parseWiFiList(string(output)), nil
}

// parseWiFiList keeps the strongest entry per name, drops hidden networks and
// sorts the joined network first, then by signal.
func parseWiFiList(output string) []wifiNetwork {
	byName := map[string]wifiNetwork{}
	for _, line := range strings.Split(output, "\n") {
		fields := splitNmcliFields(strings.TrimRight(line, "\r"))
		if len(fields) < 4 {
			continue
		}
		ssid := fields[1]
		if strings.TrimSpace(ssid) == "" {
			continue
		}
		signal, _ := strconv.Atoi(strings.TrimSpace(fields[2]))
		security := strings.TrimSpace(fields[3])
		if security == "--" {
			security = ""
		}
		network := wifiNetwork{
			SSID:     ssid,
			Signal:   signal,
			Security: security,
			Secure:   security != "",
			InUse:    strings.TrimSpace(fields[0]) == "*",
		}
		if existing, ok := byName[ssid]; ok {
			network.InUse = network.InUse || existing.InUse
			if existing.Signal >= network.Signal {
				existing.InUse = network.InUse
				network = existing
			}
		}
		byName[ssid] = network
	}

	networks := make([]wifiNetwork, 0, len(byName))
	for _, network := range byName {
		networks = append(networks, network)
	}
	sort.Slice(networks, func(i, j int) bool {
		if networks[i].InUse != networks[j].InUse {
			return networks[i].InUse
		}
		if networks[i].Signal != networks[j].Signal {
			return networks[i].Signal > networks[j].Signal
		}
		return strings.ToLower(networks[i].SSID) < strings.ToLower(networks[j].SSID)
	})
	return networks
}

func nonNilNetworks(networks []wifiNetwork) []wifiNetwork {
	if networks == nil {
		return []wifiNetwork{}
	}
	return networks
}

func ConfigureWiFi(ctx context.Context, ssid string, password string, priority int) error {
	return configureWiFi(ctx, ssid, password, priority, false)
}

func configureWiFi(ctx context.Context, ssid string, password string, priority int, hidden bool) error {
	if _, err := exec.LookPath("nmcli"); err != nil {
		return errors.New("nmcli not found")
	}

	status, err := wifiStatusSnapshot(ctx)
	if err != nil {
		return err
	}
	if !status.Supported {
		if status.Error != "" {
			return errors.New(status.Error)
		}
		return errors.New("wifi is not supported")
	}

	connectCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	_ = exec.CommandContext(connectCtx, "nmcli", "radio", "wifi", "on").Run()
	if status.Interface != "" {
		_ = exec.CommandContext(connectCtx, "nmcli", "device", "wifi", "rescan", "ifname", status.Interface).Run()
	}

	args := []string{"--wait", "30", "device", "wifi", "connect", ssid}
	if password != "" {
		args = append(args, "password", password)
	}
	if status.Interface != "" {
		args = append(args, "ifname", status.Interface)
	}
	if hidden {
		args = append(args, "hidden", "yes")
	}

	command := exec.CommandContext(connectCtx, "nmcli", args...)
	output, err := command.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			return err
		}
		return errors.New(message)
	}
	connectionName := strings.TrimSpace(ssid)
	_ = exec.CommandContext(connectCtx, "nmcli", "connection", "modify", connectionName,
		"connection.autoconnect", "yes",
		"connection.autoconnect-retries", "0",
		"connection.autoconnect-priority", strconv.Itoa(priority),
	).Run()

	return nil
}
