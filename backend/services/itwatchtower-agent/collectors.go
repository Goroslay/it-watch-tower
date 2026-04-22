package main

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/process"
	_ "github.com/sijms/go-ora/v2"
)

// ── Named instance type ────────────────────────────────────────────────────────

type NamedPath struct {
	Name string
	Path string
}

// Parses "name1:/path/one,name2:/path/two"
func parseNamedPaths(env string) []NamedPath {
	var result []NamedPath
	for _, part := range splitCSV(env) {
		if idx := strings.Index(part, ":"); idx > 0 {
			result = append(result, NamedPath{
				Name: strings.TrimSpace(part[:idx]),
				Path: strings.TrimSpace(part[idx+1:]),
			})
		}
	}
	return result
}

// ── Process helpers ────────────────────────────────────────────────────────────

// findProcessByPath finds the first process whose cmdline contains basePath.
func findProcessByPath(basePath string) (int32, error) {
	procs, err := process.Processes()
	if err != nil {
		return 0, err
	}
	for _, p := range procs {
		cmdline, err := p.Cmdline()
		if err != nil {
			continue
		}
		if strings.Contains(cmdline, basePath) {
			return p.Pid, nil
		}
	}
	return 0, fmt.Errorf("process not found for path %s", basePath)
}

// findJavaPIDByPath finds a java process whose cmdline contains basePath.
func findJavaPIDByPath(basePath string) (int32, error) {
	procs, err := process.Processes()
	if err != nil {
		return 0, err
	}
	for _, p := range procs {
		name, _ := p.Name()
		if !strings.Contains(strings.ToLower(name), "java") {
			continue
		}
		cmdline, err := p.Cmdline()
		if err != nil {
			continue
		}
		if strings.Contains(cmdline, basePath) {
			return p.Pid, nil
		}
	}
	return 0, fmt.Errorf("java process not found for path %s", basePath)
}

// collectProcessMetrics collects CPU and RSS memory for a given PID.
func collectProcessMetrics(pid int32, service, instance string, now int64, a *Agent) []Metric {
	proc, err := process.NewProcess(pid)
	if err != nil {
		return nil
	}
	tags := map[string]string{"instance": instance}
	var metrics []Metric
	if cpuPct, err := proc.CPUPercent(); err == nil {
		metrics = append(metrics, a.metric(now, service, service+"_process_cpu_percent", cpuPct, "percent", tags))
	}
	if memInfo, err := proc.MemoryInfo(); err == nil {
		metrics = append(metrics, a.metric(now, service, service+"_process_rss_bytes", float64(memInfo.RSS), "bytes", tags))
	}
	// Thread count from /proc/<pid>/status
	if threads, err := getProcessThreadCount(pid); err == nil {
		metrics = append(metrics, a.metric(now, service, service+"_process_threads", float64(threads), "", tags))
	}
	return metrics
}

// getProcessThreadCount reads the thread count from /proc/<pid>/status.
func getProcessThreadCount(pid int32) (int64, error) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "Threads:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				return strconv.ParseInt(parts[1], 10, 64)
			}
		}
	}
	return 0, fmt.Errorf("Threads field not found in /proc/%d/status", pid)
}

// collectJstatMetrics collects JVM heap stats via jstat -gc.
// jstat outputs memory values in KB; converts to bytes.
func collectJstatMetrics(pid int32, service, instance string, now int64, a *Agent) []Metric {
	out, err := exec.Command("jstat", "-gc", fmt.Sprintf("%d", pid)).CombinedOutput()
	if err != nil {
		return nil
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) < 2 {
		return nil
	}
	headers := strings.Fields(lines[0])
	values := strings.Fields(lines[1])
	vals := map[string]float64{}
	for i, h := range headers {
		if i < len(values) {
			if v, err := strconv.ParseFloat(values[i], 64); err == nil {
				vals[h] = v
			}
		}
	}

	// Heap in KB: S0C+S1C+EC+OC = capacity, S0U+S1U+EU+OU = used
	capacityKB := vals["S0C"] + vals["S1C"] + vals["EC"] + vals["OC"]
	usedKB := vals["S0U"] + vals["S1U"] + vals["EU"] + vals["OU"]
	if capacityKB == 0 {
		return nil
	}
	tags := map[string]string{"instance": instance}
	metrics := []Metric{
		a.metric(now, service, service+"_heap_used_bytes", usedKB*1024, "bytes", tags),
		a.metric(now, service, service+"_heap_capacity_bytes", capacityKB*1024, "bytes", tags),
		a.metric(now, service, service+"_heap_used_percent", usedKB/capacityKB*100, "percent", tags),
	}
	if v, ok := vals["YGC"]; ok {
		metrics = append(metrics, a.metric(now, service, service+"_young_gc_total", v, "", tags))
	}
	if v, ok := vals["FGC"]; ok {
		metrics = append(metrics, a.metric(now, service, service+"_full_gc_total", v, "", tags))
	}
	return metrics
}

// ── /proc/net/tcp connection counter ──────────────────────────────────────────

// countPortConnections counts ESTABLISHED connections on a given TCP port
// by reading /proc/net/tcp (IPv4). Port is decimal (e.g. 80, 8080, 8009).
func countPortConnections(port int) (int, error) {
	data, err := os.ReadFile("/proc/net/tcp")
	if err != nil {
		return 0, err
	}
	hexPort := fmt.Sprintf("%04X", port)
	count := 0
	for _, line := range strings.Split(string(data), "\n")[1:] {
		fields := strings.Fields(line)
		// fields[1] = local_address (hex IP:PORT), fields[3] = state (01 = ESTABLISHED)
		if len(fields) < 4 {
			continue
		}
		localParts := strings.Split(fields[1], ":")
		if len(localParts) != 2 {
			continue
		}
		if localParts[1] == hexPort && fields[3] == "01" {
			count++
		}
	}
	return count, nil
}

// getListeningPorts returns the TCP ports a process has open (LISTEN state = 0A).
func getListeningPorts(pid int32) ([]int, error) {
	// Read socket inodes for the process
	fdDir := fmt.Sprintf("/proc/%d/fd", pid)
	entries, err := os.ReadDir(fdDir)
	if err != nil {
		return nil, err
	}
	inodes := map[string]bool{}
	for _, e := range entries {
		target, err := os.Readlink(filepath.Join(fdDir, e.Name()))
		if err != nil {
			continue
		}
		// Format: "socket:[inode]"
		if strings.HasPrefix(target, "socket:[") {
			inode := strings.TrimSuffix(strings.TrimPrefix(target, "socket:["), "]")
			inodes[inode] = true
		}
	}
	if len(inodes) == 0 {
		return nil, nil
	}

	// Parse /proc/net/tcp for LISTEN sockets owned by these inodes
	data, err := os.ReadFile("/proc/net/tcp")
	if err != nil {
		return nil, err
	}
	var ports []int
	for _, line := range strings.Split(string(data), "\n")[1:] {
		fields := strings.Fields(line)
		// fields[3]=state, fields[9]=inode; LISTEN=0A
		if len(fields) < 10 {
			continue
		}
		if fields[3] != "0A" {
			continue
		}
		if !inodes[fields[9]] {
			continue
		}
		localParts := strings.Split(fields[1], ":")
		if len(localParts) == 2 {
			if p, err := strconv.ParseInt(localParts[1], 16, 32); err == nil {
				ports = append(ports, int(p))
			}
		}
	}
	return ports, nil
}

// ── Access log metrics ─────────────────────────────────────────────────────────

// resolveGlobPath returns the most recently modified file matching the pattern.
// If pattern has no glob characters, returns it directly.
func resolveGlobPath(pattern string) string {
	if !strings.ContainsAny(pattern, "*?[") {
		return pattern
	}
	matches, err := filepath.Glob(pattern)
	if err != nil || len(matches) == 0 {
		return pattern
	}
	// Return the most recently modified match
	sort.Slice(matches, func(i, j int) bool {
		si, _ := os.Stat(matches[i])
		sj, _ := os.Stat(matches[j])
		if si == nil || sj == nil {
			return false
		}
		return si.ModTime().After(sj.ModTime())
	})
	return matches[0]
}

// isAccessLogError returns true if the line represents a 4xx or 5xx response
// in Apache/Nginx Combined Log Format: ... "METHOD path HTTP/1.1" STATUS ...
func isAccessLogError(line string) bool {
	return strings.Contains(line, `" 4`) || strings.Contains(line, `" 5`)
}

// countAccessLogDelta reads new lines from an access log file since the last
// tracked offset and returns (newRequests, newErrors). Initialises offset to
// end-of-file on first call so historical data is not replayed.
func (a *Agent) countAccessLogDelta(path string) (int64, int64) {
	resolved := resolveGlobPath(path)
	stat, err := os.Stat(resolved)
	if err != nil {
		return 0, 0
	}

	offset, exists := a.accessLogOffsets[resolved]
	if !exists {
		a.accessLogOffsets[resolved] = stat.Size()
		return 0, 0
	}
	if offset > stat.Size() {
		// Log was rotated; start from beginning of new file
		offset = 0
	}

	f, err := os.Open(resolved)
	if err != nil {
		return 0, 0
	}
	defer f.Close()

	if _, err := f.Seek(offset, 0); err != nil {
		return 0, 0
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 256*1024), 4*1024*1024)

	var reqs, errs int64
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		reqs++
		if isAccessLogError(line) {
			errs++
		}
	}

	if pos, err := f.Seek(0, 1); err == nil {
		a.accessLogOffsets[resolved] = pos
	}
	return reqs, errs
}

// collectAccessLogMetrics reads access log deltas and accumulates running totals.
func (a *Agent) collectAccessLogMetrics(paths []NamedPath, service string, now int64) []Metric {
	var metrics []Metric
	for _, np := range paths {
		deltaReq, deltaErr := a.countAccessLogDelta(np.Path)

		// Accumulate totals (monotonic counters, reset on restart)
		key := service + ":" + np.Name
		a.accessReqTotals[key] += float64(deltaReq)
		a.accessErrTotals[key] += float64(deltaErr)

		tags := map[string]string{"instance": np.Name}
		metrics = append(metrics,
			a.metric(now, service, service+"_requests_total", a.accessReqTotals[key], "", tags),
			a.metric(now, service, service+"_errors_total", a.accessErrTotals[key], "", tags),
		)
		if a.accessReqTotals[key] > 0 {
			errRate := a.accessErrTotals[key] / a.accessReqTotals[key] * 100
			metrics = append(metrics, a.metric(now, service, service+"_error_rate_pct", errRate, "percent", tags))
		}
	}
	return metrics
}

// ── Extra system metrics ───────────────────────────────────────────────────────

func (a *Agent) collectExtraSystemMetrics(now int64) []Metric {
	metrics := make([]Metric, 0, 16)

	if avg, err := load.Avg(); err == nil {
		metrics = append(metrics,
			a.metric(now, "system", "system_load_avg_1m", avg.Load1, "", nil),
			a.metric(now, "system", "system_load_avg_5m", avg.Load5, "", nil),
			a.metric(now, "system", "system_load_avg_15m", avg.Load15, "", nil),
		)
	}

	if counters, err := disk.IOCounters(); err == nil {
		for name, c := range counters {
			if strings.HasPrefix(name, "loop") || strings.HasPrefix(name, "ram") {
				continue
			}
			tags := map[string]string{"disk": name}
			metrics = append(metrics,
				a.metric(now, "system", "system_disk_read_bytes_total", float64(c.ReadBytes), "bytes", tags),
				a.metric(now, "system", "system_disk_write_bytes_total", float64(c.WriteBytes), "bytes", tags),
				a.metric(now, "system", "system_disk_read_ops_total", float64(c.ReadCount), "ops", tags),
				a.metric(now, "system", "system_disk_write_ops_total", float64(c.WriteCount), "ops", tags),
			)
		}
	}

	if data, err := os.ReadFile("/proc/sys/fs/file-nr"); err == nil {
		parts := strings.Fields(strings.TrimSpace(string(data)))
		if len(parts) >= 3 {
			if open, err := strconv.ParseFloat(parts[0], 64); err == nil {
				metrics = append(metrics, a.metric(now, "system", "system_open_file_descriptors", open, "", nil))
			}
			if maxFD, err := strconv.ParseFloat(parts[2], 64); err == nil {
				metrics = append(metrics, a.metric(now, "system", "system_max_file_descriptors", maxFD, "", nil))
			}
		}
	}

	for _, path := range a.diskPaths {
		if usage, err := disk.Usage(path); err == nil {
			tags := map[string]string{"path": path}
			metrics = append(metrics,
				a.metric(now, "system", "system_disk_usage_percent", usage.UsedPercent, "percent", tags),
				a.metric(now, "system", "system_disk_used_bytes", float64(usage.Used), "bytes", tags),
				a.metric(now, "system", "system_disk_total_bytes", float64(usage.Total), "bytes", tags),
			)
		}
	}

	return metrics
}

// ── Nginx ──────────────────────────────────────────────────────────────────────
// NGINX_PATHS=main:/usr/sbin/nginx         → process CPU/mem/threads + port connections
// NGINX_ACCESS_LOG_PATHS=main:/var/log/nginx/access.log → request/error counters

func (a *Agent) collectNginxMetrics(now int64) []Metric {
	var all []Metric
	for _, inst := range a.nginxPaths {
		pid, err := findProcessByPath(inst.Path)
		if err != nil {
			continue
		}
		all = append(all, collectProcessMetrics(pid, "nginx", inst.Name, now, a)...)

		// Active connections via /proc/net/tcp
		if ports, err := getListeningPorts(pid); err == nil {
			total := 0
			for _, port := range ports {
				if n, err := countPortConnections(port); err == nil {
					total += n
				}
			}
			tags := map[string]string{"instance": inst.Name}
			all = append(all, a.metric(now, "nginx", "nginx_active_connections", float64(total), "", tags))
		}
	}
	all = append(all, a.collectAccessLogMetrics(a.nginxAccessLogPaths, "nginx", now)...)
	return all
}

// ── PM2 ───────────────────────────────────────────────────────────────────────

type pm2Process struct {
	Name   string `json:"name"`
	PMID   int    `json:"pm_id"`
	PM2Env struct {
		Status      string `json:"status"`
		RestartTime int64  `json:"restart_time"`
	} `json:"pm2_env"`
	Monit struct {
		CPU    float64 `json:"cpu"`
		Memory float64 `json:"memory"`
	} `json:"monit"`
}

func (a *Agent) collectPM2Metrics(now int64) []Metric {
	if !a.pm2Enabled {
		return nil
	}
	out, err := exec.Command("pm2", "jlist").Output()
	if err != nil {
		return nil
	}
	var procs []pm2Process
	if err := json.Unmarshal(out, &procs); err != nil {
		return nil
	}
	metrics := make([]Metric, 0, len(procs)*4)
	for _, p := range procs {
		tags := map[string]string{"name": p.Name, "pm_id": strconv.Itoa(p.PMID)}
		up := 0.0
		if p.PM2Env.Status == "online" {
			up = 1.0
		}
		metrics = append(metrics,
			a.metric(now, "pm2", "pm2_process_up", up, "", tags),
			a.metric(now, "pm2", "pm2_process_cpu_percent", p.Monit.CPU, "percent", tags),
			a.metric(now, "pm2", "pm2_process_memory_bytes", p.Monit.Memory, "bytes", tags),
			a.metric(now, "pm2", "pm2_process_restarts", float64(p.PM2Env.RestartTime), "", tags),
		)
	}
	return metrics
}

// ── Tomcat ────────────────────────────────────────────────────────────────────
// TOMCAT_PATHS=tomcat01:/DATOS01/tomcat/tomcat01  → PID discovery, process CPU/mem/threads, JVM heap via jstat, port connections
// TOMCAT_ACCESS_LOG_PATHS=tomcat01:/DATOS01/tomcat/tomcat01/logs/localhost_access_log*.txt → request/error counters

func (a *Agent) collectTomcatMetrics(now int64) []Metric {
	var all []Metric
	for _, inst := range a.tomcatPaths {
		pid, err := findJavaPIDByPath(inst.Path)
		if err != nil {
			continue
		}
		all = append(all, collectProcessMetrics(pid, "tomcat", inst.Name, now, a)...)
		all = append(all, collectJstatMetrics(pid, "tomcat", inst.Name, now, a)...)

		// Active connections on Tomcat's listening ports
		if ports, err := getListeningPorts(pid); err == nil {
			total := 0
			for _, port := range ports {
				if n, err := countPortConnections(port); err == nil {
					total += n
				}
			}
			tags := map[string]string{"instance": inst.Name}
			all = append(all, a.metric(now, "tomcat", "tomcat_active_connections", float64(total), "", tags))
		}
	}
	all = append(all, a.collectAccessLogMetrics(a.tomcatAccessLogPaths, "tomcat", now)...)
	return all
}

// ── WildFly ───────────────────────────────────────────────────────────────────
// WILDFLY_PATHS=wf01:/DATOS01/wildfly/wf01  → same as Tomcat
// WILDFLY_ACCESS_LOG_PATHS=wf01:/DATOS01/wildfly/wf01/standalone/log/access.log

func (a *Agent) collectWildflyMetrics(now int64) []Metric {
	var all []Metric
	for _, inst := range a.wildflyPaths {
		pid, err := findJavaPIDByPath(inst.Path)
		if err != nil {
			continue
		}
		all = append(all, collectProcessMetrics(pid, "wildfly", inst.Name, now, a)...)
		all = append(all, collectJstatMetrics(pid, "wildfly", inst.Name, now, a)...)

		// Active connections
		if ports, err := getListeningPorts(pid); err == nil {
			total := 0
			for _, port := range ports {
				if n, err := countPortConnections(port); err == nil {
					total += n
				}
			}
			tags := map[string]string{"instance": inst.Name}
			all = append(all, a.metric(now, "wildfly", "wildfly_active_connections", float64(total), "", tags))
		}
	}
	all = append(all, a.collectAccessLogMetrics(a.wildflyAccessLogPaths, "wildfly", now)...)
	return all
}

// ── Oracle ────────────────────────────────────────────────────────────────────

func (a *Agent) collectOracleMetrics(now int64) []Metric {
	if !a.oracleEnabled || a.oracleDSN == "" {
		return nil
	}
	db, err := sql.Open("oracle", a.oracleDSN)
	if err != nil {
		return nil
	}
	defer db.Close()
	db.SetConnMaxLifetime(10 * time.Second)

	var metrics []Metric

	var activeSessions, totalSessions float64
	if err := db.QueryRow("SELECT COUNT(*) FROM v$session WHERE type = 'USER' AND status = 'ACTIVE'").Scan(&activeSessions); err == nil {
		metrics = append(metrics, a.metric(now, "oracle", "oracle_active_sessions", activeSessions, "", nil))
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM v$session WHERE type = 'USER'").Scan(&totalSessions); err == nil {
		metrics = append(metrics, a.metric(now, "oracle", "oracle_total_sessions", totalSessions, "", nil))
	}

	var hitRatio float64
	hitSQL := `SELECT ROUND((1 - SUM(DECODE(name,'physical reads',value,0)) /
		DECODE(SUM(DECODE(name,'db block gets',value,0))+SUM(DECODE(name,'consistent gets',value,0)),0,1,
		       SUM(DECODE(name,'db block gets',value,0))+SUM(DECODE(name,'consistent gets',value,0))))*100,2)
		FROM v$sysstat WHERE name IN ('physical reads','db block gets','consistent gets')`
	if err := db.QueryRow(hitSQL).Scan(&hitRatio); err == nil {
		metrics = append(metrics, a.metric(now, "oracle", "oracle_buffer_cache_hit_ratio", hitRatio, "percent", nil))
	}

	tsSQL := `SELECT df.tablespace_name,
		ROUND((df.bytes-NVL(fs.bytes,0))/df.bytes*100,2)
		FROM (SELECT tablespace_name,SUM(bytes) bytes FROM dba_data_files GROUP BY tablespace_name) df
		LEFT JOIN (SELECT tablespace_name,SUM(bytes) bytes FROM dba_free_space GROUP BY tablespace_name) fs
		ON df.tablespace_name=fs.tablespace_name`
	if rows, err := db.Query(tsSQL); err == nil {
		defer rows.Close()
		for rows.Next() {
			var ts string
			var pct float64
			if err := rows.Scan(&ts, &pct); err == nil {
				metrics = append(metrics, a.metric(now, "oracle", "oracle_tablespace_used_pct",
					pct, "percent", map[string]string{"tablespace": ts}))
			}
		}
	}
	return metrics
}
