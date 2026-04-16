package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

type Metric struct {
	Timestamp   int64             `json:"timestamp"`
	Host        string            `json:"host"`
	Service     string            `json:"service"`
	MetricName  string            `json:"metricName"`
	MetricValue float64           `json:"metricValue"`
	Tags        map[string]string `json:"tags,omitempty"`
	Unit        string            `json:"unit,omitempty"`
}

type MetricsBatch struct {
	BatchID     string   `json:"batchId"`
	Timestamp   int64    `json:"timestamp"`
	Metrics     []Metric `json:"metrics"`
	SourceAgent string   `json:"sourceAgent"`
}

type LogEntry struct {
	Timestamp int64             `json:"timestamp"`
	Host      string            `json:"host"`
	Service   string            `json:"service"`
	Level     string            `json:"level"`
	Message   string            `json:"message"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

type LogsBatch struct {
	BatchID     string     `json:"batchId"`
	Timestamp   int64      `json:"timestamp"`
	Logs        []LogEntry `json:"logs"`
	SourceAgent string     `json:"sourceAgent"`
}

type Agent struct {
	name             string
	hostname         string
	natsURL          string
	natsUser         string
	natsPassword     string
	metricsInterval  time.Duration
	logsInterval     time.Duration
	logPaths         []string
	logTailFromStart bool
	logOffsets       map[string]int64
	natsConn         *nats.Conn
}

func main() {
	agent := newAgent()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go startHealthServer()

	if err := agent.connect(); err != nil {
		log.Fatalf("failed to connect to NATS: %v", err)
	}
	defer agent.natsConn.Close()

	log.Printf("IT Watch Tower Agent started name=%s host=%s nats=%s", agent.name, agent.hostname, agent.natsURL)
	agent.run(ctx)
	log.Println("Agent shutting down")
}

func newAgent() *Agent {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "unknown-host"
	}

	name := env("AGENT_NAME", hostname)

	return &Agent{
		name:             name,
		hostname:         hostname,
		natsURL:          env("NATS_URL", "nats://localhost:4222"),
		natsUser:         os.Getenv("NATS_USER"),
		natsPassword:     os.Getenv("NATS_PASSWORD"),
		metricsInterval:  durationEnv("METRICS_INTERVAL", 15*time.Second),
		logsInterval:     durationEnv("LOGS_INTERVAL", 30*time.Second),
		logPaths:         splitCSV(os.Getenv("LOG_PATHS")),
		logTailFromStart: boolEnv("LOG_TAIL_FROM_START", false),
		logOffsets:       map[string]int64{},
	}
}

func (a *Agent) connect() error {
	options := []nats.Option{
		nats.Name("itwatchtower-agent-" + a.name),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2 * time.Second),
	}

	if a.natsUser != "" {
		options = append(options, nats.UserInfo(a.natsUser, a.natsPassword))
	}

	conn, err := nats.Connect(a.natsURL, options...)
	if err != nil {
		return err
	}

	a.natsConn = conn
	return nil
}

func (a *Agent) run(ctx context.Context) {
	metricsTicker := time.NewTicker(a.metricsInterval)
	logsTicker := time.NewTicker(a.logsInterval)
	defer metricsTicker.Stop()
	defer logsTicker.Stop()

	a.publishMetrics()
	a.publishAgentLog("INFO", "agent started")

	for {
		select {
		case <-ctx.Done():
			a.publishAgentLog("INFO", "agent stopped")
			a.natsConn.FlushTimeout(2 * time.Second)
			return
		case <-metricsTicker.C:
			a.publishMetrics()
		case <-logsTicker.C:
			a.publishAgentLog("INFO", "agent heartbeat")
			a.publishFileLogs()
		}
	}
}

func (a *Agent) publishMetrics() {
	metrics, err := a.collectMetrics()
	if err != nil {
		log.Printf("failed to collect metrics: %v", err)
		a.publishAgentLog("ERROR", "failed to collect metrics: "+err.Error())
		return
	}

	batch := MetricsBatch{
		BatchID:     fmt.Sprintf("%s-%d", a.name, time.Now().UnixNano()),
		Timestamp:   time.Now().UnixMilli(),
		Metrics:     metrics,
		SourceAgent: a.name,
	}

	payload, err := json.Marshal(batch)
	if err != nil {
		log.Printf("failed to encode metrics batch: %v", err)
		return
	}

	subject := "metrics." + sanitizeSubjectToken(a.hostname)
	if err := a.natsConn.Publish(subject, payload); err != nil {
		log.Printf("failed to publish metrics: %v", err)
	}
}

func (a *Agent) publishAgentLog(level string, message string) {
	entry := LogEntry{
		Timestamp: time.Now().UnixMilli(),
		Host:      a.hostname,
		Service:   "itwatchtower-agent",
		Level:     level,
		Message:   message,
		Metadata: map[string]string{
			"agent": a.name,
		},
	}

	a.publishLogEntries([]LogEntry{entry})
}

func (a *Agent) publishFileLogs() {
	entries := a.collectFileLogs()
	if len(entries) == 0 {
		return
	}

	a.publishLogEntries(entries)
}

func (a *Agent) publishLogEntries(entries []LogEntry) {
	batch := LogsBatch{
		BatchID:     fmt.Sprintf("%s-log-%d", a.name, time.Now().UnixNano()),
		Timestamp:   time.Now().UnixMilli(),
		Logs:        entries,
		SourceAgent: a.name,
	}

	payload, err := json.Marshal(batch)
	if err != nil {
		log.Printf("failed to encode logs batch: %v", err)
		return
	}

	subject := "logs." + sanitizeSubjectToken(a.hostname)
	if err := a.natsConn.Publish(subject, payload); err != nil {
		log.Printf("failed to publish logs: %v", err)
	}
}

func (a *Agent) collectFileLogs() []LogEntry {
	if len(a.logPaths) == 0 {
		return nil
	}

	entries := make([]LogEntry, 0, 32)
	for _, path := range a.logPaths {
		pathEntries, err := a.collectFile(path, 100)
		if err != nil {
			log.Printf("failed to collect log file %s: %v", path, err)
			continue
		}
		entries = append(entries, pathEntries...)
	}

	return entries
}

func (a *Agent) collectFile(path string, maxLines int) ([]LogEntry, error) {
	stat, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	offset, exists := a.logOffsets[path]
	if !exists && !a.logTailFromStart {
		a.logOffsets[path] = stat.Size()
		return nil, nil
	}
	if offset > stat.Size() {
		offset = 0
	}

	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	if _, err := file.Seek(offset, 0); err != nil {
		return nil, err
	}

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	entries := make([]LogEntry, 0, maxLines)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		entries = append(entries, LogEntry{
			Timestamp: time.Now().UnixMilli(),
			Host:      a.hostname,
			Service:   filepath.Base(path),
			Level:     detectLogLevel(line),
			Message:   line,
			Metadata: map[string]string{
				"agent": a.name,
				"path":  path,
			},
		})

		if len(entries) >= maxLines {
			break
		}
	}

	currentOffset, err := file.Seek(0, 1)
	if err == nil {
		a.logOffsets[path] = currentOffset
	}

	if err := scanner.Err(); err != nil {
		return entries, err
	}

	return entries, nil
}

func (a *Agent) collectMetrics() ([]Metric, error) {
	now := time.Now().UnixMilli()
	metrics := make([]Metric, 0, 32)

	cpuPercent, err := cpu.Percent(0, false)
	if err != nil {
		return nil, err
	}
	if len(cpuPercent) > 0 {
		metrics = append(metrics, a.metric(now, "system", "system_cpu_usage_percent", cpuPercent[0], "percent", nil))
	}

	vmem, err := mem.VirtualMemory()
	if err != nil {
		return nil, err
	}
	metrics = append(metrics,
		a.metric(now, "system", "system_memory_usage_percent", vmem.UsedPercent, "percent", nil),
		a.metric(now, "system", "system_memory_used_bytes", float64(vmem.Used), "bytes", nil),
		a.metric(now, "system", "system_memory_total_bytes", float64(vmem.Total), "bytes", nil),
	)

	if usage, err := disk.Usage("/"); err == nil {
		metrics = append(metrics,
			a.metric(now, "system", "system_disk_usage_percent", usage.UsedPercent, "percent", map[string]string{"path": "/"}),
			a.metric(now, "system", "system_disk_used_bytes", float64(usage.Used), "bytes", map[string]string{"path": "/"}),
			a.metric(now, "system", "system_disk_total_bytes", float64(usage.Total), "bytes", map[string]string{"path": "/"}),
		)
	}

	if counters, err := net.IOCounters(false); err == nil && len(counters) > 0 {
		metrics = append(metrics,
			a.metric(now, "system", "system_network_rx_bytes", float64(counters[0].BytesRecv), "bytes", nil),
			a.metric(now, "system", "system_network_tx_bytes", float64(counters[0].BytesSent), "bytes", nil),
		)
	}

	for _, service := range detectServices(now, a.hostname) {
		metrics = append(metrics, service)
	}

	return metrics, nil
}

func (a *Agent) metric(now int64, service string, name string, value float64, unit string, tags map[string]string) Metric {
	if tags == nil {
		tags = map[string]string{}
	}

	tags["agent"] = a.name

	return Metric{
		Timestamp:   now,
		Host:        a.hostname,
		Service:     service,
		MetricName:  name,
		MetricValue: value,
		Tags:        tags,
		Unit:        unit,
	}
}

func detectServices(now int64, hostname string) []Metric {
	processes, err := process.Processes()
	if err != nil {
		return nil
	}

	targets := map[string]string{
		"nginx":   "nginx",
		"tomcat":  "tomcat",
		"wildfly": "wildfly",
		"node":    "node",
		"oracle":  "oracle",
	}
	detected := map[string]bool{}

	for _, proc := range processes {
		name, err := proc.Name()
		if err != nil {
			continue
		}
		lowerName := strings.ToLower(name)
		for token, service := range targets {
			if strings.Contains(lowerName, token) {
				detected[service] = true
			}
		}
	}

	metrics := make([]Metric, 0, len(targets))
	for _, service := range targets {
		value := 0.0
		if detected[service] {
			value = 1
		}

		metrics = append(metrics, Metric{
			Timestamp:   now,
			Host:        hostname,
			Service:     service,
			MetricName:  "service_up",
			MetricValue: value,
			Tags: map[string]string{
				"detector": "process_name",
			},
		})
	}

	return metrics
}

func startHealthServer() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	if err := http.ListenAndServe(":9090", mux); err != nil {
		log.Printf("health server stopped: %v", err)
	}
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func boolEnv(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return fallback
	}

	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func splitCSV(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}

	return result
}

func detectLogLevel(line string) string {
	upper := strings.ToUpper(line)
	switch {
	case strings.Contains(upper, "FATAL"):
		return "FATAL"
	case strings.Contains(upper, "ERROR") || strings.Contains(upper, "ERR "):
		return "ERROR"
	case strings.Contains(upper, "WARN"):
		return "WARN"
	case strings.Contains(upper, "DEBUG"):
		return "DEBUG"
	default:
		return "INFO"
	}
}

func sanitizeSubjectToken(value string) string {
	replacer := strings.NewReplacer(".", "-", " ", "-", "/", "-", "\\", "-", ":", "-")
	return replacer.Replace(value)
}
