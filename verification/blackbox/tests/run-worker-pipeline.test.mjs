import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const workspace = resolve(import.meta.dirname, "../../..");
const runner = resolve(
  workspace,
  "verification/blackbox/run-worker-pipeline.mjs",
);
const exampleResult = resolve(
  workspace,
  "examples/heygen-reference-project/result.json",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const provenance = {
  rootSha: "1".repeat(40),
  workerSha: "2".repeat(40),
  workerDockerImageId: `sha256:${"3".repeat(64)}`,
  workerDockerImageDigest: `registry.example/worker@sha256:${"4".repeat(64)}`,
  inputZipSha256: "5".repeat(64),
};
const fakeHandler = `
import { appendFile, writeFile } from "node:fs/promises";

export const createWorkflowJobHandler = ({ api }) => async (job, signal) => {
  const phase = job.payload.phase;
  await appendFile(process.env.RVS_TEST_CALLS, \`${"${phase}"}\\n\`);
  if (phase === "analyze")
    return {
      phase,
      evidence: JSON.parse(process.env.RVS_TEST_EVIDENCE),
      evidenceDigest: process.env.RVS_TEST_EVIDENCE_DIGEST,
      normalized: { sha256: "a".repeat(64), durationMs: 4000, fps: 30, frameCount: 120 },
    };
  if (phase === "compile")
    return {
      phase,
      compilation: {
        authoring: { digest: "b".repeat(64) },
        scene: { digest: "c".repeat(64) },
        browserPassSpec: { digest: "d".repeat(64) },
      },
    };
  await writeFile(process.env.RVS_TEST_MEDIA, phase);
  if (phase === "preview") {
    await api.uploadPreview(job.jobId, process.env.RVS_TEST_MEDIA, signal);
    return { phase, report: { mode: "preview" } };
  }
  await api.uploadArtifact(job.jobId, process.env.RVS_TEST_MEDIA, signal);
  return { phase, report: { mode: "delivery" } };
};
`;

async function fixture(evidence) {
  const directory = await mkdtemp(resolve(tmpdir(), "rvs-worker-runner-"));
  const dist = resolve(directory, "dist");
  const output = resolve(directory, "output");
  const source = resolve(directory, "source.mp4");
  const calls = resolve(directory, "calls.log");
  const media = resolve(directory, "fake-media.mp4");
  const sourceBytes = Buffer.from("exact source bytes\n");
  await mkdir(dist);
  await writeFile(resolve(dist, "package.json"), '{"type":"module"}\n');
  await writeFile(resolve(dist, "worker-job-handler.js"), fakeHandler);
  await writeFile(source, sourceBytes);
  const evidenceDigest = sha256(JSON.stringify(evidence));
  return {
    calls,
    directory,
    evidence,
    media,
    output,
    source,
    sourceSha256: sha256(sourceBytes),
    env: {
      ...process.env,
      RVS_ROOT_SHA: provenance.rootSha,
      RVS_WORKER_SHA: provenance.workerSha,
      RVS_WORKER_IMAGE_ID: provenance.workerDockerImageId,
      RVS_WORKER_IMAGE_DIGEST: provenance.workerDockerImageDigest,
      RVS_INPUT_ZIP_SHA256: provenance.inputZipSha256,
      RVS_SOURCE_SHA256: sha256(sourceBytes),
      RVS_WORKER_DIST: dist,
      RVS_TEST_CALLS: calls,
      RVS_TEST_EVIDENCE: JSON.stringify(evidence),
      RVS_TEST_EVIDENCE_DIGEST: evidenceDigest,
      RVS_TEST_MEDIA: media,
    },
  };
}

const run = (created) =>
  spawnSync(process.execPath, [runner, created.source, created.output], {
    cwd: workspace,
    encoding: "utf8",
    env: created.env,
  });
const json = async (path) => JSON.parse(await readFile(path, "utf8"));

await test("refuses unresolved evidence before compile, preview, or render", async () => {
  // Given
  const needsChoice = {
    state: "NEEDS_CHOICE",
    choiceId: "choice_foreground_subject_ownership",
    reason: "ambiguous-matte-evidence",
  };
  const created = await fixture({
    state: "NEEDS_CHOICE",
    needsChoice: [needsChoice],
    sceneInput: { gate: "PENDING", needsChoice: [needsChoice] },
  });
  try {
    // When
    const result = run(created);
    // Then
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /UNRESOLVED_CHOICE_SKIPPED choice_foreground_subject_ownership/,
    );
    assert.equal(await readFile(created.calls, "utf8"), "analyze\n");
    assert.deepEqual(
      await json(resolve(created.output, "evidence.json")),
      created.evidence,
    );
  } finally {
    await rm(created.directory, { recursive: true, force: true });
  }
});

await test("reports successful work as a non-authoritative technical pipeline", async () => {
  // Given
  const created = await fixture({
    state: "MAPPED",
    needsChoice: [],
    sceneInput: { gate: "READY", needsChoice: [] },
  });
  try {
    // When
    const result = run(created);
    // Then
    assert.equal(result.status, 0, result.stderr);
    const stdout = JSON.parse(result.stdout.trim());
    const recorded = await json(resolve(created.output, "worker-result.json"));
    assert.deepEqual(stdout, recorded);
    assert.equal(recorded.status, "TECHNICAL_PIPELINE_COMPLETED");
    assert.equal(recorded.gateAuthoritative, false);
    assert.deepEqual(recorded.provenance, provenance);
    assert.equal(recorded.source.sha256, created.sourceSha256);
    assert.equal(recorded.preview.digest, sha256("preview"));
    assert.equal(recorded.render.digest, sha256("render"));
    const recordedProvenance = await json(
      resolve(created.output, "provenance.json"),
    );
    assert.deepEqual(
      {
        rootSha: recordedProvenance.rootSha,
        workerSha: recordedProvenance.workerSha,
        workerDockerImageId: recordedProvenance.workerDockerImageId,
        workerDockerImageDigest: recordedProvenance.workerDockerImageDigest,
        inputZipSha256: recordedProvenance.inputZipSha256,
      },
      provenance,
    );
  } finally {
    await rm(created.directory, { recursive: true, force: true });
  }
});

await test("checked-in HeyGen evidence records no gate approval", async () => {
  // Given / When
  const result = await json(exampleResult);
  // Then
  assert.equal(result.status, "TECHNICAL_PIPELINE_COMPLETED");
  assert.equal(result.gateAuthoritative, false);
  assert.equal(result.workflow.choiceResolution.status, "UNRESOLVED");
  assert.deepEqual(result.workflow.choiceResolution.choiceIds, [
    "choice_foreground_subject_ownership",
  ]);
  assert.deepEqual(result.workflow.tenantGates, {
    scope: "T1-T5",
    status: "NOT_ESTABLISHED",
    receiptIds: [],
  });
  assert.deepEqual(result.workflow.releaseGate, {
    gate: "T6",
    status: "NOT_RUN",
    receiptId: null,
  });
});
