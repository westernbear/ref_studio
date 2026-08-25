import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthStore, Principal } from "./auth.js";
import {
  adminRole,
  authenticateAdminRequest,
  requestHeader,
} from "./admin-auth.js";
import { IdempotencyStore, safeEnvelope, requestHash } from "./boundary.js";
import {
  cancelJob,
  retryJob,
  transitionJob,
  type CreatorWorkflowStore,
} from "./creator-workflow.js";
import type { ReviewStore } from "./reviews.js";
import type { UploadStore } from "./uploads.js";
import { retireWorker, type WorkerStore } from "./workers.js";

// UploadRecord carries no etag/version field of its own; this derives a
// content-addressed one (changes whenever `state` changes) so quarantine
// release/reject can use the same If-Match optimistic-concurrency pattern
// as jobs, without a schema change. admin-read.ts exposes the same value.
export const quarantineVersion = (id: string, state: string): string =>
  `\"${createHash("sha256").update(`${id}:${state}`).digest("hex").slice(0, 16)}\"`;
export type AdminMutationTenant = {
  id: string;
  status: string;
  version: number;
  members: Map<string, "OWNER" | "ADMIN" | "MEMBER">;
  planMetadata: Record<string, string | number | boolean | null>;
  quotaBytes: number;
};
export type AdminMutationExport = {
  id: string;
  tenantId: string | null;
  kind: "audit" | "receipt";
  state: "PENDING";
  expiresAt: string;
};
export type AdminAuditEvent = {
  id: string;
  tenantId: string | null;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  reason: string;
  correlationId: string;
  outcome: "ALLOWED" | "DENIED";
  createdAt: string;
};
export type AdminMutationStore = {
  readonly tenants: Map<string, AdminMutationTenant>;
  readonly exports: Map<string, AdminMutationExport>;
  readonly auditEvents: AdminAuditEvent[];
  readonly idempotency: IdempotencyStore;
  readonly now: () => number;
  readonly workers?: WorkerStore;
  readonly workflow?: CreatorWorkflowStore;
  readonly uploads?: UploadStore;
  readonly reviews?: ReviewStore;
};
export const createAdminMutationStore = (
  now = Date.now(),
): AdminMutationStore => ({
  tenants: new Map(),
  exports: new Map(),
  auditEvents: [],
  idempotency: new IdempotencyStore(),
  now: () => now,
});

type Body = {
  reason?: string;
  confirmTenantId?: string;
  confirmItemId?: string;
  addOrUpdate?: { userId: string; role: "OWNER" | "ADMIN" | "MEMBER" };
  removeUserId?: string;
  planMetadata?: Record<string, string | number | boolean | null>;
  quotaBytes?: number;
  format?: "jsonl";
  tenantId?: string;
  jobId?: string;
  gate?: string;
  q?: string;
  eventType?: string;
  outcome?: string;
  actor?: string;
  range?: string;
};
const id = (prefix: string): string =>
  `${prefix}_${randomBytes(10).toString("base64url")}`;
const fail = (reply: FastifyReply, error: unknown): void => {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const status =
    code === "AUTHENTICATION_REQUIRED"
      ? 401
      : code === "ADMIN_ACCESS_DENIED" ||
          code === "ROLE_NOT_PERMITTED" ||
          code === "CSRF_REQUIRED" ||
          code === "CSRF_ORIGIN_INVALID"
        ? 403
        : code === "RESOURCE_NOT_FOUND"
          ? 404
          : code === "VERSION_CONFLICT"
            ? 409
            : 400;
  reply
    .code(status)
    .send(
      safeEnvelope(
        new Error(code),
        String(reply.getHeader("x-correlation-id")),
      ),
    );
};
const requireReason = (body: Body): string => {
  if (!body.reason || body.reason.length < 1 || body.reason.length > 500)
    throw new Error("INVALID_REQUEST");
  return body.reason;
};
const requireVersion = (request: FastifyRequest, version: number): void => {
  if (
    requestHeader(request, "if-match") !== `W/\"${version}\"` &&
    requestHeader(request, "if-match") !== `\"${version}\"`
  )
    throw new Error("VERSION_CONFLICT");
};

export function registerAdminMutation(
  app: FastifyInstance,
  auth: AuthStore,
  store: AdminMutationStore,
  now: () => number = Date.now,
  expectedOrigin = "http://localhost:3100",
): void {
  app.addHook("onRequest", async (request, reply) => {
    if (
      !request.url.startsWith("/admin/") ||
      request.url.startsWith("/admin/sign-in")
    )
      return;
    const principal = authenticateAdminRequest(
      auth,
      request,
      expectedOrigin,
      now(),
    );
    if ("code" in principal) {
      fail(reply, new Error(principal.code));
      return reply;
    }
    (
      request as FastifyRequest & { adminMutationPrincipal?: Principal }
    ).adminMutationPrincipal = principal;
  });
  const command = (
    request: FastifyRequest,
    targetTenant: string | null,
    action: (
      principal: Principal,
      correlation: string,
    ) => readonly [number, Record<string, unknown>],
  ): readonly [number, Record<string, unknown>] => {
    const principal = (
      request as FastifyRequest & { adminMutationPrincipal?: Principal }
    ).adminMutationPrincipal;
    if (!principal) throw new Error("ADMIN_ACCESS_DENIED");
    const tenant = targetTenant ?? principal.tenantId;
    const principalRole = adminRole(principal);
    const assigned =
      principalRole === "SUPER_ADMIN" ||
      (principalRole === "OPS_ADMIN" &&
        auth.assignments.some(
          (item) =>
            item.reviewerId === principal.userId &&
            item.scope === "TENANT" &&
            item.tenantId === tenant,
        ));
    if (!assigned) {
      store.auditEvents.push({
        id: id("audit"),
        tenantId: tenant,
        actorId: principal.userId,
        action: "ADMIN_MUTATION_DENIED",
        targetType: "admin",
        targetId: tenant,
        before: null,
        after: null,
        reason: "assignment required",
        correlationId: String(request.headers["x-correlation-id"] ?? ""),
        outcome: "DENIED",
        createdAt: new Date(store.now()).toISOString(),
      });
      throw new Error("ADMIN_ACCESS_DENIED");
    }
    const key = requestHeader(request, "idempotency-key");
    if (!key) throw new Error("INVALID_REQUEST");
    const correlation = String(request.headers["x-correlation-id"] ?? "");
    const replay = store.idempotency.execute(
      request.method + ":" + request.url.split("?")[0],
      key,
      requestHash(request.body ?? {}),
      tenant,
      () => action(principal, correlation),
    );
    return replay.response;
  };
  const mutate = async (
    request: FastifyRequest<{
      Params: {
        jobId?: string;
        itemId?: string;
        tenantId?: string;
        workerId?: string;
      };
      Body: Body;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    try {
      const body = request.body ?? {};
      const tenantId =
        request.params.tenantId ??
        (request.params.jobId
          ? store.workflow?.jobs.get(request.params.jobId)?.tenantId
          : request.params.itemId
            ? store.uploads?.uploads.get(request.params.itemId)?.tenantId
            : null) ??
        null;
      const result = command(request, tenantId, (principal, correlation) => {
        const reason = requireReason(body);
        const path = request.url.split("?")[0] ?? "";
        if (
          path.endsWith("/cancel") ||
          path.endsWith("/retry") ||
          path.endsWith("/force-terminate")
        ) {
          const job = store.workflow?.jobs.get(request.params.jobId ?? "");
          if (!job || job.tenantId !== tenantId || !store.workflow)
            throw new Error("RESOURCE_NOT_FOUND");
          if (requestHeader(request, "if-match") !== job.etag)
            throw new Error("VERSION_CONFLICT");
          const before = { state: job.state, attempt: job.attempt };
          if (path.endsWith("/cancel")) {
            if (!["QUEUED", "PREPARING", "RENDERING"].includes(job.state))
              throw new Error("JOB_NOT_CANCELLABLE");
            cancelJob(store.workflow, store.workers, job, store.now);
          } else if (path.endsWith("/retry")) {
            retryJob(store.workflow, store.reviews, job);
          } else {
            // Force-terminate: unlike /cancel, this works from any
            // non-terminal state and does not wait on the worker lease —
            // every non-terminal JobState legally transitions to FAILED
            // (see packages/contracts/src/lifecycle.ts), so this is always
            // a same-step, immediate failure, for stuck/orphaned jobs.
            if (["COMPLETED", "CANCELLED", "FAILED"].includes(job.state))
              throw new Error("JOB_NOT_CANCELLABLE");
            store.workers?.leases.delete(job.id);
            transitionJob(job, "FAILED", store.now);
            job.failureCode = "ADMIN_FORCE_TERMINATED";
          }
          store.auditEvents.push({
            id: id("audit"),
            tenantId,
            actorId: principal.userId,
            action: path.endsWith("/cancel")
              ? "JOB_CANCEL_REQUESTED"
              : path.endsWith("/retry")
                ? "JOB_RETRY_REQUESTED"
                : "JOB_FORCE_TERMINATED",
            targetType: "job",
            targetId: job.id,
            before,
            after: { state: job.state, attempt: job.attempt },
            reason,
            correlationId: correlation,
            outcome: "ALLOWED",
            createdAt: new Date(store.now()).toISOString(),
          });
          return [
            path.endsWith("/retry") ? 201 : 202,
            { state: job.state, etag: job.etag },
          ];
        }
        if (path.includes("/quarantine/")) {
          const item = store.uploads?.uploads.get(request.params.itemId ?? "");
          if (
            !item ||
            item.tenantId !== tenantId ||
            body.confirmTenantId !== tenantId ||
            body.confirmItemId !== item.id
          )
            throw new Error("QUARANTINE_RELEASE_BLOCKED");
          if (requestHeader(request, "if-match") !== quarantineVersion(item.id, item.state))
            throw new Error("VERSION_CONFLICT");
          const before = { state: item.state };
          if (path.endsWith("/release")) {
            if (item.state !== "QUARANTINED")
              throw new Error("QUARANTINE_RELEASE_BLOCKED");
            item.state = "VALIDATING";
          } else {
            if (item.state !== "QUARANTINED")
              throw new Error("VERSION_CONFLICT");
            // UploadState has no distinct "REJECTED" value; EXPIRED is the
            // closest existing terminal state for "will never be accepted."
            item.state = "EXPIRED";
          }
          store.auditEvents.push({
            id: id("audit"),
            tenantId,
            actorId: principal.userId,
            action: path.endsWith("/release")
              ? "QUARANTINE_RELEASE_REVIEWED"
              : "QUARANTINE_RETAINED",
            targetType: "quarantine",
            targetId: item.id,
            before,
            after: { state: item.state },
            reason,
            correlationId: correlation,
            outcome: "ALLOWED",
            createdAt: new Date(store.now()).toISOString(),
          });
          return [
            path.endsWith("/release") ? 202 : 200,
            path.endsWith("/release")
              ? {
                  revalidationUploadId: id("upl"),
                  originalQuarantineState: "QUARANTINED",
                  state: "VALIDATING",
                }
              : { state: "rejected" },
          ];
        }
        if (path.startsWith("/admin/workers/")) {
          const workerId = request.params.workerId ?? "";
          const workers = store.workers;
          const current = workers?.workers.get(workerId);
          if (!workers || !current) throw new Error("RESOURCE_NOT_FOUND");
          if (body.confirmItemId !== workerId)
            throw new Error("INVALID_REQUEST");
          const before = {
            status: current.status,
            sessionActive: workers.sessions.has(workerId),
            leaseCount: [...workers.leases.values()].filter(
              (lease) => lease.workerId === workerId,
            ).length,
          };
          const retired = retireWorker(workers, {
            workerId,
            workflow: store.workflow,
            timestamp: store.now(),
          });
          if (!retired.workerFound) throw new Error("RESOURCE_NOT_FOUND");
          store.auditEvents.push({
            id: id("audit"),
            tenantId: null,
            actorId: principal.userId,
            action: "WORKER_MARKED_OFFLINE",
            targetType: "worker",
            targetId: workerId,
            before,
            after: {
              status: "OFFLINE",
              sessionActive: false,
              reclaimedLeases: retired.reclaimedLeases,
            },
            reason,
            correlationId: correlation,
            outcome: "ALLOWED",
            createdAt: new Date(store.now()).toISOString(),
          });
          return [
            202,
            {
              workerId,
              status: "OFFLINE",
              reclaimedLeases: retired.reclaimedLeases,
            },
          ];
        }
        const tenant = store.tenants.get(tenantId ?? "");
        if (!tenant) throw new Error("RESOURCE_NOT_FOUND");
        requireVersion(request, tenant.version);
        const before = {
          status: tenant.status,
          members: [...tenant.members],
          planMetadata: tenant.planMetadata,
          quotaBytes: tenant.quotaBytes,
        };
        if (path.endsWith("/suspend")) tenant.status = "suspended";
        else if (path.endsWith("/members")) {
          if (body.addOrUpdate) {
            if (!["OWNER", "ADMIN", "MEMBER"].includes(body.addOrUpdate.role))
              throw new Error("ROLE_NOT_PERMITTED");
            tenant.members.set(body.addOrUpdate.userId, body.addOrUpdate.role);
          } else if (body.removeUserId)
            tenant.members.delete(body.removeUserId);
          else throw new Error("INVALID_REQUEST");
        } else {
          if (body.planMetadata)
            tenant.planMetadata = {
              ...tenant.planMetadata,
              ...body.planMetadata,
            };
          if (body.quotaBytes !== undefined)
            tenant.quotaBytes = body.quotaBytes;
        }
        tenant.version += 1;
        store.auditEvents.push({
          id: id("audit"),
          tenantId,
          actorId: principal.userId,
          action: path.endsWith("/suspend")
            ? "TENANT_SUSPENDED"
            : path.endsWith("/members")
              ? "TENANT_ACCESS_CHANGED"
              : "BILLING_METADATA_CHANGED",
          targetType: "tenant",
          targetId: tenant.id,
          before,
          after: {
            status: tenant.status,
            members: [...tenant.members],
            planMetadata: tenant.planMetadata,
            quotaBytes: tenant.quotaBytes,
          },
          reason,
          correlationId: correlation,
          outcome: "ALLOWED",
          createdAt: new Date(store.now()).toISOString(),
        });
        return [200, { status: tenant.status, version: tenant.version }];
      });
      reply.code(result[0]).send(result[1]);
    } catch (error) {
      fail(reply, error);
    }
  };
  app.post("/admin/jobs/:jobId/cancel", mutate);
  app.post("/admin/jobs/:jobId/retry", mutate);
  app.post("/admin/jobs/:jobId/force-terminate", mutate);
  app.post("/admin/workers/:workerId/offline", mutate);
  app.post("/admin/quarantine/:itemId/release", mutate);
  app.post("/admin/quarantine/:itemId/reject", mutate);
  app.patch("/admin/tenants/:tenantId/members", mutate);
  app.post("/admin/tenants/:tenantId/suspend", mutate);
  app.patch("/admin/billing/:tenantId", mutate);
  const queue = async (
    request: FastifyRequest<{ Body: Body }>,
    reply: FastifyReply,
  ): Promise<void> => {
    try {
      const result = command(request, null, (principal, correlation) => {
        if (adminRole(principal) !== "SUPER_ADMIN")
          throw new Error("ADMIN_ACCESS_DENIED");
        const draining = request.url.endsWith("/drain");
        store.auditEvents.push({
          id: id("audit"),
          tenantId: null,
          actorId: principal.userId,
          action: draining
            ? "JOB_QUEUE_DRAIN_REQUESTED"
            : "JOB_QUEUE_RESUME_REQUESTED",
          targetType: "queue",
          targetId: "authoritative",
          before: null,
          after: { draining },
          reason: requireReason(request.body ?? {}),
          correlationId: correlation,
          outcome: "ALLOWED",
          createdAt: new Date(store.now()).toISOString(),
        });
        return [202, { draining }];
      });
      reply.code(result[0]).send(result[1]);
    } catch (error) {
      fail(reply, error);
    }
  };
  app.post("/admin/queue/drain", queue);
  app.post("/admin/queue/resume", queue);
  const exports = async (
    request: FastifyRequest<{ Body: Body }>,
    reply: FastifyReply,
  ): Promise<void> => {
    try {
      const result = command(
        request,
        request.body?.tenantId ?? null,
        (principal, correlation) => {
          if (request.body?.format !== "jsonl")
            throw new Error("INVALID_REQUEST");
          const exportItem: AdminMutationExport = {
            id: id("exp"),
            tenantId: request.body.tenantId ?? principal.tenantId,
            kind: request.url.includes("audit-exports") ? "audit" : "receipt",
            state: "PENDING",
            expiresAt: new Date(store.now() + 3600000).toISOString(),
          };
          store.exports.set(exportItem.id, exportItem);
          store.auditEvents.push({
            id: id("audit"),
            tenantId: exportItem.tenantId,
            actorId: principal.userId,
            action:
              exportItem.kind === "audit"
                ? "AUDIT_EXPORT_CREATED"
                : "RECEIPT_EXPORT_CREATED",
            targetType: "export",
            targetId: exportItem.id,
            before: null,
            after: { state: exportItem.state },
            reason: requireReason(request.body ?? {}),
            correlationId: correlation,
            outcome: "ALLOWED",
            createdAt: new Date(store.now()).toISOString(),
          });
          return [
            202,
            {
              exportId: exportItem.id,
              state: exportItem.state,
              expiresAt: exportItem.expiresAt,
              downloadReady: false,
            },
          ];
        },
      );
      reply.code(result[0]).send(result[1]);
    } catch (error) {
      fail(reply, error);
    }
  };
  app.post("/admin/audit-exports", exports);
  app.post("/admin/receipt-exports", exports);
  app.all("/admin/jobs/:jobId/prioritize", async (_request, reply) => {
    reply
      .code(403)
      .send(
        safeEnvelope(
          new Error("ROLE_NOT_PERMITTED"),
          String(reply.getHeader("x-correlation-id")),
        ),
      );
  });
}
