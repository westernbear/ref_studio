import fs from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const ADMIN_EMAIL = "RVS_INITIAL_ADMIN_EMAIL";
const ADMIN_NAME = "RVS_INITIAL_ADMIN_NAME";
const ADMIN_PASSWORD = "RVS_INITIAL_ADMIN_PASSWORD";
const ROOT_ENV = new URL("../../../.env", import.meta.url);

const envValue = (env, name) => {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const hashPassword = (password, salt = randomBytes(16).toString("hex")) =>
  `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;

const unquote = (value) =>
  (value.startsWith('"') && value.endsWith('"')) ||
  (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1)
    : value;

export function loadSeedEnv(file = ROOT_ENV, base = process.env) {
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/u)) {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u,
      );
      if (match) env[match[1]] = unquote(match[2].trim());
    }
  }
  return { ...env, ...base };
}

export function openDatabase(
  file = process.env.DATABASE_PATH ?? path.resolve("apps/api/data/app.sqlite"),
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
  const migration = fs.readFileSync(
    new URL("./migrations/001_initial.sql", import.meta.url),
    "utf8",
  );
  if (!db.prepare("SELECT 1 FROM schema_migrations WHERE version = 1").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration);
      db.prepare(
        "INSERT INTO schema_migrations VALUES (1, datetime('now'))",
      ).run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
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
