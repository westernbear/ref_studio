import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  assertLegalTransition,
  type JobState,
} from "../../../packages/contracts/src/lifecycle.js";
import { IdempotencyStore, requestHash, safeEnvelope } from "./boundary.js";
import type { Principal } from "./auth.js";
import type { ReviewStore } from "./reviews.js";
import type { UploadStore } from "./uploads.js";

export type Job = {
  id: string;
  tenantId: string;
  creatorId: string;
  uploadId: string;
  state: JobState;
  attempt: number;
  etag: string;
  createdAt: string;
  updatedAt: string;
  irDigest: string;
  evidenceDigest: string;
  approved: boolean;
  startFrame: number;
  sourceFps: number;
  frameCount: number;
  evidence: Record<string, unknown> | null;
  runtimePreflight: RuntimePreflightEvidence | null;
  progress: {
    phase: "prepare" | "render";
    stage: string;
    fraction: number;
    framesProcessed: number | null;
    framesTotal: number | null;
  } | null;
  artifact: {
    id: string;
    kind: "delivery" | "report";
    expiresAt: string;
  } | null;
};
export type RuntimePreflightEvidence = Readonly<{
  status: "PASS";
  chromiumVersion: "151.0.7922.138";
  renderer: string;
  fontReady: true;
  webgl2: true;
  networkPolicy: "external-blocked";
  repeatedFrameByteIdentity: true;
  ffmpeg: true;
  ffprobe: true;
  compilerModels: true;
  runtimeDigest: string;
}>;
export type StoredArtifact = {
  readonly id: string;
  readonly jobId: string;
  readonly tenantId: string;
  readonly kind: "preview" | "delivery";
  readonly filename: string;
  readonly contentType: "video/mp4";
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  report: Record<string, unknown> | null;
};
type Attempt = {
  id: string;
  number: number;
  state: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  immutable: true;
};
export type CreatorWorkflowStore = {
  readonly jobs: Map<string, Job>;
  readonly attempts: Map<string, Attempt[]>;
  readonly stagedArtifacts: Map<string, StoredArtifact>;
  readonly previews: Map<string, StoredArtifact>;
  readonly artifacts: Map<string, StoredArtifact>;
  readonly idempotency: IdempotencyStore;
  readonly now: () => number;
};
export const createCreatorWorkflowStore = (
  now = Date.now(),
): CreatorWorkflowStore => ({
  jobs: new Map(),
  attempts: new Map(),
  stagedArtifacts: new Map(),
  previews: new Map(),
  artifacts: new Map(),
  idempotency: new IdempotencyStore(),
  now: () => now,
});

const id = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString("base64url")}`;
const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const RUNTIME_DIGEST = digest({
  browser: "151.0.7922.138",
  renderer: "WebGL2",
  angle: "SwiftShader",
  network: "external-blocked",
});
export const RELEASE_BASELINE_DIGEST = digest({
  profile: "vertical-1080p30",
  width: 1080,
  height: 1920,
  durationSeconds: 4,
});
const EvidenceSceneInput = z.object({
  owners: z.array(
    z.object({
      ownerId: z.string(),
      kind: z.string(),
      editable: z.boolean(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  tracks: z.array(
    z.object({
      trackId: z.string(),
      owner: z.string(),
      geometryRef: z.string(),
      lifecycle: z.record(z.string(), z.unknown()),
      effects: z.array(z.string()),
    }),
  ),
  needsChoice: z.array(z.unknown()).optional(),
});
const jobSceneInput = (job: Job): z.infer<typeof EvidenceSceneInput> => {
  const parsed = z
    .object({ sceneInput: EvidenceSceneInput })
    .safeParse(job.evidence);
  if (!parsed.success) throw new Error("ARTIFACT_UNAVAILABLE");
  return parsed.data.sceneInput;
};
const header = (request: FastifyRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
};
const projection = (
  store: CreatorWorkflowStore,
  job: Job,
  reviews?: ReviewStore,
): Record<string, unknown> => ({
  id: job.id,
  tenantId: job.tenantId,
  state: job.state,
  attempt: job.attempt,
  etag: job.etag,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  startFrame: job.startFrame,
  sourceFps: job.sourceFps,
  frameCount: job.frameCount,
  artifact: job.artifact,
  progress: job.progress,
  runtimePreflight: job.runtimePreflight,
  evidenceDigest: job.evidenceDigest,
  irDigest: job.irDigest,
  reviewArtifactId: store.stagedArtifacts.get(job.id)?.id ?? null,
  previewArtifactId: store.previews.get(job.id)?.id ?? null,
  runtimeDigest: job.runtimePreflight?.runtimeDigest ?? RUNTIME_DIGEST,
  releaseBaselineDigest: RELEASE_BASELINE_DIGEST,
  approvedGates: [
    ...new Set(
      (reviews?.receipts ?? [])
        .filter(
          (receipt) =>
            receipt.jobId === job.id &&
            receipt.attempt === job.attempt &&
            receipt.decision === "APPROVED",
        )
        .map((receipt) => receipt.gate),
    ),
  ],
});
const fail = (reply: FastifyReply, code: string, status = 400): void => {
  reply
    .code(status)
    .send(
      safeEnvelope(
        new Error(code),
        String(reply.getHeader("x-correlation-id")),
      ),
    );
};
const command = (
  store: CreatorWorkflowStore,
  request: FastifyRequest,
  tenantId: string,
  scope: string,
  action: () => readonly [number, Record<string, unknown>],
): readonly [number, SafeRecord] => {
  const key = header(request, "idempotency-key");
  if (!key) throw new Error("INVALID_REQUEST");
  const replay = store.idempotency.execute(
    scope,
    key,
    requestHash(request.body ?? {}),
    tenantId,
    action,
  );
  return replay.response;
};
type SafeRecord = Record<string, unknown>;
const owned = (
  store: CreatorWorkflowStore,
  idValue: string,
  tenantId: string,
): Job => {
  const job = store.jobs.get(idValue);
  if (!job || job.tenantId !== tenantId) throw new Error("RESOURCE_NOT_FOUND");
  return job;
};
const edit = (job: Job, request: FastifyRequest): void => {
  const match = header(request, "if-match");
  if (!match || match !== job.etag) throw new Error("VERSION_CONFLICT");
};
const mutate = (job: Job, next: JobState): void => {
  assertLegalTransition(job.state, next);
  job.state = next;
  job.updatedAt = new Date().toISOString();
  job.etag = `\"${digest(job.updatedAt)}\"`;
};

export const publishStagedArtifact = (
  store: CreatorWorkflowStore,
  job: Job,
): boolean => {
  const artifact = store.stagedArtifacts.get(job.id);
  if (!artifact || artifact.kind !== "delivery" || job.state !== "AWAITING_T5")
    return false;
  assertLegalTransition(job.state, "COMPLETED");
  store.stagedArtifacts.delete(job.id);
  store.artifacts.set(artifact.id, artifact);
  job.artifact = {
    id: artifact.id,
    kind: artifact.kind,
    expiresAt: artifact.expiresAt,
  };
  job.state = "COMPLETED";
  job.updatedAt = new Date(store.now()).toISOString();
  job.etag = `"${digest(job.updatedAt)}"`;
  return true;
};

const currentT4Approval = (reviews: ReviewStore | undefined, job: Job) =>
  reviews?.receipts.findLast(
    (receipt) =>
      receipt.jobId === job.id &&
      receipt.attempt === job.attempt &&
      receipt.gate === "T4" &&
      receipt.decision === "APPROVED" &&
      receipt.evidenceDigest === job.evidenceDigest &&
      receipt.irDigest === job.irDigest &&
      receipt.runtimeDigest === job.runtimePreflight?.runtimeDigest &&
      receipt.releaseBaselineDigest === RELEASE_BASELINE_DIGEST,
  ) ?? null;

export function registerCreatorWorkflow(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
  uploads: UploadStore,
  reviews?: ReviewStore,
): void {
  const tenant = (request: FastifyRequest): string =>
    header(request, "x-tenant-id") ?? "";
  app.post(
    "/v1/jobs",
    async (
      request: FastifyRequest<{
        Body: {
          uploadId: string;
          startFrame?: number;
          sourceFps?: number;
          frameCount?: number;
          outputProfile?: string;
        };
      }>,
      reply,
    ) => {
      try {
        const response = command(
          store,
          request,
          tenant(request),
          "job-create",
          () => {
            const upload = uploads.uploads.get(request.body.uploadId);
            if (!upload || upload.tenantId !== tenant(request))
              throw new Error("RESOURCE_NOT_FOUND");
            if (upload.state !== "ACCEPTED")
              throw new Error("UPLOAD_QUARANTINED");
            const fps = Number(request.body.sourceFps);
            const start = Number(request.body.startFrame);
            const frames = Number(request.body.frameCount);
            if (
              !Number.isInteger(fps) ||
              ![24, 25, 30, 50, 60].includes(fps) ||
              !Number.isInteger(start) ||
              start < 0 ||
              !Number.isInteger(frames) ||
              frames < 1 ||
              start + fps * 4 > frames
            )
              throw new Error("INTERVAL_INVALID");
            const job: Job = {
              id: id("job"),
              tenantId: tenant(request),
              creatorId: "server-derived",
              uploadId: upload.id,
              state: "PREPARING",
              attempt: 1,
              etag: `\"${digest(upload.id)}\"`,
              createdAt: new Date(store.now()).toISOString(),
              updatedAt: new Date(store.now()).toISOString(),
              irDigest: digest({ upload: upload.id }),
              evidenceDigest: digest({ upload: upload.id, evidence: true }),
              approved: false,
              startFrame: start,
              sourceFps: fps,
              frameCount: frames,
              evidence: null,
              runtimePreflight: null,
              progress: null,
              artifact: null,
            };
            const attempt: Attempt = {
              id: id("attempt"),
              number: 1,
              state: "QUEUED",
              immutable: true,
            };
            store.jobs.set(job.id, job);
            store.attempts.set(job.id, [attempt]);
            return [201, projection(store, job, reviews)];
          },
        );
        reply.code(response[0]).send(response[1]);
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          error instanceof Error && error.message === "RESOURCE_NOT_FOUND"
            ? 404
            : 400,
        );
      }
    },
  );
  app.get(
    "/v1/jobs",
    async (
      request: FastifyRequest<{
        Querystring: { limit?: number; after?: string };
      }>,
      reply,
    ) => {
      const limit = Number(request.query.limit ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        fail(reply, "INVALID_REQUEST");
        return;
      }
      const items = [...store.jobs.values()]
        .filter((job) => job.tenantId === tenant(request))
        .slice(0, limit)
        .map((job) => projection(store, job, reviews));
      reply.send({
        items,
        pageInfo: {
          hasNextPage: items.length === limit,
          hasPreviousPage: Boolean(request.query.after),
        },
      });
    },
  );
  app.get(
    "/v1/jobs/:jobId",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        reply.send(
          projection(
            store,
            owned(store, request.params.jobId, tenant(request)),
            reviews,
          ),
        );
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/attempts",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        owned(store, request.params.jobId, tenant(request));
        reply.send({
          items: store.attempts.get(request.params.jobId) ?? [],
          pageInfo: { hasNextPage: false, hasPreviousPage: false },
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.post(
    "/v1/jobs/:jobId/cancel",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const result = command(
          store,
          request,
          tenant(request),
          "job-cancel",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            mutate(job, "CANCEL_REQUESTED");
            return [202, { state: "CANCEL_REQUESTED" }];
          },
        );
        reply.code(result[0]).send(result[1]);
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          409,
        );
      }
    },
  );
  app.post(
    "/v1/jobs/:jobId/retry",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const result = command(
          store,
          request,
          tenant(request),
          "job-retry",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            if (!["FAILED", "CANCELLED"].includes(job.state))
              throw new Error("JOB_NOT_RETRYABLE");
            job.attempt += 1;
            job.state = "PREPARING";
            job.approved = false;
            job.evidence = null;
            job.runtimePreflight = null;
            job.progress = null;
            job.artifact = null;
            job.evidenceDigest = digest({
              upload: job.uploadId,
              attempt: job.attempt,
            });
            job.irDigest = digest({
              upload: job.uploadId,
              attempt: job.attempt,
              ir: true,
            });
            job.updatedAt = new Date(store.now()).toISOString();
            job.etag = `\"${digest(job.id + job.attempt)}\"`;
            const attempt: Attempt = {
              id: id("attempt"),
              number: job.attempt,
              state: "QUEUED",
              immutable: true,
            };
            store.attempts.get(job.id)?.push(attempt);
            return [201, projection(store, job, reviews)];
          },
        );
        reply.code(result[0]).send(result[1]);
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          409,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/source-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const upload = uploads.uploads.get(job.uploadId);
        if (
          !upload ||
          upload.tenantId !== job.tenantId ||
          upload.state !== "ACCEPTED"
        )
          throw new Error("ARTIFACT_UNAVAILABLE");
        reply
          .header("content-type", upload.contentType)
          .header("content-length", upload.actualBytes)
          .header("content-disposition", 'inline; filename="reference.mp4"')
          .send(
            Buffer.concat(upload.chunks.map((chunk) => Buffer.from(chunk))),
          );
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/preview-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const preview = store.previews.get(job.id);
        if (!preview || preview.kind !== "preview")
          throw new Error("ARTIFACT_UNAVAILABLE");
        reply
          .header("content-type", preview.contentType)
          .header("content-length", preview.sizeBytes)
          .header(
            "content-disposition",
            `inline; filename="${preview.filename}"`,
          )
          .send(Buffer.from(preview.bytes));
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/evidence",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        if (!job.evidence) throw new Error("ARTIFACT_UNAVAILABLE");
        reply.send({ ...job.evidence, digest: job.evidenceDigest });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/authoring-ir",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        reply
          .header("etag", job.etag)
          .send({ digest: job.irDigest, version: 1 });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.patch(
    "/v1/jobs/:jobId/authoring-ir",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const result = command(
          store,
          request,
          tenant(request),
          "ir-edit",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            job.irDigest = digest(request.body);
            job.approved = false;
            job.etag = `\"${digest(job.irDigest)}\"`;
            return [
              201,
              {
                authoringIrDigest: job.irDigest,
                sceneIrDigest: digest({ scene: job.irDigest }),
                browserPassSpecDigest: digest({ pass: job.irDigest }),
              },
            ];
          },
        );
        reply.code(result[0]).send(result[1]);
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          409,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/preview",
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
        Querystring: { frame?: number };
      }>,
      reply,
    ) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const frame = Number(request.query.frame ?? 0);
        if (!Number.isInteger(frame) || frame < 0 || frame >= job.frameCount)
          throw new Error("FRAME_OUT_OF_RANGE");
        const preview = store.previews.get(job.id);
        if (!preview) throw new Error("ARTIFACT_UNAVAILABLE");
        reply.send({
          frame,
          artifactId: preview.id,
          url: `/v1/jobs/${encodeURIComponent(job.id)}/preview-download`,
          sha256: preview.sha256,
          irDigest: job.irDigest,
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/topology",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const sceneInput = jobSceneInput(job);
        reply.send({
          version: 1,
          digest: digest({
            owners: sceneInput.owners,
            tracks: sceneInput.tracks,
          }),
          owners: sceneInput.owners,
          tracks: sceneInput.tracks,
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/choices",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const choices = jobSceneInput(job).needsChoice ?? [];
        reply.send({
          version: 1,
          digest: digest(choices),
          choices,
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/render",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        reply.send({
          eligible:
            job.state === "READY" && currentT4Approval(reviews, job) !== null,
          reason:
            job.state !== "READY"
              ? "JOB_NOT_READY"
              : currentT4Approval(reviews, job)
                ? null
                : "T4_APPROVAL_REQUIRED",
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.post(
    "/v1/jobs/:jobId/render",
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
        Body: Record<string, never>;
      }>,
      reply,
    ) => {
      try {
        const result = command(
          store,
          request,
          tenant(request),
          "render-launch",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            if (job.state !== "READY") throw new Error("JOB_NOT_READY");
            const principal = (
              request as FastifyRequest & {
                authenticatedPrincipal?: Principal;
              }
            ).authenticatedPrincipal;
            if (
              !principal?.roles.some((role) =>
                ["OWNER", "ADMIN"].includes(role.toUpperCase()),
              )
            )
              throw new Error("ROLE_NOT_PERMITTED");
            if (!currentT4Approval(reviews, job))
              throw new Error("APPROVAL_REQUIRED");
            job.approved = true;
            mutate(job, "QUEUED");
            return [
              202,
              {
                state: "QUEUED",
                attemptId: store.attempts.get(job.id)?.at(-1)?.id,
              },
            ];
          },
        );
        reply.code(result[0]).send(result[1]);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
        fail(reply, code, code === "ROLE_NOT_PERMITTED" ? 403 : 409);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/delivery-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const artifact = job.artifact
          ? store.artifacts.get(job.artifact.id)
          : undefined;
        if (job.state !== "COMPLETED" || !artifact)
          throw new Error("ARTIFACT_UNAVAILABLE");
        reply
          .header("content-type", artifact.contentType)
          .header(
            "content-disposition",
            `attachment; filename="${artifact.filename}"`,
          )
          .send(Buffer.from(artifact.bytes));
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/report-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const artifact = job.artifact
          ? store.artifacts.get(job.artifact.id)
          : undefined;
        if (job.state !== "COMPLETED" || !artifact?.report)
          throw new Error("ARTIFACT_UNAVAILABLE");
        reply
          .header("content-type", "application/json; charset=utf-8")
          .header(
            "content-disposition",
            `attachment; filename="${job.id}-render-report.json"`,
          )
          .send(artifact.report);
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
}
