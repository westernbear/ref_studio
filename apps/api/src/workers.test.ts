import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildAuthApp } from "./app.js";
import { hashWorkerToken, createWorkerStore } from "./workers.js";
import type { AuthStore } from "./auth.js";
import {
  createCreatorWorkflowStore,
  RUNTIME_DIGEST,
  type CreatorWorkflowStore,
  type Job,
} from "./creator-workflow.js";
import type { UploadStore } from "./uploads.js";

const sourceBytes = Uint8Array.from([
  0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109,
]);
const preflight = {
  status: "PASS",
  chromiumVersion: "151.0.7922.138",
  renderer: "ANGLE SwiftShader",
  fontReady: true,
  webgl2: true,
  networkPolicy: "external-blocked",
  repeatedFrameByteIdentity: true,
  ffmpeg: true,
  ffprobe: true,
  compilerModels: true,
  runtimeDigest: RUNTIME_DIGEST,
} as const;
const registration = (capabilities: readonly string[]) => ({
  workerId: "worker-a",
  capabilities,
  preflight,
});
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const renderReport = (job: Job, attemptId: string, bytes: Uint8Array) => ({
  status: "PASS",
  protocol: "rvs.render-report.v1",
  mode: "delivery",
  jobId: job.id,
  attemptId,
  outputSha256: sha256(bytes),
  outputBytes: bytes.byteLength,
  ir: {
    authoringDigest: "a".repeat(64),
    sceneDigest: "b".repeat(64),
    browserPassSpecDigest: "c".repeat(64),
  },
  runtime: {
    chromiumVersion: "151.0.7922.138",
    renderer: preflight.renderer,
    fontReady: true,
    webgl2: true,
    networkPolicy: "external-blocked",
    repeatedFrameByteIdentity: true,
    frameSha256: Array<string>(120).fill("d".repeat(64)),
    passIds: ["background-dom", "final-composite"],
    shaderDiagnostics: [
      {
        shader: "residual-gradient",
        compiled: true,
        linked: true,
        log: "",
      },
    ],
    limits: { MAX_TEXTURE_SIZE: 16_384, MAX_RENDERBUFFER_SIZE: 16_384 },
  },
  qc: {
    status: "PASS",
    durationMs: 4_000,
    width: 1080,
    height: 1920,
    frameCount: 120,
    fps: 30,
    videoCodec: "h264",
    audioCodec: "aac",
    audioChannels: 2,
    audioSampleRateHz: 48_000,
  },
});
const uploadFixture = (): UploadStore => ({
  uploads: new Map([
    [
      "upl_a",
      {
        id: "upl_a",
        tenantId: "ten_a",
        filename: "reference.mp4",
        contentType: "video/mp4",
        sizeBytes: sourceBytes.byteLength,
        state: "ACCEPTED",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-02T00:00:00.000Z",
        casObjectId: "cas_a",
        chunks: [sourceBytes],
        actualBytes: sourceBytes.byteLength,
      },
    ],
  ]),
  cas: new Map(),
  casByTenantDigest: new Map(),
  now: () => 1_000,
});

const appFixture = (
  workflow?: CreatorWorkflowStore,
  uploads = uploadFixture(),
) => {
  const token = "worker-test-token";
  const workers = createWorkerStore(hashWorkerToken(token));
  const auth: AuthStore = {
    users: [],
    credentials: [],
    memberships: [],
    assignments: [],
    sessions: [],
    apiTokens: [],
    audit: () => undefined,
  };
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "not-a-worker-token",
    workers,
    creatorWorkflow: workflow,
    uploads,
    now: () => 1_000,
  });
  return {
    app,
    workers,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  };
};
const addJob = (workflow: CreatorWorkflowStore, state: Job["state"]): Job => {
  const job: Job = {
    id: `job-${state.toLowerCase()}`,
    tenantId: "ten_a",
    creatorId: "server",
    uploadId: "upl_a",
    state,
    attempt: 1,
    etag: '"etag"',
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    irDigest: "ir",
    evidenceDigest: "evidence",
    approved: state === "QUEUED",
    startFrame: 0,
    sourceFps: 30,
    frameCount: 120,
    evidence: state === "PREPARING" ? null : { state: "MAPPED" },
    runtimePreflight: state === "PREPARING" ? null : preflight,
    progress: null,
    artifact: null,
  };
  workflow.jobs.set(job.id, job);
  workflow.attempts.set(job.id, [
    { id: "attempt-a", number: 1, state: "QUEUED", immutable: true },
  ]);
  return job;
};

describe("worker registration API", () => {
  it("Given a valid bearer token, when registering and heartbeating, then stores the worker lifecycle state", async () => {
    const fixture = appFixture();
    const registered = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: registration(["compiler"]),
    });
    const heartbeat = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/heartbeat",
      headers: fixture.headers,
      payload: { capabilities: ["compiler", "renderer"] },
    });
    expect(registered.statusCode).toBe(200);
    expect(registered.json()).toEqual({ workerId: "worker-a" });
    expect(heartbeat.json()).toEqual({ workerId: "worker-a" });
    expect(fixture.workers.workers.get("worker-a")).toMatchObject({
      capabilities: ["compiler", "renderer"],
      lastHeartbeat: 1_000,
      status: "ONLINE",
      preflight: { status: "PASS", runtimeDigest: RUNTIME_DIGEST },
    });
    await fixture.app.close();
  });

  it("rejects workers that do not provide a passing runtime preflight", async () => {
    const fixture = appFixture();
    const response = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: { workerId: "worker-a", capabilities: ["compiler"] },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("INVALID_REQUEST");
    expect(fixture.workers.workers.size).toBe(0);
    await fixture.app.close();
  });

  it("Given no bearer token, when registering, then rejects the request without storing a worker", async () => {
    const fixture = appFixture();
    const response = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      payload: registration(["compiler"]),
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(fixture.workers.workers.size).toBe(0);
    await fixture.app.close();
  });

  it("Given a registered worker, when claiming and completing an unknown job, then returns no job and a safe not-found error", async () => {
    const fixture = appFixture();
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: registration(["compiler"]),
    });
    const claim = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: fixture.headers,
      payload: {},
    });
    const complete = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/jobs/job-missing/complete",
      headers: fixture.headers,
      payload: { result: {} },
    });
    expect(claim.json()).toEqual({ job: null });
    expect(complete.statusCode).toBe(404);
    expect(complete.json().error.code).toBe("RESOURCE_NOT_FOUND");
    await fixture.app.close();
  });

  it("Given a preparing workflow job, when claimed and completed, then marks it ready", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow);
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: registration(["compiler"]),
    });
    const claim = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: fixture.headers,
      payload: {},
    });
    const source = await fixture.app.inject({
      method: "GET",
      url: `/v1/workers/worker-a/jobs/${job.id}/source`,
      headers: { authorization: fixture.headers.authorization },
    });
    const invalidComplete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: { result: { ok: true } },
    });
    const preview = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/preview-artifact`,
      headers: {
        authorization: fixture.headers.authorization,
        "content-type": "application/octet-stream",
      },
      payload: Buffer.from("preview-mp4-bytes"),
    });
    const evidence = { state: "MAPPED", measurements: [] };
    const digestMismatch = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "prepare",
          evidence,
          evidenceDigest: "a".repeat(64),
          previewArtifactId: preview.json().artifactId,
          normalized: {
            sha256: "b".repeat(64),
            durationMs: 4_000,
            fps: 30,
            frameCount: 120,
          },
        },
      },
    });
    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "prepare",
          evidence,
          evidenceDigest: sha256(JSON.stringify(evidence)),
          previewArtifactId: preview.json().artifactId,
          normalized: {
            sha256: "b".repeat(64),
            durationMs: 4_000,
            fps: 30,
            frameCount: 120,
          },
        },
      },
    });
    expect(claim.json().job).toMatchObject({
      jobId: job.id,
      attemptId: "attempt-a",
      payload: {
        phase: "prepare",
        startFrame: 0,
        sourceFps: 30,
        frameCount: 120,
      },
    });
    expect(source.statusCode).toBe(200);
    expect(source.rawPayload).toEqual(Buffer.from(sourceBytes));
    expect(invalidComplete.statusCode).toBe(422);
    expect(digestMismatch.statusCode).toBe(422);
    expect(preview.statusCode).toBe(201);
    expect(workflow.previews.get(job.id)).toMatchObject({
      id: preview.json().artifactId,
      kind: "preview",
    });
    expect(workflow.jobs.get(job.id)?.evidence).toEqual({
      state: "MAPPED",
      measurements: [],
    });
    expect(complete.statusCode).toBe(200);
    expect(workflow.jobs.get(job.id)?.state).toBe("READY");
    await fixture.app.close();
  });

  it("rejects regressing or internally inconsistent progress", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow);
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: registration(["compiler"]),
    });
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: fixture.headers,
      payload: {},
    });
    const report = (fraction: number, framesProcessed: number) =>
      fixture.app.inject({
        method: "POST",
        url: `/v1/workers/worker-a/jobs/${job.id}/progress`,
        headers: fixture.headers,
        payload: {
          phase: "prepare",
          stage: "analysis",
          fraction,
          framesProcessed,
          framesTotal: 120,
        },
      });
    expect((await report(0.7, 70)).statusCode).toBe(200);
    expect((await report(0.6, 80)).statusCode).toBe(422);
    expect((await report(0.8, 121)).statusCode).toBe(422);
    expect(job.progress?.fraction).toBe(0.7);
    await fixture.app.close();
  });

  it("keeps cancellation pending until the claimed worker acknowledges it", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow);
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: registration(["compiler"]),
    });
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: fixture.headers,
      payload: {},
    });
    job.state = "CANCEL_REQUESTED";

    const progress = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/progress`,
      headers: fixture.headers,
      payload: {
        phase: "prepare",
        stage: "evidence",
        fraction: 0.5,
        framesProcessed: 60,
        framesTotal: 120,
      },
    });
    expect(progress.statusCode).toBe(409);
    expect(progress.json().error.code).toBe("CANCEL_REQUESTED");
    expect(job.state).toBe("CANCEL_REQUESTED");

    const acknowledged = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/cancelled`,
      headers: fixture.headers,
      payload: {},
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(job.state).toBe("CANCELLED");
    expect(fixture.workers.claimedJobs.has(job.id)).toBe(false);
    await fixture.app.close();
  });

  it("Given a queued render job, when completed without uploaded media, then rejects false completion", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow);
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: registration(["renderer"]),
    });
    const claim = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: fixture.headers,
      payload: {},
    });
    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "render",
          artifactId: "artifact_missing",
          report: renderReport(job, "attempt-a", new Uint8Array([1])),
        },
      },
    });
    expect(claim.json().job.payload.phase).toBe("render");
    expect(workflow.jobs.get(job.id)?.state).toBe("RENDERING");
    expect(workflow.jobs.get(job.id)?.artifact).toBeNull();
    expect(complete.statusCode).toBe(422);
    await fixture.app.close();
  });

  it("Given a rendered MP4, when the worker uploads and completes it, then stages it for T5 without publishing", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    job.evidence = { state: "MAPPED" };
    const fixture = appFixture(workflow);
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: registration(["renderer"]),
    });
    const claim = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: fixture.headers,
      payload: {},
    });
    const artifactBytes = Buffer.from("real-mp4-bytes");
    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
      headers: {
        authorization: fixture.headers.authorization,
        "content-type": "application/octet-stream",
      },
      payload: artifactBytes,
    });
    const mismatched = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "render",
          artifactId: uploaded.json().artifactId,
          report: {
            ...renderReport(job, "attempt-a", artifactBytes),
            outputSha256: "f".repeat(64),
          },
        },
      },
    });
    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "render",
          artifactId: uploaded.json().artifactId,
          report: renderReport(job, "attempt-a", artifactBytes),
        },
      },
    });

    expect(claim.json().job.payload).toMatchObject({
      phase: "render",
      evidence: { state: "MAPPED" },
      evidenceDigest: job.evidenceDigest,
    });
    expect(uploaded.statusCode).toBe(201);
    expect(mismatched.statusCode).toBe(422);
    expect(uploaded.json()).toMatchObject({
      sizeBytes: artifactBytes.byteLength,
    });
    expect(workflow.jobs.get(job.id)?.state).toBe("AWAITING_T5");
    expect(workflow.jobs.get(job.id)?.artifact).toBeNull();
    expect(workflow.stagedArtifacts.get(job.id)).toMatchObject({
      id: uploaded.json().artifactId,
      kind: "delivery",
    });
    expect(complete.statusCode).toBe(200);
    await fixture.app.close();
  });
});
