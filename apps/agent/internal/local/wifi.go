package local

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

type wifiStatus struct {
	Supported bool   `json:"supported"`
	Connected bool   `json:"connected"`
	Interface string `json:"interface,omitempty"`
	SSID      string `json:"ssid,omitempty"`
	Error     string `json:"error,omitempty"`
}

type wifiConfigureRequest struct {
	SSID     string `json:"ssid"`
	Password string `json:"password"`
}

func (s *Server) handleWiFiStatus(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	status := s.readWiFiStatus()
	_ = json.NewEncoder(w).Encode(status)
}

func (s *Server) handleWiFiConfigure(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request wifiConfigureRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	request.SSID = strings.TrimSpace(request.SSID)
	request.Password = strings.TrimSpace(request.Password)
	if request.SSID == "" || request.Password == "" {
		http.Error(w, "ssid and password are required", http.StatusBadRequest)
		return
	}

	if err := connectWiFi(r.Context(), request.SSID, request.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(s.readWiFiStatus())
}

func (s *Server) readWiFiStatus() wifiStatus {
	status, err := wifiStatusSnapshot(context.Background())
	if err != nil {
		return wifiStatus{
			Supported: false,
			Error:     err.Error(),
		}
	}

	return status
}

func wifiStatusSnapshot(ctx context.Context) (wifiStatus, error) {
	if _, err := exec.LookPath("nmcli"); err != nil {
		return wifiStatus{}, errors.New("nmcli not found")
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	output, err := exec.CommandContext(ctx, "nmcli", "--escape", "no", "-t", "-f", "DEVICE,TYPE,STATE", "device", "status").Output()
	if err != nil {
		return wifiStatus{}, err
	}

	status := wifiStatus{Supported: true}
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}

		fields := strings.SplitN(line, ":", 3)
		if len(fields) != 3 || fields[1] != "wifi" {
			continue
		}

		status.Interface = fields[0]
		status.Connected = fields[2] == "connected"
		break
	}

	if status.Interface == "" {
		status.Error = "no wifi interface found"
		return status, nil
	}

	if !status.Connected {
		return status, nil
	}

	ssid, err := exec.CommandContext(ctx, "nmcli", "-g", "GENERAL.CONNECTION", "device", "show", status.Interface).Output()
	if err != nil {
		return status, nil
	}

	status.SSID = strings.TrimSpace(string(ssid))
	return status, nil
}

func connectWiFi(ctx context.Context, ssid string, password string) error {
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

	args := []string{"--wait", "30", "device", "wifi", "connect", ssid, "password", password}
	if status.Interface != "" {
		args = append(args, "ifname", status.Interface)
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

	return nil
}
