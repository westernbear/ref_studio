import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type AuthStore, type Principal } from "./auth.js";
import {
  adminRole,
  authenticateAdminRequest,
  isAdminPrincipal,
} from "./admin-auth.js";
import type { AiProviderSettingsPublic } from "./ai-provider-settings.js";
import type { MaterialProviderSettingsPublic } from "./material-provider-settings.js";
import { ProviderModelsError, listProviderModels } from "./provider-models.js";
import type { CodexAuth } from "./codex-oauth.js";
import { safeEnvelope } from "./boundary.js";
import type { WorkerStore } from "./workers.js";
import type { FeatureFlagSnapshot } from "./feature-flags.js";
import {
  MOTION_OBSERVABILITY_DASHBOARD,
  motionObservabilitySnapshot,
} from "../../../packages/contracts/src/motion-observability.js";

export type AdminTenant = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly plan: string;
  readonly used: number;
  readonly limit: number;
  readonly createdAt: string;
};
export type AdminJob = {
  readonly id: string;
  readonly tenantId: string;
  readonly state: string;
  readonly attempt: number;
  readonly creatorId: string;
  readonly createdAt: string;
  readonly privatePath?: string;
  readonly etag?: string;
};
export type AdminMotionSummary = {
  readonly backend: "native" | "adobe";
  readonly planId: string | null;
  readonly planDigest: string | null;
  readonly knowledgeCardIds: readonly string[];
  readonly version: number;
  readonly sceneDigest: string;
  readonly verificationStatus: "PASS" | "FAIL" | "PENDING";
  readonly verificationAttempts: number;
  readonly passedFindings: number;
  readonly totalFindings: number;
  readonly predicateFindings: readonly {
    readonly predicateId: string;
    readonly pass: boolean;
    readonly remediation: string;
  }[];
  readonly capabilities: readonly string[];
  readonly capabilitySnapshotDigest: string;
  readonly deliverables: readonly ("mp4" | "scene-package" | "report")[];
  readonly renderHash: string | null;
  readonly packageHash: string | null;
  readonly workerRuntime: string | null;
  readonly adobeDevice: {
    readonly id: string;
    readonly status: "ENROLLED" | "REVOKED";
  } | null;
  readonly adobeCommand: {
    readonly id: string;
    readonly status:
      | "QUEUED"
      | "RUNNING"
      | "SUCCEEDED"
      | "FAILED"
      | "CANCELLED";
    readonly ageMs: number;
  } | null;
  readonly failureRemediation: string | null;
};
export type AdminReceipt = {
  readonly id: string;
  readonly tenantId: string;
  readonly jobId: string;
  readonly gate: string;
  readonly decision: string;
  readonly actorId: string;
  readonly predecessorId: string | null;
  readonly createdAt: string;
  readonly artifactPath?: string;
};
export type AdminAudit = {
  readonly id: string;
  readonly tenantId: string | null;
  readonly jobId?: string;
  readonly actorId: string;
  readonly eventType: string;
  readonly authorization: string;
  readonly correlationId: string;
  readonly outcome: string;
  readonly createdAt: string;
  readonly rawBytes?: Uint8Array;
  readonly privatePath?: string;
};
export type AdminQuarantine = {
  readonly id: string;
  readonly tenantId: string;
  readonly state: string;
  readonly declaredType: string;
  readonly magicBytes: string;
  readonly containerParse: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly rawBytes?: Uint8Array;
  readonly privatePath?: string;
  readonly version?: string;
  readonly retentionUntil?: string;
};
export type AdminBilling = {
  readonly tenantId: string;
  readonly plan: string;
  readonly billingStatus: string;
  readonly used: number;
  readonly limit: number;
  readonly resetAt: string;
  readonly renewalAt: string;
  readonly paymentMethod?: unknown;
};
export type AdminWorkerLease = {
  readonly jobId: string;
  readonly attemptId: string;
  readonly phase: string;
  readonly expiresAt: string;
  readonly expired: boolean;
  readonly deletionEpoch: number;
  readonly restoreEpoch: number;
};
export type AdminWorker = {
  readonly id: string;
  readonly status: string;
  readonly capabilities: readonly string[];
  readonly lastHeartbeatAt: string;
  readonly sessionExpiresAt: string | null;
  readonly activeLeaseCount: number;
  readonly leases: readonly AdminWorkerLease[];
  readonly runtime: {
    readonly chromiumVersion: string;
    readonly renderer: string;
    readonly runtimeDigest: string;
  };
};
export type AdminMotionCanary = {
  readonly tenantId: string;
  readonly providerKind: string;
  readonly model: string;
  readonly status: "PASS" | "FAIL";
  readonly checkedAt: string;
  readonly toolSchemaDigest: string;
  readonly failureReason: string | null;
};
export type AdminReadStore = {
  readonly tenants: readonly AdminTenant[];
  readonly jobs: readonly AdminJob[];
  readonly receipts: readonly AdminReceipt[];
  readonly audit: AdminAudit[];
  readonly quarantine: readonly AdminQuarantine[];
  readonly billing: readonly AdminBilling[];
  readonly workers?: WorkerStore;
  readonly recordAudit?: AuthStore["audit"];
  readonly queryCount?: { value: number };
  readonly aiProviderSettings?: AiProviderSettingsPublic;
  readonly materialProviderSettings?: MaterialProviderSettingsPublic;
  readonly motionForJob?: (job: AdminJob) => AdminMotionSummary | null;
  readonly motionCanaries?: () => readonly AdminMotionCanary[];
  // Separate accessors from the two above, and deliberately functions: the
  // decrypted key is read only when a model listing is actually asked for,
  // never held on a store the rest of the admin reads share.
  readonly aiProviderSettingsWithSecret?: () => AiProviderSettingsPublic & {
    readonly apiKey: string | null;
  };
  readonly materialProviderSettingsWithSecret?: () => MaterialProviderSettingsPublic & {
    readonly apiKey: string | null;
  };
  // codex-oauth's credential rotates when the model registry refreshes it,
  // and the rotated refresh token is the one that still works. Reads do not
  // otherwise write, so this is the narrowest way to let that one write
  // through without handing the read store a database.
  readonly persistCodexAuth?: (
    target: "ai" | "material",
    auth: CodexAuth,
  ) => void;
};
type Query = {
  readonly q?: string;
  readonly tenantId?: string;
  readonly state?: string;
  readonly status?: string;
  readonly plan?: string;
  readonly eventType?: string;
  readonly jobId?: string;
  readonly actorId?: string;
  readonly outcome?: string;
  readonly reason?: string;
  readonly after?: string;
  readonly limit?: string;
  readonly include?: string;
  readonly fields?: string;
  readonly capability?: string;
  readonly backend?: string;
  readonly verification?: string;
  readonly commandState?: string;
};
const includes = (query: string | undefined, ...values: unknown[]): boolean =>
  !query ||
  values.some(
    (value) =>
      typeof value === "string" &&
      value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
const page = <T>(
  items: readonly T[],
  query: Query,
): { readonly items: readonly T[]; readonly nextCursor: string | null } => {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("INVALID_REQUEST");
  const after =
    typeof query.after === "string" && query.after.length > 0
      ? query.after
      : undefined;
  const start = after === undefined ? 0 : Number.parseInt(after, 10);
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    (after !== undefined && String(start) !== after)
  )
    throw new Error("CURSOR_INVALID");
  const selected = items.slice(start, start + limit);
  return {
    items: selected,
    nextCursor:
      start + selected.length < items.length
        ? String(start + selected.length)
        : null,
  };
};
const fail = (reply: FastifyReply, error: unknown): void => {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  reply
    .code(
      code === "AUTHENTICATION_REQUIRED"
        ? 401
        : code === "ADMIN_ACCESS_DENIED" ||
            code === "ROLE_NOT_PERMITTED" ||
            code === "CSRF_REQUIRED" ||
            code === "CSRF_ORIGIN_INVALID"
          ? 403
          : code === "RESOURCE_NOT_FOUND"
            ? 404
            : 400,
    )
    .send(
      safeEnvelope(
        new Error(code),
        String(reply.getHeader("x-correlation-id")),
      ),
    );
};
const visibleReceipt = (
  item: AdminReceipt,
): Omit<AdminReceipt, "artifactPath"> => {
  const { artifactPath: _path, ...safe } = item;
  return safe;
};
const visibleQuarantine = (
  item: AdminQuarantine,
): Omit<AdminQuarantine, "rawBytes" | "privatePath"> => {
  const { rawBytes: _bytes, privatePath: _path, ...safe } = item;
  return safe;
};
const visibleBilling = (item: AdminBilling): Record<string, unknown> => ({
  tenantId: item.tenantId,
  plan: item.plan,
  billingStatus: item.billingStatus,
  quota: { used: item.used, limit: item.limit, resetAt: item.resetAt },
  renewalAt: item.renewalAt,
  paymentMethod: { type: "REDACTED" },
});
const visibleJob = (store: AdminReadStore, item: AdminJob) => {
  const { privatePath: _path, ...safe } = item;
  return { ...safe, motion: store.motionForJob?.(item) ?? null };
};
const visibleWorkers = (
  workers: WorkerStore | undefined,
  timestamp: number,
): readonly AdminWorker[] =>
  workers
    ? [...workers.workers.values()].map((item) => {
        const session = workers.sessions.get(item.id);
        const leases = [...workers.leases.values()]
          .filter((lease) => lease.workerId === item.id)
          .map((lease) => ({
            jobId: lease.jobId,
            attemptId: lease.attemptId,
            phase: lease.phase,
            expiresAt: new Date(lease.expiresAt).toISOString(),
            expired: lease.expiresAt <= timestamp,
            deletionEpoch: lease.deletionEpoch,
            restoreEpoch: lease.restoreEpoch,
          }));
        const sessionActive =
          session !== undefined && session.expiresAt > timestamp;
        return {
          id: item.id,
          status:
            item.status === "ONLINE" && sessionActive ? "ONLINE" : "OFFLINE",
          capabilities: item.capabilities,
          lastHeartbeatAt: new Date(item.lastHeartbeat).toISOString(),
          sessionExpiresAt: session
            ? new Date(session.expiresAt).toISOString()
            : null,
          activeLeaseCount: leases.filter((lease) => !lease.expired).length,
          leases,
          runtime: {
            chromiumVersion: item.preflight.chromiumVersion,
            renderer: item.preflight.renderer,
            runtimeDigest: item.preflight.runtimeDigest,
          },
        };
      })
    : [];

export function registerAdminRead(
  app: FastifyInstance,
  auth: AuthStore,
  store: AdminReadStore,
  now: () => number = Date.now,
  expectedOrigin = "http://localhost:3100",
  adminSessionTimeoutMs?: number,
  featureFlags?: FeatureFlagSnapshot,
): void {
  app.addHook("onRequest", async (request, reply) => {
    if (
      (request.method !== "GET" && request.method !== "HEAD") ||
      !request.url.startsWith("/admin/") ||
      request.url.startsWith("/admin/sign-in")
    )
      return;
    const principal = authenticateAdminRequest(
      auth,
      request,
      expectedOrigin,
      now(),
      adminSessionTimeoutMs,
    );
    if ("code" in principal || !isAdminPrincipal(principal)) {
      auth.audit({
        action: "ADMIN_ACCESS_DENIED",
        userId: "unknown",
        tenantId: null,
        decision: "DENIED",
      });
      fail(
        reply,
        new Error("code" in principal ? principal.code : "ROLE_NOT_PERMITTED"),
      );
      return reply;
    } else
      (
        request as FastifyRequest & { adminPrincipal?: Principal }
      ).adminPrincipal = principal;
  });
  const handler = async (
    request: FastifyRequest<{
      Params?: { id?: string; tenantId?: string };
      Querystring: Query;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    try {
      const principal = (
        request as FastifyRequest & { adminPrincipal?: Principal }
      ).adminPrincipal;
      if (!principal) throw new Error("ADMIN_ACCESS_DENIED");
      const query = request.query ?? {};
      if (
        [query.include, query.fields].some(
          (value) =>
            typeof value === "string" &&
            /payment|rawBytes|privatePath|artifactPath|stack|apiKey/i.test(
              value,
            ),
        )
      ) {
        auth.audit({
          action: "ADMIN_SENSITIVE_FIELD_DENIED",
          userId: principal.userId,
          tenantId: null,
          decision: "DENIED",
        });
        throw new Error("ADMIN_ACCESS_DENIED");
      }
      if (store.queryCount) store.queryCount.value += 1;
      const visibleTenants = new Set(
        adminRole(principal) === "SUPER_ADMIN"
          ? store.tenants.map((tenant) => tenant.id)
          : auth.assignments
              .filter(
                (assignment) =>
                  assignment.reviewerId === principal.userId &&
                  assignment.scope === "TENANT" &&
                  assignment.tenantId !== null,
              )
              .map((assignment) => assignment.tenantId as string),
      );
      const pathUrl = (request.url ?? "").split("?")[0] ?? "";
      const requested =
        request.params?.id ??
        request.params?.tenantId ??
        pathUrl.match(/^\/admin\/tenants\/([^/]+)/)?.[1] ??
        pathUrl.match(/^\/admin\/billing\/([^/]+)/)?.[1];
      if (adminRole(principal) !== "SUPER_ADMIN" && visibleTenants.size === 0)
        throw new Error("ROLE_NOT_PERMITTED");
      if (requested && !visibleTenants.has(requested))
        throw new Error("RESOURCE_NOT_FOUND");
      const allowed = (tenantId: string): boolean =>
        visibleTenants.has(tenantId);
      const path = (request.url ?? "").split("?")[0] ?? "";
      if (path === "/admin/tenants") {
        const items = store.tenants
          .filter(
            (item) =>
              visibleTenants.has(item.id) &&
              includes(query.q, item.id, item.name, item.status, item.plan) &&
              (!query.status || item.status === query.status) &&
              (!query.plan || item.plan === query.plan),
          )
          .map((item) => ({
            id: item.id,
            name: item.name,
            status: item.status,
            plan: item.plan,
            activeJobs: store.jobs.filter(
              (job) =>
                job.tenantId === item.id &&
                ["QUEUED", "PREPARING", "RENDERING"].includes(job.state),
            ).length,
            quota: { used: item.used, limit: item.limit },
            createdAt: item.createdAt,
          }));
        auth.audit({
          action: "TENANT_VIEWED",
          userId: principal.userId,
          tenantId: null,
          decision: "ALLOWED",
        });
        reply.send(page(items, query));
        return;
      }
      if (path === "/admin/jobs") {
        const items = store.jobs
          .map((item) => visibleJob(store, item))
          .filter(
            (item) =>
              allowed(item.tenantId) &&
              includes(
                query.q,
                item.id,
                item.tenantId,
                item.creatorId,
                item.state,
                item.motion?.backend,
                item.motion?.verificationStatus,
              ) &&
              (!query.tenantId || item.tenantId === query.tenantId) &&
              (!query.state || item.state === query.state) &&
              (!query.backend || item.motion?.backend === query.backend) &&
              (!query.verification ||
                item.motion?.verificationStatus === query.verification) &&
              (!query.capability ||
                item.motion?.capabilities.includes(query.capability)) &&
              (!query.commandState ||
                item.motion?.adobeCommand?.status === query.commandState),
          );
        auth.audit({
          action: "TENANT_VIEWED",
          userId: principal.userId,
          tenantId: query.tenantId ?? null,
          decision: "ALLOWED",
        });
        reply.send(page(items, query));
        return;
      }
      if (path === "/admin/workers") {
        const timestamp = now();
        const items = visibleWorkers(store.workers, timestamp).filter(
          (item) =>
            includes(
              query.q,
              item.id,
              item.status,
              item.runtime.chromiumVersion,
              item.runtime.renderer,
              item.runtime.runtimeDigest,
              ...item.capabilities,
            ) &&
            (!query.status || item.status === query.status) &&
            (!query.capability || item.capabilities.includes(query.capability)),
        );
        const summary = {
          totalWorkers: items.length,
          onlineWorkers: items.filter((item) => item.status === "ONLINE")
            .length,
          activeLeases: items.reduce(
            (total, item) => total + item.activeLeaseCount,
            0,
          ),
          expiredLeases: items.reduce(
            (total, item) =>
              total + item.leases.filter((lease) => lease.expired).length,
            0,
          ),
        };
        auth.audit({
          action: "WORKER_POOL_VIEWED",
          userId: principal.userId,
          tenantId: null,
          decision: "ALLOWED",
        });
        reply.send({ ...page(items, query), summary });
        return;
      }
      if (path.startsWith("/admin/tenants/") && path.endsWith("/jobs")) {
        const items = store.jobs
          .map((item) => visibleJob(store, item))
          .filter(
            (item) =>
              item.tenantId === requested &&
              includes(
                query.q,
                item.id,
                item.creatorId,
                item.state,
                item.motion?.backend,
                item.motion?.verificationStatus,
              ) &&
              (!query.state || item.state === query.state) &&
              (!query.backend || item.motion?.backend === query.backend) &&
              (!query.verification ||
                item.motion?.verificationStatus === query.verification) &&
              (!query.capability ||
                item.motion?.capabilities.includes(query.capability)) &&
              (!query.commandState ||
                item.motion?.adobeCommand?.status === query.commandState),
          );
        auth.audit({
          action: "TENANT_VIEWED",
          userId: principal.userId,
          tenantId: requested ?? null,
          decision: "ALLOWED",
        });
        reply.send({ tenantId: requested, ...page(items, query) });
        return;
      }
      if (path === "/admin/receipts") {
        const items = store.receipts
          .filter(
            (item) =>
              allowed(item.tenantId) &&
              includes(
                query.q,
                item.id,
                item.jobId,
                item.gate,
                item.decision,
                item.actorId,
              ) &&
              (!query.tenantId || item.tenantId === query.tenantId) &&
              (!query.jobId || item.jobId === query.jobId) &&
              (!query.eventType || item.gate === query.eventType),
          )
          .map(visibleReceipt);
        auth.audit({
          action: "RECEIPT_CHAIN_VIEWED",
          userId: principal.userId,
          tenantId: query.tenantId ?? null,
          decision: "ALLOWED",
        });
        reply.send(page(items, query));
        return;
      }
      if (path === "/admin/audit-log") {
        const items = store.audit
          .filter(
            (item) =>
              (item.tenantId === null || allowed(item.tenantId)) &&
              includes(
                query.q,
                item.id,
                item.jobId,
                item.actorId,
                item.eventType,
                item.correlationId,
                item.outcome,
              ) &&
              (!query.tenantId || item.tenantId === query.tenantId) &&
              (!query.actorId || item.actorId === query.actorId) &&
              (!query.eventType || item.eventType === query.eventType) &&
              (!query.jobId || item.jobId === query.jobId) &&
              (!query.outcome || item.outcome === query.outcome),
          )
          .map(({ rawBytes: _bytes, privatePath: _path, ...safe }) => safe);
        auth.audit({
          action: "AUDIT_LOG_VIEWED",
          userId: principal.userId,
          tenantId: query.tenantId ?? null,
          decision: "ALLOWED",
        });
        reply.send(page(items, query));
        return;
      }
      if (path === "/admin/quarantine") {
        const items = store.quarantine
          .filter(
            (item) =>
              allowed(item.tenantId) &&
              includes(
                query.q,
                item.id,
                item.declaredType,
                item.magicBytes,
                item.containerParse,
                item.reason,
              ) &&
              (!query.tenantId || item.tenantId === query.tenantId) &&
              (!query.state || item.state === query.state) &&
              (!query.reason || item.reason === query.reason),
          )
          .map(visibleQuarantine);
        auth.audit({
          action: "QUARANTINE_VIEWED",
          userId: principal.userId,
          tenantId: query.tenantId ?? null,
          decision: "ALLOWED",
        });
        reply.send(page(items, query));
        return;
      }
      if (path.startsWith("/admin/billing/")) {
        const item = store.billing.find(
          (candidate) => candidate.tenantId === requested,
        );
        if (!item) throw new Error("RESOURCE_NOT_FOUND");
        auth.audit({
          action: "BILLING_METADATA_VIEWED",
          userId: principal.userId,
          tenantId: requested ?? null,
          decision: "ALLOWED",
        });
        reply.send(visibleBilling(item));
        return;
      }
      if (path === "/admin/ai-provider-settings") {
        if (adminRole(principal) !== "SUPER_ADMIN")
          throw new Error("ROLE_NOT_PERMITTED");
        auth.audit({
          action: "AI_PROVIDER_SETTINGS_VIEWED",
          userId: principal.userId,
          tenantId: null,
          decision: "ALLOWED",
        });
        reply.send(store.aiProviderSettings ?? null);
        return;
      }
      if (path === "/admin/material-provider-settings") {
        if (adminRole(principal) !== "SUPER_ADMIN")
          throw new Error("ROLE_NOT_PERMITTED");
        auth.audit({
          action: "MATERIAL_PROVIDER_SETTINGS_VIEWED",
          userId: principal.userId,
          tenantId: null,
          decision: "ALLOWED",
        });
        reply.send(store.materialProviderSettings ?? null);
        return;
      }
      if (path === "/admin/motion-provider-canaries") {
        const items = (store.motionCanaries?.() ?? [])
          .filter(
            (item) =>
              allowed(item.tenantId) &&
              (!query.tenantId || item.tenantId === query.tenantId),
          )
          .map((item) => ({
            ...item,
            ageMs: Math.max(0, now() - Date.parse(item.checkedAt)),
          }));
        auth.audit({
          action: "MOTION_PROVIDER_CANARIES_VIEWED",
          userId: principal.userId,
          tenantId: query.tenantId ?? null,
          decision: "ALLOWED",
        });
        reply.send(page(items, query));
        return;
      }
      if (path === "/admin/motion-observability") {
        if (adminRole(principal) !== "SUPER_ADMIN")
          throw new Error("ROLE_NOT_PERMITTED");
        auth.audit({
          action: "MOTION_OBSERVABILITY_VIEWED",
          userId: principal.userId,
          tenantId: null,
          decision: "ALLOWED",
        });
        const snapshot = motionObservabilitySnapshot();
        reply.send({
          dashboard: MOTION_OBSERVABILITY_DASHBOARD,
          events: snapshot.events,
          metrics: snapshot.metrics,
          histograms: snapshot.histograms,
        });
        return;
      }
      if (path === "/admin/feature-flags") {
        if (adminRole(principal) !== "SUPER_ADMIN")
          throw new Error("ROLE_NOT_PERMITTED");
        auth.audit({
          action: "FEATURE_FLAGS_VIEWED",
          userId: principal.userId,
          tenantId: null,
          decision: "ALLOWED",
        });
        reply.send(
          featureFlags ?? {
            verifiedMotionAuthoring: false,
            nativeSceneV2: false,
            adobeMcp: false,
          },
        );
        return;
      }
      // The model name is the one field where the provider knows the
      // right answers and the operator is guessing. Fetched live rather
      // than from a hardcoded list, which would go stale the week after it
      // was written.
      if (
        path === "/admin/ai-provider-models" ||
        path === "/admin/material-provider-models"
      ) {
        if (adminRole(principal) !== "SUPER_ADMIN")
          throw new Error("ROLE_NOT_PERMITTED");
        const forAi = path === "/admin/ai-provider-models";
        const settings = forAi
          ? store.aiProviderSettingsWithSecret?.()
          : store.materialProviderSettingsWithSecret?.();
        if (!settings) throw new Error("RESOURCE_NOT_FOUND");
        if (!settings.apiKey) {
          // Not an error: there is simply nothing to ask with yet. The
          // console shows the reason instead of an empty dropdown that
          // looks like the provider has no models.
          reply.send({ models: [], reason: "NO_API_KEY" });
          return;
        }
        try {
          const models = await listProviderModels({
            providerKind: settings.providerKind,
            apiKey: settings.apiKey,
            baseUrl: "baseUrl" in settings ? (settings.baseUrl ?? null) : null,
            capability: forAi ? "text" : "image",
            persistCodexAuth: (auth) =>
              store.persistCodexAuth?.(forAi ? "ai" : "material", auth),
          });
          reply.send({ models, reason: null });
        } catch (cause) {
          // A provider that will not list its models must not stop
          // anyone configuring it -- the field stays free text.
          reply.send({
            models: [],
            reason:
              cause instanceof ProviderModelsError ? cause.code : "UNAVAILABLE",
          });
        }
        return;
      }
      throw new Error("RESOURCE_NOT_FOUND");
    } catch (error) {
      fail(reply, error);
    }
  };
  app.get("/admin/tenants", handler);
  app.get("/admin/jobs", handler);
  app.get("/admin/workers", handler);
  app.get("/admin/tenants/:id/jobs", handler);
  app.get("/admin/receipts", handler);
  app.get("/admin/audit-log", handler);
  app.get("/admin/quarantine", handler);
  app.get("/admin/billing/:tenantId", handler);
  app.get("/admin/ai-provider-settings", handler);
  app.get("/admin/material-provider-settings", handler);
  app.get("/admin/ai-provider-models", handler);
  app.get("/admin/material-provider-models", handler);
  app.get("/admin/motion-provider-canaries", handler);
  app.get("/admin/motion-observability", handler);
  app.get("/admin/feature-flags", handler);
}
