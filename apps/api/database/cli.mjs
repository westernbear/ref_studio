import fs from "node:fs";
import path from "node:path";
import { migrate, openDatabase, seed } from "./db.mjs";
const command = process.argv[2];
const file = path.resolve(
  process.env.DATABASE_PATH ?? "apps/api/data/app.sqlite",
);
if (command === "reset") {
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}-wal`, { force: true });
  fs.rmSync(`${file}-shm`, { force: true });
}
const db = openDatabase(file);
if (command === "migrate" || command === "reset") migrate(db);
if (command === "reset") seed(db);
if (command === "verify") {
  migrate(db);
  seed(db);
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error(`INTEGRITY_CHECK_${integrity}`);
  for (const [table, expected] of [
    ["tenants", 2],
    ["users", 3],
    ["tenant_memberships", 3],
    ["reviewer_assignments", 1],
    ["tenant_quotas", 1],
  ]) {
    const count = db
      .prepare(`SELECT count(*) AS count FROM ${table}`)
      .get().count;
    if (count !== expected) throw new Error(`SEED_COUNT_${table}_${count}`);
  }
  console.log(
    JSON.stringify({
      integrity,
      seeded: {
        tenants: 2,
        users: 3,
        memberships: 3,
        reviewerAssignments: 1,
        quotas: 1,
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
