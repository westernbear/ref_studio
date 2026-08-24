import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument)
  throw new Error("usage: run-worker-pipeline.mjs <source.mp4> <output-dir>");

const exact = (name, pattern) => {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name}_REQUIRED`);
  if (!pattern.test(value)) throw new Error(`${name}_INVALID`);
  return value;
};
const sha256Pattern = /^[0-9a-f]{64}$/;
const provenance = {
  rootSha: exact("RVS_ROOT_SHA", /^[0-9a-f]{40}$/),
  workerSha: exact("RVS_WORKER_SHA", /^[0-9a-f]{40}$/),
  workerDockerImageId: exact("RVS_WORKER_IMAGE_ID", /^sha256:[0-9a-f]{64}$/),
  workerDockerImageDigest: exact(
    "RVS_WORKER_IMAGE_DIGEST",
    /^(?:[^@\s]+@)?sha256:[0-9a-f]{64}$/,
  ),
  inputZipSha256: exact("RVS_INPUT_ZIP_SHA256", sha256Pattern),
};
const expectedSourceSha256 = exact("RVS_SOURCE_SHA256", sha256Pattern);
const sourcePath = resolve(sourceArgument);
const outputPath = resolve(outputArgument);
const workerDist = resolve(process.env.RVS_WORKER_DIST ?? "/app/dist");
const { createWorkflowJobHandler } = await import(
  pathToFileURL(resolve(workerDist, "worker-job-handler.js")).href
);
const sha256 = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};
const sourceSha256 = await sha256(sourcePath);
if (expectedSourceSha256 !== sourceSha256)
  throw new Error("RVS_SOURCE_SHA256_MISMATCH");
await mkdir(outputPath, { recursive: true });

const uploadTargets = {
  preview: { filename: "preview.mp4", artifactPrefix: "preview" },
  delivery: { filename: "delivery.mp4", artifactPrefix: "artifact" },
};
const uploads = {};
const storeUpload = async (kind, source) => {
  const target = uploadTargets[kind];
  const destination = resolve(outputPath, target.filename);
  await copyFile(source, destination);
  const [digest, metadata] = await Promise.all([
    sha256(destination),
    stat(destination),
  ]);
  uploads[kind] = { digest, sizeBytes: metadata.size };
  return {
    artifactId: `${target.artifactPrefix}_${digest.slice(0, 16)}`,
    sha256: digest,
    sizeBytes: metadata.size,
  };
};
const api = {
  downloadSource: async (_jobId, destination) =>
    copyFile(sourcePath, destination),
  reportProgress: async () => undefined,
  uploadPreview: async (_jobId, source) => storeUpload("preview", source),
  uploadArtifact: async (_jobId, source) => storeUpload("delivery", source),
};
const handler = createWorkflowJobHandler({
  api,
  workRoot: resolve(outputPath, "work"),
});
const signal = new AbortController().signal;
const common = {
  tenantId: "ten_heygen_example",
  uploadId: "upl_heygen_example",
  startFrame: 0,
  sourceFps: 30,
  frameCount: 120,
  deletionEpoch: 0,
  restoreEpoch: 0,
};
const claimed = (phase, payload) => ({
  jobId: "job_heygen_example",
  attemptId: "attempt_heygen_1",
  leaseToken: "one-shot-lease",
  leaseExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  payload: { ...common, phase, ...payload },
});

const analysis = await handler(claimed("analyze", {}), signal);
if (analysis?.phase !== "analyze") throw new Error("ANALYSIS_RESULT_INVALID");
await writeFile(
  resolve(outputPath, "evidence.json"),
  JSON.stringify(analysis.evidence),
);
const unresolvedChoices = Array.isArray(analysis.evidence?.needsChoice)
  ? analysis.evidence.needsChoice
  : [];
if (unresolvedChoices.length > 0)
  throw new Error(
    `UNRESOLVED_CHOICE_SKIPPED ${unresolvedChoices
      .map((choice) => choice?.choiceId ?? "unknown")
      .join(",")}`,
  );
const compilation = await handler(
  claimed("compile", { evidence: analysis.evidence }),
  signal,
);
if (compilation?.phase !== "compile")
  throw new Error("COMPILATION_RESULT_INVALID");
const renderPayload = {
  evidence: analysis.evidence,
  evidenceDigest: analysis.evidenceDigest,
  compilation: compilation.compilation,
  browserPassSpecDigest: compilation.compilation.browserPassSpec.digest,
};
const preview = await handler(claimed("preview", renderPayload), signal);
if (preview?.phase !== "preview") throw new Error("PREVIEW_RESULT_INVALID");
const render = await handler(claimed("render", renderPayload), signal);
if (render?.phase !== "render") throw new Error("RENDER_RESULT_INVALID");

const summary = {
  protocol: "rvs.worker-one-shot.v1",
  status: "TECHNICAL_PIPELINE_COMPLETED",
  gateAuthoritative: false,
  provenance,
  source: { sha256: sourceSha256, sizeBytes: (await stat(sourcePath)).size },
  analysis: {
    evidenceDigest: analysis.evidenceDigest,
    normalized: analysis.normalized,
  },
  compilation: {
    authoringDigest: compilation.compilation.authoring.digest,
    sceneDigest: compilation.compilation.scene.digest,
    browserPassSpecDigest: compilation.compilation.browserPassSpec.digest,
  },
  preview: { ...uploads.preview, report: preview.report },
  render: { ...uploads.delivery, report: render.report },
};
await writeFile(
  resolve(outputPath, "worker-result.json"),
  JSON.stringify(summary, null, 2),
);
await writeFile(
  resolve(outputPath, "provenance.json"),
  JSON.stringify(
    {
      protocol: "rvs.worker-provenance.v1",
      ...provenance,
      source: summary.source,
      compilation: summary.compilation,
      preview: uploads.preview,
      delivery: uploads.delivery,
    },
    null,
    2,
  ),
);
process.stdout.write(`${JSON.stringify(summary)}\n`);
