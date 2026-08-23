import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  assertLegalTransition,
  type JobState,
} from "../../../packages/contracts/src/lifecycle.js";
import { z } from "zod";
import { safeEnvelope } from "./boundary.js";
import type { CreatorWorkflowStore, Job } from "./creator-workflow.js";

export type WorkerStatus = "ONLINE" | "OFFLINE";
export type Worker = {
  readonly id: string;
  capabilities: readonly string[];
  lastHeartbeat: number;
  status: WorkerStatus;
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

const RegisterBody = z
  .object({
    workerId: z.string().min(1),
    capabilities: z.array(z.string().min(1)),
  })
  .strict();
const HeartbeatBody = z
  .object({ capabilities: z.array(z.string().min(1)) })
  .strict();
type WorkerBody = z.input<typeof RegisterBody> | z.input<typeof HeartbeatBody>;
const error = (
  reply: FastifyReply,
  code: "AUTHENTICATION_REQUIRED" | "INVALID_REQUEST" | "RESOURCE_NOT_FOUND",
): void => {
  const status =
    code === "AUTHENTICATION_REQUIRED"
      ? 401
      : code === "RESOURCE_NOT_FOUND"
        ? 404
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
const body = (
  request: FastifyRequest<{ Body: WorkerBody }>,
): { workerId: string; capabilities: readonly string[] } | null => {
  const parsed = RegisterBody.safeParse(request.body);
  return parsed.success ? parsed.data : null;
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
  const job = [...workflow.jobs.values()].find(
    (item) =>
      (item.state === "PREPARING" ||
        (item.state === "QUEUED" && item.approved)) &&
      !store.claimedJobs.has(item.id),
  );
  if (!job) return null;
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
      frameCount: job.frameCount,
      phase: job.state === "PREPARING" ? "prepare" : "render",
    },
  };
};
const finishWorkflowJob = (
  workflow: CreatorWorkflowStore | undefined,
  jobId: string,
  failed: boolean,
  now: () => number,
): boolean => {
  const job = workflow?.jobs.get(jobId);
  if (!job) return false;
  if (failed) {
    transition(job, "FAILED", now);
    return true;
  }
  if (job.state === "PREPARING") {
    transition(job, "READY", now);
    return true;
  }
  if (job.state !== "RENDERING" || !job.approved) return false;
  transition(job, "ASSEMBLING", now);
  transition(job, "AWAITING_T5", now);
  transition(job, "COMPLETED", now);
  job.artifact = {
    id: `artifact_${digest({ jobId, attempt: job.attempt }).slice(0, 16)}`,
    kind: "delivery",
    expiresAt: new Date(now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  return true;
};

export function registerWorkers(
  app: FastifyInstance,
  store: WorkerStore,
  now: () => number,
  workflow?: CreatorWorkflowStore,
): void {
  const auth = (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (!authorized(request, store)) {
      error(reply, "AUTHENTICATION_REQUIRED");
      return false;
    }
    return true;
  };
  app.post<{ Body: WorkerBody }>(
    "/v1/workers/register",
    async (request, reply) => {
      if (!auth(request, reply)) return;
      const parsed = body(request);
      if (!parsed) {
        error(reply, "INVALID_REQUEST");
        return;
      }
      store.workers.set(parsed.workerId, {
        id: parsed.workerId,
        capabilities: [...parsed.capabilities],
        lastHeartbeat: now(),
        status: "ONLINE",
      });
      reply.send({ workerId: parsed.workerId });
    },
  );
  app.post<{ Params: { workerId: string }; Body: WorkerBody }>(
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
  const finish = async (
    request: FastifyRequest<{
      Params: { workerId: string; jobId: string };
      Body: unknown;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    if (!auth(request, reply)) return;
    const claimed = store.claimedJobs.get(request.params.jobId);
    if (!claimed || claimed.workerId !== request.params.workerId) {
      error(reply, "RESOURCE_NOT_FOUND");
      return;
    }
    const failed = request.url.endsWith("/fail");
    if (!finishWorkflowJob(workflow, request.params.jobId, failed, now)) {
      error(reply, "RESOURCE_NOT_FOUND");
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
}
