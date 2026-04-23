package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
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

const agentVersion = "0.4.0"

type AgentRegister struct {
	Hostname             string   `json:"hostname"`
	IPAddress            string   `json:"ip_address"`
	Platform             string   `json:"platform"`
	Arch                 string   `json:"arch"`
	OSVersion            string   `json:"os_version"`
	AgentVersion         string   `json:"agent_version"`
	DetectedServices     []string `json:"detected_services"`
	AllowedUnits         []string `json:"allowed_units"`
	AllowedPM2Processes  []string `json:"allowed_pm2_processes"`
	AllowedLogPaths      []string `json:"allowed_log_cleanup_paths"`
	RestartServerEnabled bool     `json:"restart_server_enabled"`
}

type AgentHeartbeat struct {
	Hostname  string `json:"hostname"`
	Timestamp int64  `json:"timestamp"`
}

type ActionRequest struct {
	ID          string `json:"id"`
	Action      string `json:"action"`
	Unit        string `json:"unit"`
	RequestedBy string `json:"requested_by"`
}

type ActionResult struct {
	ID         string `json:"id"`
	Success    bool   `json:"success"`
	Message    string `json:"message"`
	ExecutedAt int64  `json:"executed_at"`
}

type Agent struct {
	name                 string
	hostname             string
	natsURL              string
	natsUser             string
	natsPassword         string
	metricsInterval      time.Duration
	logsInterval         time.Duration
	logPaths             []string
	logTailFromStart     bool
	logOffsets           map[string]int64
	natsConn             *nats.Conn
	allowedUnits         []string
	allowedPM2Processes  []string
	allowedLogPaths      []string
	restartServerEnabled bool
	// extra system metrics
	diskPaths []string
	// app metric collectors (process/jstat/proc based, no HTTP required)
	nginxPaths   []NamedPath
	pm2Enabled   bool
	tomcatPaths  []NamedPath
	wildflyPaths []NamedPath
	oracleEnabled bool
	oracleDSN     string
	// access log paths for request/error metrics (supports glob patterns for rotating logs)
	nginxAccessLogPaths   []NamedPath
	tomcatAccessLogPaths  []NamedPath
	wildflyAccessLogPaths []NamedPath
	// access log counters (monotonically increasing, reset on restart)
	accessLogOffsets map[string]int64
	accessReqTotals  map[string]float64
	accessErrTotals  map[string]float64
	// app log file tailing (error/app logs → displayed in Logs tab)
	nginxLogPaths   []NamedPath
	tomcatLogPaths  []NamedPath
	wildflyLogPaths []NamedPath
	pm2LogPaths     []NamedPath
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

	log.Printf("IT Watch Tower Agent started name=%s host=%s nats=%s version=%s", agent.name, agent.hostname, agent.natsURL, agentVersion)
	agent.publishRegister()
	agent.subscribeActions()
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
		name:                 name,
		hostname:             hostname,
		natsURL:              env("NATS_URL", "nats://localhost:4222"),
		natsUser:             os.Getenv("NATS_USER"),
		natsPassword:         os.Getenv("NATS_PASSWORD"),
		metricsInterval:      durationEnv("METRICS_INTERVAL", 15*time.Second),
		logsInterval:         durationEnv("LOGS_INTERVAL", 30*time.Second),
		logPaths:             splitCSV(os.Getenv("LOG_PATHS")),
		logTailFromStart:     boolEnv("LOG_TAIL_FROM_START", false),
		logOffsets:           map[string]int64{},
		allowedUnits:         splitCSV(os.Getenv("ALLOWED_UNITS")),
		allowedPM2Processes:  splitCSV(os.Getenv("ALLOWED_PM2_PROCESSES")),
		allowedLogPaths:      splitCSV(os.Getenv("ALLOWED_LOG_CLEANUP_PATHS")),
		restartServerEnabled: boolEnv("RESTART_SERVER_ENABLED", false),
		diskPaths:             splitCSV(os.Getenv("DISK_PATHS")),
		nginxPaths:            parseNamedPaths(os.Getenv("NGINX_PATHS")),
		pm2Enabled:            boolEnv("PM2_ENABLED", false),
		tomcatPaths:           parseNamedPaths(os.Getenv("TOMCAT_PATHS")),
		wildflyPaths:          parseNamedPaths(os.Getenv("WILDFLY_PATHS")),
		oracleEnabled:         boolEnv("ORACLE_ENABLED", false),
		oracleDSN:             os.Getenv("ORACLE_DSN"),
		nginxAccessLogPaths:   parseNamedPaths(os.Getenv("NGINX_ACCESS_LOG_PATHS")),
		tomcatAccessLogPaths:  parseNamedPaths(os.Getenv("TOMCAT_ACCESS_LOG_PATHS")),
		wildflyAccessLogPaths: parseNamedPaths(os.Getenv("WILDFLY_ACCESS_LOG_PATHS")),
		accessLogOffsets:      map[string]int64{},
		accessReqTotals:       map[string]float64{},
		accessErrTotals:       map[string]float64{},
		nginxLogPaths:         parseNamedPaths(os.Getenv("NGINX_LOG_PATHS")),
		tomcatLogPaths:        parseNamedPaths(os.Getenv("TOMCAT_LOG_PATHS")),
		wildflyLogPaths:       parseNamedPaths(os.Getenv("WILDFLY_LOG_PATHS")),
		pm2LogPaths:           parseNamedPaths(os.Getenv("PM2_LOG_PATHS")),
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
	heartbeatTicker := time.NewTicker(60 * time.Second)
	defer metricsTicker.Stop()
	defer logsTicker.Stop()
	defer heartbeatTicker.Stop()

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
		case <-heartbeatTicker.C:
			a.publishHeartbeat()
		}
	}
}

func primaryIP() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range ifaces {
		if iface.Name == "lo" || strings.HasPrefix(iface.Name, "docker") || strings.HasPrefix(iface.Name, "br-") {
			continue
		}
		for _, addr := range iface.Addrs {
			ip := addr.Addr
			if ip != "" && !strings.HasPrefix(ip, "127.") && !strings.Contains(ip, ":") {
				// strip /prefix if present
				if idx := strings.Index(ip, "/"); idx != -1 {
					ip = ip[:idx]
				}
				return ip
			}
		}
	}
	return ""
}

func (a *Agent) publishRegister() {
	processes, _ := process.Processes()
	targets := []string{"nginx", "tomcat", "wildfly", "node", "oracle"}
	detected := []string{}
	for _, proc := range processes {
		name, err := proc.Name()
		if err != nil {
			continue
		}
		lower := strings.ToLower(name)
		for _, t := range targets {
			if strings.Contains(lower, t) {
				found := false
				for _, d := range detected {
					if d == t {
						found = true
						break
					}
				}
				if !found {
					detected = append(detected, t)
				}
			}
		}
	}

	reg := AgentRegister{
		Hostname:             a.hostname,
		IPAddress:            primaryIP(),
		Platform:             runtime.GOOS,
		Arch:                 runtime.GOARCH,
		OSVersion:            env("OS_VERSION", ""),
		AgentVersion:         agentVersion,
		DetectedServices:     detected,
		AllowedUnits:         a.allowedUnits,
		AllowedPM2Processes:  a.allowedPM2Processes,
		AllowedLogPaths:      a.allowedLogPaths,
		RestartServerEnabled: a.restartServerEnabled,
	}
	payload, err := json.Marshal(reg)
	if err != nil {
		return
	}
	if err := a.natsConn.Publish("agents.register", payload); err != nil {
		log.Printf("failed to publish register: %v", err)
	}
}

func (a *Agent) publishHeartbeat() {
	hb := AgentHeartbeat{Hostname: a.hostname, Timestamp: time.Now().UnixMilli()}
	payload, err := json.Marshal(hb)
	if err != nil {
		return
	}
	if err := a.natsConn.Publish("agents.heartbeat", payload); err != nil {
		log.Printf("failed to publish heartbeat: %v", err)
	}
}

func (a *Agent) subscribeActions() {
	subject := "actions." + sanitizeSubjectToken(a.hostname)
	_, err := a.natsConn.Subscribe(subject, func(msg *nats.Msg) {
		var req ActionRequest
		if err := json.Unmarshal(msg.Data, &req); err != nil {
			log.Printf("actions: failed to parse request: %v", err)
			return
		}
		result := a.executeAction(req)
		payload, _ := json.Marshal(result)
		if msg.Reply != "" {
			_ = msg.Respond(payload)
		}
		_ = a.natsConn.Publish("actions.result."+sanitizeSubjectToken(a.hostname), payload)
		log.Printf("action executed id=%s action=%s unit=%s success=%v", req.ID, req.Action, req.Unit, result.Success)
	})
	if err != nil {
		log.Printf("failed to subscribe to actions: %v", err)
	}
}

func (a *Agent) executeAction(req ActionRequest) ActionResult {
	now := time.Now().UnixMilli()
	switch req.Action {
	case "start_service", "stop_service", "restart_service":
		return a.executeSystemctlAction(req, now)

	case "restart_pm2":
		return a.executePM2Restart(req, now)

	case "log_cleanup":
		return a.executeLogCleanup(req, now)

	case "restart_server":
		if !a.restartServerEnabled {
			return ActionResult{ID: req.ID, Success: false, Message: "reinicio de servidor no habilitado en este agente (RESTART_SERVER_ENABLED=false)", ExecutedAt: now}
		}
		go func() {
			time.Sleep(3 * time.Second)
			_ = exec.Command("shutdown", "-r", "now").Run()
		}()
		return ActionResult{ID: req.ID, Success: true, Message: "reinicio del servidor programado en 3s", ExecutedAt: now}

	default:
		return ActionResult{ID: req.ID, Success: false, Message: "acción desconocida: " + req.Action, ExecutedAt: now}
	}
}

func (a *Agent) executeSystemctlAction(req ActionRequest, now int64) ActionResult {
	systemctlVerb := map[string]string{
		"start_service":   "start",
		"stop_service":    "stop",
		"restart_service": "restart",
	}[req.Action]

	if req.Unit == "" {
		return ActionResult{ID: req.ID, Success: false, Message: "unit name required", ExecutedAt: now}
	}
	if !contains(a.allowedUnits, req.Unit) {
		return ActionResult{ID: req.ID, Success: false, Message: "unit not in whitelist: " + req.Unit, ExecutedAt: now}
	}

	out, err := exec.Command("systemctl", systemctlVerb, req.Unit).CombinedOutput()
	if err != nil {
		return ActionResult{ID: req.ID, Success: false, Message: fmt.Sprintf("systemctl %s %s: %v — %s", systemctlVerb, req.Unit, err, strings.TrimSpace(string(out))), ExecutedAt: now}
	}
	return ActionResult{ID: req.ID, Success: true, Message: fmt.Sprintf("%s ejecutado correctamente sobre %s", systemctlVerb, req.Unit), ExecutedAt: now}
}

func (a *Agent) executePM2Restart(req ActionRequest, now int64) ActionResult {
	if req.Unit == "" {
		return ActionResult{ID: req.ID, Success: false, Message: "pm2 process name required", ExecutedAt: now}
	}
	if !contains(a.allowedPM2Processes, req.Unit) {
		return ActionResult{ID: req.ID, Success: false, Message: "pm2 process not in whitelist: " + req.Unit, ExecutedAt: now}
	}
	out, err := exec.Command("pm2", "restart", req.Unit).CombinedOutput()
	if err != nil {
		return ActionResult{ID: req.ID, Success: false, Message: fmt.Sprintf("pm2 restart %s: %v — %s", req.Unit, err, strings.TrimSpace(string(out))), ExecutedAt: now}
	}
	return ActionResult{ID: req.ID, Success: true, Message: "pm2 process reiniciado correctamente: " + req.Unit, ExecutedAt: now}
}

func (a *Agent) executeLogCleanup(req ActionRequest, now int64) ActionResult {
	if req.Unit == "" {
		return ActionResult{ID: req.ID, Success: false, Message: "log path required", ExecutedAt: now}
	}
	if !contains(a.allowedLogPaths, req.Unit) {
		return ActionResult{ID: req.ID, Success: false, Message: "log path not in whitelist: " + req.Unit, ExecutedAt: now}
	}
	file, err := os.OpenFile(req.Unit, os.O_WRONLY|os.O_TRUNC, 0)
	if err != nil {
		return ActionResult{ID: req.ID, Success: false, Message: "failed to truncate log: " + err.Error(), ExecutedAt: now}
	}
	_ = file.Close()
	return ActionResult{ID: req.ID, Success: true, Message: "log limpiado correctamente: " + req.Unit, ExecutedAt: now}
}

func contains(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
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
	entries := make([]LogEntry, 0, 32)
	for _, path := range a.logPaths {
		pathEntries, err := a.collectFile(path, filepath.Base(path), "", 100)
		if err != nil {
			log.Printf("failed to collect log file %s: %v", path, err)
			continue
		}
		entries = append(entries, pathEntries...)
	}
	entries = append(entries, a.collectAppLogs()...)
	return entries
}

func (a *Agent) collectAppLogs() []LogEntry {
	type def struct{ service, instance, path string }
	var defs []def
	for _, np := range a.nginxLogPaths {
		defs = append(defs, def{"nginx", np.Name, np.Path})
	}
	for _, np := range a.tomcatLogPaths {
		defs = append(defs, def{"tomcat", np.Name, np.Path})
	}
	for _, np := range a.wildflyLogPaths {
		defs = append(defs, def{"wildfly", np.Name, np.Path})
	}
	for _, np := range a.pm2LogPaths {
		defs = append(defs, def{"pm2", np.Name, np.Path})
	}
	var entries []LogEntry
	for _, d := range defs {
		got, err := a.collectFile(d.path, d.service, d.instance, 100)
		if err != nil {
			log.Printf("app log tail %s: %v", d.path, err)
			continue
		}
		entries = append(entries, got...)
	}
	return entries
}

func (a *Agent) collectFile(path, service, instance string, maxLines int) ([]LogEntry, error) {
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

	meta := map[string]string{"agent": a.name, "path": path}
	if instance != "" {
		meta["instance"] = instance
	}

	entries := make([]LogEntry, 0, maxLines)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		entries = append(entries, LogEntry{
			Timestamp: time.Now().UnixMilli(),
			Host:      a.hostname,
			Service:   service,
			Level:     detectLogLevel(line),
			Message:   line,
			Metadata:  meta,
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

	metrics = append(metrics, a.collectExtraSystemMetrics(now)...)
	metrics = append(metrics, a.collectNginxMetrics(now)...)
	metrics = append(metrics, a.collectPM2Metrics(now)...)
	metrics = append(metrics, a.collectTomcatMetrics(now)...)
	metrics = append(metrics, a.collectWildflyMetrics(now)...)
	metrics = append(metrics, a.collectOracleMetrics(now)...)

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
