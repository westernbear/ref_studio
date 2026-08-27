import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import type { AdminReadStore } from "./admin-read.js";
import { createWorkerStore, type WorkerStore } from "./workers.js";

type Fixture = {
  readonly auth: AuthStore;
  readonly reads: AdminReadStore;
  readonly workers: WorkerStore;
  readonly events: Array<{
    readonly action: string;
    readonly decision: string;
  }>;
};
const runtimeDigest = "a".repeat(64);
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
const fixture = (): Fixture => {
  const events: Array<{ readonly action: string; readonly decision: string }> =
    [];
  const audit: AuthStore["audit"] = (event) => {
    events.push({ action: event.action, decision: event.decision });
  };
  const token = (id: string, userId: string, tenantId: string) => ({
    id,
    userId,
    tenantId,
    tokenHash: hashBearer(`${id}-token`),
    expiresAt: Date.now() + 10000,
    revokedAt: null,
  });
  const auth: AuthStore = {
    users: [],
    credentials: [],
    memberships: [
      { userId: "super", tenantId: "platform", role: "SUPER_ADMIN" },
      { userId: "ops", tenantId: "tenant-a", role: "OPS_ADMIN" },
      { userId: "viewer", tenantId: "tenant-a", role: "VIEWER" },
      { userId: "unassigned", tenantId: "tenant-b", role: "OPS_ADMIN" },
      { userId: "creator", tenantId: "tenant-a", role: "MEMBER" },
    ],
    assignments: [
      { reviewerId: "ops", tenantId: "tenant-a", gate: "T1", scope: "TENANT" },
      {
        reviewerId: "viewer",
        tenantId: "tenant-a",
        gate: "T1",
        scope: "TENANT",
      },
    ],
    sessions: [],
    apiTokens: [
      token("super", "super", "platform"),
      token("ops", "ops", "tenant-a"),
      token("viewer", "viewer", "tenant-a"),
      token("unassigned", "unassigned", "tenant-b"),
      token("creator", "creator", "tenant-a"),
    ],
    audit,
  };
  const workers = createWorkerStore("worker-token-hash");
  workers.workers.set("worker-a", {
    id: "worker-a",
    capabilities: ["compiler", "renderer"],
    lastHeartbeat: 1_000,
    status: "ONLINE",
    preflight: workerPreflight,
  });
  workers.sessions.set("worker-a", {
    workerId: "worker-a",
    tokenHash: "session-token-hash",
    expiresAt: 5_000,
  });
  workers.leases.set("job_a", {
    workerId: "worker-a",
    phase: "render",
    jobId: "job_a",
    attemptId: "attempt-a",
    tokenHash: "lease-token-hash",
    deletionEpoch: 0,
    restoreEpoch: 0,
    expiresAt: 4_000,
  });
  const reads: AdminReadStore = {
    tenants: [
      {
        id: "tenant-a",
        name: "A",
        status: "ACTIVE",
        plan: "PRO",
        used: 1,
        limit: 10,
        createdAt: "2026-01-01",
      },
      {
        id: "tenant-b",
        name: "B",
        status: "ACTIVE",
        plan: "FREE",
        used: 2,
        limit: 5,
        createdAt: "2026-01-02",
      },
    ],
    jobs: [
      {
        id: "job_a",
        tenantId: "tenant-a",
        state: "RENDERING",
        attempt: 1,
        creatorId: "creator",
        createdAt: "2026-01-01",
        privatePath: "/private/a",
      },
      {
        id: "job_b",
        tenantId: "tenant-b",
        state: "FAILED",
        attempt: 2,
        creatorId: "creator-b",
        createdAt: "2026-01-02",
      },
    ],
    receipts: [
      {
        id: "rcpt_a",
        tenantId: "tenant-a",
        jobId: "job_a",
        gate: "T5",
        decision: "APPROVED",
        actorId: "reviewer",
        predecessorId: null,
        createdAt: "2026-01-01",
        artifactPath: "/private/artifact",
      },
      {
        id: "rcpt_b",
        tenantId: "tenant-b",
        jobId: "job_b",
        gate: "T5",
        decision: "REJECTED",
        actorId: "reviewer",
        predecessorId: null,
        createdAt: "2026-01-02",
      },
    ],
    audit: [
      {
        id: "aud_a",
        tenantId: "tenant-a",
        jobId: "job_a",
        actorId: "ops",
        eventType: "JOB_VIEWED",
        authorization: "ALLOW",
        correlationId: "cor_a",
        outcome: "ACCEPTED",
        createdAt: "2026-01-01",
        rawBytes: new Uint8Array([1]),
        privatePath: "/private/a",
      },
      {
        id: "aud_b",
        tenantId: "tenant-b",
        actorId: "other",
        eventType: "JOB_VIEWED",
        authorization: "ALLOW",
        correlationId: "cor_b",
        outcome: "ACCEPTED",
        createdAt: "2026-01-02",
      },
    ],
    quarantine: [
      {
        id: "upl_a",
        tenantId: "tenant-a",
        state: "QUARANTINED",
        declaredType: "video/mp4",
        magicBytes: "FAIL",
        containerParse: "NOT_RUN",
        reason: "VIDEO_TYPE_INVALID",
        createdAt: "2026-01-01",
        rawBytes: new Uint8Array([1]),
        privatePath: "/private/a",
      },
      {
        id: "upl_b",
        tenantId: "tenant-b",
        state: "QUARANTINED",
        declaredType: "video/mp4",
        magicBytes: "FAIL",
        containerParse: "NOT_RUN",
        reason: "VIDEO_TYPE_INVALID",
        createdAt: "2026-01-02",
      },
    ],
    billing: [
      {
        tenantId: "tenant-a",
        plan: "PRO",
        billingStatus: "ACTIVE",
        used: 1,
        limit: 10,
        resetAt: "2026-02-01",
        renewalAt: "2026-02-01",
        paymentMethod: { cardNumber: "secret" },
      },
      {
        tenantId: "tenant-b",
        plan: "FREE",
        billingStatus: "ACTIVE",
        used: 2,
        limit: 5,
        resetAt: "2026-02-01",
        renewalAt: "2026-02-01",
      },
    ],
    workers,
    queryCount: { value: 0 },
    aiProviderSettings: {
      providerKind: "openai",
      model: "gpt-4o",
      baseUrl: null,
      enabled: true,
      hasApiKey: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "super",
    },
    materialProviderSettings: {
      providerKind: "openai",
      model: "gpt-image-2",
      enabled: true,
      hasApiKey: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "super",
    },
  };
  return { auth, reads, workers, events };
};
const appFor = (data: Fixture, now: () => number = Date.now) =>
  buildAuthApp({
    store: data.auth,
    expectedOrigin: "https://admin.test",
    introspectSecret: "secret",
    adminReads: data.reads,
    now,
  });
const headers = (id: string) => ({ authorization: `Bearer ${id}-token` });

describe("admin-read", () => {
  it("super-admin exercises every route, masks fields, and audits sensitive reads", async () => {
    const data = fixture();
    const app = appFor(data);
    for (const url of [
      "/admin/tenants",
      "/admin/jobs?q=job_a",
      "/admin/tenants/tenant-a/jobs",
      "/admin/receipts",
      "/admin/audit-log",
      "/admin/quarantine",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: headers("super"),
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.stringify(response.json())).not.toMatch(
        /privatePath|rawBytes|artifactPath|cardNumber|stack/i,
      );
    }
    const billing = await app.inject({
      method: "GET",
      url: "/admin/billing/tenant-a",
      headers: headers("super"),
    });
    expect(billing.statusCode).toBe(200);
    expect(billing.json().paymentMethod).toEqual({ type: "REDACTED" });
    expect(data.events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "TENANT_VIEWED",
        "RECEIPT_CHAIN_VIEWED",
        "AUDIT_LOG_VIEWED",
        "QUARANTINE_VIEWED",
        "BILLING_METADATA_VIEWED",
      ]),
    );
    expect(data.reads.queryCount?.value).toBe(7);
  });
  it("allows browser admin sessions to read admin records", async () => {
    const data = fixture();
    data.auth.sessions.push({
      id: "session/admin",
      userId: "super",
      tenantId: "platform",
      expiresAt: Date.now() + 10000,
      revokedAt: null,
    });
    const response = await appFor(data).inject({
      method: "GET",
      url: "/admin/tenants",
      headers: {
        cookie: "rvs_session=session%2Fadmin",
        "x-csrf-token": "web-proxy",
        origin: "https://admin.test",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(
      response.json().items.map((item: { id: string }) => item.id),
    ).toEqual(["tenant-a", "tenant-b"]);
  });
  it("returns worker health without exposing worker tokens", async () => {
    const data = fixture();
    const response = await appFor(data, () => 2_000).inject({
      method: "GET",
      url: "/admin/workers?capability=compiler",
      headers: headers("super"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toMatch(/tokenHash|session-token|lease-token/i);
    expect(response.json()).toMatchObject({
      summary: {
        totalWorkers: 1,
        onlineWorkers: 1,
        activeLeases: 1,
        expiredLeases: 0,
      },
      items: [
        {
          id: "worker-a",
          status: "ONLINE",
          capabilities: ["compiler", "renderer"],
          activeLeaseCount: 1,
          leases: [{ jobId: "job_a", phase: "render", expired: false }],
          runtime: {
            chromiumVersion: "151.0.7922.138",
            renderer: "SwiftShader renderer",
            runtimeDigest,
          },
        },
      ],
    });
  });
  it("rejects an admin session that expires after route registration", async () => {
    let now = 1_000;
    const data = fixture();
    data.auth.sessions.push({
      id: "expiring-session",
      userId: "super",
      tenantId: "platform",
      expiresAt: 1_500,
      revokedAt: null,
    });
    const app = appFor(data, () => now);
    const request = {
      method: "GET" as const,
      url: "/admin/tenants",
      headers: {
        cookie: "rvs_session=expiring-session",
        "x-csrf-token": "web-proxy",
        origin: "https://admin.test",
      },
    };

    now = 1_501;
    const expired = await app.inject(request);

    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.code).toBe("AUTHENTICATION_REQUIRED");
  });
  it("treats a malformed percent-encoded admin cookie as failed authentication", async () => {
    const response = await appFor(fixture()).inject({
      method: "GET",
      url: "/admin/tenants",
      headers: {
        cookie: "rvs_session=%E0%A4%A",
        "x-csrf-token": "web-proxy",
        origin: "https://admin.test",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_REQUIRED");
  });
  it("assigned ops-admin and viewer see only assigned tenant across all read routes", async () => {
    for (const id of ["ops", "viewer"]) {
      const data = fixture();
      const app = appFor(data);
      for (const url of [
        "/admin/tenants",
        "/admin/jobs",
        "/admin/tenants/tenant-a/jobs",
        "/admin/receipts",
        "/admin/audit-log",
        "/admin/quarantine",
        "/admin/billing/tenant-a",
      ]) {
        const response = await app.inject({
          method: "GET",
          url,
          headers: headers(id),
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.stringify(response.json())).not.toContain("tenant-b");
      }
    }
  });
  it("unassigned operator and creator-only actor are denied", async () => {
    for (const id of ["unassigned", "creator"]) {
      const data = fixture();
      const app = appFor(data);
      const response = await app.inject({
        method: "GET",
        url: "/admin/tenants",
        headers: headers(id),
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe(
        id === "creator" ? "ROLE_NOT_PERMITTED" : "ROLE_NOT_PERMITTED",
      );
    }
  });
  it("rejects foreign tenants, forbidden field queries, and invalid bounds safely", async () => {
    const data = fixture();
    const app = appFor(data);
    for (const url of [
      "/admin/tenants/tenant-b/jobs",
      "/admin/billing/tenant-b",
      "/admin/receipts?include=rawBytes",
      "/admin/audit-log?fields=privatePath",
      "/admin/quarantine?include=stack",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: headers("ops"),
      });
      expect([403, 404]).toContain(response.statusCode);
      expect(response.body).not.toContain("/private");
    }
    const overLimit = await app.inject({
      method: "GET",
      url: "/admin/tenants?limit=101",
      headers: headers("super"),
    });
    expect(overLimit.statusCode).toBe(400);
    const badCursor = await app.inject({
      method: "GET",
      url: "/admin/tenants?after=not-a-cursor",
      headers: headers("super"),
    });
    expect(badCursor.statusCode).toBe(400);
    expect(
      data.events.some(
        (event) =>
          event.action === "ADMIN_SENSITIVE_FIELD_DENIED" &&
          event.decision === "DENIED",
      ),
    ).toBe(true);
  });
  it("returns AI provider settings for super admin without the key, and denies non-super-admins", async () => {
    const data = fixture();
    const app = appFor(data);
    const superResponse = await app.inject({
      method: "GET",
      url: "/admin/ai-provider-settings",
      headers: headers("super"),
    });
    expect(superResponse.statusCode).toBe(200);
    expect(superResponse.json()).toMatchObject({
      providerKind: "openai",
      model: "gpt-4o",
      hasApiKey: true,
    });
    expect(JSON.stringify(superResponse.json())).not.toMatch(/"apiKey"/i);
    const opsResponse = await app.inject({
      method: "GET",
      url: "/admin/ai-provider-settings",
      headers: headers("ops"),
    });
    expect(opsResponse.statusCode).toBe(403);
    expect(opsResponse.json().error.code).toBe("ROLE_NOT_PERMITTED");
    const fieldQuery = await app.inject({
      method: "GET",
      url: "/admin/ai-provider-settings?fields=apiKey",
      headers: headers("super"),
    });
    expect(fieldQuery.statusCode).toBe(403);
  });

  it("returns material provider settings for super admin without the key, and denies non-super-admins", async () => {
    const data = fixture();
    const app = appFor(data);
    const superResponse = await app.inject({
      method: "GET",
      url: "/admin/material-provider-settings",
      headers: headers("super"),
    });
    expect(superResponse.statusCode).toBe(200);
    expect(superResponse.json()).toMatchObject({
      providerKind: "openai",
      model: "gpt-image-2",
      hasApiKey: true,
    });
    expect(JSON.stringify(superResponse.json())).not.toMatch(/"apiKey"/i);
    const opsResponse = await app.inject({
      method: "GET",
      url: "/admin/material-provider-settings",
      headers: headers("ops"),
    });
    expect(opsResponse.statusCode).toBe(403);
    expect(opsResponse.json().error.code).toBe("ROLE_NOT_PERMITTED");
  });
});
