export const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS environments (
  id         TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'custom',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(client_id, name)
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer',
  client_id     TEXT REFERENCES clients(id) ON DELETE SET NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL,
  scope_id    TEXT NOT NULL,
  actions     TEXT NOT NULL DEFAULT '[]',
  UNIQUE(user_id, scope, scope_id)
);

CREATE TABLE IF NOT EXISTS host_registry (
  hostname       TEXT PRIMARY KEY,
  ip_address     TEXT DEFAULT '',
  platform       TEXT DEFAULT '',
  arch           TEXT DEFAULT '',
  os_version     TEXT DEFAULT '',
  agent_version  TEXT DEFAULT '',
  detected_services TEXT DEFAULT '[]',
  allowed_units TEXT NOT NULL DEFAULT '[]',
  allowed_pm2_processes TEXT NOT NULL DEFAULT '[]',
  allowed_log_cleanup_paths TEXT NOT NULL DEFAULT '[]',
  restart_server_enabled INTEGER NOT NULL DEFAULT 0,
  status         TEXT DEFAULT 'online',
  client_id      TEXT REFERENCES clients(id) ON DELETE SET NULL,
  environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL,
  assigned_by    TEXT DEFAULT '',
  assigned_at    TEXT DEFAULT '',
  last_seen      TEXT DEFAULT (datetime('now')),
  first_seen     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  username    TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_host TEXT DEFAULT '',
  params      TEXT DEFAULT '{}',
  result      TEXT DEFAULT '',
  success     INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  promql       TEXT NOT NULL,
  operator     TEXT NOT NULL DEFAULT 'gt',
  threshold    REAL NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'high',
  for_count    INTEGER NOT NULL DEFAULT 1,
  enabled      INTEGER NOT NULL DEFAULT 1,
  notify_slack INTEGER NOT NULL DEFAULT 0,
  notify_email TEXT NOT NULL DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_states (
  state_key     TEXT PRIMARY KEY,
  rule_id       TEXT NOT NULL,
  rule_name     TEXT NOT NULL,
  host          TEXT NOT NULL,
  alert_id      TEXT NOT NULL,
  pending_count INTEGER NOT NULL DEFAULT 0,
  firing        INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT DEFAULT (datetime('now'))
);
`;
