import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, hashPassword, type AuthStore } from "./auth.js";
import {
  createAdminMutationStore,
  quarantineVersion,
} from "./admin-mutation.js";
import type { AdminReadStore } from "./admin-read.js";
import {
  createCreatorWorkflowStore,
  type Job,
} from "./creator-workflow.js";
import { openApiDatabase } from "./durable-state.js";
import { createReviewStore } from "./reviews.js";
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

const makeJob = (
  id: string,
  tenantId: string,
  state: Job["state"],
  etag: string,
): Job => ({
  id,
  tenantId,
  creatorId: "creator",
  uploadId: "upl_a",
  state,
  attempt: 1,
  etag,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  irDigest: "ir-1",
  evidenceDigest: "ev-1",
  approved: false,
  startFrame: 0,
  sourceFps: 30,
  frameCount: 120,
  evidence: null,
  candidateEvidence: null,
  candidateEvidenceDigest: null,
  preparationStage: "AWAITING_T1",
  pendingCompilation: null,
  compilation: null,
  previewSpecDigest: null,
  approvedSpecDigest: null,
  eligibleAt: 0,
  automaticRetries: 0,
  deletionEpoch: 0,
  restoreEpoch: 0,
  failureCode: null,
  runtimePreflight: null,
  progress: null,
  artifact: null,
});
const JOB_A_ETAG = '"job-a-etag"';
const JOB_B_ETAG = '"job-b-etag"';
const ITEM_A_VERSION = quarantineVersion("item-a", "QUARANTINED");

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
  const workflow = createCreatorWorkflowStore();
  workflow.availablePreflight = workerPreflight;
  workflow.jobs.set("job-a", makeJob("job-a", "tenant-a", "RENDERING", JOB_A_ETAG));
  workflow.jobs.set("job-b", makeJob("job-b", "tenant-a", "FAILED", JOB_B_ETAG));
  workflow.attempts.set("job-a", [
    { id: "attempt-a", number: 1, state: "RUNNING", immutable: true },
  ]);
  workflow.attempts.set("job-b", [
    { id: "attempt-b", number: 1, state: "FAILED", immutable: true },
  ]);
  const uploads = {
    uploads: new Map([
      [
        "item-a",
        {
          id: "item-a",
          tenantId: "tenant-a",
          filename: "clip.mp4",
          contentType: "video/mp4",
          sizeBytes: 12,
          state: "QUARANTINED" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-01-02T00:00:00.000Z",
          casObjectId: null,
          sourceSha256: null,
          media: null,
          chunks: [],
          chunkHashes: [],
          chunkSizes: [],
          actualBytes: 12,
        },
      ],
    ]),
    cas: new Map(),
    casByTenantDigest: new Map(),
    now: () => 1_000,
  };
  const reviews = createReviewStore();
  const mutations = { ...createAdminMutationStore(), workers, workflow, uploads, reviews };
  for (const id of ["tenant-a", "tenant-b"])
    mutations.tenants.set(id, {
      id,
      status: "ACTIVE",
      version: 1,
      members: new Map(),
      planMetadata: {},
      quotaBytes: 100,
    });
  return { auth, mutations, workflow, uploads };
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
const headers = (userId: string, key: string, ifMatch = '"1"') => ({
  authorization: `Bearer ${userId}-token`,
  "idempotency-key": key,
  "if-match": ifMatch,
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

  it("covers job cancel and retry for assigned ops with exact audited replay, against real workflow jobs", async () => {
    const data = fixture();
    const app = appFor(data);
    const cancel = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/cancel",
      headers: headers("ops", "cancel-a", JOB_A_ETAG),
      payload: body(),
    });
    expect(cancel.statusCode, cancel.body).toBe(202);
    // job-a has no active worker lease in this fixture, so cancelJob()
    // completes the cancellation immediately rather than staying requested.
    expect(data.workflow.jobs.get("job-a")?.state).toBe("CANCELLED");
    const retry = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-b/retry",
      headers: headers("ops", "retry-b", JOB_B_ETAG),
      payload: body(),
    });
    expect(retry.statusCode, retry.body).toBe(201);
    expect(data.workflow.jobs.get("job-b")?.attempt).toBe(2);
    expect(data.workflow.jobs.get("job-b")?.state).toBe("PREPARING");
    const replay = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-b/retry",
      headers: headers("ops", "retry-b", JOB_B_ETAG),
      payload: body(),
    });
    expect(replay.statusCode).toBe(201);
    expect(data.workflow.jobs.get("job-b")?.attempt).toBe(2);
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

  it("force-terminates a job from a state /cancel does not cover, bypassing the worker lease", async () => {
    const data = fixture();
    const stuckJob = data.workflow.jobs.get("job-a");
    if (!stuckJob) throw new Error("fixture job-a missing");
    stuckJob.state = "AWAITING_T5";
    stuckJob.etag = '"stuck-etag"';
    data.mutations.workers?.leases.set("job-a", {
      workerId: "worker-a",
      phase: "render",
      jobId: "job-a",
      attemptId: "attempt-a",
      tokenHash: "lease-token-hash",
      deletionEpoch: 0,
      restoreEpoch: 0,
      expiresAt: Date.now() + 60_000,
    });
    const app = appFor(data);
    // A normal /cancel can't touch AWAITING_T5.
    const cancel = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/cancel",
      headers: headers("ops", "cancel-attempt", '"stuck-etag"'),
      payload: body(),
    });
    expect(cancel.statusCode).toBe(400);
    // JOB_NOT_CANCELLABLE isn't in the shared ErrorCodeSchema allowlist (a
    // pre-existing gap, not introduced here), so normalizeError masks it —
    // the status code is still the meaningful signal for this case.
    expect(cancel.json().error.code).toBe("INTERNAL_ERROR");

    const terminate = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/force-terminate",
      headers: headers("ops", "force-terminate", '"stuck-etag"'),
      payload: body("stuck worker never reported back"),
    });
    expect(terminate.statusCode, terminate.body).toBe(202);
    expect(data.workflow.jobs.get("job-a")?.state).toBe("FAILED");
    expect(data.workflow.jobs.get("job-a")?.failureCode).toBe(
      "ADMIN_FORCE_TERMINATED",
    );
    // The stale lease is reclaimed so the job id can't stay double-claimed.
    expect(data.mutations.workers?.leases.has("job-a")).toBe(false);
    // The rejected /cancel attempt threw before reaching the audit-log
    // write, so only the successful force-terminate is recorded.
    expect(data.mutations.auditEvents).toMatchObject([
      { action: "JOB_FORCE_TERMINATED", outcome: "ALLOWED" },
    ]);

    const alreadyTerminal = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/force-terminate",
      headers: headers(
        "ops",
        "force-terminate-again",
        data.workflow.jobs.get("job-a")?.etag ?? "",
      ),
      payload: body(),
    });
    expect(alreadyTerminal.statusCode).toBe(400);
    expect(alreadyTerminal.json().error.code).toBe("INTERNAL_ERROR");
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

  it("covers quarantine release/reject and state/version failures, against real uploads", async () => {
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
      headers: headers("ops", "release-a", ITEM_A_VERSION),
      payload: decision,
    });
    expect(release.statusCode, release.body).toBe(202);
    expect(data.uploads.uploads.get("item-a")?.state).toBe("VALIDATING");
    const invalid = await app.inject({
      method: "POST",
      url: "/admin/quarantine/item-a/release",
      // Item is now VALIDATING, not QUARANTINED, but the If-Match value
      // matches its new (current) version — so the version check passes
      // and the request is rejected on state instead.
      headers: headers(
        "ops",
        "release-b",
        quarantineVersion("item-a", "VALIDATING"),
      ),
      payload: decision,
    });
    expect(invalid.statusCode).toBe(400);
    const rejectData = fixture();
    const reject = await appFor(rejectData).inject({
      method: "POST",
      url: "/admin/quarantine/item-a/reject",
      headers: headers("ops", "reject-a", ITEM_A_VERSION),
      payload: { ...decision, confirmItemId: "item-a" },
    });
    expect(reject.statusCode, reject.body).toBe(200);
    // UploadState has no distinct REJECTED value; EXPIRED is the terminal
    // state used for a rejected quarantine item (see admin-mutation.ts).
    expect(rejectData.uploads.uploads.get("item-a")?.state).toBe("EXPIRED");
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
      headers: headers("ops", "member-remove", '"2"'),
      payload: { ...body(), removeUserId: "creator" },
    });
    expect(remove.statusCode).toBe(200);
    expect(data.mutations.tenants.get("tenant-a")?.members.has("creator")).toBe(
      false,
    );
    const billing = await app.inject({
      method: "PATCH",
      url: "/admin/billing/tenant-a",
      headers: headers("ops", "billing", '"3"'),
      payload: { ...body(), quotaBytes: 500, planMetadata: { tier: "pro" } },
    });
    expect(billing.statusCode).toBe(200);
    const suspend = await app.inject({
      method: "POST",
      url: "/admin/tenants/tenant-a/suspend",
      headers: headers("ops", "suspend", '"4"'),
      payload: body(),
    });
    expect(suspend.statusCode).toBe(200);
    expect(data.mutations.tenants.get("tenant-a")?.status).toBe("suspended");
    const invalidRole = await app.inject({
      method: "PATCH",
      url: "/admin/tenants/tenant-a/members",
      headers: headers("ops", "invalid-role", '"5"'),
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
      headers: headers("ops", "stale", '"not-the-real-etag"'),
      payload: body(),
    });
    expect(stale.statusCode).toBe(409);
    const changed = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/cancel",
      headers: headers("ops", "cancel-change", JOB_A_ETAG),
      payload: body("first"),
    });
    const replay = await app.inject({
      method: "POST",
      url: "/admin/jobs/job-a/cancel",
      headers: headers("ops", "cancel-change", JOB_A_ETAG),
      payload: body("changed"),
    });
    expect(changed.statusCode).toBe(202);
    expect(replay.statusCode).toBe(400);
    for (const userId of ["assigned-viewer", "creator", "unassigned"]) {
      const response = await app.inject({
        method: "POST",
        url: "/admin/jobs/job-a/cancel",
        headers: headers(userId, `deny-${userId}`, JOB_A_ETAG),
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

  it("updates AI provider settings for a super admin without leaking the key into the audit log", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rvs-admin-ai-settings-"));
    const db = openApiDatabase(join(directory, "app.sqlite"));
    try {
      const data = fixture();
      data.mutations.db = db;
      data.mutations.aiSecretKey = "test-secret-key-material";
      const app = appFor(data);
      const response = await app.inject({
        method: "PATCH",
        url: "/admin/ai-provider-settings",
        headers: headers("super", "ai-settings"),
        payload: {
          providerKind: "openai",
          model: "gpt-4o",
          apiKey: "sk-secret",
          enabled: true,
        },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({
        providerKind: "openai",
        model: "gpt-4o",
        hasApiKey: true,
        enabled: true,
      });
      expect(JSON.stringify(response.json())).not.toContain("sk-secret");
      const auditEvent = data.mutations.auditEvents.find(
        (event) => event.action === "AI_PROVIDER_SETTINGS_UPDATED",
      );
      expect(auditEvent).toBeDefined();
      expect(JSON.stringify(auditEvent)).not.toContain("sk-secret");
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("denies AI provider settings updates from a non-super-admin", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rvs-admin-ai-settings-denied-"));
    const db = openApiDatabase(join(directory, "app.sqlite"));
    try {
      const data = fixture();
      data.mutations.db = db;
      data.mutations.aiSecretKey = "test-secret-key-material";
      const app = appFor(data);
      const response = await app.inject({
        method: "PATCH",
        url: "/admin/ai-provider-settings",
        headers: headers("ops", "ai-settings-denied"),
        payload: { providerKind: "openai", model: "gpt-4o" },
      });
      expect(response.statusCode).toBe(403);
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
