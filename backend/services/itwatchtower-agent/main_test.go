package main

import (
	"os"
	"testing"
	"time"
)

func TestSanitizeSubjectToken(t *testing.T) {
	got := sanitizeSubjectToken("host.name/with spaces")
	want := "host-name-with-spaces"
	if got != want {
		t.Fatalf("sanitizeSubjectToken() = %q, want %q", got, want)
	}
}

func TestDurationEnv(t *testing.T) {
	t.Setenv("TEST_DURATION", "2s")
	if got := durationEnv("TEST_DURATION", time.Second); got != 2*time.Second {
		t.Fatalf("durationEnv() = %s, want 2s", got)
	}

	t.Setenv("TEST_DURATION", "bad")
	if got := durationEnv("TEST_DURATION", time.Second); got != time.Second {
		t.Fatalf("durationEnv() fallback = %s, want 1s", got)
	}
}

func TestEnvFallback(t *testing.T) {
	_ = os.Unsetenv("TEST_ENV_FALLBACK")
	if got := env("TEST_ENV_FALLBACK", "fallback"); got != "fallback" {
		t.Fatalf("env() = %q, want fallback", got)
	}
}

func TestSplitCSV(t *testing.T) {
	got := splitCSV(" /var/log/syslog, ,/var/log/messages ")
	if len(got) != 2 {
		t.Fatalf("splitCSV() length = %d, want 2", len(got))
	}
	if got[0] != "/var/log/syslog" || got[1] != "/var/log/messages" {
		t.Fatalf("splitCSV() = %#v", got)
	}
}

func TestDetectLogLevel(t *testing.T) {
	cases := map[string]string{
		"fatal startup failure": "FATAL",
		"ERROR cannot connect":  "ERROR",
		"warning threshold":     "WARN",
		"debug payload":         "DEBUG",
		"service started":       "INFO",
	}

	for line, want := range cases {
		if got := detectLogLevel(line); got != want {
			t.Fatalf("detectLogLevel(%q) = %q, want %q", line, got, want)
		}
	}
}

func TestCollectFileLogsFromStart(t *testing.T) {
	tmp := t.TempDir()
	path := tmp + "/app.log"
	if err := os.WriteFile(path, []byte("INFO booted\nERROR failed once\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	agent := &Agent{
		name:             "test-agent",
		hostname:         "test-host",
		logTailFromStart: true,
		logOffsets:       map[string]int64{},
	}

	entries, err := agent.collectFile(path, "app", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("collectFile() entries = %d, want 2", len(entries))
	}
	if entries[1].Level != "ERROR" {
		t.Fatalf("collectFile() second level = %q, want ERROR", entries[1].Level)
	}
}

func TestExecuteLogCleanupRequiresWhitelist(t *testing.T) {
	tmp := t.TempDir()
	path := tmp + "/app.log"
	if err := os.WriteFile(path, []byte("ERROR old log\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	agent := &Agent{
		name:            "test-agent",
		hostname:        "test-host",
		allowedLogPaths: []string{path},
	}

	result := agent.executeAction(ActionRequest{ID: "1", Action: "log_cleanup", Unit: path})
	if !result.Success {
		t.Fatalf("executeAction(log_cleanup) success = false, message=%q", result.Message)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 0 {
		t.Fatalf("log file length = %d, want 0", len(data))
	}

	blocked := agent.executeAction(ActionRequest{ID: "2", Action: "log_cleanup", Unit: tmp + "/other.log"})
	if blocked.Success {
		t.Fatal("executeAction(log_cleanup) allowed non-whitelisted path")
	}
}

func TestExecuteActionRejectsUnknownAction(t *testing.T) {
	agent := &Agent{name: "test-agent", hostname: "test-host"}
	result := agent.executeAction(ActionRequest{ID: "1", Action: "delete_everything"})
	if result.Success {
		t.Fatal("executeAction() accepted unknown action")
	}
}
