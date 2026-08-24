import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, hashPassword, type AuthStore } from "./auth.js";
import { createAdminMutationStore } from "./admin-mutation.js";
import type { AdminReadStore } from "./admin-read.js";
import { createWorkerStore } from "./workers.js";

const adminReads: AdminReadStore = {
  tenants: [],
  jobs: [],
  receipts: [],
  audit: [],
  quarantine: [],
  billing: [],
};
const runtimeDigest = "b".repeat(64);
const workerPreflight = {
  status: "PASS",
  chromiumVersion: "151.0.7922.138",
  renderer: "SwiftShader renderer",
  fontReady: true,
  webgl2: true,
  networkPolicy: "external-blocked",
  repeatedFrameByteIdentity: true,
  ffmpeg: true,
  ffprobe: true,
  compilerModels: true,
  runtimeDigest,
} as const;

const fixture = () => {
  const users = ["super", "ops", "assigned-viewer", "unassigned", "creator"];
  const auth: AuthStore = {
    users: [{ id: "super", email: "admin@example.invalid" }],
    credentials: [
      {
        userId: "super",
        kind: "PASSWORD",
        secretHash: hashPassword("correct", "fixed-salt"),
        revokedAt: null,
      },
    ],
    memberships: [
      { userId: "super", tenantId: "platform", role: "SUPER_ADMIN" },
      { userId: "ops", tenantId: "tenant-a", role: "OPS_ADMIN" },
      { userId: "assigned-viewer", tenantId: "tenant-a", role: "VIEWER" },
      { userId: "unassigned", tenantId: "tenant-b", role: "OPS_ADMIN" },
      { userId: "creator", tenantId: "tenant-a", role: "MEMBER" },
    ],
    assignments: [
      { reviewerId: "ops", tenantId: "tenant-a", gate: "T1", scope: "TENANT" },
      {
        reviewerId: "assigned-viewer",
        tenantId: "tenant-a",
        gate: "T1",
        scope: "TENANT",
      },
    ],
    sessions: [],
    apiTokens: users.map((userId) => ({
      id: userId,
      userId,
      tenantId:
        userId === "super"
          ? "platform"
          : userId === "unassigned"
            ? "tenant-b"
            : "tenant-a",
      tokenHash: hashBearer(`${userId}-token`),
      expiresAt: Date.now() + 10000,
      revokedAt: null,
    })),
    audit: () => undefined,
  };
  const workers = createWorkerStore("worker-token-hash");
  workers.workers.set("worker-a", {
    id: "worker-a",
    capabilities: ["compiler"],
    lastHeartbeat: 1_000,
    status: "ONLINE",
    preflight: workerPreflight,
  });
  workers.sessions.set("worker-a", {
    workerId: "worker-a",
    tokenHash: "session-token-hash",
    expiresAt: 5_000,
  });
  workers.leases.set("job-worker", {
    workerId: "worker-a",
    phase: "render",
    jobId: "job-worker",
    attemptId: "attempt-worker",
    tokenHash: "lease-token-hash",
    deletionEpoch: 0,
    restoreEpoch: 0,
    expiresAt: 4_000,
  });
  const mutations = { ...createAdminMutationStore(), workers };
  mutations.jobs.set("job-a", {
    id: "job-a",
    tenantId: "tenant-a",
    state: "RENDERING",
    attempt: 1,
    version: 1,
  });
  mutations.jobs.set("job-b", {
    id: "job-b",
    tenantId: "tenant-a",
    state: "FAILED",
    attempt: 1,
    version: 1,
  });
  mutations.quarantine.set("item-a", {
    id: "item-a",
    tenantId: "tenant-a",
    state: "QUARANTINED",
    version: 1,
  });
  for (const id of ["tenant-a", "tenant-b"])
    mutations.tenants.set(id, {
      id,
      status: "ACTIVE",
      version: 1,
      members: new Map(),
      planMetadata: {},
      quotaBytes: 100,
    });
  return { auth, mutations };
};
const appFor = (
  data: ReturnType<typeof fixture>,
  now: () => number = Date.now,
) =>
  buildAuthApp({
    store: data.auth,
    expectedOrigin: "https://admin.test",
    introspectSecret: "secret",
    adminReads,
    adminMutations: data.mutations,
    now,
  });
const headers = (userId: string, key: string, version = 1) => ({
  authorization: `Bearer ${userId}-token`,
  "idempotency-key": key,
  "if-match": `"${version}"`,
  "x-correlation-id": `cor_${key}`,
});
const body = (reason = "operator reason") => ({ reason });

describe("admin-mutation", () => {
  it("does not intercept the admin sign-in route", async () => {
    const response = await appFor(fixture()).inject({
      method: "POST",
      url: "/admin/sign-in",
      headers: { origin: "https://admin.test" },
      payload: { email: "admin@example.invalid", password: "correct" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toContain("rvs_session=");
  });

  it("evaluates session expiry for each admin mutation request", async () => {
    let now = 1_000;
    const data = fixture();
    data.auth.sessions.push({
      id: "expiring-admin",
      userId: "super",
      tenantId: "platform",
      expiresAt: 1_500,
      revokedAt: null,
    });
    const app = appFor(data, () => now);
    now = 1_501;
    const expired = await app.inject({
      method: "POST",
      url: "/admin/audit-exports",
      headers: {
        cookie: "rvs_session=expiring-admin",
        origin: "https://admin.test",
        "x-csrf-token": "web-proxy",
        "idempotency-key": "after-expiry",
      },
      payload: { format: "jsonl", reason: "expiry regression" },
    });

    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("allows an origin-checked admin session to create an export", async () => {
    const data = fixture();
    data.auth.sessions.push({
      id: "session-admin",
      userId: "super",
      tenantId: "platform",
      expiresAt: Date.now() + 10000,
      revokedAt: null,
    });
    const response = await appFor(data).inject({
      method: "POST",
      url: "/admin/audit-exports",
      headers: {
        cookie: "rvs_session=session-admin",
        origin: "https://admin.test",
        "x-csrf-token": "web-proxy",
        "idempotency-key": "session-export",
      },
      payload: { format: "jsonl", reason: "browser export" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ state: "PENDING" });

    const foreign = await appFor(data).inject({
      method: "POST",
      url: "/admin/audit-exports",
      headers: {
        cookie: "rvs_session=session-admin",
        origin: "https://foreign.test",
        "x-csrf-token": "web-proxy",
        "idempotency-key": "foreign-export",
      },
      payload: { format: "jsonl", reason: "browser export" },
    });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json().error.code).toBe("CSRF_ORIGIN_INVALID");
  });

  it("audits a denied non-admin mutation when both admin stores are registered", async () => {
    const data = fixture();
    data.auth.sessions.push({
      id: "session-member",
      userId: "creator",
      tenantId: "tenant-a",
      expiresAt: Date.now() + 10000,
      revokedAt: null,
    });
    const response = await appFor(data).inject({
      method: "POST",
      url: "/admin/jobs/job-a/cancel",
      headers: {
        cookie: "rvs_session=session-member",
        origin: "https://admin.test",
        "x-csrf-token": "web-proxy",
        "idempotency-key": "member-cancel",
      },
      payload: body(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("INTERNAL_ERROR");
    expect(data.mutations.auditEvents).toMatchObject([
      {
        actorId: "creator",
        action: "ADMIN_MUTATION_DENIED",
        outcome: "DENIED",
      },
    ]);
  });

  it("covers job cancel and retry for assigned ops with exact audited replay", async () => {
    const data = fixture();
    const app = appFor(data);
    const cancel = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/cancel",
      headers: headers("ops", "cancel-a"),
      payload: body(),
    });
    expect(cancel.statusCode).toBe(202);
    expect(data.mutations.jobs.get("job-a")?.state).toBe("CANCEL_REQUESTED");
    const retry = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-b/retry",
      headers: headers("ops", "retry-b"),
      payload: body(),
    });
    expect(retry.statusCode).toBe(201);
    expect(data.mutations.jobs.get("job-b")?.attempt).toBe(2);
    const replay = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-b/retry",
      headers: headers("ops", "retry-b"),
      payload: body(),
    });
    expect(replay.statusCode).toBe(201);
    expect(data.mutations.jobs.get("job-b")?.attempt).toBe(2);
    expect(
      data.mutations.auditEvents.filter((event) => event.outcome === "ALLOWED"),
    ).toHaveLength(2);
    expect(
      data.mutations.auditEvents.every(
        (event) =>
          event.before !== undefined &&
          event.after !== undefined &&
          event.reason &&
          event.correlationId &&
          event.outcome,
      ),
    ).toBe(true);
  });

  it("covers super-admin queue drain/resume and both export kinds", async () => {
    const data = fixture();
    const app = appFor(data);
    for (const path of ["/admin/queue/drain", "/admin/queue/resume"]) {
      const response = await app.inject({
        method: "POST",
        url: path,
        headers: headers("super", path),
        payload: body(),
      });
      expect(response.statusCode).toBe(202);
    }
    for (const path of ["/admin/audit-exports", "/admin/receipt-exports"]) {
      const response = await app.inject({
        method: "POST",
        url: path,
        headers: headers("super", path),
        payload: { format: "jsonl", tenantId: "tenant-a", reason: "export" },
      });
      expect(response.statusCode).toBe(202);
    }
    expect(data.mutations.auditEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "JOB_QUEUE_DRAIN_REQUESTED",
        "JOB_QUEUE_RESUME_REQUESTED",
        "AUDIT_EXPORT_CREATED",
        "RECEIPT_EXPORT_CREATED",
      ]),
    );
    expect(data.mutations.exports.size).toBe(2);
  });

  it("marks a worker offline and reclaims its leases", async () => {
    const data = fixture();
    const app = appFor(data);
    const response = await app.inject({
      method: "POST",
      url: "/admin/workers/worker-a/offline",
      headers: headers("ops", "worker-offline"),
      payload: {
        ...body(),
        confirmItemId: "worker-a",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      workerId: "worker-a",
      status: "OFFLINE",
      reclaimedLeases: 1,
    });
    expect(data.mutations.workers?.workers.get("worker-a")?.status).toBe(
      "OFFLINE",
    );
    expect(data.mutations.workers?.sessions.has("worker-a")).toBe(false);
    expect(
      data.mutations.workers?.retiredUntil.get("worker-a"),
    ).toBeGreaterThan(Date.now());
    expect(data.mutations.workers?.leases.has("job-worker")).toBe(false);
    expect(data.mutations.auditEvents).toMatchObject([
      {
        action: "WORKER_MARKED_OFFLINE",
        targetType: "worker",
        targetId: "worker-a",
        outcome: "ALLOWED",
      },
    ]);
  });

  it("covers quarantine release/reject and state/version failures", async () => {
    const data = fixture();
    const app = appFor(data);
    const decision = {
      ...body(),
      confirmTenantId: "tenant-a",
      confirmItemId: "item-a",
    };
    const release = await app.inject({
      method: "POST",
      url: "/admin/quarantine/item-a/release",
      headers: headers("ops", "release-a"),
      payload: decision,
    });
    expect(release.statusCode).toBe(202);
    expect(data.mutations.quarantine.get("item-a")?.state).toBe("VALIDATING");
    const invalid = await app.inject({
      method: "POST",
      url: "/admin/quarantine/item-a/release",
      headers: headers("ops", "release-b", 2),
      payload: decision,
    });
    expect(invalid.statusCode).toBe(400);
    const rejectData = fixture();
    const reject = await appFor(rejectData).inject({
      method: "POST",
      url: "/admin/quarantine/item-a/reject",
      headers: headers("ops", "reject-a"),
      payload: { ...decision, confirmItemId: "item-a" },
    });
    expect(reject.statusCode).toBe(200);
    expect(rejectData.mutations.quarantine.get("item-a")?.state).toBe(
      "REJECTED",
    );
  });

  it("covers member add/remove, quota/plan, and suspend with role allowlist", async () => {
    const data = fixture();
    const app = appFor(data);
    const add = await app.inject({
      method: "PATCH",
      url: "/admin/tenants/tenant-a/members",
      headers: headers("ops", "member-add"),
      payload: {
        ...body(),
        addOrUpdate: { userId: "creator", role: "MEMBER" },
      },
    });
    expect(add.statusCode).toBe(200);
    expect(data.mutations.tenants.get("tenant-a")?.members.get("creator")).toBe(
      "MEMBER",
    );
    const remove = await app.inject({
      method: "PATCH",
      url: "/admin/tenants/tenant-a/members",
      headers: headers("ops", "member-remove", 2),
      payload: { ...body(), removeUserId: "creator" },
    });
    expect(remove.statusCode).toBe(200);
    expect(data.mutations.tenants.get("tenant-a")?.members.has("creator")).toBe(
      false,
    );
    const billing = await app.inject({
      method: "PATCH",
      url: "/admin/billing/tenant-a",
      headers: headers("ops", "billing", 3),
      payload: { ...body(), quotaBytes: 500, planMetadata: { tier: "pro" } },
    });
    expect(billing.statusCode).toBe(200);
    const suspend = await app.inject({
      method: "POST",
      url: "/admin/tenants/tenant-a/suspend",
      headers: headers("ops", "suspend", 4),
      payload: body(),
    });
    expect(suspend.statusCode).toBe(200);
    expect(data.mutations.tenants.get("tenant-a")?.status).toBe("suspended");
    const invalidRole = await app.inject({
      method: "PATCH",
      url: "/admin/tenants/tenant-a/members",
      headers: headers("ops", "invalid-role", 5),
      payload: {
        ...body(),
        addOrUpdate: { userId: "creator", role: "SUPER_ADMIN" },
      },
    });
    expect(invalidRole.statusCode).toBe(403);
  });

  it("rejects missing/changed idempotency, stale versions, forbidden actors and cross-tenant scope", async () => {
    const data = fixture();
    const app = appFor(data);
    const stale = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/cancel",
      headers: headers("ops", "stale", 9),
      payload: body(),
    });
    expect(stale.statusCode).toBe(409);
    const changed = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/cancel",
      headers: headers("ops", "cancel-change"),
      payload: body("first"),
    });
    const replay = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/cancel",
      headers: headers("ops", "cancel-change"),
      payload: body("changed"),
    });
    expect(changed.statusCode).toBe(202);
    expect(replay.statusCode).toBe(400);
    for (const userId of ["assigned-viewer", "creator", "unassigned"]) {
      const response = await app.inject({
        method: "POST",
        url: "/admin/jobs/job-a/cancel",
        headers: headers(userId, `deny-${userId}`),
        payload: body(),
      });
      expect(response.statusCode).toBe(403);
    }
    const foreign = await app.inject({
      method: "PATCH",
      url: "/admin/tenants/tenant-b/members",
      headers: headers("ops", "foreign"),
      payload: {
        ...body(),
        addOrUpdate: { userId: "creator", role: "MEMBER" },
      },
    });
    expect(foreign.statusCode).toBe(403);
    const denied = data.mutations.auditEvents.filter(
      (event) => event.outcome === "DENIED",
    );
    expect(denied.length).toBeGreaterThanOrEqual(2);
  });

  it("does not register approval, receipt, or render mutation and disables Prioritize", async () => {
    const data = fixture();
    const app = appFor(data);
    for (const url of [
      "/admin/jobs/job-a/approve",
      "/admin/receipts/rcpt-a",
      "/admin/jobs/job-a/render",
    ]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers: headers("super", `forbidden-${url}`),
        payload: body(),
      });
      expect([403, 404]).toContain(response.statusCode);
    }
    const prioritize = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/prioritize",
      headers: headers("super", "priority"),
      payload: body(),
    });
    expect(prioritize.statusCode).toBe(403);
    expect(prioritize.json().error.code).toBe("ROLE_NOT_PERMITTED");
  });
});
