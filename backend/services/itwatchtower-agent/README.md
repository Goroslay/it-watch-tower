# IT Watch Tower Agent

Go-based agent for collecting metrics, logs, and managing services.

## Responsibilities

1. **Metrics Collection**
   - System metrics (CPU, memory, disk, network)
   - Application-specific metrics
   - Service status

2. **Log Collection**
   - Tail application logs
   - Normalize and enrich log data

3. **Service Detection**
   - Detect Nginx, Tomcat, Wildfly, Node.js, Oracle
   - Monitor service status

4. **Remote Execution**
   - Execute whitelisted commands
   - Restart services
   - Deploy actions

## Building

```bash
go mod download
go build -o agent .
```

## Running

```bash
./agent
```

## Configuration

Configuration via environment variables:
- `NATS_URL` - NATS server URL (default: nats://localhost:4222)
- `NATS_USER` - NATS username
- `NATS_PASSWORD` - NATS password
- `AGENT_NAME` - Agent identifier (default: hostname)
- `AGENT_LOG_LEVEL` - Log level (debug, info, warn, error)
- `METRICS_INTERVAL` - Metrics collection interval (default: 15s)
- `LOGS_INTERVAL` - Log collection interval (default: 30s)
- `LOG_PATHS` - Comma-separated files to tail and publish to NATS logs subjects
- `LOG_TAIL_FROM_START` - Read configured log files from byte 0 on first scan (default: false)
