package java

import (
	"fmt"
	"net"
	"strconv"
	"time"
)

// ValidateConnection checks if a Java target is reachable via TCP on the given host:port.
func ValidateConnection(host string, port int) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		return fmt.Errorf("cannot connect to %s: %w", addr, err)
	}
	conn.Close()
	return nil
}

// FindAvailablePort finds a random available TCP port on localhost.
func FindAvailablePort() (int, error) {
	listener, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return 0, err
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	return port, nil
}

// FormatJMXURL creates a JMX service URL from host and port.
func FormatJMXURL(host string, port int) string {
	return "service:jmx:rmi:///jndi/rmi://" + host + ":" + strconv.Itoa(port) + "/jmxrmi"
}
