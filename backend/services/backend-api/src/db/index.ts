import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { SCHEMA } from './schema';

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

export function initDb(path: string): void {
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  runMigrations();
  seedAdmin();
  seedDefaultAlertRules();
}

function runMigrations(): void {
  try { db.exec("ALTER TABLE host_registry ADD COLUMN allowed_units TEXT NOT NULL DEFAULT '[]'"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE host_registry ADD COLUMN allowed_pm2_processes TEXT NOT NULL DEFAULT '[]'"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE host_registry ADD COLUMN allowed_log_cleanup_paths TEXT NOT NULL DEFAULT '[]'"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE host_registry ADD COLUMN restart_server_enabled INTEGER NOT NULL DEFAULT 0"); } catch { /* already exists */ }
}

function seedDefaultAlertRules(): void {
  const count = (db.prepare('SELECT COUNT(*) as n FROM alert_rules').get() as { n: number }).n;
  if (count > 0) return;

  const defaults = [
    { id: randomUUID(), name: 'high_cpu',    promql: 'system_cpu_usage_percent',              operator: 'gt', threshold: 85, severity: 'high',     for_count: 2 },
    { id: randomUUID(), name: 'high_memory', promql: 'system_memory_usage_percent',           operator: 'gt', threshold: 90, severity: 'high',     for_count: 2 },
    { id: randomUUID(), name: 'high_disk',   promql: 'system_disk_usage_percent{path="/"}',   operator: 'gt', threshold: 90, severity: 'critical', for_count: 1 },
    { id: randomUUID(), name: 'high_load',   promql: 'system_load_avg_5m',                    operator: 'gt', threshold: 4,  severity: 'medium',   for_count: 3 },
  ];

  const stmt = db.prepare(`
    INSERT INTO alert_rules (id, name, promql, operator, threshold, severity, for_count, enabled, notify_slack, notify_email)
    VALUES (@id, @name, @promql, @operator, @threshold, @severity, @for_count, 1, 0, '')
  `);
  for (const rule of defaults) stmt.run(rule);
}

function seedAdmin(): void {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existing) return;

  const password = process.env.ADMIN_PASSWORD ?? 'admin';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, client_id)
    VALUES (?, 'admin', ?, 'admin', NULL)
  `).run(randomUUID(), hash);
}

export function generateId(): string {
  return randomUUID();
}
