import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  assertLegalTransition,
  type JobState,
} from "../../../packages/contracts/src/lifecycle.js";
import { z } from "zod";
import { safeEnvelope } from "./boundary.js";
import type {
  CreatorWorkflowStore,
  Job,
  RuntimePreflightEvidence,
} from "./creator-workflow.js";
import type { UploadStore } from "./uploads.js";

const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;

export type WorkerStatus = "ONLINE" | "OFFLINE";
export type Worker = {
  readonly id: string;
  capabilities: readonly string[];
  lastHeartbeat: number;
  status: WorkerStatus;
  readonly preflight: RuntimePreflightEvidence;
};
export type ClaimedJob = { readonly workerId: string; readonly jobId: string };
export type WorkerStore = {
  readonly workers: Map<string, Worker>;
  readonly claimedJobs: Map<string, ClaimedJob>;
  readonly tokenHash: string | undefined;
};

export const createWorkerStore = (tokenHash?: string): WorkerStore => ({
  workers: new Map(),
  claimedJobs: new Map(),
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
  .object({ capabilities: z.array(z.string().min(1)) })
  .strict();
const PrepareResult = z
  .object({
    protocol: z.literal("rvs.worker.v1"),
    phase: z.literal("prepare"),
    evidence: z.record(z.string(), z.unknown()),
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    previewArtifactId: z.string().min(1),
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
const RenderReport = z
  .object({
    status: z.literal("PASS"),
    protocol: z.literal("rvs.render-report.v1"),
    mode: z.literal("delivery"),
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
        frameCount: z.number().int().min(96).max(240),
        fps: z.union([
          z.literal(24),
          z.literal(25),
          z.literal(30),
          z.literal(50),
          z.literal(60),
        ]),
        videoCodec: z.literal("h264"),
        audioCodec: z.literal("aac"),
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
    report: RenderReport,
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
const claimWorkflowJob = (
  store: WorkerStore,
  workflow: CreatorWorkflowStore | undefined,
  workerId: string,
  now: () => number,
) => {
  if (!workflow) return null;
  const currentWorker = store.workers.get(workerId);
  if (!currentWorker) return null;
  const job = [...workflow.jobs.values()].find(
    (item) =>
      (item.state === "PREPARING" ||
        (item.state === "QUEUED" && item.approved && item.evidence !== null)) &&
      currentWorker.capabilities.includes(
        item.state === "PREPARING" ? "compiler" : "renderer",
      ) &&
      !store.claimedJobs.has(item.id),
  );
  if (!job) return null;
  if (job.state === "PREPARING") job.runtimePreflight = currentWorker.preflight;
  const attempt = workflow.attempts.get(job.id)?.at(-1);
  if (!attempt) return null;
  if (job.state === "QUEUED") transition(job, "RENDERING", now);
  store.claimedJobs.set(job.id, { workerId, jobId: job.id });
  return {
    jobId: job.id,
    attemptId: attempt.id,
    payload: {
      tenantId: job.tenantId,
      uploadId: job.uploadId,
      startFrame: job.startFrame,
      sourceFps: job.sourceFps,
      frameCount: job.sourceFps * 4,
      phase: job.state === "PREPARING" ? "prepare" : "render",
      ...(job.state === "PREPARING" ? {} : { evidence: job.evidence }),
      ...(job.state === "PREPARING"
        ? {}
        : { evidenceDigest: job.evidenceDigest }),
    },
  };
};
const finishWorkflowJob = (
  workflow: CreatorWorkflowStore | undefined,
  jobId: string,
  failed: boolean,
  result: unknown,
  now: () => number,
): boolean => {
  const job = workflow?.jobs.get(jobId);
  if (!job) return false;
  if (job.state === "CANCEL_REQUESTED") {
    transition(job, "CANCELLED", now);
    return true;
  }
  if (failed) {
    transition(job, "FAILED", now);
    return true;
  }
  if (job.state === "PREPARING") {
    const parsed = PrepareResult.safeParse(result);
    const preview = workflow?.previews.get(job.id);
    if (
      !parsed.success ||
      !preview ||
      preview.id !== parsed.data.previewArtifactId ||
      digest(parsed.data.evidence) !== parsed.data.evidenceDigest ||
      parsed.data.normalized.fps !== job.sourceFps ||
      parsed.data.normalized.frameCount !== job.sourceFps * 4
    )
      return false;
    job.evidence = parsed.data.evidence;
    job.evidenceDigest = parsed.data.evidenceDigest;
    job.progress = {
      phase: "prepare",
      stage: "evidence",
      fraction: 1,
      framesProcessed: job.sourceFps * 4,
      framesTotal: job.sourceFps * 4,
    };
    transition(job, "READY", now);
    return true;
  }
  if (job.state !== "RENDERING" || !job.approved) return false;
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
    parsed.data.report.qc.fps !== job.sourceFps ||
    parsed.data.report.qc.frameCount !== job.sourceFps * 4 ||
    parsed.data.report.runtime.frameSha256.length !== job.sourceFps * 4 ||
    parsed.data.report.runtime.renderer !== job.runtimePreflight?.renderer ||
    new Set(parsed.data.report.runtime.passIds).size !==
      parsed.data.report.runtime.passIds.length
  )
    return false;
  artifact.report = parsed.data.report;
  transition(job, "ASSEMBLING", now);
  transition(job, "AWAITING_T5", now);
  job.progress = {
    phase: "render",
    stage: "delivery-qc",
    fraction: 1,
    framesProcessed: job.sourceFps * 4,
    framesTotal: job.sourceFps * 4,
  };
  return true;
};

export function registerWorkers(
  app: FastifyInstance,
  store: WorkerStore,
  now: () => number,
  workflow?: CreatorWorkflowStore,
  uploads?: UploadStore,
): void {
  const auth = (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (!authorized(request, store)) {
      error(reply, "AUTHENTICATION_REQUIRED");
      return false;
    }
    return true;
  };
  app.post<{ Body: unknown }>(
    "/v1/workers/register",
    async (request, reply) => {
      if (!auth(request, reply)) return;
      const parsed = RegisterBody.safeParse(request.body);
      if (!parsed.success) {
        error(reply, "INVALID_REQUEST");
        return;
      }
      store.workers.set(parsed.data.workerId, {
        id: parsed.data.workerId,
        capabilities: [...parsed.data.capabilities],
        lastHeartbeat: now(),
        status: "ONLINE",
        preflight: parsed.data.preflight,
      });
      reply.send({ workerId: parsed.data.workerId });
    },
  );
  app.post<{ Params: { workerId: string }; Body: unknown }>(
    "/v1/workers/:workerId/heartbeat",
    async (request, reply) => {
      if (!auth(request, reply)) return;
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
      current.capabilities = [...parsed.data.capabilities];
      current.lastHeartbeat = now();
      current.status = "ONLINE";
      reply.send({ workerId: current.id });
    },
  );
  app.post<{ Params: { workerId: string } }>(
    "/v1/workers/:workerId/claim",
    async (request, reply) => {
      if (!auth(request, reply)) return;
      if (!worker(store, request.params.workerId)) {
        error(reply, "RESOURCE_NOT_FOUND");
        return;
      }
      reply.send({
        job: claimWorkflowJob(store, workflow, request.params.workerId, now),
      });
    },
  );
  const claimedJob = (
    request: FastifyRequest<{ Params: { workerId: string; jobId: string } }>,
    reply: FastifyReply,
  ): Job | null => {
    if (!auth(request, reply)) return null;
    const claimed = store.claimedJobs.get(request.params.jobId);
    const job = workflow?.jobs.get(request.params.jobId);
    if (
      !claimed ||
      claimed.workerId !== request.params.workerId ||
      !job ||
      !worker(store, request.params.workerId)
    ) {
      error(reply, "RESOURCE_NOT_FOUND");
      return null;
    }
    return job;
  };
  app.get<{ Params: { workerId: string; jobId: string } }>(
    "/v1/workers/:workerId/jobs/:jobId/source",
    async (request, reply) => {
      const job = claimedJob(request, reply);
      if (!job) return;
      const upload = uploads?.uploads.get(job.uploadId);
      if (
        !upload ||
        upload.tenantId !== job.tenantId ||
        upload.state !== "ACCEPTED"
      ) {
        error(reply, "RESOURCE_NOT_FOUND");
        return;
      }
      reply
        .header("content-type", upload.contentType)
        .header("content-length", upload.actualBytes)
        .header("content-disposition", 'attachment; filename="source.mp4"')
        .send(Buffer.concat(upload.chunks.map((chunk) => Buffer.from(chunk))));
    },
  );
  app.post<{
    Params: { workerId: string; jobId: string };
    Body: unknown;
  }>("/v1/workers/:workerId/jobs/:jobId/progress", async (request, reply) => {
    const job = claimedJob(request, reply);
    if (!job) return;
    if (job.state === "CANCEL_REQUESTED") {
      error(reply, "CANCEL_REQUESTED");
      return;
    }
    const parsed = ProgressBody.safeParse(request.body);
    const expectedPhase = job.state === "PREPARING" ? "prepare" : "render";
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
  app.post<{
    Params: { workerId: string; jobId: string };
    Body: unknown;
  }>(
    "/v1/workers/:workerId/jobs/:jobId/preview-artifact",
    { bodyLimit: MAX_ARTIFACT_BYTES },
    async (request, reply) => {
      const job = claimedJob(request, reply);
      if (!job) return;
      const bytes = request.body instanceof Uint8Array ? request.body : null;
      if (
        job.state !== "PREPARING" ||
        !bytes ||
        bytes.byteLength === 0 ||
        bytes.byteLength > MAX_ARTIFACT_BYTES
      ) {
        error(reply, "INVALID_REQUEST");
        return;
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const artifactId = `preview_${digest({ jobId: job.id, sha256 }).slice(0, 16)}`;
      workflow?.previews.set(job.id, {
        id: artifactId,
        jobId: job.id,
        tenantId: job.tenantId,
        kind: "preview",
        filename: `${job.id}-preview.mp4`,
        contentType: "video/mp4",
        bytes: Uint8Array.from(bytes),
        sha256,
        sizeBytes: bytes.byteLength,
        createdAt: new Date(now()).toISOString(),
        expiresAt: new Date(now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        report: null,
      });
      reply.code(201).send({ artifactId, sha256, sizeBytes: bytes.byteLength });
    },
  );
  app.post<{
    Params: { workerId: string; jobId: string };
    Body: unknown;
  }>(
    "/v1/workers/:workerId/jobs/:jobId/artifact",
    { bodyLimit: MAX_ARTIFACT_BYTES },
    async (request, reply) => {
      const job = claimedJob(request, reply);
      if (!job) return;
      const bytes = request.body instanceof Uint8Array ? request.body : null;
      if (
        job.state !== "RENDERING" ||
        !bytes ||
        bytes.byteLength === 0 ||
        bytes.byteLength > MAX_ARTIFACT_BYTES
      ) {
        error(reply, "INVALID_REQUEST");
        return;
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const artifactId = `artifact_${digest({ jobId: job.id, sha256 }).slice(0, 16)}`;
      workflow?.stagedArtifacts.set(job.id, {
        id: artifactId,
        jobId: job.id,
        tenantId: job.tenantId,
        kind: "delivery",
        filename: `${job.id}-delivery.mp4`,
        contentType: "video/mp4",
        bytes: Uint8Array.from(bytes),
        sha256,
        sizeBytes: bytes.byteLength,
        createdAt: new Date(now()).toISOString(),
        expiresAt: new Date(now() + 24 * 60 * 60 * 1000).toISOString(),
        report: null,
      });
      reply.code(201).send({ artifactId, sha256, sizeBytes: bytes.byteLength });
    },
  );
  const finish = async (
    request: FastifyRequest<{
      Params: { workerId: string; jobId: string };
      Body: unknown;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const job = claimedJob(request, reply);
    if (!job) return;
    const failed = request.url.endsWith("/fail");
    const result =
      request.body && typeof request.body === "object"
        ? Reflect.get(request.body, "result")
        : undefined;
    if (
      !finishWorkflowJob(workflow, request.params.jobId, failed, result, now)
    ) {
      error(reply, "INVALID_REQUEST");
      return;
    }
    store.claimedJobs.delete(request.params.jobId);
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
      const job = claimedJob(request, reply);
      if (!job) return;
      if (job.state !== "CANCEL_REQUESTED") {
        error(reply, "INVALID_REQUEST");
        return;
      }
      transition(job, "CANCELLED", now);
      store.claimedJobs.delete(job.id);
      reply.send({ ok: true });
    },
  );
}
