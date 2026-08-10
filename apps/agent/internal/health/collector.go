package health

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

type Input struct {
	HardwareProfile       string
	LastPlayerHeartbeatAt string
	PlayerStaleAfter      time.Duration
	AgentRestarts         int
	PlayerRestarts        int
	RollbackCount         int
}

func Collect(ctx context.Context, input Input) state.HealthSnapshot {
	now := time.Now().UTC()
	snapshot := state.HealthSnapshot{
		CapturedAt:           now.Format(time.RFC3339),
		HardwareProfile:      input.HardwareProfile,
		Model:                readTrimmed("/proc/device-tree/model"),
		SerialNumber:         cpuInfoValue("Serial"),
		OSVersion:            osRelease(),
		KernelVersion:        command(ctx, "uname", "-r"),
		BootSlot:             readBootSlot(ctx),
		BootReason:           readTrimmed("/var/lib/showroom/state/last-boot-reason"),
		CPUTemperatureC:      temperature(),
		Load1:                load1(),
		MemoryAvailableBytes: memoryAvailable(),
		ThrottledFlags:       command(ctx, "vcgencmd", "get_throttled"),
		HDMIConnected:        hdmiConnected(),
		PlayerHeartbeatAt:    input.LastPlayerHeartbeatAt,
		AgentRestarts:        input.AgentRestarts,
		PlayerRestarts:       input.PlayerRestarts,
		RollbackCount:        max(input.RollbackCount, readInteger("/var/lib/showroom/state/rollback-count")),
	}
	if input.LastPlayerHeartbeatAt != "" {
		if heartbeatAt, err := time.Parse(time.RFC3339, input.LastPlayerHeartbeatAt); err == nil {
			snapshot.PlayerHealthy = now.Sub(heartbeatAt) <= input.PlayerStaleAfter
		}
	}
	if runtime.GOOS != "linux" {
		snapshot.PlayerHealthy = true
	}
	readNetwork(ctx, &snapshot)
	return snapshot
}

func readTrimmed(path string) string {
	value, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.Trim(strings.TrimSpace(string(value)), "\x00")
}

func command(ctx context.Context, name string, args ...string) string {
	commandCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	output, err := exec.CommandContext(commandCtx, name, args...).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func cpuInfoValue(key string) string {
	for _, line := range strings.Split(readTrimmed("/proc/cpuinfo"), "\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 && strings.TrimSpace(parts[0]) == key {
			return strings.TrimSpace(parts[1])
		}
	}
	return ""
}

func osRelease() string {
	for _, line := range strings.Split(readTrimmed("/etc/os-release"), "\n") {
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			return strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), "\"")
		}
	}
	return ""
}

func temperature() float64 {
	raw, err := strconv.ParseFloat(readTrimmed("/sys/class/thermal/thermal_zone0/temp"), 64)
	if err != nil {
		return 0
	}
	return raw / 1000
}

func load1() float64 {
	fields := strings.Fields(readTrimmed("/proc/loadavg"))
	if len(fields) == 0 {
		return 0
	}
	value, _ := strconv.ParseFloat(fields[0], 64)
	return value
}

func memoryAvailable() int64 {
	for _, line := range strings.Split(readTrimmed("/proc/meminfo"), "\n") {
		if strings.HasPrefix(line, "MemAvailable:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				value, _ := strconv.ParseInt(fields[1], 10, 64)
				return value * 1024
			}
		}
	}
	return 0
}

func readBootSlot(ctx context.Context) string {
	activeBoot := command(ctx, "readlink", "-f", "/dev/disk/by-slot/active/boot")
	if strings.HasSuffix(activeBoot, "p2") || strings.HasSuffix(activeBoot, "2") {
		return "A"
	}
	if strings.HasSuffix(activeBoot, "p3") || strings.HasSuffix(activeBoot, "3") {
		return "B"
	}
	return filepath.Base(activeBoot)
}

func readInteger(path string) int {
	value, _ := strconv.Atoi(readTrimmed(path))
	return value
}

func hdmiConnected() bool {
	for _, path := range []string{"/sys/class/drm/card1-HDMI-A-1/status", "/sys/class/drm/card0-HDMI-A-1/status", "/sys/class/drm/card0-HDMI-A-2/status"} {
		if readTrimmed(path) == "connected" {
			return true
		}
	}
	return false
}

func readNetwork(ctx context.Context, snapshot *state.HealthSnapshot) {
	output := command(ctx, "nmcli", "--escape", "no", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status")
	for _, line := range strings.Split(output, "\n") {
		parts := strings.SplitN(line, ":", 4)
		if len(parts) != 4 || parts[2] != "connected" {
			continue
		}
		if parts[1] == "wifi" || parts[1] == "ethernet" {
			snapshot.NetworkInterface, snapshot.SSID = parts[0], parts[3]
			snapshot.IPAddress = command(ctx, "nmcli", "-g", "IP4.ADDRESS", "device", "show", parts[0])
			if parts[1] == "wifi" {
				signal := command(ctx, "nmcli", "-t", "-f", "IN-USE,SIGNAL", "device", "wifi")
				for _, row := range strings.Split(signal, "\n") {
					if strings.HasPrefix(row, "*:") {
						snapshot.SignalPercent, _ = strconv.Atoi(strings.TrimPrefix(row, "*:"))
					}
				}
			}
			return
		}
	}
}
