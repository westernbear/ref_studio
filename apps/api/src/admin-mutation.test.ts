import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import { createAdminMutationStore } from "./admin-mutation.js";

const fixture = () => {
  const users = ["super", "ops", "assigned-viewer", "unassigned", "creator"];
  const auth: AuthStore = {
    users: [],
    credentials: [],
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
  const mutations = createAdminMutationStore();
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
const appFor = (data: ReturnType<typeof fixture>) =>
  buildAuthApp({
    store: data.auth,
    expectedOrigin: "https://admin.test",
    introspectSecret: "secret",
    adminMutations: data.mutations,
  });
const headers = (userId: string, key: string, version = 1) => ({
  authorization: `Bearer ${userId}-token`,
  "idempotency-key": key,
  "if-match": `"${version}"`,
  "x-correlation-id": `cor_${key}`,
});
const body = (reason = "operator reason") => ({ reason });

describe("admin-mutation", () => {
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
