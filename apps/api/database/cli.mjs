import fs from "node:fs";
import path from "node:path";
import {
  defaultDatabasePath,
  loadSeedEnv,
  migrate,
  openDatabase,
  seed,
} from "./db.mjs";
const command = process.argv[2];
const file = path.resolve(process.env.DATABASE_PATH ?? defaultDatabasePath());
if (command === "reset") {
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}-wal`, { force: true });
  fs.rmSync(`${file}-shm`, { force: true });
}
const db = openDatabase(file);
const seedEnv = loadSeedEnv();
if (command === "migrate" || command === "reset") migrate(db);
if (command === "reset") seed(db, seedEnv);
if (command === "verify") {
  migrate(db);
  seed(db, seedEnv);
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error(`INTEGRITY_CHECK_${integrity}`);
  const exists = (sql, ...params) => db.prepare(sql).get(...params);
  for (const [table, id] of [
    ["tenants", "ten_platform"],
    ["tenants", "ten_stitch_demo"],
    ["users", "usr_platform"],
    ["users", "usr_owner"],
    ["users", "usr_reviewer"],
    ["credentials", "cred_platform_password"],
    ["credentials", "cred_owner_password"],
    ["credentials", "cred_reviewer_password"],
    ["reviewer_assignments", "asn_release_t6"],
  ])
    if (!exists(`SELECT 1 FROM ${table} WHERE id=?`, id))
      throw new Error(`SEED_MISSING_${table}_${id}`);
  if (
    !exists("SELECT 1 FROM tenant_quotas WHERE tenant_id=?", "ten_stitch_demo")
  )
    throw new Error("SEED_MISSING_tenant_quotas_ten_stitch_demo");
  for (const [tenantId, userId, role] of [
    ["ten_platform", "usr_platform", "SUPER_ADMIN"],
    ["ten_stitch_demo", "usr_owner", "OWNER"],
    ["ten_stitch_demo", "usr_reviewer", "DESIGNATED_REVIEWER"],
  ])
    if (
      !exists(
        "SELECT 1 FROM tenant_memberships WHERE tenant_id=? AND user_id=? AND role=?",
        tenantId,
        userId,
        role,
      )
    )
      throw new Error(`SEED_MISSING_tenant_memberships_${tenantId}_${userId}`);
  console.log(
    JSON.stringify({
      integrity,
      seeded: {
        tenants: db.prepare("SELECT count(*) AS count FROM tenants").get()
          .count,
        users: db.prepare("SELECT count(*) AS count FROM users").get().count,
        memberships: db
          .prepare("SELECT count(*) AS count FROM tenant_memberships")
          .get().count,
        reviewerAssignments: db
          .prepare("SELECT count(*) AS count FROM reviewer_assignments")
          .get().count,
        quotas: db.prepare("SELECT count(*) AS count FROM tenant_quotas").get()
          .count,
      },
      pragmas: {
        journalMode: db.pragma("journal_mode", { simple: true }),
        foreignKeys: db.pragma("foreign_keys", { simple: true }),
        busyTimeout: db.pragma("busy_timeout", { simple: true }),
      },
    }),
  );
}
db.close();
