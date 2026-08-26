import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  assertLegalTransition,
  type JobState,
} from "../../../packages/contracts/src/lifecycle.js";
import { z } from "zod";
import { runSafetyCheck, type GenerateSafetyVerdict } from "./safety-check.js";
import {
  enrichEvidenceTranslations,
  type GenerateTranslation,
} from "./translate-evidence.js";
import {
  type PersistenceRequest,
  requestPersistence,
  safeEnvelope,
} from "./boundary.js";
import type {
  Compilation,
  CreatorWorkflowStore,
  Job,
  PreparationStage,
  RuntimePreflightEvidence,
} from "./creator-workflow.js";
import {
  autoApproveEvidenceVideo,
  autoApproveT1,
  autoApproveT2T3,
  autoApproveT4,
  autoApproveT5,
  CompilationSchema,
  EvidenceBundleSchema,
} from "./creator-workflow.js";
import type { ReviewStore } from "./reviews.js";
import { uploadSourcePath, type UploadStore } from "./uploads.js";

const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
const LEASE_MS = 90_000;
const WORKER_SESSION_MS = 5 * 60_000;
const ArtifactContentLength = z
  .string()
  .regex(/^\d+$/u)
  .transform(Number)
  .pipe(z.number().int().positive().max(MAX_ARTIFACT_BYTES));

const ARTIFACT_LENGTH_MISMATCH = new Error("ARTIFACT_LENGTH_MISMATCH");

export type WorkerStatus = "ONLINE" | "OFFLINE";
export type Worker = {
  readonly id: string;
  capabilities: readonly string[];
  lastHeartbeat: number;
  status: WorkerStatus;
  readonly preflight: RuntimePreflightEvidence;
};
export type WorkerSession = {
  readonly workerId: string;
  readonly tokenHash: string;
  expiresAt: number;
};
// Single source of truth for worker phases. durable-state.ts parses persisted
// leases with this same schema -- a hand-written duplicate there once let an
// `evidence-video` lease persist but fail to re-read, crash-looping boot.
export const WorkerPhaseSchema = z.enum([
  "analyze",
  "compile",
  "evidence-video",
  "preview",
  "render",
]);
export type WorkerPhase = z.infer<typeof WorkerPhaseSchema>;
export type ClaimedJob = {
  readonly workerId: string;
  readonly phase: WorkerPhase;
  readonly jobId: string;
  readonly attemptId: string;
  readonly tokenHash: string;
  readonly deletionEpoch: number;
  readonly restoreEpoch: number;
  expiresAt: number;
};
export type WorkerStore = {
  readonly workers: Map<string, Worker>;
  readonly sessions: Map<string, WorkerSession>;
  readonly leases: Map<string, ClaimedJob>;
  readonly retiredUntil: Map<string, number>;
  readonly tokenHash: string | undefined;
};

export const createWorkerStore = (tokenHash?: string): WorkerStore => ({
  workers: new Map(),
  sessions: new Map(),
  leases: new Map(),
  retiredUntil: new Map(),
  tokenHash,
});
export const hashWorkerToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const RuntimePreflight = z
  .object({
    status: z.literal("PASS"),
    chromiumVersion: z.literal("151.0.7922.138"),
    renderer: z.string().regex(/swiftshader/iu),
    fontReady: z.literal(true),
    webgl2: z.literal(true),
    networkPolicy: z.literal("external-blocked"),
    repeatedFrameByteIdentity: z.literal(true),
    ffmpeg: z.literal(true),
    ffprobe: z.literal(true),
    compilerModels: z.literal(true),
    runtimeDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
const RegisterBody = z
  .object({
    workerId: z.string().min(1),
    capabilities: z.array(z.string().min(1)),
    preflight: RuntimePreflight,
  })
  .strict();
const HeartbeatBody = z
  .object({
    capabilities: z.array(z.string().min(1)),
    leases: z
      .array(
        z
          .object({
            jobId: z.string().min(1),
            leaseToken: z.string().min(1),
          })
          .strict(),
      )
      .max(1),
  })
  .strict();
const AnalysisResult = z
  .object({
    protocol: z.literal("rvs.worker.v1"),
    phase: z.literal("analyze"),
    evidence: EvidenceBundleSchema,
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    compilation: CompilationSchema,
    normalized: z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        durationMs: z.literal(4_000),
        fps: z.union([
          z.literal(24),
          z.literal(25),
          z.literal(30),
          z.literal(50),
          z.literal(60),
        ]),
        frameCount: z.number().int().min(96).max(240),
      })
      .strict(),
  })
  .strict();
const CompileResult = z
  .object({
    protocol: z.literal("rvs.worker.v1"),
    phase: z.literal("compile"),
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    compilation: CompilationSchema,
  })
  .strict();
const DELIVERY_FPS = 30;
const DELIVERY_FRAME_COUNT = 120;
const RenderReport = z
  .object({
    status: z.literal("PASS"),
    protocol: z.literal("rvs.render-report.v1"),
    mode: z.enum(["preview", "delivery"]),
    jobId: z.string().min(1),
    attemptId: z.string().min(1),
    outputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    outputBytes: z.number().int().positive(),
    ir: z
      .object({
        authoringDigest: z.string().regex(/^[a-f0-9]{64}$/u),
        sceneDigest: z.string().regex(/^[a-f0-9]{64}$/u),
        browserPassSpecDigest: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict(),
    runtime: z
      .object({
        chromiumVersion: z.literal("151.0.7922.138"),
        renderer: z.string().regex(/swiftshader/iu),
        fontReady: z.literal(true),
        webgl2: z.literal(true),
        networkPolicy: z.literal("external-blocked"),
        repeatedFrameByteIdentity: z.literal(true),
        frameSha256: z.array(z.string().regex(/^[a-f0-9]{64}$/u)).min(1),
        passIds: z.array(z.string().min(1)).min(1),
        shaderDiagnostics: z.array(
          z
            .object({
              shader: z.string().min(1),
              compiled: z.literal(true),
              linked: z.literal(true),
              log: z.string(),
            })
            .strict(),
        ),
        limits: z.record(z.string(), z.number().int().positive()),
      })
      .strict(),
    qc: z
      .object({
        status: z.literal("PASS"),
        durationMs: z.literal(4_000),
        width: z.literal(1080),
        height: z.literal(1920),
        frameCount: z.literal(DELIVERY_FRAME_COUNT),
        fps: z.literal(DELIVERY_FPS),
        videoCodec: z.literal("h264"),
        videoProfile: z.literal("High"),
        videoLevel: z.literal("4.1"),
        pixelFormat: z.literal("yuv420p"),
        colorSpace: z.literal("bt709"),
        gopSize: z.literal(60),
        closedGop: z.literal(true),
        fastStart: z.literal(true),
        audioCodec: z.literal("aac"),
        audioProfile: z.literal("LC"),
        audioTargetBitRate: z.literal(192_000),
        audioChannels: z.literal(2),
        audioSampleRateHz: z.literal(48_000),
      })
      .strict(),
  })
  .strict();
const RenderResult = z
  .object({
    protocol: z.literal("rvs.worker.v1"),
    phase: z.literal("render"),
    artifactId: z.string().min(1),
    safetySampleArtifactId: z.string().min(1).nullable(),
    report: RenderReport,
  })
  .strict();
const PreviewResult = z
  .object({
    protocol: z.literal("rvs.worker.v1"),
    phase: z.literal("preview"),
    previewArtifactId: z.string().min(1),
    previewLabeledArtifactId: z.string().min(1),
    report: RenderReport.extend({ mode: z.literal("preview") }),
  })
  .strict();
const EvidenceVideoResult = z
  .object({
    protocol: z.literal("rvs.worker.v1"),
    phase: z.literal("evidence-video"),
    evidenceVideoArtifactId: z.string().min(1),
  })
  .strict();
const ProgressBody = z
  .object({
    phase: z.enum(["prepare", "render"]),
    stage: z.string().min(1).max(80),
    fraction: z.number().min(0).max(1),
    framesProcessed: z.number().int().nonnegative().nullable().default(null),
    framesTotal: z.number().int().positive().nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.framesProcessed !== null && value.framesTotal === null) ||
      (value.framesProcessed !== null &&
        value.framesTotal !== null &&
        value.framesProcessed > value.framesTotal)
    )
      context.addIssue({
        code: "custom",
        message: "framesProcessed must fit within framesTotal",
      });
  });
const error = (
  reply: FastifyReply,
  code:
    | "AUTHENTICATION_REQUIRED"
    | "INVALID_REQUEST"
    | "RESOURCE_NOT_FOUND"
    | "CANCEL_REQUESTED",
): void => {
  const status =
    code === "AUTHENTICATION_REQUIRED"
      ? 401
      : code === "RESOURCE_NOT_FOUND"
        ? 404
        : code === "CANCEL_REQUESTED"
          ? 409
          : 422;
  reply
    .code(status)
    .send(
      safeEnvelope(
        new Error(code),
        String(reply.getHeader("x-correlation-id")),
      ),
    );
};
const tokenFrom = (request: FastifyRequest): string => {
  const value = request.headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ")
    ? value.slice(7)
    : "";
};
const authorized = (request: FastifyRequest, store: WorkerStore): boolean => {
  const received = Buffer.from(hashWorkerToken(tokenFrom(request)));
  const expected = store.tokenHash
    ? Buffer.from(store.tokenHash)
    : Buffer.alloc(0);
  return (
    received.length === expected.length &&
    received.length > 0 &&
    timingSafeEqual(received, expected)
  );
};
const sessionAuthorized = (
  request: FastifyRequest,
  store: WorkerStore,
  workerId: string,
  now: number,
): boolean => {
  const retiredUntil = store.retiredUntil.get(workerId);
  if (retiredUntil !== undefined && retiredUntil > now) return false;
  const session = store.sessions.get(workerId);
  if (!session || session.workerId !== workerId || session.expiresAt <= now)
    return false;
  const received = Buffer.from(hashWorkerToken(tokenFrom(request)));
  const expected = Buffer.from(session.tokenHash);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
};
const worker = (store: WorkerStore, id: string): Worker | undefined =>
  store.workers.get(id);
const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const transition = (job: Job, next: JobState, now: () => number): void => {
  assertLegalTransition(job.state, next);
  job.state = next;
  job.updatedAt = new Date(now()).toISOString();
  job.etag = `\"${digest(job.updatedAt)}\"`;
};
type TenantDeletionFence = Readonly<{
  tenantId: string;
  deletionEpoch: number;
  now: () => number;
}>;
export function fenceTenantJobs(
  store: WorkerStore,
  workflow: CreatorWorkflowStore,
  fence: TenantDeletionFence,
): void {
  for (const job of workflow.jobs.values()) {
    if (job.tenantId !== fence.tenantId) continue;
    job.deletionEpoch = Math.max(job.deletionEpoch + 1, fence.deletionEpoch);
    const lease = store.leases.get(job.id);
    store.leases.delete(job.id);
    switch (job.state) {
      case "PREPARING":
      case "QUEUED":
      case "RENDERING":
        transition(job, "CANCEL_REQUESTED", fence.now);
        transition(job, "CANCELLED", fence.now);
        break;
      case "CANCEL_REQUESTED":
        transition(job, "CANCELLED", fence.now);
        break;
      case "READY":
      case "ASSEMBLING":
      case "AWAITING_T5":
      case "STALE_APPROVAL":
      case "RETRYABLE_ERROR":
        transition(job, "FAILED", fence.now);
        break;
      case "COMPLETED":
      case "CANCELLED":
      case "FAILED":
        break;
      default: {
        const unreachable: never = job.state;
        throw new Error(`UNHANDLED_JOB_STATE:${unreachable}`);
      }
    }
    const attempt = lease
      ? workflow.attempts
          .get(job.id)
          ?.find((item) => item.id === lease.attemptId)
      : workflow.attempts.get(job.id)?.at(-1);
    if (
      attempt &&
      attempt.state !== "COMPLETED" &&
      attempt.state !== "FAILED" &&
      attempt.state !== "CANCELLED"
    )
      attempt.state = job.state === "CANCELLED" ? "CANCELLED" : "FAILED";
  }
}
type ClaimPhase = ClaimedJob["phase"];
type FinishOutcome = "QUEUED" | "FAILED";
const queuedPhase = (job: Job): ClaimPhase | null => {
  if (job.state === "QUEUED") return "render";
  if (job.state !== "PREPARING" && job.state !== "STALE_APPROVAL") return null;
  if (job.preparationStage === "ANALYSIS_QUEUED") return "analyze";
  if (job.preparationStage === "COMPILATION_QUEUED") return "compile";
  if (job.preparationStage === "EVIDENCE_VIDEO_QUEUED")
    return "evidence-video";
  if (job.preparationStage === "PREVIEW_QUEUED") return "preview";
  return null;
};
const runningStage = (phase: ClaimPhase): PreparationStage | null => {
  if (phase === "analyze") return "ANALYSIS_RUNNING";
  if (phase === "compile") return "COMPILATION_RUNNING";
  if (phase === "evidence-video") return "EVIDENCE_VIDEO_RUNNING";
  if (phase === "preview") return "PREVIEW_RUNNING";
  return null;
};
const queuedStage = (phase: ClaimPhase): PreparationStage | null => {
  if (phase === "analyze") return "ANALYSIS_QUEUED";
  if (phase === "compile") return "COMPILATION_QUEUED";
  if (phase === "evidence-video") return "EVIDENCE_VIDEO_QUEUED";
  if (phase === "preview") return "PREVIEW_QUEUED";
  return null;
};
const phaseCapability = (phase: ClaimPhase): "compiler" | "renderer" =>
  phase === "analyze" || phase === "compile" ? "compiler" : "renderer";
const compilationMatchesReport = (
  compilation: Compilation,
  report: z.infer<typeof RenderReport>,
): boolean =>
  report.ir.authoringDigest === compilation.authoring.digest &&
  report.ir.sceneDigest === compilation.scene.digest &&
  report.ir.browserPassSpecDigest === compilation.browserPassSpec.digest;
const reclaimLease = (
  store: WorkerStore,
  workflow: CreatorWorkflowStore | undefined,
  jobId: string,
  timestamp: number,
): void => {
  const lease = store.leases.get(jobId);
  if (!lease) return;
  store.leases.delete(jobId);
  const attempt = workflow?.attempts
    .get(jobId)
    ?.find((item) => item.id === lease.attemptId);
  if (attempt?.state === "RUNNING") attempt.state = "QUEUED";
  const job = workflow?.jobs.get(jobId);
  if (job?.state === "RENDERING") job.state = "QUEUED";
  const stage = lease ? queuedStage(lease.phase) : null;
  if (job && stage) job.preparationStage = stage;
  if (job) {
    job.updatedAt = new Date(timestamp).toISOString();
    job.etag = `\"${digest(job.updatedAt)}\"`;
  }
};
type RetireWorkerOptions = Readonly<{
  workerId: string;
  workflow: CreatorWorkflowStore | undefined;
  timestamp: number;
}>;
export function retireWorker(
  store: WorkerStore,
  options: RetireWorkerOptions,
): { readonly workerFound: boolean; readonly reclaimedLeases: number } {
  const current = store.workers.get(options.workerId);
  if (!current) return { workerFound: false, reclaimedLeases: 0 };
  current.status = "OFFLINE";
  store.sessions.delete(options.workerId);
  store.retiredUntil.set(
    options.workerId,
    options.timestamp + WORKER_SESSION_MS,
  );
  const jobIds = [...store.leases.values()]
    .filter((lease) => lease.workerId === options.workerId)
    .map((lease) => lease.jobId);
  for (const jobId of jobIds)
    reclaimLease(store, options.workflow, jobId, options.timestamp);
  return { workerFound: true, reclaimedLeases: jobIds.length };
}
const claimWorkflowJob = (
  store: WorkerStore,
  workflow: CreatorWorkflowStore | undefined,
  uploads: UploadStore | undefined,
  workerId: string,
  now: () => number,
) => {
  if (!workflow) return null;
  const currentWorker = store.workers.get(workerId);
  if (!currentWorker) return null;
  const timestamp = now();
  for (const [jobId, lease] of store.leases)
    if (lease.expiresAt <= timestamp)
      reclaimLease(store, workflow, jobId, timestamp);
  const candidates = [...workflow.jobs.values()].sort(
    (left, right) =>
      left.eligibleAt - right.eligibleAt ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
  const job = candidates.find((item) => {
    const phase = queuedPhase(item);
    const upload = uploads?.uploads.get(item.uploadId);
    return (
      phase !== null &&
      upload?.state === "ACCEPTED" &&
      upload.sourceSha256 !== null &&
      item.eligibleAt <= timestamp &&
      currentWorker.capabilities.includes(phaseCapability(phase)) &&
      !store.leases.has(item.id) &&
      (phase !== "compile" || item.evidence !== null) &&
      (phase !== "evidence-video" || item.evidence !== null) &&
      (phase !== "preview" || item.compilation !== null) &&
      (phase !== "render" ||
        (item.approved &&
          item.evidence !== null &&
          item.compilation !== null &&
          item.approvedSpecDigest ===
            item.compilation.browserPassSpec.digest)) &&
      (item.runtimePreflight === null ||
        item.runtimePreflight.runtimeDigest ===
          currentWorker.preflight.runtimeDigest)
    );
  });
  if (!job) return null;
  const upload = uploads?.uploads.get(job.uploadId);
  if (!upload || upload.state !== "ACCEPTED" || !upload.sourceSha256)
    return null;
  const phase = queuedPhase(job);
  if (!phase) return null;
  if (!job.runtimePreflight) job.runtimePreflight = currentWorker.preflight;
  const attempt = workflow.attempts.get(job.id)?.at(-1);
  if (!attempt) return null;
  attempt.state = "RUNNING";
  if (phase === "render") transition(job, "RENDERING", now);
  else {
    const stage = runningStage(phase);
    if (!stage) return null;
    job.preparationStage = stage;
  }
  const leaseToken = randomBytes(32).toString("base64url");
  const expiresAt = timestamp + LEASE_MS;
  store.leases.set(job.id, {
    workerId,
    phase,
    jobId: job.id,
    attemptId: attempt.id,
    tokenHash: hashWorkerToken(leaseToken),
    deletionEpoch: job.deletionEpoch,
    restoreEpoch: job.restoreEpoch,
    expiresAt,
  });
  return {
    jobId: job.id,
    attemptId: attempt.id,
    payload: {
      tenantId: job.tenantId,
      uploadId: job.uploadId,
      sourceSha256: upload.sourceSha256,
      startFrame: job.startFrame,
      sourceFps: job.sourceFps,
      frameCount: job.sourceFps * 4,
      phase,
      deletionEpoch: job.deletionEpoch,
      restoreEpoch: job.restoreEpoch,
      ...(phase === "analyze"
        ? {}
        : { evidence: job.candidateEvidence ?? job.evidence }),
      ...(phase === "preview" || phase === "render"
        ? {
            compilation: job.compilation,
            evidenceDigest: job.evidenceDigest,
            browserPassSpecDigest: job.compilation?.browserPassSpec.digest,
          }
        : {}),
    },
    leaseToken,
    leaseExpiresAt: new Date(expiresAt).toISOString(),
  };
};
const failureToken = (value: unknown): string => {
  const message = typeof value === "string" ? value : "WORKER_JOB_FAILED";
  return message.match(/\b[A-Z][A-Z0-9_]{2,}\b/u)?.[0] ?? "WORKER_JOB_FAILED";
};
const terminalFailure = (token: string): boolean =>
  [
    "AUTHENTICATION_REQUIRED",
    "COMPILER_PROTOCOL_INVALID",
    "EVIDENCE_CONTRACT_INVALID",
    "MEDIA_CONTRACT_INVALID",
    "NORMALIZED_ARTIFACT_CORRUPT",
    "TEMPORAL_CONTRACT_INVALID",
    "UNRESOLVED_CHOICE",
    "WORKSPACE_BOUNDARY_VIOLATION",
  ].includes(token);
const failWorkflowJob = (
  workflow: CreatorWorkflowStore | undefined,
  lease: ClaimedJob,
  message: unknown,
  now: () => number,
): FinishOutcome => {
  const job = workflow?.jobs.get(lease.jobId);
  if (!job) return "FAILED";
  const token = failureToken(message);
  job.failureCode = token;
  if (job.state === "CANCEL_REQUESTED") {
    transition(job, "FAILED", now);
    return "FAILED";
  }
  if (!terminalFailure(token) && job.automaticRetries < 3) {
    job.automaticRetries += 1;
    job.eligibleAt = now() + 1_000 * 2 ** (job.automaticRetries - 1);
    job.progress = null;
    if (lease.phase === "render") {
      transition(job, "RETRYABLE_ERROR", now);
      transition(job, "QUEUED", now);
    } else {
      const stage = queuedStage(lease.phase);
      if (!stage) return "FAILED";
      job.preparationStage = stage;
      job.updatedAt = new Date(now()).toISOString();
      job.etag = `\"${digest(job.updatedAt)}\"`;
    }
    return "QUEUED";
  }
  transition(job, "FAILED", now);
  return "FAILED";
};
const finishWorkflowJob = (
  workflow: CreatorWorkflowStore | undefined,
  lease: ClaimedJob,
  result: unknown,
  now: () => number,
  reviews: ReviewStore | undefined,
): FinishOutcome | null => {
  const job = workflow?.jobs.get(lease.jobId);
  if (!job) return null;
  if (job.state === "CANCEL_REQUESTED") {
    transition(job, "CANCELLED", now);
    return "FAILED";
  }
  if (lease.phase === "analyze") {
    const parsed = AnalysisResult.safeParse(result);
    const rawEvidence = z
      .record(z.string(), z.unknown())
      .safeParse(
        result && typeof result === "object" && "evidence" in result
          ? result.evidence
          : null,
      );
    if (
      !parsed.success ||
      !rawEvidence.success ||
      digest(rawEvidence.data) !== parsed.data.evidenceDigest ||
      parsed.data.evidence.source.jobId !== job.id ||
      parsed.data.evidence.source.attemptId !== lease.attemptId ||
      parsed.data.evidence.source.normalizedSha256 !==
        parsed.data.normalized.sha256 ||
      parsed.data.evidence.observed.temporalVolume.fps !== job.sourceFps ||
      parsed.data.evidence.observed.temporalVolume.frameCount !==
        job.frameCount ||
      parsed.data.normalized.fps !== job.sourceFps ||
      parsed.data.normalized.frameCount !== job.sourceFps * 4
    )
      return null;
    job.evidence = rawEvidence.data;
    job.evidenceDigest = parsed.data.evidenceDigest;
    job.pendingCompilation = parsed.data.compilation;
    job.irDigest = parsed.data.compilation.browserPassSpec.digest;
    job.preparationStage = "AWAITING_T2";
    job.automaticRetries = 0;
    job.failureCode = null;
    job.progress = {
      phase: "prepare",
      stage: "evidence",
      fraction: 1,
      framesProcessed: job.sourceFps * 4,
      framesTotal: job.sourceFps * 4,
    };
    // Deliberately NOT auto-approving here: advancing to EVIDENCE_VIDEO_QUEUED
    // makes the job claimable, and the route still has to await translation
    // enrichment (which mutates the evidence and so changes its digest). The
    // route calls autoApproveT2T3 once that is done -- same deferral the
    // render phase uses for the safety gate below.
    return "QUEUED";
  }
  if (lease.phase === "compile") {
    const parsed = CompileResult.safeParse(result);
    if (
      !parsed.success ||
      !job.evidence ||
      parsed.data.evidenceDigest !== job.evidenceDigest
    )
      return null;
    job.pendingCompilation = parsed.data.compilation;
    job.irDigest = parsed.data.compilation.browserPassSpec.digest;
    job.preparationStage = "AWAITING_T2";
    job.automaticRetries = 0;
    job.failureCode = null;
    autoApproveT2T3(reviews, job, job.creatorId, now());
    return "QUEUED";
  }
  if (lease.phase === "evidence-video") {
    const parsed = EvidenceVideoResult.safeParse(result);
    const evidenceVideo = workflow?.evidenceVideos.get(job.id);
    if (
      !parsed.success ||
      !evidenceVideo ||
      evidenceVideo.id !== parsed.data.evidenceVideoArtifactId
    )
      return null;
    job.automaticRetries = 0;
    job.failureCode = null;
    if (workflow) autoApproveEvidenceVideo(workflow, job, now());
    return "QUEUED";
  }
  if (lease.phase === "preview") {
    const parsed = PreviewResult.safeParse(result);
    const preview = workflow?.previews.get(job.id);
    if (
      !parsed.success ||
      !job.compilation ||
      !preview ||
      preview.id !== parsed.data.previewArtifactId ||
      // Bind the captioned variant the same way, so a retry cannot leave the
      // reviewer comparing against the previous attempt's labels.
      workflow?.previewsLabeled.get(job.id)?.id !==
        parsed.data.previewLabeledArtifactId ||
      parsed.data.report.outputSha256 !== preview.sha256 ||
      parsed.data.report.outputBytes !== preview.sizeBytes ||
      !compilationMatchesReport(job.compilation, parsed.data.report)
    )
      return null;
    preview.report = parsed.data.report;
    job.previewSpecDigest = parsed.data.report.ir.browserPassSpecDigest;
    job.preparationStage = "AWAITING_T4";
    job.automaticRetries = 0;
    job.failureCode = null;
    job.progress = {
      phase: "prepare",
      stage: "preview",
      fraction: 1,
      framesProcessed: DELIVERY_FRAME_COUNT,
      framesTotal: DELIVERY_FRAME_COUNT,
    };
    if (workflow) autoApproveT4(reviews, workflow, job, job.creatorId, now());
    return "QUEUED";
  }
  if (job.state !== "RENDERING" || !job.approved || !job.compilation)
    return null;
  const parsed = RenderResult.safeParse(result);
  const artifact = workflow?.stagedArtifacts.get(job.id);
  const attemptId = workflow?.attempts.get(job.id)?.at(-1)?.id;
  if (
    !parsed.success ||
    !artifact ||
    artifact.id !== parsed.data.artifactId ||
    parsed.data.report.jobId !== job.id ||
    parsed.data.report.attemptId !== attemptId ||
    parsed.data.report.outputSha256 !== artifact.sha256 ||
    parsed.data.report.outputBytes !== artifact.sizeBytes ||
    parsed.data.report.mode !== "delivery" ||
    !compilationMatchesReport(job.compilation, parsed.data.report) ||
    parsed.data.report.ir.browserPassSpecDigest !== job.approvedSpecDigest ||
    parsed.data.report.runtime.frameSha256.length !== DELIVERY_FRAME_COUNT ||
    parsed.data.report.runtime.renderer !== job.runtimePreflight?.renderer ||
    // The safety gate below judges whatever sample is in the store; without
    // this binding a retry that uploads no sample inherits the previous
    // attempt's frame and publishes an unreviewed delivery.
    (workflow?.safetySamples.get(job.id)?.id ?? null) !==
      parsed.data.safetySampleArtifactId ||
    new Set(parsed.data.report.runtime.passIds).size !==
      parsed.data.report.runtime.passIds.length
  )
    return null;
  artifact.report = parsed.data.report;
  transition(job, "ASSEMBLING", now);
  transition(job, "AWAITING_T5", now);
  job.progress = {
    phase: "render",
    stage: "delivery-qc",
    fraction: 1,
    framesProcessed: DELIVERY_FRAME_COUNT,
    framesTotal: DELIVERY_FRAME_COUNT,
  };
  job.automaticRetries = 0;
  job.failureCode = null;
  // T5 is deliberately NOT auto-approved here -- the async content-safety
  // check must run first (see the render-phase branch of the `finish` route
  // handler below), and finishWorkflowJob itself stays synchronous.
  return "QUEUED";
};

type WorkerRouteOptions = Readonly<{
  now: () => number;
  workflow: CreatorWorkflowStore | undefined;
  reviews: ReviewStore | undefined;
  uploads: UploadStore | undefined;
  artifactRoot: string | undefined;
  persist: (() => void) | undefined;
  db: Database.Database | undefined;
  aiSecretKey: string | undefined;
  safetyCheckGenerate: GenerateSafetyVerdict | undefined;
  translateGenerate: GenerateTranslation | undefined;
}>;

export function registerWorkers(
  app: FastifyInstance,
  store: WorkerStore,
  options: WorkerRouteOptions,
): void {
  const {
    now,
    workflow,
    reviews,
    uploads,
    artifactRoot,
    persist,
    db,
    aiSecretKey,
    safetyCheckGenerate,
    translateGenerate,
  } = options;
  const auth = (
    request: FastifyRequest,
    reply: FastifyReply,
    workerId: string,
  ): boolean => {
    if (!sessionAuthorized(request, store, workerId, now())) {
      error(reply, "AUTHENTICATION_REQUIRED");
      return false;
    }
    return true;
  };
  app.post<{ Body: unknown }>(
    "/v1/workers/register",
    async (request, reply) => {
      if (!authorized(request, store)) {
        error(reply, "AUTHENTICATION_REQUIRED");
        return;
      }
      const parsed = RegisterBody.safeParse(request.body);
      if (!parsed.success) {
        error(reply, "INVALID_REQUEST");
        return;
      }
      const timestamp = now();
      const retiredUntil = store.retiredUntil.get(parsed.data.workerId);
      if (retiredUntil !== undefined && retiredUntil > timestamp) {
        error(reply, "AUTHENTICATION_REQUIRED");
        return;
      }
      if (retiredUntil !== undefined)
        store.retiredUntil.delete(parsed.data.workerId);
      for (const [jobId, lease] of store.leases)
        if (lease.workerId === parsed.data.workerId)
          reclaimLease(store, workflow, jobId, timestamp);
      const sessionToken = randomBytes(32).toString("base64url");
      const sessionExpiresAt = timestamp + WORKER_SESSION_MS;
      store.workers.set(parsed.data.workerId, {
        id: parsed.data.workerId,
        capabilities: [...parsed.data.capabilities],
        lastHeartbeat: timestamp,
        status: "ONLINE",
        preflight: parsed.data.preflight,
      });
      if (workflow) {
        workflow.availablePreflight = parsed.data.preflight;
        for (const job of workflow.jobs.values())
          if (
            job.state === "PREPARING" &&
            job.preparationStage === "AWAITING_T1" &&
            !job.runtimePreflight
          ) {
            job.runtimePreflight = parsed.data.preflight;
            autoApproveT1(reviews, job, job.creatorId, timestamp);
          }
      }
      store.sessions.set(parsed.data.workerId, {
        workerId: parsed.data.workerId,
        tokenHash: hashWorkerToken(sessionToken),
        expiresAt: sessionExpiresAt,
      });
      reply.send({
        workerId: parsed.data.workerId,
        sessionToken,
        sessionExpiresAt: new Date(sessionExpiresAt).toISOString(),
      });
    },
  );
  app.post<{ Params: { workerId: string }; Body: unknown }>(
    "/v1/workers/:workerId/heartbeat",
    async (request, reply) => {
      if (!auth(request, reply, request.params.workerId)) return;
      const current = worker(store, request.params.workerId);
      if (!current) {
        error(reply, "RESOURCE_NOT_FOUND");
        return;
      }
      const parsed = HeartbeatBody.safeParse(request.body);
      if (!parsed.success) {
        error(reply, "INVALID_REQUEST");
        return;
      }
      const timestamp = now();
      const session = store.sessions.get(current.id);
      if (!session) {
        error(reply, "AUTHENTICATION_REQUIRED");
        return;
      }
      const activeLeases: ClaimedJob[] = [];
      for (const item of parsed.data.leases) {
        const lease = store.leases.get(item.jobId);
        if (
          lease?.workerId !== current.id ||
          lease.expiresAt <= timestamp ||
          hashWorkerToken(item.leaseToken) !== lease.tokenHash
        ) {
          if (lease?.expiresAt !== undefined && lease.expiresAt <= timestamp)
            reclaimLease(store, workflow, item.jobId, timestamp);
          error(reply, "AUTHENTICATION_REQUIRED");
          return;
        }
        activeLeases.push(lease);
      }
      current.capabilities = [...parsed.data.capabilities];
      current.lastHeartbeat = timestamp;
      current.status = "ONLINE";
      session.expiresAt = timestamp + WORKER_SESSION_MS;
      const renewedUntil = timestamp + LEASE_MS;
      for (const lease of activeLeases) lease.expiresAt = renewedUntil;
      reply.send({
        workerId: current.id,
        sessionExpiresAt: new Date(session.expiresAt).toISOString(),
      });
    },
  );
  app.post<{ Params: { workerId: string } }>(
    "/v1/workers/:workerId/claim",
    async (request, reply) => {
      if (!auth(request, reply, request.params.workerId)) return;
      if (!worker(store, request.params.workerId)) {
        error(reply, "RESOURCE_NOT_FOUND");
        return;
      }
      reply.send({
        job: claimWorkflowJob(
          store,
          workflow,
          uploads,
          request.params.workerId,
          now,
        ),
      });
    },
  );
  type LiveClaim =
    | { readonly job: Job; readonly lease: ClaimedJob }
    | {
        readonly code:
          | "AUTHENTICATION_REQUIRED"
          | "RESOURCE_NOT_FOUND"
          | "INVALID_REQUEST";
      };
  const liveClaim = (
    request: FastifyRequest<{ Params: { workerId: string; jobId: string } }>,
  ): LiveClaim => {
    if (!sessionAuthorized(request, store, request.params.workerId, now()))
      return { code: "AUTHENTICATION_REQUIRED" };
    const claimed = store.leases.get(request.params.jobId);
    const job = workflow?.jobs.get(request.params.jobId);
    if (claimed && claimed.expiresAt <= now())
      reclaimLease(store, workflow, request.params.jobId, now());
    if (
      !claimed ||
      claimed.workerId !== request.params.workerId ||
      claimed.expiresAt <= now() ||
      hashWorkerToken(
        typeof request.headers["x-worker-lease"] === "string"
          ? request.headers["x-worker-lease"]
          : "",
      ) !== claimed.tokenHash
    )
      return { code: "AUTHENTICATION_REQUIRED" };
    if (!job || !worker(store, request.params.workerId))
      return { code: "RESOURCE_NOT_FOUND" };
    if (
      claimed.deletionEpoch !== job.deletionEpoch ||
      claimed.restoreEpoch !== job.restoreEpoch
    )
      return { code: "INVALID_REQUEST" };
    return { job, lease: claimed };
  };
  const claimedJob = (
    request: FastifyRequest<{ Params: { workerId: string; jobId: string } }>,
    reply: FastifyReply,
  ): { readonly job: Job; readonly lease: ClaimedJob } | null => {
    const claimed = liveClaim(request);
    if ("code" in claimed) {
      error(reply, claimed.code);
      return null;
    }
    return claimed;
  };
  app.get<{ Params: { workerId: string; jobId: string } }>(
    "/v1/workers/:workerId/jobs/:jobId/source",
    async (request, reply) => {
      const claimed = claimedJob(request, reply);
      if (!claimed) return;
      const { job, lease } = claimed;
      if (lease.phase === "compile") {
        error(reply, "INVALID_REQUEST");
        return;
      }
      const upload = uploads?.uploads.get(job.uploadId);
      if (
        !upload ||
        upload.tenantId !== job.tenantId ||
        upload.state !== "ACCEPTED"
      ) {
        error(reply, "RESOURCE_NOT_FOUND");
        return;
      }
      const sourcePath = uploadSourcePath(upload);
      return reply
        .header("content-type", upload.contentType)
        .header("content-length", upload.actualBytes)
        .header("content-disposition", 'attachment; filename="source.mp4"')
        .send(
          sourcePath
            ? createReadStream(sourcePath)
            : Buffer.concat(upload.chunks),
        );
    },
  );
  app.post<{
    Params: { workerId: string; jobId: string };
    Body: unknown;
  }>("/v1/workers/:workerId/jobs/:jobId/progress", async (request, reply) => {
    const claimed = claimedJob(request, reply);
    if (!claimed) return;
    const { job, lease } = claimed;
    if (job.state === "CANCEL_REQUESTED") {
      error(reply, "CANCEL_REQUESTED");
      return;
    }
    const parsed = ProgressBody.safeParse(request.body);
    const expectedPhase = lease.phase === "render" ? "render" : "prepare";
    if (
      !parsed.success ||
      parsed.data.phase !== expectedPhase ||
      (job.progress?.phase === parsed.data.phase &&
        parsed.data.fraction < job.progress.fraction)
    ) {
      error(reply, "INVALID_REQUEST");
      return;
    }
    job.progress = parsed.data;
    job.updatedAt = new Date(now()).toISOString();
    reply.send({ ok: true });
  });
  const uploadArtifact = async (
    request: FastifyRequest<{
      Params: { workerId: string; jobId: string };
      Body: unknown;
    }>,
    reply: FastifyReply,
    kind:
      | "preview"
      | "preview-labeled"
      | "delivery"
      | "evidence-video"
      | "safety-sample",
  ): Promise<void> => {
    const claimed = claimedJob(request, reply);
    if (!claimed) return;
    const { job, lease } = claimed;
    const contentLength = ArtifactContentLength.safeParse(
      request.headers["content-length"],
    );
    const artifacts =
      kind === "preview"
        ? workflow?.previews
        : kind === "preview-labeled"
          ? workflow?.previewsLabeled
          : kind === "evidence-video"
            ? workflow?.evidenceVideos
            : kind === "safety-sample"
              ? workflow?.safetySamples
              : workflow?.stagedArtifacts;
    const stateValid =
      kind === "preview" || kind === "preview-labeled"
        ? lease.phase === "preview" &&
          job.preparationStage === "PREVIEW_RUNNING" &&
          (job.state === "PREPARING" || job.state === "STALE_APPROVAL")
        : kind === "evidence-video"
          ? lease.phase === "evidence-video" &&
            job.preparationStage === "EVIDENCE_VIDEO_RUNNING" &&
            (job.state === "PREPARING" || job.state === "STALE_APPROVAL")
          : lease.phase === "render" && job.state === "RENDERING";
    // Video kinds stream in as a Readable (raw content-type parsers
    // registered in app.ts); the safety-sample image falls through to the
    // generic buffer content-type parser shared with job attachments, so
    // normalize it into a Readable here rather than adding another
    // content-type-specific global parser.
    const bodyStream =
      request.body instanceof Readable
        ? request.body
        : request.body instanceof Uint8Array
          ? Readable.from(request.body)
          : null;
    if (!stateValid || !contentLength.success || !bodyStream || !artifactRoot || !artifacts) {
      error(reply, "INVALID_REQUEST");
      return;
    }

    const directory = path.join(
      artifactRoot,
      createHash("sha256").update(job.tenantId).digest("hex"),
    );
    const temporary = path.join(
      directory,
      `.upload-${randomBytes(12).toString("hex")}.tmp`,
    );
    const hash = createHash("sha256");
    let sizeBytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        sizeBytes += chunk.byteLength;
        if (sizeBytes > contentLength.data) {
          callback(ARTIFACT_LENGTH_MISMATCH);
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await pipeline(
        bodyStream,
        meter,
        createWriteStream(temporary, {
          flags: "wx",
          mode: 0o600,
          flush: true,
        }),
      );
      if (sizeBytes !== contentLength.data) throw ARTIFACT_LENGTH_MISMATCH;
      const liveJob = workflow?.jobs.get(job.id);
      if (liveJob === job && liveJob.state === "CANCEL_REQUESTED") {
        await rm(temporary, { force: true });
        error(reply, "CANCEL_REQUESTED");
        return;
      }
      const revalidated = liveClaim(request);
      if ("code" in revalidated) {
        await rm(temporary, { force: true });
        error(reply, revalidated.code);
        return;
      }
      const liveStateValid =
        kind === "preview" || kind === "preview-labeled"
          ? revalidated.lease.phase === "preview" &&
            revalidated.job.preparationStage === "PREVIEW_RUNNING" &&
            (revalidated.job.state === "PREPARING" ||
              revalidated.job.state === "STALE_APPROVAL")
          : kind === "evidence-video"
            ? revalidated.lease.phase === "evidence-video" &&
              revalidated.job.preparationStage === "EVIDENCE_VIDEO_RUNNING" &&
              (revalidated.job.state === "PREPARING" ||
                revalidated.job.state === "STALE_APPROVAL")
            : revalidated.lease.phase === "render" &&
              revalidated.job.state === "RENDERING";
      if (
        revalidated.job !== job ||
        revalidated.lease !== lease ||
        !liveStateValid
      ) {
        await rm(temporary, { force: true });
        error(reply, "INVALID_REQUEST");
        return;
      }
      const sha256 = hash.digest("hex");
      const idPrefix =
        kind === "preview"
          ? "preview"
          : kind === "preview-labeled"
            ? "previewlabeled"
            : kind === "evidence-video"
              ? "evidencevideo"
              : kind === "safety-sample"
                ? "safetysample"
                : "artifact";
      const extension = kind === "safety-sample" ? "png" : "mp4";
      const contentType = kind === "safety-sample" ? "image/png" : "video/mp4";
      const artifactId = `${idPrefix}_${digest({ jobId: job.id, sha256 }).slice(0, 16)}`;
      const storagePath = path.join(directory, `${artifactId}.${extension}`);
      const timestamp = now();
      const artifact = {
        id: artifactId,
        jobId: job.id,
        tenantId: job.tenantId,
        kind,
        filename: `${job.id}-${kind}.${extension}`,
        contentType,
        bytes: new Uint8Array(),
        storagePath,
        sha256,
        sizeBytes,
        createdAt: new Date(timestamp).toISOString(),
        expiresAt: new Date(
          timestamp +
            (kind === "delivery" ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000),
        ).toISOString(),
        report: null,
      } as const;
      const previous = artifacts.get(job.id);
      await rename(temporary, storagePath);
      artifacts.set(job.id, artifact);
      (request as FastifyRequest & PersistenceRequest)[requestPersistence] =
        true;
      try {
        persist?.();
      } catch (cause) {
        if (previous) artifacts.set(job.id, previous);
        else artifacts.delete(job.id);
        if (previous?.storagePath !== storagePath)
          await rm(storagePath, { force: true });
        throw cause;
      }
      if (previous?.storagePath && previous.storagePath !== storagePath)
        await rm(previous.storagePath, { force: true });
      reply.code(201).send({ artifactId, sha256, sizeBytes });
    } catch (cause) {
      await rm(temporary, { force: true });
      if (cause === ARTIFACT_LENGTH_MISMATCH) {
        error(reply, "INVALID_REQUEST");
        return;
      }
      throw cause;
    }
  };
  const requireContentType = (expected: string) =>
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const contentType = request.headers["content-type"];
      if (
        typeof contentType !== "string" ||
        contentType.split(";", 1)[0]?.trim().toLowerCase() !== expected
      )
        error(reply, "INVALID_REQUEST");
    };
  const requireMp4 = requireContentType("video/mp4");
  const requirePng = requireContentType("image/png");
  for (const [url, kind, onRequest] of [
    ["/v1/workers/:workerId/jobs/:jobId/preview-artifact", "preview", requireMp4],
    [
      "/v1/workers/:workerId/jobs/:jobId/preview-labeled-artifact",
      "preview-labeled",
      requireMp4,
    ],
    [
      "/v1/workers/:workerId/jobs/:jobId/evidence-video-artifact",
      "evidence-video",
      requireMp4,
    ],
    ["/v1/workers/:workerId/jobs/:jobId/artifact", "delivery", requireMp4],
    [
      "/v1/workers/:workerId/jobs/:jobId/safety-sample-artifact",
      "safety-sample",
      requirePng,
    ],
  ] as const)
    app.post<{
      Params: { workerId: string; jobId: string };
      Body: unknown;
    }>(url, { onRequest }, async (request, reply) => {
      await uploadArtifact(request, reply, kind);
    });
  const finish = async (
    request: FastifyRequest<{
      Params: { workerId: string; jobId: string };
      Body: unknown;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const claimed = claimedJob(request, reply);
    if (!claimed) return;
    const { job, lease } = claimed;
    const failed = request.url.endsWith("/fail");
    const message =
      request.body && typeof request.body === "object"
        ? Reflect.get(request.body, "message")
        : undefined;
    const result =
      request.body && typeof request.body === "object"
        ? Reflect.get(request.body, "result")
        : undefined;
    let outcome = failed
      ? failWorkflowJob(workflow, lease, message, now)
      : finishWorkflowJob(workflow, lease, result, now, reviews);
    if (!outcome) {
      error(reply, "INVALID_REQUEST");
      return;
    }
    // Best-effort translation enrichment: never blocks or fails the job,
    // unlike the safety-check gate below. Missing provider/AI error just
    // means the evidence stays without translated fields.
    if (!failed && lease.phase === "analyze" && workflow) {
      // Enrich whatever bundle the job will actually hand the worker
      // (autoApproveT2T3 promotes candidateEvidence over evidence), then
      // re-digest it: the worker re-hashes the bundle it receives and hard
      // fails on WORKER_EVIDENCE_DIGEST_MISMATCH, so a mutation that skips
      // the digest fails every text-bearing job.
      const bundle = job.candidateEvidence ?? job.evidence;
      if (bundle && db && aiSecretKey) {
        await enrichEvidenceTranslations(
          bundle,
          db,
          aiSecretKey,
          translateGenerate,
        );
        const enriched = digest(bundle);
        if (job.candidateEvidence) job.candidateEvidenceDigest = enriched;
        job.evidenceDigest = enriched;
      }
      autoApproveT2T3(reviews, job, job.creatorId, now());
    }
    // Content-safety gate: the render phase deliberately leaves the job at
    // AWAITING_T5 without auto-approving (see finishWorkflowJob above) so
    // this async check can run first. Safe -> normal T5 auto-approval path.
    // Unsafe (including an unconfigured/failed check, which is fail-closed
    // by design) -> the job fails instead of ever publishing the staged
    // delivery artifact.
    if (
      !failed &&
      lease.phase === "render" &&
      workflow &&
      job.state === "AWAITING_T5"
    ) {
      const sample = workflow.safetySamples.get(job.id);
      const verdict =
        sample && db && aiSecretKey
          ? await runSafetyCheck({
              imagePath: sample.storagePath ?? "",
              db,
              aiSecretKey,
              ...(safetyCheckGenerate ? { generate: safetyCheckGenerate } : {}),
            })
          : { safe: false, reason: "AI_PROVIDER_NOT_CONFIGURED" };
      if (verdict.safe) {
        autoApproveT5(reviews, workflow, job, job.creatorId, now());
      } else {
        job.failureCode = "CONTENT_SAFETY_REJECTED";
        transition(job, "FAILED", now);
        outcome = "FAILED";
      }
    }
    const attempt = workflow?.attempts
      .get(request.params.jobId)
      ?.find((item) => item.id === lease?.attemptId);
    const finishedJob = workflow?.jobs.get(request.params.jobId);
    if (attempt)
      attempt.state =
        finishedJob?.state === "CANCELLED"
          ? "CANCELLED"
          : outcome === "FAILED"
            ? "FAILED"
            : "QUEUED";
    store.leases.delete(request.params.jobId);
    reply.send({ ok: true });
  };
  app.post<{ Params: { workerId: string; jobId: string }; Body: unknown }>(
    "/v1/workers/:workerId/jobs/:jobId/complete",
    finish,
  );
  app.post<{ Params: { workerId: string; jobId: string }; Body: unknown }>(
    "/v1/workers/:workerId/jobs/:jobId/fail",
    finish,
  );
  app.post<{ Params: { workerId: string; jobId: string } }>(
    "/v1/workers/:workerId/jobs/:jobId/cancelled",
    async (request, reply) => {
      const claimed = claimedJob(request, reply);
      if (!claimed) return;
      const { job, lease } = claimed;
      if (job.state !== "CANCEL_REQUESTED") {
        error(reply, "INVALID_REQUEST");
        return;
      }
      transition(job, "CANCELLED", now);
      const attempt = workflow?.attempts
        .get(job.id)
        ?.find((item) => item.id === lease?.attemptId);
      if (attempt) attempt.state = "CANCELLED";
      store.leases.delete(job.id);
      reply.send({ ok: true });
    },
  );
}
