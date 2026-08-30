import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buildAuthApp } from "./app.js";
import { hashWorkerToken, createWorkerStore } from "./workers.js";
import { hashBearer, type AuthStore } from "./auth.js";
import {
  CANVAS,
  DELIVERY_FPS,
  fixtureSpec,
  sha256Hex,
  type GenerationConfig,
  type SceneSpec,
} from "@rvs/contracts";
import {
  autoApproveT4,
  createCreatorWorkflowStore,
  RUNTIME_DIGEST,
  type CreatorWorkflowStore,
  type Job,
} from "./creator-workflow.js";
import { createReviewStore, type ReviewStore } from "./reviews.js";
import type { UploadStore } from "./uploads.js";
import { createRetentionStore, type RetentionStore } from "./retention.js";
import { updateAiProviderSettings } from "./ai-provider-settings.js";
import { updateMaterialProviderSettings } from "./material-provider-settings.js";
import { openApiDatabase } from "./durable-state.js";
import type { GenerateScene } from "./author-scene.js";
import type { GenerateMotionPlanCandidate } from "./motion-plan-generator.js";
import type { GenerateImage } from "./openai-image-material.js";
import type { GenerateSafetyVerdict } from "./safety-check.js";
import type { GenerateTranslation } from "./translate-evidence.js";
import type DatabaseType from "better-sqlite3";

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
const generationConfig: GenerationConfig = {
  brief: "Use timing and easing as Meridian finds meeting times nobody hates.",
  durationSec: 20,
  aspect: "9:16",
  attachmentIds: [],
};
const previewArtifact = (jobId: string) => ({
  id: `preview-${jobId}`,
  jobId,
  tenantId: "ten_a",
  kind: "preview" as const,
  filename: `${jobId}-preview.mp4`,
  contentType: "video/mp4" as const,
  bytes: Uint8Array.from([1, 2, 3]),
  sha256: "d".repeat(64),
  sizeBytes: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
  report: null,
});
const compilation = {
  authoring: {
    versionId: "air_a",
    digest: "a".repeat(64),
    parentDigest: null,
  },
  scene: {
    versionId: "sir_b",
    digest: "b".repeat(64),
    parentDigest: "a".repeat(64),
  },
  browserPassSpec: {
    versionId: "bps_c",
    digest: "c".repeat(64),
    parentDigest: "b".repeat(64),
  },
} as const;
const analysisEvidence = (
  jobId: string,
  attemptId: string,
  frameCount = 120,
  fps: 24 | 25 | 30 | 50 | 60 = 30,
) => ({
  schemaVersion: "rvs-reference-evidence-v1",
  state: "MAPPED",
  source: {
    jobId,
    attemptId,
    normalizedSha256: "e".repeat(64),
  },
  observed: {
    temporalVolume: {
      profile: "540x960",
      fps,
      frameCount,
      intervalMs: [0, 4_000],
      frames: Array.from({ length: frameCount }, (_, index) => ({
        index,
        timeMs: Math.floor((index * 1_000) / fps),
        nativeSha256: sha256(`frame-${index}`),
        confidence: 1,
      })),
    },
    ocr: { engine: "EasyOCR ko+en", candidates: [] },
    uiSurfaces: [],
    matting: {
      engine: "RVM MobileNetV3",
      frames: Array.from({ length: frameCount }, (_, frame) => ({
        frame,
        confidence: 1,
      })),
    },
    depth: {
      engine: "MiDaS v2.1 small",
      medianNormalized: Array<null>(frameCount).fill(null),
      ownerSamples: [],
    },
    camera: {
      method: "foreground-masked RANSAC background homography",
      frames: Array.from({ length: frameCount }, (_, frame) => ({
        frame,
        confidence: 1,
      })),
    },
    tracking: [],
    effects: Array.from({ length: frameCount }, () => ({
      lowerLightRgb16x9: Array<number>(16 * 9 * 3).fill(0),
      confidence: 1,
      formulas: { lowerLight: "median RGB per 16x9 cell" },
    })),
    rhythm: { beats: [] },
    audio: { sampleRateHz: 48_000, channels: 2, anchors: [] },
    palette: ["#000000", "#ffffff"],
  },
  mappings: {
    textOwnerCount: 0,
    uiOwnerCount: 0,
    residualOwner: "global-residual",
  },
  needsChoice: [],
  sceneInput: {
    tenantId: "ten_a",
    editor: "reference-compiler",
    reason: "measured reference evidence",
    timestamp: "1970-01-01T00:00:00.000Z",
    gate: "PENDING",
    needsChoice: [],
    owners: [
      {
        ownerId: "global-residual",
        kind: "global-residual",
        editable: true,
        assetRef: "asset-global-residual",
        confidence: 1,
      },
    ],
    editableAssets: [
      {
        assetId: "asset-global-residual",
        kind: "measured-background",
        editable: true,
        owner: "global-residual",
      },
    ],
    geometry: {
      "global-residual": {
        boundsPerFrame: [{ frame: 0, x: 0, y: 0, width: 1080, height: 1920 }],
        fixedWidth: true,
        fixedX: true,
      },
    },
    tracks: [
      {
        trackId: "track-global-residual",
        owner: "global-residual",
        lifecycle: {
          enter: { start: 0 },
          stable: { start: 0 },
          exit: { start: frameCount },
        },
        geometryRef: "global-residual",
        effects: ["residual-canvas"],
      },
    ],
    effects: {
      "global-residual": {
        "residual-canvas": { source: "all-frame measurements" },
      },
    },
    residualCanvas: {
      owner: "global-residual",
      measurements: ["lower-light field"],
      mustRemainSeparate: true,
      compositeRule: "background then semantic owners",
    },
    audio: {
      sampleRateHz: 48_000,
      channels: 2,
      frameRate: fps,
      anchors: [],
    },
    passes: [
      {
        passId: "background-dom",
        owner: "global-residual",
        kind: "DOM/SVG",
        shader: null,
        reads: ["asset-global-residual"],
        writes: "background-layer",
      },
    ],
    layerOrder: ["background-layer"],
    allowedShaders: [],
  },
});
const renderReport = (job: Job, attemptId: string, bytes: Uint8Array) => ({
  status: "PASS",
  protocol: "rvs.render-report.v1",
  mode: "delivery",
  jobId: job.id,
  attemptId,
  outputSha256: sha256(bytes),
  outputBytes: bytes.byteLength,
  ir: {
    authoringDigest: job.compilation?.authoring.digest,
    sceneDigest: job.compilation?.scene.digest,
    browserPassSpecDigest: job.compilation?.browserPassSpec.digest,
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
    videoProfile: "High",
    videoLevel: "4.1",
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    gopSize: 60,
    closedGop: true,
    fastStart: true,
    audioCodec: "aac",
    audioProfile: "LC",
    audioTargetBitRate: 192_000,
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
        sourceSha256: sha256(sourceBytes),
        media: { fps: 30, frameCount: 120, durationSeconds: 4 },
        chunks: [sourceBytes],
        chunkHashes: [sha256(sourceBytes)],
        chunkSizes: [sourceBytes.byteLength],
        actualBytes: sourceBytes.byteLength,
      },
    ],
  ]),
  cas: new Map(),
  casByTenantDigest: new Map(),
  now: () => 1_000,
});

type FixtureOptions = Readonly<{
  now?: () => number;
  persist?: () => void;
  retention?: RetentionStore;
  reviews?: ReviewStore;
  db?: DatabaseType.Database;
  aiSecretKey?: string;
  safetyCheckGenerate?: GenerateSafetyVerdict;
  translateGenerate?: GenerateTranslation;
  authorSceneGenerate?: GenerateScene;
  authorSceneGeneratePlan?: GenerateMotionPlanCandidate;
  materialGenerate?: GenerateImage;
}>;
const appFixture = (
  workflow?: CreatorWorkflowStore,
  uploads = uploadFixture(),
  options: FixtureOptions = {},
) => {
  const token = "worker-test-token";
  const tenantToken = "tenant-test-token";
  const artifactRoot = mkdtempSync(join(tmpdir(), "rvs-worker-artifacts-"));
  const workers = createWorkerStore(hashWorkerToken(token));
  const auth: AuthStore = {
    users: [],
    credentials: [],
    memberships: [{ userId: "tenant-owner", tenantId: "ten_a", role: "OWNER" }],
    assignments: [],
    sessions: [],
    apiTokens: [
      {
        id: "tenant-token",
        userId: "tenant-owner",
        tenantId: "ten_a",
        tokenHash: hashBearer(tenantToken),
        expiresAt: 10_000,
        revokedAt: null,
      },
    ],
    audit: () => undefined,
  };
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "not-a-worker-token",
    workers,
    creatorWorkflow: workflow,
    uploads,
    reviews: options.reviews,
    artifactRoot,
    now: options.now ?? (() => 1_000),
    persist: options.persist,
    retention: options.retention,
    db: options.db,
    aiSecretKey: options.aiSecretKey,
    safetyCheckGenerate: options.safetyCheckGenerate,
    translateGenerate: options.translateGenerate,
    authorSceneGenerate: options.authorSceneGenerate,
    authorSceneGeneratePlan:
      options.authorSceneGeneratePlan ??
      (options.authorSceneGenerate
        ? async (request) => ({
            schema: "motion-plan-v1",
            intent: "Apply bounded timing to the headline.",
            knowledgeCardIds: [
              request.knowledgeCards[0]?.id ?? "timing-easing",
            ],
            requiredCapabilities: ["keyframes", "easing"],
            canvas: request.jobCanvas,
            keyframeIntents: [
              {
                elementId: "headline",
                anticipationFrames: 12,
                overshootPercent: 8,
                settleFrame: 36,
                staggerFrames: 6,
              },
            ],
            predicateIds: ["scene-spec", "element-kind-capability"],
          })
        : undefined),
    materialGenerate: options.materialGenerate,
  });
  app.addHook("onClose", async () => {
    rmSync(artifactRoot, { recursive: true, force: true });
  });
  const bootstrapHeaders = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  return {
    app,
    artifactRoot,
    workers,
    bootstrapHeaders,
    headers: { ...bootstrapHeaders } as Record<string, string>,
    tenantHeaders: {
      authorization: `Bearer ${tenantToken}`,
      "x-tenant-id": "ten_a",
    },
  };
};
type Fixture = ReturnType<typeof appFixture>;
const artifactFiles = (root: string): readonly string[] =>
  readdirSync(root, { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith(".mp4") || entry.endsWith(".tmp"));
const registerWorker = async (
  fixture: Fixture,
  capabilities: readonly string[],
  workerId = "worker-a",
) => {
  const response = await fixture.app.inject({
    method: "POST",
    url: "/v1/workers/register",
    headers: fixture.bootstrapHeaders,
    payload: { ...registration(capabilities), workerId },
  });
  fixture.headers.authorization = `Bearer ${String(response.json().sessionToken)}`;
  return response;
};
const claimWorker = async (fixture: Fixture, workerId = "worker-a") => {
  const response = await fixture.app.inject({
    method: "POST",
    url: `/v1/workers/${workerId}/claim`,
    headers: fixture.headers,
    payload: {},
  });
  const leaseToken = response.json().job?.leaseToken;
  if (leaseToken) fixture.headers["x-worker-lease"] = String(leaseToken);
  return response;
};
const addJob = (
  workflow: CreatorWorkflowStore,
  state: Job["state"],
  generation?: GenerationConfig,
): Job => {
  const evidence =
    state === "PREPARING"
      ? null
      : analysisEvidence(`job-${state.toLowerCase()}`, "attempt-a");
  const job: Job = {
    id: `job-${state.toLowerCase()}`,
    tenantId: "ten_a",
    creatorId: "server",
    uploadId: "upl_a",
    creativePrompt: null,
    state,
    attempt: 1,
    etag: '"etag"',
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    irDigest: compilation.browserPassSpec.digest,
    evidenceDigest: evidence ? sha256(JSON.stringify(evidence)) : "",
    approved: state === "QUEUED",
    startFrame: 0,
    sourceFps: 30,
    frameCount: 120,
    evidence,
    candidateEvidence: null,
    candidateEvidenceDigest: null,
    preparationStage: state === "PREPARING" ? "ANALYSIS_QUEUED" : "READY",
    pendingCompilation: null,
    compilation: state === "PREPARING" ? null : compilation,
    previewSpecDigest:
      state === "PREPARING" ? null : compilation.browserPassSpec.digest,
    approvedSpecDigest:
      state === "PREPARING" ? null : compilation.browserPassSpec.digest,
    eligibleAt: 0,
    automaticRetries: 0,
    deletionEpoch: 0,
    restoreEpoch: 0,
    failureCode: null,
    runtimePreflight: state === "PREPARING" ? null : preflight,
    authoredScene: null,
    sceneSpecDigest: null,
    lastPatchChangedBeatIds: null,
    ...(generation ? { generation } : {}),
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
    const registered = await registerWorker(fixture, ["compiler"]);
    const heartbeat = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/heartbeat",
      headers: fixture.headers,
      payload: { capabilities: ["compiler", "renderer"], leases: [] },
    });
    expect(registered.statusCode).toBe(200);
    expect(registered.json()).toMatchObject({ workerId: "worker-a" });
    expect(heartbeat.json()).toMatchObject({ workerId: "worker-a" });
    expect(fixture.workers.workers.get("worker-a")).toMatchObject({
      capabilities: ["compiler", "renderer"],
      lastHeartbeat: 1_000,
      status: "ONLINE",
      preflight: { status: "PASS", runtimeDigest: RUNTIME_DIGEST },
    });
    await fixture.app.close();
  });

  it("auto-approves T1 when worker preflight arrives after job creation", async () => {
    const reviews = createReviewStore();
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    job.preparationStage = "AWAITING_T1";
    job.runtimePreflight = null;
    const fixture = appFixture(workflow, uploadFixture(), { reviews });

    const registered = await registerWorker(fixture, ["compiler"]);

    expect(registered.statusCode).toBe(200);
    expect(job.preparationStage).toBe("ANALYSIS_QUEUED");
    expect(reviews.receipts).toMatchObject([
      { jobId: job.id, gate: "T1", decision: "APPROVED" },
    ]);
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

  it("rejects a worker that was just marked offline", async () => {
    const fixture = appFixture(undefined, uploadFixture(), {
      now: () => 1_000,
    });
    fixture.workers.retiredUntil.set("worker-a", 2_000);
    const response = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.bootstrapHeaders,
      payload: registration(["compiler"]),
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_REQUIRED");
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
    await registerWorker(fixture, ["compiler"]);
    const claim = await claimWorker(fixture);
    const complete = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/jobs/job-missing/complete",
      headers: fixture.headers,
      payload: { result: {} },
    });
    expect(claim.json()).toEqual({ job: null });
    expect(complete.statusCode).toBe(401);
    expect(complete.json().error.code).toBe("AUTHENTICATION_REQUIRED");
    await fixture.app.close();
  });

  it("stores analyzed evidence and waits for T2 before compilation", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["compiler"]);
    const claim = await claimWorker(fixture);
    const source = await fixture.app.inject({
      method: "GET",
      url: `/v1/workers/worker-a/jobs/${job.id}/source`,
      headers: fixture.headers,
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
        ...fixture.headers,
        "content-type": "video/mp4",
      },
      payload: Buffer.from("preview-mp4-bytes"),
    });
    const evidence = analysisEvidence(job.id, "attempt-a");
    const digestMismatch = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "analyze",
          evidence,
          evidenceDigest: "a".repeat(64),
          compilation,
          normalized: {
            sha256: evidence.source.normalizedSha256,
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
          phase: "analyze",
          evidence,
          evidenceDigest: sha256(JSON.stringify(evidence)),
          compilation,
          normalized: {
            sha256: evidence.source.normalizedSha256,
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
        phase: "analyze",
        sourceSha256: sha256(sourceBytes),
        startFrame: 0,
        sourceFps: 30,
        frameCount: 120,
      },
    });
    expect(source.statusCode).toBe(200);
    expect(source.rawPayload).toEqual(Buffer.from(sourceBytes));
    expect(invalidComplete.statusCode).toBe(422);
    expect(digestMismatch.statusCode).toBe(422);
    expect(preview.statusCode).toBe(422);
    expect(workflow.previews.has(job.id)).toBe(false);
    expect(workflow.jobs.get(job.id)?.evidence).toEqual(evidence);
    expect(complete.statusCode).toBe(200);
    expect(workflow.jobs.get(job.id)).toMatchObject({
      state: "PREPARING",
      preparationStage: "AWAITING_T2",
      pendingCompilation: compilation,
      compilation: null,
    });
    await fixture.app.close();
  });

  it("re-digests the evidence after translation enrichment mutates it", async () => {
    const reviews = createReviewStore();
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const evidence = analysisEvidence(job.id, "attempt-a");
    // A text owner is what triggers enrichment; the stock fixture has only
    // global-residual, which is why this regression slipped through before.
    (evidence.sceneInput.owners as unknown as Record<string, unknown>[]).push({
      ownerId: "text-00",
      kind: "text-word",
      editable: true,
      assetRef: "asset-global-residual",
      confidence: 0.9,
      content: "안녕하세요",
      sourceLocale: "ko-KR",
    });
    const directory = mkdtempSync(join(tmpdir(), "rvs-workers-translate-db-"));
    const db = openApiDatabase(join(directory, "app.sqlite"));
    updateAiProviderSettings(
      db,
      {
        providerKind: "openai",
        model: "gpt-4o",
        apiKey: "sk-test",
        enabled: true,
      },
      "admin",
      1_000,
      "test-secret-key-material",
    );
    const fixture = appFixture(workflow, uploadFixture(), {
      reviews,
      db,
      aiSecretKey: "test-secret-key-material",
      translateGenerate: async () => ({
        object: { translatedText: "Hello", confidence: 0.9 },
      }),
    });
    await registerWorker(fixture, ["compiler", "renderer"]);
    await claimWorker(fixture);
    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "analyze",
          evidence,
          evidenceDigest: sha256(JSON.stringify(evidence)),
          compilation,
          normalized: {
            sha256: evidence.source.normalizedSha256,
            durationMs: 4_000,
            fps: 30,
            frameCount: 120,
          },
        },
      },
    });
    expect(complete.statusCode).toBe(200);
    const stored = workflow.jobs.get(job.id);
    const owners = (
      stored?.evidence as unknown as {
        sceneInput: { owners: Record<string, unknown>[] };
      }
    ).sceneInput.owners;
    // Enrichment must have actually run...
    expect(owners.at(-1)?.["translatedText"]).toBe("Hello");
    // ...and the stored digest must match what the worker recomputes from the
    // bundle it will receive, or every text-bearing job dies on
    // WORKER_EVIDENCE_DIGEST_MISMATCH.
    expect(stored?.evidenceDigest).toBe(
      sha256(JSON.stringify(stored?.evidence)),
    );
    // The stage must only advance once enrichment is done, so a worker can
    // never claim a half-translated bundle.
    expect(stored?.preparationStage).toBe("EVIDENCE_VIDEO_QUEUED");
    await fixture.app.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("advances AWAITING_T2 through the evidence-video stage to PREVIEW_QUEUED", async () => {
    const reviews = createReviewStore();
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow, uploadFixture(), { reviews });
    await registerWorker(fixture, ["compiler", "renderer"]);
    await claimWorker(fixture);
    const evidence = analysisEvidence(job.id, "attempt-a");
    const analyzeComplete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "analyze",
          evidence,
          evidenceDigest: sha256(JSON.stringify(evidence)),
          compilation,
          normalized: {
            sha256: evidence.source.normalizedSha256,
            durationMs: 4_000,
            fps: 30,
            frameCount: 120,
          },
        },
      },
    });
    expect(analyzeComplete.statusCode).toBe(200);
    expect(workflow.jobs.get(job.id)?.preparationStage).toBe(
      "EVIDENCE_VIDEO_QUEUED",
    );
    const claim = await claimWorker(fixture);
    expect(claim.json().job).toMatchObject({
      jobId: job.id,
      payload: { phase: "evidence-video" },
    });
    expect(workflow.jobs.get(job.id)?.preparationStage).toBe(
      "EVIDENCE_VIDEO_RUNNING",
    );
    const upload = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/evidence-video-artifact`,
      headers: { ...fixture.headers, "content-type": "video/mp4" },
      payload: Buffer.from("evidence-video-mp4-bytes"),
    });
    expect(upload.statusCode).toBe(201);
    const evidenceVideoArtifactId = upload.json().artifactId;
    expect(workflow.evidenceVideos.get(job.id)?.id).toBe(
      evidenceVideoArtifactId,
    );
    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "evidence-video",
          evidenceVideoArtifactId,
        },
      },
    });
    expect(complete.statusCode).toBe(200);
    expect(workflow.jobs.get(job.id)?.preparationStage).toBe("PREVIEW_QUEUED");
    await fixture.app.close();
  });

  it("requeues the evidence-video stage on a retryable worker failure", async () => {
    const reviews = createReviewStore();
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    job.preparationStage = "EVIDENCE_VIDEO_QUEUED";
    job.evidence = analysisEvidence(job.id, "attempt-a");
    const fixture = appFixture(workflow, uploadFixture(), { reviews });
    await registerWorker(fixture, ["compiler", "renderer"]);
    await claimWorker(fixture);
    expect(workflow.jobs.get(job.id)?.preparationStage).toBe(
      "EVIDENCE_VIDEO_RUNNING",
    );
    const fail = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/fail`,
      headers: fixture.headers,
      payload: { message: "WORKER_PROCESS_FAILED:ffmpeg:boom" },
    });
    expect(fail.statusCode).toBe(200);
    expect(workflow.jobs.get(job.id)?.preparationStage).toBe(
      "EVIDENCE_VIDEO_QUEUED",
    );
    expect(workflow.jobs.get(job.id)?.state).toBe("PREPARING");
    await fixture.app.close();
  });

  it("rejects regressing or internally inconsistent progress", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["compiler"]);
    await claimWorker(fixture);
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

  it("accepts fresh progress when retrying a failed worker job", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    let currentTime = 1_000;
    const fixture = appFixture(workflow, uploadFixture(), {
      now: () => currentTime,
    });
    await registerWorker(fixture, ["compiler"]);
    await claimWorker(fixture);

    const completedProgress = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/progress`,
      headers: fixture.headers,
      payload: {
        phase: "prepare",
        stage: "evidence",
        fraction: 1,
        framesProcessed: 120,
        framesTotal: 120,
      },
    });
    const failed = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/fail`,
      headers: fixture.headers,
      payload: { message: "INVALID_REQUEST" },
    });
    currentTime = 2_000;
    await claimWorker(fixture);
    const retryProgress = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/progress`,
      headers: fixture.headers,
      payload: {
        phase: "prepare",
        stage: "download",
        fraction: 0.05,
        framesProcessed: null,
        framesTotal: null,
      },
    });

    expect(completedProgress.statusCode).toBe(200);
    expect(failed.statusCode).toBe(200);
    expect(retryProgress.statusCode).toBe(200);
    expect(job.progress?.fraction).toBe(0.05);
    await fixture.app.close();
  });

  it("Given a preview MP4, when the worker uploads it, then stores a file-backed artifact with its digest and size", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    job.preparationStage = "PREVIEW_QUEUED";
    job.compilation = compilation;
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);
    const previewBytes = Buffer.from("preview-mp4-bytes");

    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/preview-artifact`,
      headers: {
        ...fixture.headers,
        "content-type": "video/mp4",
      },
      payload: previewBytes,
    });

    const stored = workflow.previews.get(job.id);
    expect(claim.json().job.payload.phase).toBe("preview");
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json()).toEqual({
      artifactId: stored?.id,
      sha256: sha256(previewBytes),
      sizeBytes: previewBytes.byteLength,
    });
    expect(stored).toMatchObject({
      kind: "preview",
      bytes: new Uint8Array(),
      sha256: sha256(previewBytes),
      sizeBytes: previewBytes.byteLength,
    });
    expect(readFileSync(stored?.storagePath ?? "")).toEqual(previewBytes);
    expect(
      artifactFiles(fixture.artifactRoot).some((file) => file.endsWith(".tmp")),
    ).toBe(false);
    await fixture.app.close();
  });

  it.each([
    ["missing content-length", "video/mp4", undefined],
    ["zero content-length", "video/mp4", "0"],
    ["non-integer content-length", "video/mp4", "1.5"],
    ["oversized content-length", "video/mp4", String(512 * 1024 * 1024 + 1)],
    ["non-MP4 content type", "application/octet-stream", "17"],
  ] as const)(
    "Given %s, when a worker uploads an artifact, then rejects it without creating a file",
    async (_case, contentType, contentLength) => {
      const workflow = createCreatorWorkflowStore();
      const job = addJob(workflow, "QUEUED");
      const fixture = appFixture(workflow);
      await registerWorker(fixture, ["renderer"]);
      await claimWorker(fixture);
      const artifactBytes = Buffer.from("invalid-mp4-bytes");

      const uploaded = await fixture.app.inject({
        method: "POST",
        url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
        headers: {
          ...fixture.headers,
          "content-type": contentType,
          ...(contentLength === undefined
            ? {}
            : { "content-length": contentLength }),
        },
        payload: Readable.from([artifactBytes]),
      });

      expect(uploaded.statusCode).toBe(422);
      expect(uploaded.json().error.code).toBe("INVALID_REQUEST");
      expect(workflow.stagedArtifacts.has(job.id)).toBe(false);
      expect(artifactFiles(fixture.artifactRoot)).toEqual([]);
      await fixture.app.close();
    },
  );

  it("Given a mismatched content-length, when streaming ends, then removes the partial file", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const artifactBytes = Buffer.from("short-mp4-bytes");

    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
      headers: {
        ...fixture.headers,
        "content-type": "video/mp4",
        "content-length": String(artifactBytes.byteLength + 1),
      },
      payload: Readable.from([artifactBytes]),
    });

    expect(uploaded.statusCode).toBe(422);
    expect(workflow.stagedArtifacts.has(job.id)).toBe(false);
    expect(artifactFiles(fixture.artifactRoot)).toEqual([]);
    await fixture.app.close();
  });

  it("returns cancellation when a job is cancelled while its artifact is streaming", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const artifactBytes = Buffer.from("cancelled-upload-bytes");
    const body = Readable.from(
      (async function* () {
        yield artifactBytes.subarray(0, 5);
        job.state = "CANCEL_REQUESTED";
        yield artifactBytes.subarray(5);
      })(),
    );

    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
      headers: {
        ...fixture.headers,
        "content-type": "video/mp4",
        "content-length": String(artifactBytes.byteLength),
      },
      payload: body,
    });

    expect(uploaded.statusCode).toBe(409);
    expect(uploaded.json().error.code).toBe("CANCEL_REQUESTED");
    expect(workflow.stagedArtifacts.has(job.id)).toBe(false);
    expect(artifactFiles(fixture.artifactRoot)).toEqual([]);
    await fixture.app.close();
  });

  it("keeps serving when the snapshot write throws, instead of killing the process", async () => {
    // onSend runs after the reply's headers are on the wire, so a rejected
    // hook cannot become an error response: Fastify writes headers anyway
    // and the process dies on ERR_HTTP_HEADERS_SENT. One CHECK-constraint
    // failure took the whole API down that way and left every worker on
    // 502. The write is lost either way; the service must survive it.
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (line: unknown) => {
      errors.push(String(line));
    };
    try {
      const workflow = createCreatorWorkflowStore();
      const fixture = appFixture(workflow, uploadFixture(), {
        persist: () => {
          throw new Error("TEST_SNAPSHOT_WRITE_FAILED");
        },
      });

      const response = await registerWorker(fixture, ["renderer"]);

      expect(response.statusCode).toBe(200);
      expect(errors.join("\n")).toContain("api.persist.failed");
      expect(errors.join("\n")).toContain("TEST_SNAPSHOT_WRITE_FAILED");
    } finally {
      console.error = originalError;
    }
  });

  it("rolls back the artifact file and map when request persistence fails once", async () => {
    let injectFailure = false;
    let persistenceCalls = 0;
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow, uploadFixture(), {
      persist: () => {
        persistenceCalls += 1;
        if (!injectFailure) return;
        throw new Error("TEST_PERSISTENCE_FAILURE");
      },
    });
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const upload = (bytes: Uint8Array) =>
      fixture.app.inject({
        method: "POST",
        url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
        headers: {
          ...fixture.headers,
          "content-type": "video/mp4",
        },
        payload: bytes,
      });
    const originalBytes = Buffer.from("original-upload-bytes");
    expect((await upload(originalBytes)).statusCode).toBe(201);
    const original = workflow.stagedArtifacts.get(job.id);
    const callsBeforeFailure = persistenceCalls;

    injectFailure = true;
    const uploaded = await upload(Buffer.from("rollback-upload-bytes"));

    expect(uploaded.statusCode).toBe(500);
    expect(persistenceCalls - callsBeforeFailure).toBe(1);
    expect(workflow.stagedArtifacts.get(job.id)).toBe(original);
    expect(readFileSync(original?.storagePath ?? "")).toEqual(originalBytes);
    expect(artifactFiles(fixture.artifactRoot)).toHaveLength(1);
    injectFailure = false;
    await fixture.app.close();
  });

  it("removes the replaced artifact file after a repeat upload", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const upload = (bytes: Uint8Array) =>
      fixture.app.inject({
        method: "POST",
        url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
        headers: {
          ...fixture.headers,
          "content-type": "video/mp4",
        },
        payload: bytes,
      });

    await upload(Buffer.from("first-artifact"));
    const firstPath = workflow.stagedArtifacts.get(job.id)?.storagePath ?? "";
    const replacement = await upload(Buffer.from("replacement-artifact"));
    const replacementPath =
      workflow.stagedArtifacts.get(job.id)?.storagePath ?? "";

    expect(replacement.statusCode).toBe(201);
    expect(replacementPath).not.toBe(firstPath);
    expect(existsSync(firstPath)).toBe(false);
    expect(existsSync(replacementPath)).toBe(true);
    expect(artifactFiles(fixture.artifactRoot)).toHaveLength(1);
    await fixture.app.close();
  });

  it.each(["digest", "size"] as const)(
    "rejects a preview report whose output %s does not match its stored preview",
    async (mismatch) => {
      const workflow = createCreatorWorkflowStore();
      const job = addJob(workflow, "PREPARING");
      job.preparationStage = "PREVIEW_QUEUED";
      job.compilation = compilation;
      const fixture = appFixture(workflow);
      await registerWorker(fixture, ["renderer"]);
      await claimWorker(fixture);
      const previewBytes = Buffer.from("preview-report-bytes");
      const uploaded = await fixture.app.inject({
        method: "POST",
        url: `/v1/workers/worker-a/jobs/${job.id}/preview-artifact`,
        headers: {
          ...fixture.headers,
          "content-type": "video/mp4",
        },
        payload: previewBytes,
      });

      const completed = await fixture.app.inject({
        method: "POST",
        url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
        headers: fixture.headers,
        payload: {
          result: {
            protocol: "rvs.worker.v1",
            phase: "preview",
            previewArtifactId: uploaded.json().artifactId,
            report: {
              ...renderReport(job, "attempt-a", previewBytes),
              mode: "preview",
              ...(mismatch === "digest"
                ? { outputSha256: "f".repeat(64) }
                : { outputBytes: previewBytes.byteLength + 1 }),
            },
          },
        },
      });

      expect(completed.statusCode).toBe(422);
      expect(workflow.previews.get(job.id)?.report).toBeNull();
      expect(job.preparationStage).toBe("PREVIEW_RUNNING");
      await fixture.app.close();
    },
  );

  it("advances to AWAITING_T4 only once both preview variants are bound", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    job.preparationStage = "PREVIEW_QUEUED";
    job.compilation = compilation;
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const previewBytes = Buffer.from("preview-report-bytes");
    const upload = (kind: string, payload: Buffer) =>
      fixture.app.inject({
        method: "POST",
        url: `/v1/workers/worker-a/jobs/${job.id}/${kind}`,
        headers: { ...fixture.headers, "content-type": "video/mp4" },
        payload,
      });
    const uploaded = await upload("preview-artifact", previewBytes);
    const labeled = await upload(
      "preview-labeled-artifact",
      Buffer.from("preview-labeled-bytes"),
    );
    expect(labeled.statusCode).toBe(201);
    const complete = (previewLabeledArtifactId: string) =>
      fixture.app.inject({
        method: "POST",
        url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
        headers: fixture.headers,
        payload: {
          result: {
            protocol: "rvs.worker.v1",
            phase: "preview",
            previewArtifactId: uploaded.json().artifactId,
            previewLabeledArtifactId,
            report: {
              ...renderReport(job, "attempt-a", previewBytes),
              mode: "preview",
            },
          },
        },
      });
    // A labelled artifact from some other attempt must not be accepted.
    const stale = await complete("preview_stale");
    expect(stale.statusCode).toBe(422);
    expect(job.preparationStage).toBe("PREVIEW_RUNNING");

    const accepted = await complete(labeled.json().artifactId);
    expect(accepted.statusCode).toBe(200);
    expect(job.preparationStage).toBe("AWAITING_T4");
    expect(workflow.previewsLabeled.get(job.id)?.id).toBe(
      labeled.json().artifactId,
    );
    await fixture.app.close();
  });

  describe("scene authoring stage", () => {
    // Authoring no longer runs inside the /complete request -- the model
    // call outlasts the worker's 30s request timeout, so the reply goes
    // back first and the job advances when the model answers. Every
    // assertion about the outcome has to wait for that, rather than
    // relying on a fake generate happening to settle within the same
    // microtask drain.
    const settledAuthoring = async (
      workflow: CreatorWorkflowStore,
      jobId: string,
    ) => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const job = workflow.jobs.get(jobId);
        // A failure leaves preparationStage at AUTHORING_RUNNING and moves
        // the job's state instead, so settling means either.
        if (
          job &&
          (job.preparationStage !== "AUTHORING_RUNNING" ||
            job.state === "FAILED")
        )
          return job;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error("authoring never settled");
    };

    it("moves to AUTHORING after the preview is approved when the job requests generation", () => {
      const reviews = createReviewStore();
      const workflow = createCreatorWorkflowStore();
      const job = addJob(workflow, "PREPARING", generationConfig);
      job.preparationStage = "AWAITING_T4";
      job.compilation = compilation;
      job.previewSpecDigest = compilation.browserPassSpec.digest;
      workflow.previews.set(job.id, previewArtifact(job.id));
      autoApproveT4(reviews, workflow, job, "creator-a", 1_000);
      expect(job.preparationStage).toBe("AUTHORING_QUEUED");
      expect(job.state).toBe("PREPARING");
    });

    it("still goes straight to READY when the job has no generation config (restore-only, unchanged)", () => {
      const reviews = createReviewStore();
      const workflow = createCreatorWorkflowStore();
      const job = addJob(workflow, "PREPARING");
      job.preparationStage = "AWAITING_T4";
      job.compilation = compilation;
      job.previewSpecDigest = compilation.browserPassSpec.digest;
      workflow.previews.set(job.id, previewArtifact(job.id));
      autoApproveT4(reviews, workflow, job, "creator-a", 1_000);
      expect(job.preparationStage).toBe("READY");
      expect(job.state).toBe("READY");
    });

    // Scene authoring is not a claimable worker phase (see queuedPhase's
    // comment in workers.ts) -- authorScene() runs inside the `finish`
    // route handler itself, triggered the moment a "preview" completion
    // routes the job to AUTHORING_QUEUED via autoApproveT4. These two tests
    // drive the real preview-completion HTTP flow (claim "preview" as a
    // renderer, upload both preview variants, complete) with `reviews` and
    // a configured AI provider so that whole chain actually fires within
    // the single `/complete` call.
    const authorSceneDbFixture = () => {
      const directory = mkdtempSync(
        join(tmpdir(), "rvs-workers-author-scene-db-"),
      );
      const db = openApiDatabase(join(directory, "app.sqlite"));
      updateAiProviderSettings(
        db,
        {
          providerKind: "openai",
          model: "gpt-4o",
          apiKey: "sk-test",
          enabled: true,
        },
        "admin",
        1_000,
        "test-secret-key-material",
      );
      return { db, aiSecretKey: "test-secret-key-material" };
    };
    const completePreview = (
      fixture: Fixture,
      job: Job,
      previewBytes: Buffer,
    ) => {
      const upload = (kind: string, payload: Buffer) =>
        fixture.app.inject({
          method: "POST",
          url: `/v1/workers/worker-a/jobs/${job.id}/${kind}`,
          headers: { ...fixture.headers, "content-type": "video/mp4" },
          payload,
        });
      return (async () => {
        const uploaded = await upload("preview-artifact", previewBytes);
        const labeled = await upload(
          "preview-labeled-artifact",
          Buffer.from("preview-labeled-bytes"),
        );
        return fixture.app.inject({
          method: "POST",
          url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
          headers: fixture.headers,
          payload: {
            result: {
              protocol: "rvs.worker.v1",
              phase: "preview",
              previewArtifactId: uploaded.json().artifactId,
              previewLabeledArtifactId: labeled.json().artifactId,
              report: {
                ...renderReport(job, "attempt-a", previewBytes),
                mode: "preview",
              },
            },
          },
        });
      })();
    };

    it("stores the spec digest and queues material generation when authoring finishes", async () => {
      const reviews = createReviewStore();
      const workflow = createCreatorWorkflowStore();
      // fixtureSpec's hero-image element references an "attachment"-origin
      // asset (I2.2/C2.2): the job must actually carry that attachment, and
      // the upload store must actually resolve it, or authorScene's own
      // fail-closed asset-resolution gate rejects the spec.
      const job = addJob(workflow, "PREPARING", {
        ...generationConfig,
        attachmentIds: ["att_1"],
      });
      job.preparationStage = "PREVIEW_QUEUED";
      job.compilation = compilation;
      job.evidence = analysisEvidence(job.id, "attempt-a");
      const { db, aiSecretKey } = authorSceneDbFixture();
      const uploads = uploadFixture();
      uploads.attachments = new Map([
        [
          "att_1",
          {
            id: "att_1",
            tenantId: "ten_a",
            fileName: "logo.png",
            contentType: "image/png",
            sizeBytes: 4,
            bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ]);
      const fixture = appFixture(workflow, uploads, {
        reviews,
        db,
        aiSecretKey,
        authorSceneGenerate: async () => ({ object: fixtureSpec }),
      });
      await registerWorker(fixture, ["renderer"]);
      await claimWorker(fixture);
      const complete = await completePreview(
        fixture,
        job,
        Buffer.from("preview-report-bytes"),
      );
      expect(complete.statusCode).toBe(200);
      const finished = await settledAuthoring(workflow, job.id);
      expect(finished?.sceneSpecDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(finished?.authoredScene?.beatSheet).toHaveLength(
        fixtureSpec.beats.length,
      );
      const creatorJob = await fixture.app.inject({
        method: "GET",
        url: `/v1/jobs/${job.id}`,
        headers: fixture.tenantHeaders,
      });
      expect(creatorJob.statusCode).toBe(200);
      expect(creatorJob.json().planDigest).toBe(
        finished?.authoredScene?.planDigest,
      );
      // The canvas comes from the job's own generation config (9:16, 20s),
      // never from whatever the fixture spec happened to carry.
      expect(finished?.authoredScene?.spec.canvas).toEqual({
        width: 1080,
        height: 1920,
        fps: 30,
        frameCount: 600,
      });
      // Straight on to material generation. Not READY -- for a generate
      // job that comes later, once its assets are backed by real bytes.
      expect(finished?.preparationStage).toBe("ASSETS_QUEUED");
      expect(finished?.state).toBe("PREPARING");
      // I4: progress must not be left at the preview phase's
      // {stage:"preview", fraction:1} -- that is what made the UI read
      // "compiler active: preview" forever once parked here.
      expect(finished?.progress).toBeNull();
      await fixture.app.close();
    });

    // "This job has ended" was all the creator ever saw. A wrong model
    // name in the AI provider settings and an unreachable worker read
    // identically without the reason the provider actually gave.
    it("records the reason authoring failed, not only that it did", async () => {
      const reviews = createReviewStore();
      const workflow = createCreatorWorkflowStore();
      const job = addJob(workflow, "PREPARING", generationConfig);
      job.preparationStage = "PREVIEW_QUEUED";
      job.compilation = compilation;
      job.evidence = analysisEvidence(job.id, "attempt-a");
      const { db, aiSecretKey } = authorSceneDbFixture();
      const fixture = appFixture(workflow, undefined, {
        reviews,
        db,
        aiSecretKey,
        authorSceneGenerate: async () => {
          throw new Error(
            "models/gpt-image-2 is not found for API version v1beta,\n or is not supported for generateContent.",
          );
        },
      });
      await registerWorker(fixture, ["renderer"]);
      await claimWorker(fixture);
      await completePreview(fixture, job, Buffer.from("preview-report-bytes"));
      const finished = await settledAuthoring(workflow, job.id);

      expect(finished?.failureCode).toBe("SCENE_AUTHORING_FAILED");
      expect(finished?.failureReason).toContain("gpt-image-2");
      // One line, so it can go on a page rather than into a log.
      expect(finished?.failureReason).not.toContain("\n");
      await fixture.app.close();
    });

    it("fails the job when authoring throws", async () => {
      const reviews = createReviewStore();
      const workflow = createCreatorWorkflowStore();
      const job = addJob(workflow, "PREPARING", generationConfig);
      job.preparationStage = "PREVIEW_QUEUED";
      job.compilation = compilation;
      job.evidence = analysisEvidence(job.id, "attempt-a");
      const { db, aiSecretKey } = authorSceneDbFixture();
      const fixture = appFixture(workflow, undefined, {
        reviews,
        db,
        aiSecretKey,
        authorSceneGenerate: async () => {
          throw new Error("model unreachable");
        },
      });
      await registerWorker(fixture, ["renderer"]);
      await claimWorker(fixture);
      const complete = await completePreview(
        fixture,
        job,
        Buffer.from("preview-report-bytes"),
      );
      expect(complete.statusCode).toBe(200);
      const finished = await settledAuthoring(workflow, job.id);
      expect(finished?.state).toBe("FAILED");
      expect(finished?.failureCode).toBe("SCENE_AUTHORING_FAILED");
      expect(finished?.progress).toBeNull();
      await fixture.app.close();
    });

    // The whole reason authoring moved out of the request: a model that
    // takes longer than the worker's 30s request timeout used to make the
    // worker give up mid-authoring and report WORKER_JOB_HANDLER_FAILED,
    // for a job that was about to succeed.
    it("replies to the worker before the model has answered", async () => {
      const reviews = createReviewStore();
      const workflow = createCreatorWorkflowStore();
      const job = addJob(workflow, "PREPARING", {
        ...generationConfig,
        attachmentIds: ["att_1"],
      });
      job.preparationStage = "PREVIEW_QUEUED";
      job.compilation = compilation;
      job.evidence = analysisEvidence(job.id, "attempt-a");
      const { db, aiSecretKey } = authorSceneDbFixture();
      let release: (() => void) | undefined;
      const answered = new Promise<void>((resolve) => {
        release = resolve;
      });
      const uploads = uploadFixture();
      uploads.attachments = new Map([
        [
          "att_1",
          {
            id: "att_1",
            tenantId: "ten_a",
            fileName: "logo.png",
            contentType: "image/png",
            sizeBytes: 4,
            bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ]);
      const fixture = appFixture(workflow, uploads, {
        reviews,
        db,
        aiSecretKey,
        authorSceneGenerate: async () => {
          await answered;
          return { object: fixtureSpec };
        },
      });
      await registerWorker(fixture, ["renderer"]);
      await claimWorker(fixture);
      const complete = await completePreview(
        fixture,
        job,
        Buffer.from("preview-report-bytes"),
      );
      expect(complete.statusCode).toBe(200);
      // Still thinking. The worker is already free.
      expect(workflow.jobs.get(job.id)?.preparationStage).toBe(
        "AUTHORING_RUNNING",
      );
      release?.();
      const finished = await settledAuthoring(workflow, job.id);
      expect(finished?.preparationStage).toBe("ASSETS_QUEUED");
      await fixture.app.close();
    });

    // I2.2: an attachment id the job references but the store can't
    // resolve (e.g. lost across an API restart -- see uploads.ts's
    // attachment-store comment) must fail the job outright, never proceed
    // with a kind: "unknown" placeholder that quietly drops the reference.
    it("fails the job when a referenced attachment can't be resolved", async () => {
      const reviews = createReviewStore();
      const workflow = createCreatorWorkflowStore();
      const job = addJob(workflow, "PREPARING", {
        ...generationConfig,
        attachmentIds: ["att_missing"],
      });
      job.preparationStage = "PREVIEW_QUEUED";
      job.compilation = compilation;
      job.evidence = analysisEvidence(job.id, "attempt-a");
      const { db, aiSecretKey } = authorSceneDbFixture();
      const fixture = appFixture(workflow, uploadFixture(), {
        reviews,
        db,
        aiSecretKey,
        authorSceneGenerate: async () => {
          throw new Error("must not be called");
        },
      });
      await registerWorker(fixture, ["renderer"]);
      await claimWorker(fixture);
      const complete = await completePreview(
        fixture,
        job,
        Buffer.from("preview-report-bytes"),
      );
      expect(complete.statusCode).toBe(200);
      const finished = await settledAuthoring(workflow, job.id);
      expect(finished?.state).toBe("FAILED");
      expect(finished?.failureCode).toBe("SCENE_AUTHORING_FAILED");
      expect(finished?.authoredScene).toBeNull();
      expect(finished?.progress).toBeNull();
      await fixture.app.close();
    });
  });

  it("keeps cancellation pending until the claimed worker acknowledges it", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["compiler"]);
    await claimWorker(fixture);
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
    expect(fixture.workers.leases.has(job.id)).toBe(false);
    await fixture.app.close();
  });

  it.each([
    ["without a lease", false],
    ["with an expired lease", true],
  ] as const)("cancels immediately %s", async (_case, expireLease) => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow);
    if (expireLease) {
      await registerWorker(fixture, ["compiler"]);
      await claimWorker(fixture);
      const lease = fixture.workers.leases.get(job.id);
      if (!lease) throw new Error("test lease missing");
      lease.expiresAt = 999;
    }

    const cancelled = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${job.id}/cancel`,
      headers: {
        ...fixture.tenantHeaders,
        "if-match": job.etag,
        "idempotency-key": `cancel-${expireLease ? "expired" : "idle"}`,
      },
      payload: {},
    });

    expect(cancelled.statusCode).toBe(202);
    expect(cancelled.json().state).toBe("CANCELLED");
    expect(job.state).toBe("CANCELLED");
    expect(fixture.workers.leases.has(job.id)).toBe(false);
    await fixture.app.close();
  });

  it("keeps creator cancellation pending for an actively leased job", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["compiler"]);
    await claimWorker(fixture);

    const cancelled = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${job.id}/cancel`,
      headers: {
        ...fixture.tenantHeaders,
        "if-match": job.etag,
        "idempotency-key": "cancel-active",
      },
      payload: {},
    });

    expect(cancelled.statusCode).toBe(202);
    expect(cancelled.json().state).toBe("CANCEL_REQUESTED");
    expect(job.state).toBe("CANCEL_REQUESTED");
    expect(fixture.workers.leases.has(job.id)).toBe(true);
    await fixture.app.close();
  });

  it("records a worker failure that races a cancellation without an invalid transition", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    job.state = "CANCEL_REQUESTED";

    const failed = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/fail`,
      headers: fixture.headers,
      payload: { message: "renderer unavailable" },
    });

    expect(failed.statusCode).toBe(200);
    expect(job.state).toBe("FAILED");
    expect(job.failureCode).toBe("WORKER_JOB_FAILED");
    expect(job.automaticRetries).toBe(0);
    expect(workflow.attempts.get(job.id)?.at(-1)?.state).toBe("FAILED");
    expect(fixture.workers.leases.has(job.id)).toBe(false);
    await fixture.app.close();
  });

  it("preserves a terminal worker failure code followed by classification detail", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);

    const failed = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/fail`,
      headers: fixture.headers,
      payload: {
        message: "NORMALIZED_ARTIFACT_CORRUPT: checksum mismatch",
      },
    });

    expect(failed.statusCode).toBe(200);
    expect(job.state).toBe("FAILED");
    expect(job.failureCode).toBe("NORMALIZED_ARTIFACT_CORRUPT");
    expect(job.automaticRetries).toBe(0);
    await fixture.app.close();
  });

  it("Given a queued render job, when completed without uploaded media, then rejects false completion", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);
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

  it("rejects a render that does not name the safety sample in the store", async () => {
    // Regression: safetySampleArtifactId was parsed but never compared, so a
    // retry that uploaded no sample inherited the previous attempt's frame and
    // the gate judged the wrong render.
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    job.sourceFps = 25;
    job.frameCount = 100;
    job.evidence = analysisEvidence(job.id, "attempt-a", 100, 25);
    job.evidenceDigest = sha256(JSON.stringify(job.evidence));
    const fixture = appFixture(workflow, undefined, {});
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const artifactBytes = Buffer.from("real-mp4-bytes");
    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
      headers: { ...fixture.headers, "content-type": "video/mp4" },
      payload: artifactBytes,
    });
    const sampleUploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/safety-sample-artifact`,
      headers: { ...fixture.headers, "content-type": "image/png" },
      payload: Buffer.from([137, 80, 78, 71]),
    });
    expect(sampleUploaded.statusCode).toBe(201);
    // A sample IS in the store, but this render claims it produced none.
    const orphaned = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "render",
          artifactId: uploaded.json().artifactId,
          safetySampleArtifactId: null,
          report: renderReport(job, "attempt-a", artifactBytes),
        },
      },
    });
    expect(orphaned.statusCode).toBe(422);
    expect(workflow.jobs.get(job.id)?.state).toBe("RENDERING");
    await fixture.app.close();
  });

  it("Given a rendered MP4 that passes the safety check, when the worker uploads and completes it, then stages it for T5 without publishing", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    job.sourceFps = 25;
    job.frameCount = 100;
    job.evidence = analysisEvidence(job.id, "attempt-a", 100, 25);
    job.evidenceDigest = sha256(JSON.stringify(job.evidence));
    const directory = mkdtempSync(join(tmpdir(), "rvs-workers-safety-db-"));
    const db = openApiDatabase(join(directory, "app.sqlite"));
    updateAiProviderSettings(
      db,
      {
        providerKind: "openai",
        model: "gpt-4o",
        apiKey: "sk-test",
        enabled: true,
      },
      "admin",
      1_000,
      "test-secret-key-material",
    );
    const fixture = appFixture(workflow, undefined, {
      db,
      aiSecretKey: "test-secret-key-material",
      safetyCheckGenerate: async () => ({
        object: { safe: true, reason: "no unsafe content detected" },
      }),
    });
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);
    const artifactBytes = Buffer.from("real-mp4-bytes");
    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
      headers: {
        ...fixture.headers,
        "content-type": "video/mp4",
      },
      payload: artifactBytes,
    });
    const sampleBytes = Buffer.from([137, 80, 78, 71]);
    const sampleUploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/safety-sample-artifact`,
      headers: {
        ...fixture.headers,
        "content-type": "image/png",
      },
      payload: sampleBytes,
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
          safetySampleArtifactId: sampleUploaded.json().artifactId,
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
          safetySampleArtifactId: sampleUploaded.json().artifactId,
          report: renderReport(job, "attempt-a", artifactBytes),
        },
      },
    });

    expect(claim.json().job.payload).toMatchObject({
      phase: "render",
      evidence: { state: "MAPPED", source: { jobId: job.id } },
      evidenceDigest: job.evidenceDigest,
    });
    const stored = workflow.stagedArtifacts.get(job.id);
    expect(uploaded.statusCode).toBe(201);
    expect(sampleUploaded.statusCode).toBe(201);
    expect(mismatched.statusCode).toBe(422);
    expect(uploaded.json()).toEqual({
      artifactId: stored?.id,
      sha256: sha256(artifactBytes),
      sizeBytes: artifactBytes.byteLength,
    });
    expect(workflow.jobs.get(job.id)?.state).toBe("AWAITING_T5");
    expect(workflow.jobs.get(job.id)?.artifact).toBeNull();
    expect(stored).toMatchObject({
      id: uploaded.json().artifactId,
      kind: "delivery",
      bytes: new Uint8Array(),
      sha256: sha256(artifactBytes),
      sizeBytes: artifactBytes.byteLength,
    });
    expect(readFileSync(stored?.storagePath ?? "")).toEqual(artifactBytes);
    expect(
      artifactFiles(fixture.artifactRoot).some((file) => file.endsWith(".tmp")),
    ).toBe(false);
    expect(complete.statusCode).toBe(200);
    await fixture.app.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("Given a rendered MP4 that fails the safety check, when the worker completes it, then fails the job without publishing", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    job.sourceFps = 25;
    job.frameCount = 100;
    job.evidence = analysisEvidence(job.id, "attempt-a", 100, 25);
    job.evidenceDigest = sha256(JSON.stringify(job.evidence));
    const directory = mkdtempSync(join(tmpdir(), "rvs-workers-safety-db-"));
    const db = openApiDatabase(join(directory, "app.sqlite"));
    updateAiProviderSettings(
      db,
      {
        providerKind: "openai",
        model: "gpt-4o",
        apiKey: "sk-test",
        enabled: true,
      },
      "admin",
      1_000,
      "test-secret-key-material",
    );
    const fixture = appFixture(workflow, undefined, {
      db,
      aiSecretKey: "test-secret-key-material",
      safetyCheckGenerate: async () => ({
        object: { safe: false, reason: "explicit content detected" },
      }),
    });
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const artifactBytes = Buffer.from("real-mp4-bytes");
    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
      headers: { ...fixture.headers, "content-type": "video/mp4" },
      payload: artifactBytes,
    });
    const sampleUploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/safety-sample-artifact`,
      headers: { ...fixture.headers, "content-type": "image/png" },
      payload: Buffer.from([137, 80, 78, 71]),
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
          safetySampleArtifactId: sampleUploaded.json().artifactId,
          report: renderReport(job, "attempt-a", artifactBytes),
        },
      },
    });

    expect(uploaded.statusCode).toBe(201);
    expect(sampleUploaded.statusCode).toBe(201);
    expect(complete.statusCode).toBe(200);
    expect(workflow.jobs.get(job.id)?.state).toBe("FAILED");
    expect(workflow.jobs.get(job.id)?.failureCode).toBe(
      "CONTENT_SAFETY_REJECTED",
    );
    expect(workflow.jobs.get(job.id)?.artifact).toBeNull();
    await fixture.app.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("Given a rendered MP4 with no AI provider configured, when the worker completes it, then fails closed without publishing", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    job.sourceFps = 25;
    job.frameCount = 100;
    job.evidence = analysisEvidence(job.id, "attempt-a", 100, 25);
    job.evidenceDigest = sha256(JSON.stringify(job.evidence));
    const fixture = appFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const artifactBytes = Buffer.from("real-mp4-bytes");
    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
      headers: { ...fixture.headers, "content-type": "video/mp4" },
      payload: artifactBytes,
    });
    const sampleUploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/safety-sample-artifact`,
      headers: { ...fixture.headers, "content-type": "image/png" },
      payload: Buffer.from([137, 80, 78, 71]),
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
          safetySampleArtifactId: sampleUploaded.json().artifactId,
          report: renderReport(job, "attempt-a", artifactBytes),
        },
      },
    });

    expect(complete.statusCode).toBe(200);
    expect(workflow.jobs.get(job.id)?.state).toBe("FAILED");
    expect(workflow.jobs.get(job.id)?.failureCode).toBe(
      "CONTENT_SAFETY_REJECTED",
    );
    expect(workflow.jobs.get(job.id)?.artifact).toBeNull();
    await fixture.app.close();
  });

  it("fences an in-flight tenant job before progress or artifact publication after deletion", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const retention = createRetentionStore(() => 1_000);
    const fixture = appFixture(workflow, uploadFixture(), { retention });
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const artifactBytes = Buffer.from("in-flight-delete-bytes");
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let resumeStream: () => void = () => undefined;
    const resume = new Promise<void>((resolve) => {
      resumeStream = resolve;
    });
    const body = Readable.from(
      (async function* () {
        yield artifactBytes.subarray(0, 5);
        markStarted();
        await resume;
        yield artifactBytes.subarray(5);
      })(),
    );
    const uploading = fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/artifact`,
      headers: {
        ...fixture.headers,
        "content-type": "video/mp4",
        "content-length": String(artifactBytes.byteLength),
      },
      payload: body,
    });
    await started;

    const deleted = await fixture.app.inject({
      method: "POST",
      url: "/v1/tenants/ten_a/delete",
      headers: fixture.tenantHeaders,
    });
    const progress = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/progress`,
      headers: fixture.headers,
      payload: { phase: "render", stage: "encoding", fraction: 0.5 },
    });
    resumeStream();
    const uploaded = await uploading;

    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ deletionEpoch: 1 });
    expect(job.deletionEpoch).toBe(1);
    expect(job.state).toBe("CANCELLED");
    expect(workflow.attempts.get(job.id)?.at(-1)?.state).toBe("CANCELLED");
    expect(fixture.workers.leases.has(job.id)).toBe(false);
    expect(progress.statusCode).toBe(401);
    expect(uploaded.statusCode).toBe(401);
    expect(workflow.stagedArtifacts.has(job.id)).toBe(false);
    expect(artifactFiles(fixture.artifactRoot)).toEqual([]);
    await fixture.app.close();
  });

  it("binds every job operation to one worker session and lease", async () => {
    const workflow = createCreatorWorkflowStore(() => 1_000);
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow, uploadFixture());
    const register = async (workerId: string) => {
      const response = await fixture.app.inject({
        method: "POST",
        url: "/v1/workers/register",
        headers: fixture.bootstrapHeaders,
        payload: { ...registration(["compiler"]), workerId },
      });
      return String(response.json().sessionToken);
    };
    const firstSession = await register("worker-a");
    const secondSession = await register("worker-b");
    const firstClaim = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: { authorization: `Bearer ${firstSession}` },
    });
    const secondClaim = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-b/claim",
      headers: { authorization: `Bearer ${secondSession}` },
    });
    const stolenHeaders = {
      authorization: `Bearer ${secondSession}`,
      "x-worker-lease": String(firstClaim.json().job.leaseToken),
    };
    const stolen = await Promise.all([
      fixture.app.inject({
        method: "GET",
        url: `/v1/workers/worker-b/jobs/${job.id}/source`,
        headers: stolenHeaders,
      }),
      ...[
        ["progress", { phase: "prepare", stage: "x", fraction: 0.1 }],
        ["complete", { result: {} }],
        ["fail", { message: "failed" }],
        ["cancelled", {}],
      ].map(([endpoint, payload]) =>
        fixture.app.inject({
          method: "POST",
          url: `/v1/workers/worker-b/jobs/${job.id}/${String(endpoint)}`,
          headers: stolenHeaders,
          payload,
        }),
      ),
      ...["preview-artifact", "artifact"].map((endpoint) =>
        fixture.app.inject({
          method: "POST",
          url: `/v1/workers/worker-b/jobs/${job.id}/${endpoint}`,
          headers: {
            ...stolenHeaders,
            "content-type": "video/mp4",
          },
          payload: Buffer.from("not-owned"),
        }),
      ),
    ]);

    expect(firstClaim.json().job.leaseToken).not.toBe(firstSession);
    expect(secondClaim.json().job).toBeNull();
    expect(stolen.every((response) => response.statusCode === 401)).toBe(true);
    expect(workflow.previews.size).toBe(0);
    expect(workflow.stagedArtifacts.size).toBe(0);
    expect(artifactFiles(fixture.artifactRoot)).toEqual([]);
    await fixture.app.close();
  });

  it("reclaims an expired lease once and rejects its former owner", async () => {
    let timestamp = 1_000;
    const workflow = createCreatorWorkflowStore(() => timestamp);
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow, uploadFixture(), {
      now: () => timestamp,
    });
    const register = async (workerId: string) => {
      const response = await fixture.app.inject({
        method: "POST",
        url: "/v1/workers/register",
        headers: fixture.bootstrapHeaders,
        payload: { ...registration(["compiler"]), workerId },
      });
      return String(response.json().sessionToken);
    };
    const firstSession = await register("worker-a");
    const secondSession = await register("worker-b");
    const first = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: { authorization: `Bearer ${firstSession}` },
    });
    timestamp += 90_001;
    const second = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-b/claim",
      headers: { authorization: `Bearer ${secondSession}` },
    });
    const stale = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/fail`,
      headers: {
        authorization: `Bearer ${firstSession}`,
        "x-worker-lease": String(first.json().job.leaseToken),
      },
      payload: { message: "late" },
    });

    expect(second.json().job).toMatchObject({
      jobId: job.id,
      attemptId: "attempt-a",
    });
    expect(second.json().job.leaseToken).not.toBe(first.json().job.leaseToken);
    expect(stale.statusCode).toBe(401);
    expect(workflow.attempts.get(job.id)?.at(-1)?.state).toBe("RUNNING");
    await fixture.app.close();
  });

  it("renews a live lease and rejects an expired lease heartbeat", async () => {
    let timestamp = 1_000;
    const workflow = createCreatorWorkflowStore(() => timestamp);
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow, uploadFixture(), {
      now: () => timestamp,
    });
    await registerWorker(fixture, ["compiler"]);
    const claim = await claimWorker(fixture);
    const leaseToken = String(claim.json().job.leaseToken);
    const heartbeat = () =>
      fixture.app.inject({
        method: "POST",
        url: "/v1/workers/worker-a/heartbeat",
        headers: fixture.headers,
        payload: {
          capabilities: ["compiler"],
          leases: [{ jobId: job.id, leaseToken }],
        },
      });

    timestamp += 89_000;
    expect((await heartbeat()).statusCode).toBe(200);
    timestamp += 89_000;
    expect((await heartbeat()).statusCode).toBe(200);
    timestamp += 90_001;
    expect((await heartbeat()).statusCode).toBe(401);
    expect(fixture.workers.leases.has(job.id)).toBe(false);
    expect(workflow.jobs.get(job.id)?.preparationStage).toBe("ANALYSIS_QUEUED");
    await fixture.app.close();
  });
});

// The generate track past authoring: material generation, then the render
// that draws the authored scene, then the same COMPLETED the restore track
// reaches. Every test here is about a job that has job.generation set; the
// restore-track regression at the bottom is the one that must not move.
describe("generate-track material and render phases", () => {
  const generatedSpec = (
    assets: SceneSpec["assets"] = [],
    assetRefs: readonly string[] = [],
  ): SceneSpec => ({
    schema: "scene-spec-v1",
    mode: "SWAP",
    canvas: {
      width: CANVAS["9:16"].width,
      height: CANVAS["9:16"].height,
      fps: DELIVERY_FPS,
      frameCount: 60,
    },
    palette: {
      hero: "#ff5500",
      cool: "#3355ff",
      warm: "#ffaa33",
      background: "#101018",
    },
    assets,
    beats: [
      {
        beatId: "beat-only",
        startFrame: 0,
        endFrame: 60,
        shot: "hard-cut",
        elements: [
          {
            elementId: "headline",
            kind: "text",
            content: "SHORT",
            box: { x: 100, y: 800, width: 880, height: 200 },
            keyframes: [{ frame: 0, opacity: 1, ease: "linear" }],
            effects: [],
          },
          ...assetRefs.map((assetRef, index) => ({
            elementId: `asset-${index}`,
            kind: "image" as const,
            assetRef,
            box: { x: 0, y: 0, width: 100, height: 100 },
            keyframes: [],
            effects: [],
          })),
        ],
      },
    ],
  });
  const attachmentSpec = generatedSpec(
    [
      {
        assetId: "logo",
        kind: "image",
        origin: "attachment",
        ref: "attachment://att_1",
      },
    ],
    ["logo"],
  );
  const logoBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const attachmentUploads = (): UploadStore => {
    const uploads = uploadFixture();
    uploads.attachments = new Map([
      [
        "att_1",
        {
          id: "att_1",
          tenantId: "ten_a",
          contentType: "image/png" as const,
          sizeBytes: logoBytes.byteLength,
          bytes: new Uint8Array(logoBytes),
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    ]);
    return uploads;
  };
  const generateJob = (
    workflow: CreatorWorkflowStore,
    spec: SceneSpec,
    stage: "ASSETS_QUEUED" | "GENERATE_QUEUED" = "ASSETS_QUEUED",
    attachmentIds: readonly string[] = [],
  ): Job => {
    const job = addJob(workflow, "PREPARING", {
      ...generationConfig,
      attachmentIds: [...attachmentIds],
    });
    job.compilation = compilation;
    job.evidence = analysisEvidence(job.id, "attempt-a");
    job.evidenceDigest = sha256(JSON.stringify(job.evidence));
    job.runtimePreflight = preflight;
    job.authoredScene = { spec, beatSheet: [] };
    job.sceneSpecDigest = sha256Hex(spec);
    if (stage === "ASSETS_QUEUED") job.preparationStage = "ASSETS_QUEUED";
    else {
      job.preparationStage = "READY";
      job.state = "QUEUED";
      job.approved = true;
    }
    return job;
  };
  const genRenderReport = (
    job: Job,
    bytes: Uint8Array,
    overrides: Record<string, unknown> = {},
  ) => ({
    schema: "rvs.gen-render-report.v1",
    jobId: job.id,
    attemptId: "attempt-a",
    specDigest: job.sceneSpecDigest,
    outputSha256: sha256(bytes),
    outputBytes: bytes.byteLength,
    frameSha256: Array<string>(60).fill("d".repeat(64)),
    runtime: {
      chromiumVersion: "151.0.7922.138",
      renderer: preflight.renderer,
      fontReady: true,
      webgl2: true,
      networkPolicy: "external-blocked",
      repeatedFrameByteIdentity: true,
    },
    qc: {
      status: "PASS",
      width: CANVAS["9:16"].width,
      height: CANVAS["9:16"].height,
      fps: DELIVERY_FPS,
      frameCount: 60,
    },
    ...overrides,
  });
  const safetyFixture = (
    workflow: CreatorWorkflowStore,
    uploads?: UploadStore,
  ) => {
    const directory = mkdtempSync(join(tmpdir(), "rvs-gen-render-"));
    const db = openApiDatabase(join(directory, "app.sqlite"));
    updateAiProviderSettings(
      db,
      {
        providerKind: "openai",
        model: "gpt-4o",
        apiKey: "sk-test",
        enabled: true,
      },
      "admin",
      1_000,
      "test-secret-key-material",
    );
    return appFixture(workflow, uploads, {
      reviews: createReviewStore(),
      db,
      aiSecretKey: "test-secret-key-material",
      safetyCheckGenerate: async () => ({
        object: { safe: true, reason: "no unsafe content detected" },
      }),
    });
  };

  it("hands the assets phase the authored scene, not the measured evidence", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, attachmentSpec, "ASSETS_QUEUED", [
      "att_1",
    ]);
    const fixture = appFixture(workflow, attachmentUploads(), {});
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);

    const payload = claim.json().job.payload;
    expect(payload.phase).toBe("assets");
    expect(payload.specDigest).toBe(job.sceneSpecDigest);
    expect(payload.spec).toEqual(attachmentSpec);
    expect(payload.attachmentIds).toEqual(["att_1"]);
    // The generated scene is the whole input by now -- shipping the
    // evidence bundle to a phase that never opens it would misstate what
    // this phase depends on.
    expect(payload.evidence).toBeUndefined();
    expect(workflow.jobs.get(job.id)?.preparationStage).toBe("ASSETS_RUNNING");
    await fixture.app.close();
  });

  it("is not claimable by a compiler-only worker", async () => {
    const workflow = createCreatorWorkflowStore();
    generateJob(workflow, generatedSpec());
    const fixture = appFixture(workflow, uploadFixture(), {});
    await registerWorker(fixture, ["compiler"]);

    expect((await claimWorker(fixture)).json().job).toBeNull();
    await fixture.app.close();
  });

  it("queues the generated render once a scene that needs no material is resolved", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, generatedSpec());
    const fixture = appFixture(workflow, uploadFixture(), {});
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);

    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "assets",
          specDigest: job.sceneSpecDigest,
          assets: [],
        },
      },
    });

    expect(complete.statusCode).toBe(200);
    const finished = workflow.jobs.get(job.id);
    expect(finished?.state).toBe("QUEUED");
    expect(finished?.preparationStage).toBe("READY");
    expect(finished?.approved).toBe(true);
    expect(finished?.progress).toBeNull();

    const second = await claimWorker(fixture);
    expect(second.json().job.payload.phase).toBe("gen-render");
    expect(second.json().job.payload.assets).toEqual([]);
    await fixture.app.close();
  });

  it("refuses an assets report for a scene this job no longer has", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, generatedSpec());
    const fixture = appFixture(workflow, uploadFixture(), {});
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);

    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "assets",
          specDigest: "f".repeat(64),
          assets: [],
        },
      },
    });

    expect(complete.statusCode).toBe(422);
    expect(workflow.jobs.get(job.id)?.state).toBe("PREPARING");
    await fixture.app.close();
  });

  it("serves a brand attachment's bytes to the assets phase, and to nothing else", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, attachmentSpec, "ASSETS_QUEUED", [
      "att_1",
    ]);
    const fixture = appFixture(workflow, attachmentUploads(), {});
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);

    const served = await fixture.app.inject({
      method: "GET",
      url: `/v1/workers/worker-a/jobs/${job.id}/attachments/att_1`,
      headers: fixture.headers,
    });
    expect(served.statusCode).toBe(200);
    expect(served.rawPayload).toEqual(logoBytes);

    // An attachment this job never named is not this job's to read.
    const foreign = await fixture.app.inject({
      method: "GET",
      url: `/v1/workers/worker-a/jobs/${job.id}/attachments/att_other`,
      headers: fixture.headers,
    });
    expect(foreign.statusCode).toBe(404);
    await fixture.app.close();
  });

  it("binds each reported asset to the artifact the API actually stored", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, attachmentSpec, "ASSETS_QUEUED", [
      "att_1",
    ]);
    const fixture = appFixture(workflow, attachmentUploads(), {});
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);

    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/asset-artifact/logo`,
      headers: { ...fixture.headers, "content-type": "image/png" },
      payload: logoBytes,
    });
    expect(uploaded.statusCode).toBe(201);
    expect(workflow.generatedAssets.get(`${job.id}/logo`)).toMatchObject({
      kind: "generated-asset",
      contentType: "image/png",
      sha256: sha256(logoBytes),
    });

    // A report naming an artifact id the store does not hold is rejected,
    // exactly as the render phase rejects a report that does not match the
    // delivery it staged.
    const forged = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "assets",
          specDigest: job.sceneSpecDigest,
          assets: [
            {
              assetId: "logo",
              artifactId: "genasset_notreal",
              sha256: sha256(logoBytes),
              provenance: null,
            },
          ],
        },
      },
    });
    expect(forged.statusCode).toBe(422);

    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "assets",
          specDigest: job.sceneSpecDigest,
          assets: [
            {
              assetId: "logo",
              artifactId: uploaded.json().artifactId,
              sha256: sha256(logoBytes),
              provenance: null,
            },
          ],
        },
      },
    });
    expect(complete.statusCode).toBe(200);
    expect(workflow.jobs.get(job.id)?.state).toBe("QUEUED");

    const second = await claimWorker(fixture);
    expect(second.json().job.payload.assets).toEqual([
      {
        assetId: "logo",
        artifactId: uploaded.json().artifactId,
        sha256: sha256(logoBytes),
        contentType: "image/png",
      },
    ]);
    await fixture.app.close();
  });

  it("refuses a reported asset set that is not the one the scene needs", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, attachmentSpec, "ASSETS_QUEUED", [
      "att_1",
    ]);
    const fixture = appFixture(workflow, attachmentUploads(), {});
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);

    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "assets",
          specDigest: job.sceneSpecDigest,
          assets: [],
        },
      },
    });

    expect(complete.statusCode).toBe(422);
    expect(workflow.jobs.get(job.id)?.state).toBe("PREPARING");
    await fixture.app.close();
  });

  it("refuses generated material whose provenance is not the hash of what was stored", async () => {
    const workflow = createCreatorWorkflowStore();
    const spec = generatedSpec(
      [
        {
          assetId: "backdrop",
          kind: "image",
          origin: "generated",
          ref: "generated://backdrop",
          provenance: {
            tool: "author-declared",
            prompt: "a dark studio backdrop",
            seed: 7,
            sha256: "0".repeat(64),
          },
        },
      ],
      ["backdrop"],
    );
    const job = generateJob(workflow, spec);
    const fixture = appFixture(workflow, uploadFixture(), {});
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/asset-artifact/backdrop`,
      headers: { ...fixture.headers, "content-type": "image/png" },
      payload: logoBytes,
    });
    expect(uploaded.statusCode).toBe(201);

    const lying = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "assets",
          specDigest: job.sceneSpecDigest,
          assets: [
            {
              assetId: "backdrop",
              artifactId: uploaded.json().artifactId,
              sha256: sha256(logoBytes),
              provenance: {
                tool: "some-generator@1",
                prompt: "a dark studio backdrop",
                seed: 3,
                sha256: "0".repeat(64),
              },
            },
          ],
        },
      },
    });
    expect(lying.statusCode).toBe(422);

    const honest = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "assets",
          specDigest: job.sceneSpecDigest,
          assets: [
            {
              assetId: "backdrop",
              artifactId: uploaded.json().artifactId,
              sha256: sha256(logoBytes),
              provenance: {
                tool: "some-generator@1",
                prompt: "a dark studio backdrop",
                seed: 3,
                sha256: sha256(logoBytes),
              },
            },
          ],
        },
      },
    });
    expect(honest.statusCode).toBe(200);
    // The author's declared provenance was a hash of bytes that did not
    // exist yet. What is carried forward is what was really produced, and
    // the spec digest moves with it.
    const finished = workflow.jobs.get(job.id);
    expect(finished?.authoredScene?.spec.assets[0]?.provenance).toEqual({
      tool: "some-generator@1",
      prompt: "a dark studio backdrop",
      seed: 3,
      sha256: sha256(logoBytes),
    });
    expect(finished?.sceneSpecDigest).toBe(
      sha256Hex(finished?.authoredScene?.spec),
    );
    expect(finished?.sceneSpecDigest).not.toBe(sha256Hex(spec));
    await fixture.app.close();
  });

  const generatedAssetSpec = generatedSpec(
    [
      {
        assetId: "backdrop",
        kind: "image",
        origin: "generated",
        ref: "generated://backdrop",
        provenance: {
          tool: "author-declared",
          prompt: "a dark studio backdrop",
          seed: 7,
          sha256: "0".repeat(64),
        },
      },
    ],
    ["backdrop"],
  );
  const materialFixture = (
    workflow: CreatorWorkflowStore,
    materialGenerate?: GenerateImage,
  ) => {
    const directory = mkdtempSync(join(tmpdir(), "rvs-material-endpoint-"));
    const db = openApiDatabase(join(directory, "app.sqlite"));
    updateMaterialProviderSettings(
      db,
      {
        providerKind: "openai",
        model: "gpt-image-2",
        apiKey: "sk-test",
        enabled: true,
      },
      "admin",
      1_000,
      "test-secret-key-material",
    );
    return appFixture(workflow, uploadFixture(), {
      db,
      aiSecretKey: "test-secret-key-material",
      ...(materialGenerate ? { materialGenerate } : {}),
    });
  };
  // A real 1x1 transparent RGBA PNG. It used to be a bare header, which the
  // alpha check accepted; it decodes the pixels now, so a header is not a
  // PNG and is refused.
  const pngChunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const rgbaPngHeader = (): Buffer => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr.writeUInt8(8, 8);
    ihdr.writeUInt8(6, 9);
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 0]))),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
  };
  const materialRequestPayload = {
    assetId: "backdrop",
    kind: "image",
    prompt: "a dark studio backdrop",
    seed: 7,
    canvas: {
      width: CANVAS["9:16"].width,
      height: CANVAS["9:16"].height,
      fps: DELIVERY_FPS,
      frameCount: 60,
    },
  };

  it("asks the OpenAI-backed endpoint for image material and returns bytes with provenance", async () => {
    const workflow = createCreatorWorkflowStore();
    generateJob(workflow, generatedAssetSpec, "ASSETS_QUEUED");
    const png = rgbaPngHeader();
    const fixture = materialFixture(workflow, async (options) => {
      expect(options.model).toBe("gpt-image-2");
      expect(options.prompt).toBe("a dark studio backdrop");
      expect(options.size).toBe("1024x1536");
      return { b64: png.toString("base64") };
    });
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);
    const jobId = claim.json().job.jobId as string;

    const response = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${jobId}/material`,
      headers: fixture.headers,
      payload: materialRequestPayload,
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.contentType).toBe("image/png");
    expect(Buffer.from(body.bytesBase64, "base64")).toEqual(png);
    expect(body.provenance).toEqual({
      tool: "openai:gpt-image-2",
      prompt: "a dark studio backdrop",
      sha256: sha256(png),
    });
    await fixture.app.close();
  });

  // The two self-hosted generators are addressed from the admin console.
  // The worker has no outbound network and used to read these from its own
  // environment, so the claim payload is how the setting reaches it.
  it("sends the console's self-hosted generator addresses with an assets claim", async () => {
    const workflow = createCreatorWorkflowStore();
    generateJob(workflow, generatedAssetSpec, "ASSETS_QUEUED");
    const directory = mkdtempSync(join(tmpdir(), "rvs-material-endpoints-"));
    const db = openApiDatabase(join(directory, "app.sqlite"));
    updateMaterialProviderSettings(
      db,
      {
        providerKind: "openai",
        model: "gpt-image-2",
        apiKey: "sk-test",
        enabled: true,
        videoBaseUrl: "http://wan-alpha:8000",
        model3dBaseUrl: "http://hi3dgen:8000",
      },
      "admin",
      1_000,
      "test-secret-key-material",
    );
    const fixture = appFixture(workflow, uploadFixture(), {
      db,
      aiSecretKey: "test-secret-key-material",
    });
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);

    expect(claim.json().job.payload.materialEndpoints).toEqual({
      video: "http://wan-alpha:8000",
      model3d: "http://hi3dgen:8000",
    });
    await fixture.app.close();
  });

  // Unset is a real answer: the worker's provider then refuses that
  // material kind by name instead of dialling nothing.
  it("sends nulls when neither self-hosted generator is configured", async () => {
    const workflow = createCreatorWorkflowStore();
    generateJob(workflow, generatedAssetSpec, "ASSETS_QUEUED");
    const fixture = materialFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);

    expect(claim.json().job.payload.materialEndpoints).toEqual({
      video: null,
      model3d: null,
    });
    await fixture.app.close();
  });

  it("refuses a material request for a kind it does not implement, naming the kind", async () => {
    const workflow = createCreatorWorkflowStore();
    generateJob(workflow, generatedAssetSpec, "ASSETS_QUEUED");
    const fixture = materialFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);
    const jobId = claim.json().job.jobId as string;

    const response = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${jobId}/material`,
      headers: fixture.headers,
      payload: { ...materialRequestPayload, kind: "video" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("MATERIAL_GENERATION_FAILED");
    expect(response.json().error.message).toMatch(/"video".*not implemented/);
    expect(response.json().error.message).toMatch(/"image"/);
  });

  it("refuses a material request when no image material provider is configured", async () => {
    const workflow = createCreatorWorkflowStore();
    generateJob(workflow, generatedAssetSpec, "ASSETS_QUEUED");
    const fixture = appFixture(workflow, uploadFixture(), {});
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);
    const jobId = claim.json().job.jobId as string;

    const response = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${jobId}/material`,
      headers: fixture.headers,
      payload: materialRequestPayload,
    });

    expect(response.statusCode).toBe(422);
    // The code, not just the message: the worker copies error.code onto the
    // job, so refusing this as INVALID_REQUEST recorded a failure that said
    // nothing about the one setting an operator has to change.
    expect(response.json().error.code).toBe("MATERIAL_PROVIDER_NOT_CONFIGURED");
    await fixture.app.close();
  });

  it("refuses a material request outside the assets phase", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, generatedSpec(), "GENERATE_QUEUED");
    const fixture = safetyFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    expect(workflow.jobs.get(job.id)?.state).toBe("RENDERING");

    const response = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/material`,
      headers: fixture.headers,
      payload: materialRequestPayload,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("INVALID_REQUEST");
    await fixture.app.close();
  });

  it("publishes the generated film as its own artifact kind and completes the job", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, generatedSpec(), "GENERATE_QUEUED");
    const fixture = safetyFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);
    expect(claim.json().job.payload.phase).toBe("gen-render");
    expect(workflow.jobs.get(job.id)?.state).toBe("RENDERING");

    const filmBytes = Buffer.from("generated-mp4-bytes");
    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/generated-artifact`,
      headers: { ...fixture.headers, "content-type": "video/mp4" },
      payload: filmBytes,
    });
    expect(uploaded.statusCode).toBe(201);
    const packageBytes = Buffer.from("native-scene-package-tar");
    const scenePackage = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/artifacts/scene-package`,
      headers: {
        ...fixture.headers,
        "content-type": "application/x-tar",
      },
      payload: packageBytes,
    });
    expect(scenePackage.statusCode).toBe(201);
    const sample = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/safety-sample-artifact`,
      headers: { ...fixture.headers, "content-type": "image/png" },
      payload: Buffer.from([137, 80, 78, 71]),
    });
    expect(sample.statusCode).toBe(201);

    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "gen-render",
          artifactId: uploaded.json().artifactId,
          scenePackageArtifactId: scenePackage.json().artifactId,
          safetySampleArtifactId: sample.json().artifactId,
          report: genRenderReport(job, filmBytes),
        },
      },
    });

    expect(complete.statusCode).toBe(200);
    const finished = workflow.jobs.get(job.id);
    expect(finished?.state).toBe("COMPLETED");
    expect(finished?.artifact).toMatchObject({
      id: uploaded.json().artifactId,
      kind: "generated-delivery",
    });
    expect(workflow.artifacts.get(uploaded.json().artifactId)?.kind).toBe(
      "generated-delivery",
    );
    expect(workflow.scenePackages.get(job.id)?.id).toBe(
      scenePackage.json().artifactId,
    );
    const deliverables = await fixture.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}/deliverables`,
      headers: fixture.tenantHeaders,
    });
    expect(deliverables.statusCode).toBe(200);
    expect(deliverables.json().items).toEqual([
      expect.objectContaining({ kind: "mp4" }),
      expect.objectContaining({
        id: scenePackage.json().artifactId,
        kind: "scene-package",
      }),
    ]);
    const download = await fixture.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}/scene-package-download`,
      headers: fixture.tenantHeaders,
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toContain("application/x-tar");
    expect(download.rawPayload).toEqual(packageBytes);
    await fixture.app.close();
  });

  it("refuses a generated render report that does not match the film it staged", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, generatedSpec(), "GENERATE_QUEUED");
    const fixture = safetyFixture(workflow);
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const filmBytes = Buffer.from("generated-mp4-bytes");
    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/generated-artifact`,
      headers: { ...fixture.headers, "content-type": "video/mp4" },
      payload: filmBytes,
    });
    const sample = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/safety-sample-artifact`,
      headers: { ...fixture.headers, "content-type": "image/png" },
      payload: Buffer.from([137, 80, 78, 71]),
    });

    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "gen-render",
          artifactId: uploaded.json().artifactId,
          safetySampleArtifactId: sample.json().artifactId,
          report: genRenderReport(job, filmBytes, {
            outputSha256: "b".repeat(64),
          }),
        },
      },
    });

    expect(complete.statusCode).toBe(422);
    expect(workflow.jobs.get(job.id)?.state).toBe("RENDERING");
    expect(workflow.jobs.get(job.id)?.artifact).toBeNull();
    await fixture.app.close();
  });

  it("fails the job when the generated film does not pass the safety check", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = generateJob(workflow, generatedSpec(), "GENERATE_QUEUED");
    const directory = mkdtempSync(join(tmpdir(), "rvs-gen-render-unsafe-"));
    const db = openApiDatabase(join(directory, "app.sqlite"));
    updateAiProviderSettings(
      db,
      {
        providerKind: "openai",
        model: "gpt-4o",
        apiKey: "sk-test",
        enabled: true,
      },
      "admin",
      1_000,
      "test-secret-key-material",
    );
    const fixture = appFixture(workflow, undefined, {
      reviews: createReviewStore(),
      db,
      aiSecretKey: "test-secret-key-material",
      safetyCheckGenerate: async () => ({
        object: { safe: false, reason: "depicts a real person" },
      }),
    });
    await registerWorker(fixture, ["renderer"]);
    await claimWorker(fixture);
    const filmBytes = Buffer.from("generated-mp4-bytes");
    const uploaded = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/generated-artifact`,
      headers: { ...fixture.headers, "content-type": "video/mp4" },
      payload: filmBytes,
    });
    const sample = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/safety-sample-artifact`,
      headers: { ...fixture.headers, "content-type": "image/png" },
      payload: Buffer.from([137, 80, 78, 71]),
    });

    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: {
        result: {
          protocol: "rvs.worker.v1",
          phase: "gen-render",
          artifactId: uploaded.json().artifactId,
          safetySampleArtifactId: sample.json().artifactId,
          report: genRenderReport(job, filmBytes),
        },
      },
    });

    expect(complete.statusCode).toBe(200);
    const finished = workflow.jobs.get(job.id);
    expect(finished?.state).toBe("FAILED");
    expect(finished?.failureCode).toBe("CONTENT_SAFETY_REJECTED");
    expect(finished?.artifact).toBeNull();
    await fixture.app.close();
  });

  // The one way this work can break the shipping product: a job with no
  // job.generation must still claim the restore render phase, get the
  // restore payload, and see none of the generate track's new fields.
  it("leaves a restore-track job on the phase and payload it has always had", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow, undefined, {});
    await registerWorker(fixture, ["renderer"]);
    const claim = await claimWorker(fixture);

    const payload = claim.json().job.payload;
    expect(payload.phase).toBe("render");
    expect(payload.spec).toBeUndefined();
    expect(payload.specDigest).toBeUndefined();
    expect(payload.attachmentIds).toBeUndefined();
    expect(payload.assets).toBeUndefined();
    expect(payload.evidence).toBeTruthy();
    expect(payload.compilation).toBeTruthy();
    expect(workflow.jobs.get(job.id)?.state).toBe("RENDERING");
    await fixture.app.close();
  });
});
