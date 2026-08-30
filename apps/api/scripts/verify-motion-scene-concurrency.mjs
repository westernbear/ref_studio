import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(import.meta.url);
const parseResult = (value) => {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).sort().join(",") !== "digest,version" ||
    !Number.isInteger(value.version) ||
    typeof value.digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.digest)
  )
    throw new Error("INVALID_CONCURRENCY_RESPONSE");
  return value;
};

if (process.argv[2] === "child") {
  const [
    { openDatabase },
    { commitMotionSceneVersion },
    { fixtureSpec },
    { verifyMotionScene },
  ] = await Promise.all([
    import("../dist/apps/api/database/db.mjs"),
    import("../dist/apps/api/src/motion-scene-store.js"),
    import("../dist/packages/contracts/src/scene-spec.fixture.js"),
    import("../dist/apps/api/src/motion-operations.js"),
  ]);
  process.once(
    "message",
    ({ file, key, requestDigest, expectedSceneDigest }) => {
      const db = openDatabase(file);
      const job = {
        id: "job_concurrency",
        tenantId: "ten_concurrency",
        authoredScene: null,
      };
      const scene = {
        ...fixtureSpec,
        palette: {
          ...fixtureSpec.palette,
          hero: `#${requestDigest.slice(0, 6)}`,
        },
      };
      try {
        const result = commitMotionSceneVersion({
          db,
          job,
          scene,
          verification: verifyMotionScene(scene),
          expectedSceneDigest,
          idempotency: {
            key,
            requestDigest,
            response: (row) => ({
              version: row.version,
              digest: row.sceneDigest,
            }),
            parseResponse: parseResult,
          },
        });
        process.send?.({
          ok: true,
          replayed: result.replayed,
          response: result.response,
        });
      } catch (error) {
        process.send?.({
          ok: false,
          code: error instanceof Error ? error.message : String(error),
        });
      } finally {
        db.close();
      }
    },
  );
  process.send?.({ ready: true });
} else {
  const [
    { openDatabase, migrate },
    { insertMotionSceneVersion },
    { fixtureSpec },
    { verifyMotionScene },
  ] = await Promise.all([
    import("../dist/apps/api/database/db.mjs"),
    import("../dist/apps/api/src/motion-scene-store.js"),
    import("../dist/packages/contracts/src/scene-spec.fixture.js"),
    import("../dist/apps/api/src/motion-operations.js"),
  ]);
  const directory = mkdtempSync(join(tmpdir(), "rvs-motion-concurrency-"));
  const file = join(directory, "scene.sqlite");
  const db = openDatabase(file);
  migrate(db);
  db.exec(
    "INSERT INTO tenants VALUES ('ten_concurrency','Concurrency','ORGANIZATION','ACTIVE',0,'2026-01-01T00:00:00Z')",
  );
  const job = {
    id: "job_concurrency",
    tenantId: "ten_concurrency",
    authoredScene: null,
  };
  const initial = insertMotionSceneVersion(
    db,
    job,
    fixtureSpec,
    verifyMotionScene(fixtureSpec),
  );
  db.close();

  const race = (keyA, keyB, hashA, hashB, expectedSceneDigest) =>
    new Promise((resolve, reject) => {
      const children = [
        fork(script, ["child"], {
          stdio: ["ignore", "ignore", "inherit", "ipc"],
        }),
        fork(script, ["child"], {
          stdio: ["ignore", "ignore", "inherit", "ipc"],
        }),
      ];
      const ready = new Set();
      const results = [];
      children.forEach((child, index) =>
        child.on("message", (message) => {
          if (message.ready) {
            ready.add(index);
            if (ready.size === 2)
              children.forEach((candidate, childIndex) =>
                candidate.send({
                  file,
                  key: childIndex === 0 ? keyA : keyB,
                  requestDigest: childIndex === 0 ? hashA : hashB,
                  expectedSceneDigest,
                }),
              );
            return;
          }
          results[index] = message;
          child.disconnect();
          if (results.filter(Boolean).length === 2) resolve(results);
        }),
      );
      children.forEach((child) => child.on("error", reject));
    });

  try {
    const hash = "a".repeat(64);
    const identical = await race(
      "same-key",
      "same-key",
      hash,
      hash,
      initial.sceneDigest,
    );
    assert.equal(
      identical.every((result) => result.ok),
      true,
    );
    assert.equal(identical.filter((result) => result.replayed).length, 1);
    assert.deepEqual(identical[0].response, identical[1].response);
    const dbAfterReplay = openDatabase(file);
    const head = dbAfterReplay
      .prepare(
        "SELECT v.scene_digest FROM job_motion_scene_heads h JOIN motion_scene_versions v ON v.id=h.version_id WHERE h.tenant_id=? AND h.job_id=?",
      )
      .pluck()
      .get(job.tenantId, job.id);
    const stale = await race(
      "stale-a",
      "stale-b",
      "b".repeat(64),
      "c".repeat(64),
      head,
    );
    assert.equal(stale.filter((result) => result.ok).length, 1);
    assert.equal(
      stale.filter((result) => result.code === "VERSION_CONFLICT").length,
      1,
    );
    assert.deepEqual(
      dbAfterReplay
        .prepare("SELECT version FROM motion_scene_versions ORDER BY version")
        .pluck()
        .all(),
      [1, 2, 3],
    );
    dbAfterReplay.close();
    console.log(
      JSON.stringify({
        identicalReplay: true,
        staleConflict: true,
        versions: [1, 2, 3],
      }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
