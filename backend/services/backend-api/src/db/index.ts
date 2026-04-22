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
}

function runMigrations(): void {
  try { db.exec("ALTER TABLE host_registry ADD COLUMN allowed_units TEXT NOT NULL DEFAULT '[]'"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE host_registry ADD COLUMN restart_server_enabled INTEGER NOT NULL DEFAULT 0"); } catch { /* already exists */ }
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
