import fs from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import Database from "better-sqlite3";

const ADMIN_EMAIL = "RVS_INITIAL_ADMIN_EMAIL";
const ADMIN_NAME = "RVS_INITIAL_ADMIN_NAME";
const ADMIN_PASSWORD = "RVS_INITIAL_ADMIN_PASSWORD";
const WORKSPACE_MARKER = "pnpm-workspace.yaml";
const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATABASE = new URL("../data/app.sqlite", import.meta.url);

const envValue = (env, name) => {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const hashPassword = (password, salt = randomBytes(16).toString("hex")) =>
  `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;

export const defaultDatabasePath = () => fileURLToPath(DEFAULT_DATABASE);

export function findRootEnv(start = MODULE_DIRECTORY) {
  let directory = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(directory, WORKSPACE_MARKER)))
      return path.join(directory, ".env");
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("WORKSPACE_ROOT_NOT_FOUND");
    directory = parent;
  }
}

export function loadSeedEnv(file = findRootEnv(), base = process.env) {
  const env = fs.existsSync(file)
    ? parseEnv(fs.readFileSync(file, "utf8"))
    : {};
  return { ...env, ...base };
}

export function openDatabase(
  file = process.env.DATABASE_PATH ?? defaultDatabasePath(),
) {
  if (file !== ":memory:" && !path.isAbsolute(file))
    throw new Error("LOCAL_DISK_PATH_REQUIRED");
  if (file !== ":memory:")
    fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
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
    [6, "./migrations/006_ai_provider_settings.sql", false],
    [7, "./migrations/007_job_attachments.sql", false],
    [8, "./migrations/008_job_feedback.sql", false],
    [9, "./migrations/009_evidence_video_stage.sql", true],
    [10, "./migrations/010_evidence_video_artifact_slots.sql", true],
    [11, "./migrations/011_preview_labeled_slot.sql", true],
    [12, "./migrations/012_material_provider_settings.sql", false],
    [13, "./migrations/013_generate_track_enums.sql", true],
    [14, "./migrations/014_brand_attachments.sql", false],
    [15, "./migrations/015_material_service_endpoints.sql", false],
    [16, "./migrations/016_codex_oauth_material_provider.sql", true],
    [17, "./migrations/017_codex_oauth_ai_provider.sql", true],
    [18, "./migrations/018_motion_knowledge.sql", false],
    [19, "./migrations/019_motion_scene_versions.sql", false],
    [20, "./migrations/020_scene_package_artifacts.sql", true],
    [21, "./migrations/021_motion_provider_canaries.sql", false],
  ];
  for (const [version, file, disableForeignKeys] of migrations) {
    if (
      db
        .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
        .get(version)
    )
      continue;
    if (
      version === 19 &&
      !db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='jobs'",
        )
        .get()
    ) {
      db.prepare(
        "INSERT INTO schema_migrations VALUES (?, datetime('now'))",
      ).run(version);
      continue;
    }
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
  const reconcile = db.transaction(() => {
    db.prepare(
      "UPDATE users SET email=?, display_name=? WHERE id='usr_platform'",
    ).run(email, name ?? "Platform Operator");
    db.prepare(
      "UPDATE credentials SET secret_hash=?, revoked_at=NULL WHERE id='cred_platform_password'",
    ).run(hashPassword(password));
  });
  reconcile.immediate();
};

export function seed(db, env = {}) {
  db.exec(fs.readFileSync(new URL("./seed.sql", import.meta.url), "utf8"));
  seedInitialAdmin(db, env);
}
