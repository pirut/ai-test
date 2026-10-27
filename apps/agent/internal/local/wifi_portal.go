package local

import (
	"context"
	_ "embed"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

//go:embed wifi_portal.html
var wifiPortalPage []byte

// portalRoutes is the phone setup page, served only on the hotspot address.
// Requests for any other host (phones probing for a captive portal) are sent
// to the page so the phone opens it on its own.
func (m *wifiSetup) portalRoutes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/state", m.handlePortalState)
	mux.HandleFunc("/api/connect", m.handlePortalConnect)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		m.markPhoneActive()
		host := r.Host
		if index := strings.LastIndex(host, ":"); index >= 0 {
			host = host[:index]
		}
		if host != hotspotAddress {
			http.Redirect(w, r, hotspotURL, http.StatusFound)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(wifiPortalPage)
	})
	return mux
}

func (m *wifiSetup) handlePortalState(w http.ResponseWriter, _ *http.Request) {
	m.markPhoneActive()
	m.mu.Lock()
	payload := map[string]interface{}{
		"screen":     m.ssid,
		"networks":   nonNilNetworks(append([]wifiNetwork(nil), m.networks...)),
		"connecting": m.connecting,
	}
	if m.attempt != nil {
		payload["lastAttempt"] = *m.attempt
	}
	m.mu.Unlock()
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

func (m *wifiSetup) handlePortalConnect(w http.ResponseWriter, r *http.Request) {
	m.markPhoneActive()
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
	request.Priority = 100
	if message := validateWiFiRequest(request, m.knownNetwork(request.SSID)); message != "" {
		http.Error(w, message, http.StatusBadRequest)
		return
	}
	m.mu.Lock()
	busy := m.connecting
	m.mu.Unlock()
	if busy {
		http.Error(w, "The screen is already connecting. Watch the screen.", http.StatusConflict)
		return
	}

	w.WriteHeader(http.StatusAccepted)
	// Joining closes the hotspot this phone is on, so answer first.
	go func() {
		time.Sleep(1500 * time.Millisecond)
		_ = m.connect(context.Background(), request)
	}()
}
