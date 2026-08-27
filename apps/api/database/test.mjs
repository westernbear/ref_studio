import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  defaultDatabasePath,
  findRootEnv,
  loadSeedEnv,
  migrate,
  openDatabase,
  seed,
} from "./db.mjs";

const matchesPassword = (password, encoded) => {
  const [, salt, expected] = encoded.split("$");
  return scryptSync(password, salt, 32).toString("hex") === expected;
};

const adminDb = new Database(":memory:");
adminDb.pragma("foreign_keys = ON");
migrate(adminDb);
seed(adminDb, {
  RVS_INITIAL_ADMIN_EMAIL: "admin@example.test",
  RVS_INITIAL_ADMIN_NAME: "Ops Admin",
  RVS_INITIAL_ADMIN_PASSWORD: "admin-secret",
});
const admin = adminDb
  .prepare(
    "SELECT users.email, users.display_name, tenant_memberships.role, credentials.secret_hash FROM users JOIN tenant_memberships ON tenant_memberships.user_id=users.id JOIN credentials ON credentials.user_id=users.id WHERE users.id='usr_platform'",
  )
  .get();
assert.equal(admin.email, "admin@example.test");
assert.equal(admin.display_name, "Ops Admin");
assert.equal(admin.role, "SUPER_ADMIN");
assert.equal(matchesPassword("admin-secret", admin.secret_hash), true);
adminDb.exec(
  "CREATE TRIGGER reject_admin_password BEFORE UPDATE OF secret_hash ON credentials WHEN OLD.id='cred_platform_password' BEGIN SELECT RAISE(ABORT,'TEST_PASSWORD_REJECTED'); END",
);
assert.throws(
  () =>
    seed(adminDb, {
      RVS_INITIAL_ADMIN_EMAIL: "changed@example.test",
      RVS_INITIAL_ADMIN_NAME: "Changed Admin",
      RVS_INITIAL_ADMIN_PASSWORD: "changed-secret",
    }),
  /TEST_PASSWORD_REJECTED/,
);
const unchangedAdmin = adminDb
  .prepare(
    "SELECT users.email, users.display_name, credentials.secret_hash FROM users JOIN credentials ON credentials.user_id=users.id WHERE users.id='usr_platform'",
  )
  .get();
assert.equal(unchangedAdmin.email, "admin@example.test");
assert.equal(unchangedAdmin.display_name, "Ops Admin");
assert.equal(matchesPassword("admin-secret", unchangedAdmin.secret_hash), true);
adminDb.close();

const envDir = mkdtempSync(join(tmpdir(), "rvs-admin-env-"));
writeFileSync(
  join(envDir, ".env"),
  "RVS_INITIAL_ADMIN_EMAIL=file-admin@example.test\nRVS_INITIAL_ADMIN_PASSWORD=file-secret\n",
);
const loadedEnv = loadSeedEnv(join(envDir, ".env"), {
  RVS_INITIAL_ADMIN_PASSWORD: "process-secret",
});
assert.equal(loadedEnv.RVS_INITIAL_ADMIN_EMAIL, "file-admin@example.test");
assert.equal(loadedEnv.RVS_INITIAL_ADMIN_PASSWORD, "process-secret");
rmSync(envDir, { recursive: true, force: true });

const workspace = mkdtempSync(join(tmpdir(), "rvs-workspace-root-"));
try {
  writeFileSync(join(workspace, "pnpm-workspace.yaml"), "packages: []\n");
  const sourceLayout = join(workspace, "apps", "api", "database");
  const builtLayout = join(
    workspace,
    "apps",
    "api",
    "dist",
    "apps",
    "api",
    "database",
  );
  mkdirSync(sourceLayout, { recursive: true });
  mkdirSync(builtLayout, { recursive: true });
  assert.equal(findRootEnv(sourceLayout), join(workspace, ".env"));
  assert.equal(findRootEnv(builtLayout), join(workspace, ".env"));
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

const rootBoundary = mkdtempSync(join(tmpdir(), "rvs-workspace-boundary-"));
try {
  assert.throws(() => findRootEnv(rootBoundary), /WORKSPACE_ROOT_NOT_FOUND/);
} finally {
  rmSync(rootBoundary, { recursive: true, force: true });
}

const originalCwd = process.cwd();
try {
  process.chdir(tmpdir());
  assert.equal(
    defaultDatabasePath().endsWith("apps/api/data/app.sqlite"),
    true,
  );
} finally {
  process.chdir(originalCwd);
}

const pathRoot = mkdtempSync(join(tmpdir(), "rvs-db-path-"));
try {
  process.chdir(pathRoot);
  assert.throws(
    () => openDatabase(join("relative", "app.sqlite")),
    /LOCAL_DISK_PATH_REQUIRED/,
  );
  assert.equal(existsSync(join(pathRoot, "relative")), false);
} finally {
  process.chdir(originalCwd);
  rmSync(pathRoot, { recursive: true, force: true });
}

const legacyDb = new Database(":memory:");
legacyDb.pragma("foreign_keys = ON");
legacyDb.exec(
  "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')), (3, datetime('now')); CREATE TABLE tenants (id TEXT PRIMARY KEY); INSERT INTO tenants VALUES ('ten_legacy'); CREATE TABLE reviewer_assignments (id TEXT PRIMARY KEY, tenant_id TEXT, reviewer_id TEXT NOT NULL, gate TEXT NOT NULL, scope TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE cas_objects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sha256 TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0), purpose TEXT NOT NULL, retention_until TEXT NOT NULL, UNIQUE (tenant_id,sha256), UNIQUE (tenant_id,id), FOREIGN KEY (tenant_id) REFERENCES tenants(id))",
);
migrate(legacyDb);
legacyDb.exec(
  "INSERT INTO cas_objects VALUES ('cas_legacy_a','ten_legacy','same-digest','video/mp4',1,'source','2026-08-23T00:00:00Z'); INSERT INTO cas_objects VALUES ('cas_legacy_b','ten_legacy','same-digest','video/mp4',1,'source','2026-08-23T00:00:00Z')",
);
legacyDb.close();

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
migrate(db);
seed(db);
assert.deepEqual(
  db.prepare("SELECT id FROM tenants ORDER BY id").pluck().all(),
  ["ten_platform"],
);
assert.equal(
  db.prepare("SELECT count(*) FROM reviewer_assignments").pluck().get(),
  0,
);
db.exec(
  "INSERT INTO tenants VALUES ('ten_test','Test Studio','ORGANIZATION','ACTIVE',0,'2026-08-22T00:00:00Z'); INSERT INTO users VALUES ('usr_owner','owner@example.test','Test Owner','2026-08-22T00:00:00Z'), ('usr_reviewer','reviewer@example.test','Test Reviewer','2026-08-22T00:00:00Z'); INSERT INTO tenant_memberships VALUES ('ten_test','usr_owner','OWNER','2026-08-22T00:00:00Z'), ('ten_test','usr_reviewer','DESIGNATED_REVIEWER','2026-08-22T00:00:00Z'); INSERT INTO reviewer_assignments(id,tenant_id,reviewer_id,gate,scope,created_at) VALUES ('asn_test_t1','ten_test','usr_reviewer','T1','TENANT','2026-08-22T00:00:00Z'), ('asn_test_t2','ten_test','usr_reviewer','T2','TENANT','2026-08-22T00:00:00Z'), ('asn_test_t3','ten_test','usr_reviewer','T3','TENANT','2026-08-22T00:00:00Z'), ('asn_test_t4','ten_test','usr_reviewer','T4','TENANT','2026-08-22T00:00:00Z'), ('asn_test_t5','ten_test','usr_reviewer','T5','TENANT','2026-08-22T00:00:00Z')",
);
db.exec(
  "INSERT INTO uploads VALUES ('upl_a','ten_test','a.mp4','video/mp4',1,'ACCEPTED',NULL,'2026-08-22T00:00:00Z','2026-08-23T00:00:00Z')",
);
db.exec(
  "INSERT INTO cas_objects VALUES ('cas_dup_a','ten_test','same-digest','video/mp4',1,'source','2026-08-23T00:00:00Z'); INSERT INTO cas_objects VALUES ('cas_dup_b','ten_test','same-digest','video/mp4',1,'source','2026-08-23T00:00:00Z')",
);
db.exec(
  "INSERT INTO jobs VALUES ('job_a','ten_test','usr_owner','upl_a','scene_a','QUEUED',0,0,'2026-08-22T00:00:00Z')",
);
db.exec(
  "INSERT INTO job_attempts VALUES ('att_a','ten_test','job_a',1,'QUEUED','2026-08-22T00:00:00Z')",
);
const rejection = (sql) => assert.throws(() => db.exec(sql));
rejection(
  "INSERT INTO cas_objects VALUES ('cas_x','ten_platform','x','video/mp4',1,'source','2026-08-23T00:00:00Z'); INSERT INTO uploads VALUES ('upl_x','ten_test','x','video/mp4',1,'ACCEPTED','cas_x','2026-08-22T00:00:00Z','2026-08-23T00:00:00Z')",
);
db.prepare(
  "INSERT INTO receipts VALUES ('rcpt_a','ten_test','job_a','att_a',1,'T1','PASS','usr_reviewer',NULL,'[]','2026-08-22T00:00:00Z')",
).run();
rejection("UPDATE receipts SET decision='FAIL' WHERE id='rcpt_a'");
rejection(
  "UPDATE tenants SET deletion_epoch=1 WHERE id='ten_test'; UPDATE tenants SET deletion_epoch=0 WHERE id='ten_test'",
);
rejection(
  "INSERT INTO receipts VALUES ('rcpt_b','ten_test','job_a','att_a',1,'T2','PASS','usr_reviewer','rcpt_a','[]','2026-08-22T00:00:01Z')",
);
db.exec("BEGIN IMMEDIATE");
const claim = db
  .prepare(
    "UPDATE jobs SET state='PREPARING' WHERE id='job_a' AND state='QUEUED'",
  )
  .run();
db.exec("COMMIT");
assert.equal(claim.changes, 1);
assert.equal(
  db
    .prepare(
      "UPDATE jobs SET state='PREPARING' WHERE id='job_a' AND state='QUEUED'",
    )
    .run().changes,
  0,
);
assert.equal(
  db
    .prepare("SELECT sequence FROM receipts ORDER BY sequence")
    .pluck()
    .all()[0],
  1,
);
// Derived from the migrations on disk rather than a hardcoded list: the
// list was left at [1..5] while seven more migrations landed, so this
// assertion had been failing for months and told nobody anything.
assert.deepEqual(
  db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .pluck()
    .all(),
  readdirSync(new URL("./migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => Number.parseInt(name.slice(0, 3), 10))
    .sort((a, b) => a - b),
);
assert.equal(
  db
    .prepare(
      "SELECT name FROM pragma_table_info('reviewer_assignments') WHERE name='release_id'",
    )
    .pluck()
    .get(),
  "release_id",
);
db.prepare(
  "INSERT INTO runtime_review_receipts VALUES ('runtime_rcpt',NULL,'ten_test','job_a','T1',1,1,'{}')",
).run();
rejection(
  "UPDATE runtime_review_receipts SET value_json='{\"changed\":true}' WHERE id='runtime_rcpt'",
);
rejection("DELETE FROM runtime_review_receipts WHERE id='runtime_rcpt'");
console.log(
  JSON.stringify({
    integrity: db.pragma("integrity_check", { simple: true }),
    negativeCases: 6,
    duplicateCasAllowed: true,
    singleClaim: true,
    orderedReceipts: true,
  }),
);
db.close();
