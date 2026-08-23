import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  assertLegalTransition,
  type JobState,
} from "../../../packages/contracts/src/lifecycle.js";
import { IdempotencyStore, requestHash, safeEnvelope } from "./boundary.js";
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
  frameCount: number;
  artifact: {
    id: string;
    kind: "delivery" | "report";
    expiresAt: string;
  } | null;
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
  readonly idempotency: IdempotencyStore;
  readonly now: () => number;
};
export const createCreatorWorkflowStore = (
  now = Date.now(),
): CreatorWorkflowStore => ({
  jobs: new Map(),
  attempts: new Map(),
  idempotency: new IdempotencyStore(),
  now: () => now,
});

const id = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString("base64url")}`;
const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const header = (request: FastifyRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
};
const projection = (job: Job): Record<string, unknown> => ({
  id: job.id,
  tenantId: job.tenantId,
  state: [
    "QUEUED",
    "PREPARING",
    "RENDERING",
    "COMPLETED",
    "CANCELLED",
    "FAILED",
  ].includes(job.state)
    ? job.state
    : "QUEUED",
  attempt: job.attempt,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  artifact: job.artifact,
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
const requireCommand = (request: FastifyRequest): void => {
  if (!header(request, "idempotency-key")) throw new Error("INVALID_REQUEST");
};
const mutate = (job: Job, next: JobState): void => {
  assertLegalTransition(job.state, next);
  job.state = next;
  job.updatedAt = new Date().toISOString();
  job.etag = `\"${digest(job.updatedAt)}\"`;
};

export function registerCreatorWorkflow(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
  uploads: UploadStore,
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
        requireCommand(request);
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
            const acceptedFrames = frames;
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
              frameCount: acceptedFrames,
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
            return [201, projection(job)];
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
        .map(projection);
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
          projection(owned(store, request.params.jobId, tenant(request))),
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
        requireCommand(request);
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
        requireCommand(request);
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
            job.state = "QUEUED";
            job.etag = `\"${digest(job.id + job.attempt)}\"`;
            const attempt: Attempt = {
              id: id("attempt"),
              number: job.attempt,
              state: "QUEUED",
              immutable: true,
            };
            store.attempts.get(job.id)?.push(attempt);
            return [201, projection(job)];
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
    "/v1/jobs/:jobId/evidence",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        reply.send({
          version: 1,
          state: "OBSERVED",
          digest: job.evidenceDigest,
          layers: {},
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
        requireCommand(request);
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
        if (!Number.isInteger(frame) || frame < 0 || frame > 119)
          throw new Error("FRAME_OUT_OF_RANGE");
        reply.send({
          frame,
          previewRef: `preview:${job.id}:${frame}`,
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
        reply.send({
          version: 1,
          digest: digest({ job: job.id, topology: 1 }),
          nodes: [],
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
        reply.send({
          version: 1,
          digest: digest({ job: job.id, choices: 1 }),
          choices: [],
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
          eligible: job.approved && job.state === "READY",
          reason: job.approved ? null : "STALE_APPROVAL_UNSAFE",
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
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        requireCommand(request);
        const result = command(
          store,
          request,
          tenant(request),
          "render-launch",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            if (!job.approved) throw new Error("STALE_APPROVAL_UNSAFE");
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
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          409,
        );
      }
    },
  );
  app.get("/v1/receipts", async (request, reply) => {
    if (Number((request.query as { limit?: number }).limit ?? 50) > 100) {
      fail(reply, "INVALID_REQUEST");
      return;
    }
    reply.send({
      items: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
    });
  });
  for (const suffix of ["report-download", "delivery-download"] as const)
    app.get(`/v1/jobs/:jobId/${suffix}`, async (_request, reply) =>
      fail(reply, "ARTIFACT_UNAVAILABLE", 404),
    );
}
