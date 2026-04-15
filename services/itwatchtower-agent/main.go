package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	fmt.Println("IT Watch Tower Agent - Starting...")

	// TODO: Implement agent functionality:
	// 1. Collect system metrics (CPU, memory, disk, network)
	// 2. Collect logs
	// 3. Detect services (nginx, tomcat, wildfly, node, oracle)
	// 4. Connect to NATS and publish data
	// 5. Listen for remote commands

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigChan
	fmt.Printf("Received signal: %v\n", sig)
	fmt.Println("Agent shutting down...")
}
