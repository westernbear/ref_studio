import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const workspace = resolve(import.meta.dirname, "../..");
const verifier = resolve(import.meta.dirname, "verify.mjs");

await test("verifies the standalone worker Compose deployment contract", () => {
  // Given / When
  const result = spawnSync(process.execPath, [verifier], {
    cwd: workspace,
    encoding: "utf8",
  });
  // Then
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.workerComposeIsolation, "verified");
  assert.deepEqual(report.workerRestartAlways, ["api-relay", "worker"]);
  assert.equal(report.workerToken, "root-env-or-worker-env");
  assert.equal(report.workerRelay, "verified");
  assert.deepEqual(report.workerComposeServices, ["api-relay", "worker"]);
  assert.equal(report.workerApiTimeoutMs, 30_000);
  assert.equal(report.workerMediaTimeoutMs, 1_800_000);
});
