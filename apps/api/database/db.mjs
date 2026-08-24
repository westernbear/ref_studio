import fs from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import Database from "better-sqlite3";

const ADMIN_EMAIL = "RVS_INITIAL_ADMIN_EMAIL";
const ADMIN_NAME = "RVS_INITIAL_ADMIN_NAME";
const ADMIN_PASSWORD = "RVS_INITIAL_ADMIN_PASSWORD";
const ROOT_ENV = new URL("../../../.env", import.meta.url);
const DEFAULT_DATABASE = new URL("../data/app.sqlite", import.meta.url);

const envValue = (env, name) => {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const hashPassword = (password, salt = randomBytes(16).toString("hex")) =>
  `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;

export const defaultDatabasePath = () => fileURLToPath(DEFAULT_DATABASE);

export function loadSeedEnv(file = ROOT_ENV, base = process.env) {
  const env = fs.existsSync(file)
    ? parseEnv(fs.readFileSync(file, "utf8"))
    : {};
  return { ...env, ...base };
}

export function openDatabase(
  file = process.env.DATABASE_PATH ?? defaultDatabasePath(),
) {
  if (file.includes("/") && !file.startsWith(":memory:"))
    fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (file !== ":memory:" && !path.isAbsolute(file))
    throw new Error("LOCAL_DISK_PATH_REQUIRED");
  return db;
}

export function migrate(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const migrations = [
    [1, "./migrations/001_initial.sql", false],
    [2, "./migrations/002_allow_duplicate_cas.sql", true],
    [3, "./migrations/003_remove_demo_seed.sql", true],
    [4, "./migrations/004_runtime_durability.sql", false],
    [5, "./migrations/005_worker_lifecycle.sql", false],
  ];
  for (const [version, file, disableForeignKeys] of migrations) {
    if (
      db
        .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
        .get(version)
    )
      continue;
    const migration = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    if (disableForeignKeys) db.pragma("foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration);
      db.prepare(
        "INSERT INTO schema_migrations VALUES (?, datetime('now'))",
      ).run(version);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      if (disableForeignKeys) db.pragma("foreign_keys = ON");
    }
  }
}

const seedInitialAdmin = (db, env) => {
  const email = envValue(env, ADMIN_EMAIL);
  const name = envValue(env, ADMIN_NAME);
  const password = envValue(env, ADMIN_PASSWORD);
  if (!email && !name && !password) return;
  if (!email || !password) throw new Error("RVS_INITIAL_ADMIN_ENV_INCOMPLETE");
  db.prepare(
    "UPDATE users SET email=?, display_name=? WHERE id='usr_platform'",
  ).run(email, name ?? "Platform Operator");
  db.prepare(
    "UPDATE credentials SET secret_hash=?, revoked_at=NULL WHERE id='cred_platform_password'",
  ).run(hashPassword(password));
};

export function seed(db, env = {}) {
  db.exec(fs.readFileSync(new URL("./seed.sql", import.meta.url), "utf8"));
  seedInitialAdmin(db, env);
}
