package local

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeNM struct {
	mu          sync.Mutex
	summary     deviceSummary
	networks    []wifiNetwork
	scans       int
	starts      int
	stops       int
	connectErr  error
	connected   []wifiConfigureRequest
	saved       int
	hotspotSSID string
}

func (f *fakeNM) devices(context.Context) (deviceSummary, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.summary, nil
}

func (f *fakeNM) scan(context.Context, string, bool) ([]wifiNetwork, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.scans++
	return f.networks, nil
}

func (f *fakeNM) startHotspot(_ context.Context, _ string, ssid, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.starts++
	f.hotspotSSID = ssid
	f.summary.wifi.connected = true
	f.summary.wifi.connection = setupConnectionName
	return nil
}

func (f *fakeNM) stopHotspot(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.stops++
	f.summary.wifi.connected = false
	f.summary.wifi.connection = ""
	return nil
}

func (f *fakeNM) connect(_ context.Context, request wifiConfigureRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.connected = append(f.connected, request)
	if f.connectErr == nil {
		f.summary.wifi.connected = true
		f.summary.wifi.connection = request.SSID
	}
	return f.connectErr
}

func (f *fakeNM) savedWiFiCount(context.Context) int { return f.saved }

func (f *fakeNM) hardwareSuffix(string) string { return "AB12" }

type setupHarness struct {
	nm      *fakeNM
	setup   *wifiSetup
	clock   time.Time
	unclaim bool
}

func newSetupHarness(enabled bool) *setupHarness {
	h := &setupHarness{
		nm: &fakeNM{
			summary: deviceSummary{wifi: &networkDevice{name: "wlan0", kind: "wifi"}},
			networks: []wifiNetwork{
				{SSID: "Showroom Guest", Signal: 80, Secure: true, Security: "WPA2"},
				{SSID: "Lobby", Signal: 40},
			},
		},
		clock:   time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC),
		unclaim: true,
	}
	h.setup = newWiFiSetup(h.nm, enabled, func() bool { return h.unclaim })
	h.setup.now = func() time.Time { return h.clock }
	h.setup.startPortal = func(http.Handler) (*http.Server, error) { return &http.Server{}, nil }
	return h
}

func (h *setupHarness) advance(d time.Duration) {
	h.clock = h.clock.Add(d)
	h.setup.tick(context.Background())
}

func TestHotspotOpensAfterGraceAndClosesWhenOnline(t *testing.T) {
	h := newSetupHarness(true)
	h.advance(0)
	h.advance(hotspotGrace - time.Second)
	if h.nm.starts != 0 {
		t.Fatal("hotspot opened before the grace period")
	}
	h.advance(2 * time.Second)
	if h.nm.starts != 1 || h.nm.scans != 1 {
		t.Fatalf("starts=%d scans=%d, want a scan then one hotspot", h.nm.starts, h.nm.scans)
	}
	if h.nm.hotspotSSID != "Showroom-AB12" {
		t.Fatalf("hotspot ssid = %q", h.nm.hotspotSSID)
	}

	status := wifiStatus{Supported: true, Interface: "wlan0"}
	h.setup.decorate(&status)
	if status.Hotspot == nil || status.Hotspot.SSID != "Showroom-AB12" || len(status.Hotspot.Password) != 8 {
		t.Fatalf("hotspot info = %+v", status.Hotspot)
	}
	if len(status.Hotspot.JoinQR) < 21 || len(status.Hotspot.JoinQR[0]) != len(status.Hotspot.JoinQR) {
		t.Fatalf("join QR is not a square module grid: %d rows", len(status.Hotspot.JoinQR))
	}
	if len(status.Networks) != 2 {
		t.Fatalf("networks = %+v", status.Networks)
	}

	h.nm.summary.wired = true
	h.advance(5 * time.Second)
	if h.nm.stops != 1 {
		t.Fatal("hotspot stayed open after Ethernet came up")
	}
}

func TestHotspotNeverOpensWhenDisabledOrClaimed(t *testing.T) {
	disabled := newSetupHarness(false)
	disabled.setup.Run(context.Background()) // returns at once
	if disabled.nm.starts != 0 {
		t.Fatal("disabled setup opened a hotspot")
	}

	claimed := newSetupHarness(true)
	claimed.unclaim = false
	claimed.advance(0)
	claimed.advance(time.Hour)
	if claimed.nm.starts != 0 {
		t.Fatal("claimed screen opened a hotspot")
	}
	status := wifiStatus{Supported: true, Interface: "wlan0"}
	claimed.setup.decorate(&status)
	if status.Networks != nil {
		t.Fatal("claimed screen scanned for the setup picker")
	}
}

func TestFailedConnectReopensHotspotWithFriendlyError(t *testing.T) {
	h := newSetupHarness(true)
	h.advance(0)
	h.advance(hotspotGrace)
	h.nm.connectErr = errors.New("Error: Connection activation failed: (7) Secrets were required, but not provided.")

	err := h.setup.connect(context.Background(), wifiConfigureRequest{SSID: "Showroom Guest", Password: "wrongpass"})
	if err == nil || !strings.Contains(err.Error(), "Check the password") {
		t.Fatalf("err = %v", err)
	}
	if h.nm.stops != 1 || h.nm.starts != 2 {
		t.Fatalf("stops=%d starts=%d, want the hotspot closed then reopened", h.nm.stops, h.nm.starts)
	}
	status := wifiStatus{Supported: true, Interface: "wlan0"}
	h.setup.decorate(&status)
	if status.LastAttempt == nil || status.LastAttempt.OK || status.Hotspot == nil {
		t.Fatalf("status = %+v", status)
	}

	h.nm.connectErr = nil
	if err := h.setup.connect(context.Background(), wifiConfigureRequest{SSID: "Lobby"}); err != nil {
		t.Fatal(err)
	}
	if h.nm.starts != 2 || h.setup.active {
		t.Fatal("hotspot reopened after a good connection")
	}
	if got := h.nm.connected[1]; got.Hidden {
		t.Fatal("a listed network was joined as hidden")
	}
}

func TestUnlistedNetworkIsJoinedAsHidden(t *testing.T) {
	h := newSetupHarness(true)
	h.advance(0)
	h.advance(hotspotGrace)
	if err := h.setup.connect(context.Background(), wifiConfigureRequest{SSID: "Back Office", Password: "password1"}); err != nil {
		t.Fatal(err)
	}
	if !h.nm.connected[0].Hidden {
		t.Fatal("unlisted network was not joined as hidden")
	}
}

func TestSavedNetworksGetARetryWhenNobodyIsSettingUp(t *testing.T) {
	h := newSetupHarness(true)
	h.nm.saved = 1
	h.advance(0)
	h.advance(hotspotGrace)
	h.advance(savedNetworkRetry - 10*time.Second)
	h.setup.markPhoneActive()
	h.advance(10 * time.Second)
	if h.nm.stops != 0 {
		t.Fatal("retry interrupted a phone that is setting up")
	}
	h.advance(phoneIdleBefore)
	if h.nm.stops != 1 {
		t.Fatal("saved networks were never retried")
	}
	h.advance(hotspotGrace + time.Second)
	if h.nm.starts != 2 {
		t.Fatal("hotspot did not reopen after the saved networks failed")
	}
}

func TestValidateWiFiRequest(t *testing.T) {
	secure := &wifiNetwork{SSID: "Guest", Secure: true}
	cases := []struct {
		request wifiConfigureRequest
		known   *wifiNetwork
		ok      bool
	}{
		{wifiConfigureRequest{SSID: "Lobby"}, &wifiNetwork{SSID: "Lobby"}, true},
		{wifiConfigureRequest{SSID: "Hidden"}, nil, true},
		{wifiConfigureRequest{SSID: "Guest"}, secure, false},
		{wifiConfigureRequest{SSID: "Guest", Password: "short"}, secure, false},
		{wifiConfigureRequest{SSID: "Guest", Password: "longenough"}, secure, true},
		{wifiConfigureRequest{}, nil, false},
	}
	for _, c := range cases {
		if got := validateWiFiRequest(c.request, c.known) == ""; got != c.ok {
			t.Errorf("validate(%+v) ok = %v, want %v", c.request, got, c.ok)
		}
	}
}

func TestParseWiFiList(t *testing.T) {
	output := strings.Join([]string{
		` :Cafe\:Guest:40:WPA2`,
		` :Cafe\:Guest:70:WPA2`,
		`*:Office:55:WPA1 WPA2`,
		` :Lobby:90:--`,
		` ::80:WPA2`,
	}, "\n")
	networks := parseWiFiList(output)
	if len(networks) != 3 {
		t.Fatalf("networks = %+v", networks)
	}
	if networks[0].SSID != "Office" || !networks[0].InUse {
		t.Fatalf("joined network not first: %+v", networks)
	}
	if networks[1].SSID != "Lobby" || networks[1].Secure {
		t.Fatalf("open network: %+v", networks[1])
	}
	if networks[2].SSID != "Cafe:Guest" || networks[2].Signal != 70 {
		t.Fatalf("escaped name or strongest signal lost: %+v", networks[2])
	}
}

func TestDeviceStatusTreatsHotspotAsOffline(t *testing.T) {
	summary := parseDeviceStatus("eth0:ethernet:unavailable:\nwlan0:wifi:connected:showroom-setup\nlo:loopback:connected (externally):lo\n")
	if summary.online() || !summary.hotspotUp() {
		t.Fatalf("summary = %+v", summary)
	}
	summary = parseDeviceStatus("wlan0:wifi:connected:Shop\\:Floor\n")
	if !summary.online() || summary.wifi.connection != "Shop:Floor" {
		t.Fatalf("summary = %+v", summary)
	}
}

func TestWiFiQRPayloadEscapes(t *testing.T) {
	if got := wifiQRPayload(`A;B`, `p:w`); got != `WIFI:T:WPA;S:A\;B;P:p\:w;;` {
		t.Fatalf("payload = %q", got)
	}
}

func TestPortalRedirectsProbesAndAcceptsConnect(t *testing.T) {
	h := newSetupHarness(true)
	h.advance(0)
	h.advance(hotspotGrace)
	routes := h.setup.portalRoutes()

	probe := httptest.NewRecorder()
	routes.ServeHTTP(probe, httptest.NewRequest(http.MethodGet, "http://connectivitycheck.gstatic.com/generate_204", nil))
	if probe.Code != http.StatusFound || probe.Header().Get("Location") != hotspotURL {
		t.Fatalf("probe = %d %q", probe.Code, probe.Header().Get("Location"))
	}

	page := httptest.NewRecorder()
	routes.ServeHTTP(page, httptest.NewRequest(http.MethodGet, "http://10.42.0.1/", nil))
	if page.Code != http.StatusOK || !strings.Contains(page.Body.String(), "Choose your Wi-Fi") {
		t.Fatalf("page = %d", page.Code)
	}

	missing := httptest.NewRecorder()
	routes.ServeHTTP(missing, httptest.NewRequest(http.MethodPost, "http://10.42.0.1/api/connect", strings.NewReader(`{"ssid":"Showroom Guest"}`)))
	if missing.Code != http.StatusBadRequest {
		t.Fatalf("secured network without password = %d", missing.Code)
	}

	accepted := httptest.NewRecorder()
	routes.ServeHTTP(accepted, httptest.NewRequest(http.MethodPost, "http://10.42.0.1/api/connect", strings.NewReader(`{"ssid":"Lobby"}`)))
	if accepted.Code != http.StatusAccepted {
		t.Fatalf("open network = %d", accepted.Code)
	}
}
