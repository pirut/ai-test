package systemdnotify

import (
	"net"
	"os"
	"strings"
)

func Send(message string) error {
	socket := strings.TrimSpace(os.Getenv("NOTIFY_SOCKET"))
	if socket == "" {
		return nil
	}
	if strings.HasPrefix(socket, "@") {
		socket = "\x00" + strings.TrimPrefix(socket, "@")
	}
	connection, err := net.DialUnix("unixgram", nil, &net.UnixAddr{Name: socket, Net: "unixgram"})
	if err != nil {
		return err
	}
	defer connection.Close()
	_, err = connection.Write([]byte(message))
	return err
}

func Ready() error    { return Send("READY=1\nSTATUS=Digital Curator agent running") }
func Watchdog() error { return Send("WATCHDOG=1") }
