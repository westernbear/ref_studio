import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function openDatabase(file = process.env.DATABASE_PATH ?? path.resolve('apps/api/data/app.sqlite')) {
  if (file.includes('/') && !file.startsWith(':memory:')) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { timeout: 5000 });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (file !== ':memory:' && !path.isAbsolute(file)) throw new Error('LOCAL_DISK_PATH_REQUIRED');
  return db;
}

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const migration = fs.readFileSync(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8');
  if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version = 1').get()) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(migration); db.prepare("INSERT INTO schema_migrations VALUES (1, datetime('now'))").run(); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}

export function seed(db) { db.exec(fs.readFileSync(new URL('./seed.sql', import.meta.url), 'utf8')); }
