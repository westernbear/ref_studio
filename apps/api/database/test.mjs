import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { defaultDatabasePath, loadSeedEnv, migrate, seed } from "./db.mjs";

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

const legacyDb = new Database(":memory:");
legacyDb.pragma("foreign_keys = ON");
legacyDb.exec(
  "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); CREATE TABLE tenants (id TEXT PRIMARY KEY); INSERT INTO tenants VALUES ('ten_legacy'); CREATE TABLE cas_objects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sha256 TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0), purpose TEXT NOT NULL, retention_until TEXT NOT NULL, UNIQUE (tenant_id,sha256), UNIQUE (tenant_id,id), FOREIGN KEY (tenant_id) REFERENCES tenants(id))",
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
db.exec(
  "INSERT INTO uploads VALUES ('upl_a','ten_stitch_demo','a.mp4','video/mp4',1,'ACCEPTED',NULL,'2026-08-22T00:00:00Z','2026-08-23T00:00:00Z')",
);
db.exec(
  "INSERT INTO cas_objects VALUES ('cas_dup_a','ten_stitch_demo','same-digest','video/mp4',1,'source','2026-08-23T00:00:00Z'); INSERT INTO cas_objects VALUES ('cas_dup_b','ten_stitch_demo','same-digest','video/mp4',1,'source','2026-08-23T00:00:00Z')",
);
db.exec(
  "INSERT INTO jobs VALUES ('job_a','ten_stitch_demo','usr_owner','upl_a','scene_a','QUEUED',0,0,'2026-08-22T00:00:00Z')",
);
db.exec(
  "INSERT INTO job_attempts VALUES ('att_a','ten_stitch_demo','job_a',1,'QUEUED','2026-08-22T00:00:00Z')",
);
const rejection = (sql) => assert.throws(() => db.exec(sql));
rejection(
  "INSERT INTO cas_objects VALUES ('cas_x','ten_platform','x','video/mp4',1,'source','2026-08-23T00:00:00Z'); INSERT INTO uploads VALUES ('upl_x','ten_stitch_demo','x','video/mp4',1,'ACCEPTED','cas_x','2026-08-22T00:00:00Z','2026-08-23T00:00:00Z')",
);
db.prepare(
  "INSERT INTO receipts VALUES ('rcpt_a','ten_stitch_demo','job_a','att_a',1,'T1','PASS','usr_reviewer',NULL,'[]','2026-08-22T00:00:00Z')",
).run();
rejection("UPDATE receipts SET decision='FAIL' WHERE id='rcpt_a'");
rejection(
  "UPDATE tenants SET deletion_epoch=1 WHERE id='ten_stitch_demo'; UPDATE tenants SET deletion_epoch=0 WHERE id='ten_stitch_demo'",
);
rejection(
  "INSERT INTO receipts VALUES ('rcpt_b','ten_stitch_demo','job_a','att_a',1,'T2','PASS','usr_reviewer','rcpt_a','[]','2026-08-22T00:00:01Z')",
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
console.log(
  JSON.stringify({
    integrity: db.pragma("integrity_check", { simple: true }),
    negativeCases: 4,
    duplicateCasAllowed: true,
    singleClaim: true,
    orderedReceipts: true,
  }),
);
db.close();
