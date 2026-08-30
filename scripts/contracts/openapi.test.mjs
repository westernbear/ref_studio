import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFile, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const workspace = resolve(import.meta.dirname, "../..");
const generator = resolve(import.meta.dirname, "openapi.mjs");
const apiMirror = resolve(workspace, "apps/api/openapi.json");

await test("accepts both checked OpenAPI mirrors when their bytes match the canonical output", () => {
  // Given / When
  const result = spawnSync(process.execPath, [generator, "--check"], {
    cwd: workspace,
    encoding: "utf8",
  });
  // Then
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "verified");
  assert.equal(report.canonicalSha256, report.contractsMirrorSha256);
  assert.equal(report.canonicalSha256, report.apiMirrorSha256);
});

await test("rejects a mirror whose bytes differ from the canonical OpenAPI output", async () => {
  // Given
  const directory = await mkdtemp(resolve(tmpdir(), "rvs-openapi-"));
  const staleMirror = resolve(directory, "openapi.json");
  await copyFile(apiMirror, staleMirror);
  await appendFile(staleMirror, " ");
  // When
  const result = spawnSync(
    process.execPath,
    [generator, "--check", "--api-mirror", staleMirror],
    { cwd: workspace, encoding: "utf8" },
  );
  // Then
  await rm(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /OPENAPI_MIRROR_MISMATCH/);
});
