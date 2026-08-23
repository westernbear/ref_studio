import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrate, seed } from "./db.mjs";

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
migrate(db);
seed(db);
db.exec(
  "INSERT INTO uploads VALUES ('upl_a','ten_stitch_demo','a.mp4','video/mp4',1,'ACCEPTED',NULL,'2026-08-22T00:00:00Z','2026-08-23T00:00:00Z')",
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
    singleClaim: true,
    orderedReceipts: true,
  }),
);
db.close();
