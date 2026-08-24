import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument)
  throw new Error("usage: run-worker-pipeline.mjs <source.mp4> <output-dir>");

const sourcePath = resolve(sourceArgument);
const outputPath = resolve(outputArgument);
const workerDist = resolve(process.env.RVS_WORKER_DIST ?? "/app/dist");
const { createWorkflowJobHandler } = await import(
  pathToFileURL(resolve(workerDist, "worker-job-handler.js")).href
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = await readFile(sourcePath);
await mkdir(outputPath, { recursive: true });

const uploads = new Map();
const api = {
  downloadSource: async () => source,
  reportProgress: async () => undefined,
  uploadPreview: async (_jobId, bytes) => {
    const copy = Uint8Array.from(bytes);
    await writeFile(resolve(outputPath, "preview.mp4"), copy);
    const digest = sha256(copy);
    uploads.set("preview", { digest, sizeBytes: copy.byteLength });
    return {
      artifactId: `preview_${digest.slice(0, 16)}`,
      sha256: digest,
      sizeBytes: copy.byteLength,
    };
  },
  uploadArtifact: async (_jobId, bytes) => {
    const copy = Uint8Array.from(bytes);
    await writeFile(resolve(outputPath, "delivery.mp4"), copy);
    const digest = sha256(copy);
    uploads.set("delivery", { digest, sizeBytes: copy.byteLength });
    return {
      artifactId: `artifact_${digest.slice(0, 16)}`,
      sha256: digest,
      sizeBytes: copy.byteLength,
    };
  },
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
  source: { sha256: sha256(source), sizeBytes: source.byteLength },
  analysis: {
    evidenceDigest: analysis.evidenceDigest,
    normalized: analysis.normalized,
  },
  compilation: {
    authoringDigest: compilation.compilation.authoring.digest,
    sceneDigest: compilation.compilation.scene.digest,
    browserPassSpecDigest: compilation.compilation.browserPassSpec.digest,
  },
  preview: { ...uploads.get("preview"), report: preview.report },
  render: { ...uploads.get("delivery"), report: render.report },
};
await writeFile(
  resolve(outputPath, "worker-result.json"),
  JSON.stringify(summary, null, 2),
);
process.stdout.write(`${JSON.stringify({ status: "PASS", ...summary })}\n`);
