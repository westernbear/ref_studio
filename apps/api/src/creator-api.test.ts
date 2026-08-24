import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type Assignment, type AuthStore } from "./auth.js";
import {
  createCreatorWorkflowStore,
  RELEASE_BASELINE_DIGEST,
  RUNTIME_DIGEST,
  type Job,
} from "./creator-workflow.js";
import { createReviewStore } from "./reviews.js";
import { createUpload, finalizeUpload, type UploadStore } from "./uploads.js";

const preflight = {
  status: "PASS",
  chromiumVersion: "151.0.7922.138",
  renderer: "ANGLE SwiftShader",
  fontReady: true,
  webgl2: true,
  networkPolicy: "external-blocked",
  repeatedFrameByteIdentity: true,
  ffmpeg: true,
  ffprobe: true,
  compilerModels: true,
  runtimeDigest: RUNTIME_DIGEST,
} as const;
const compilation = {
  authoring: {
    versionId: "air_test",
    digest: "a".repeat(64),
    parentDigest: null,
  },
  scene: {
    versionId: "sir_test",
    digest: "b".repeat(64),
    parentDigest: "a".repeat(64),
  },
  browserPassSpec: {
    versionId: "bps_test",
    digest: "c".repeat(64),
    parentDigest: "b".repeat(64),
  },
} as const;

const fixture = (): {
  readonly app: ReturnType<typeof buildAuthApp>;
  readonly uploads: UploadStore;
  readonly workflow: ReturnType<typeof createCreatorWorkflowStore>;
  readonly reviews: ReturnType<typeof createReviewStore>;
} => {
  const assignments: Assignment[] = (
    ["T1", "T2", "T3", "T4", "T5"] as const
  ).map((gate) => ({
    reviewerId: "usr_reviewer",
    tenantId: "ten_a",
    gate,
    scope: "TENANT",
  }));
  const auth: AuthStore = {
    users: [
      { id: "usr_a", email: "a@invalid" },
      { id: "usr_reviewer", email: "reviewer@invalid" },
    ],
    credentials: [],
    memberships: [
      { userId: "usr_a", tenantId: "ten_a", role: "OWNER" },
      {
        userId: "usr_reviewer",
        tenantId: "ten_a",
        role: "DESIGNATED_REVIEWER",
      },
    ],
    assignments,
    sessions: [],
    apiTokens: [
      {
        id: "tok_a",
        userId: "usr_a",
        tenantId: "ten_a",
        tokenHash: hashBearer("secret-a"),
        expiresAt: 9_000,
        revokedAt: null,
      },
      {
        id: "tok_reviewer",
        userId: "usr_reviewer",
        tenantId: "ten_a",
        tokenHash: hashBearer("reviewer-secret"),
        expiresAt: 9_000,
        revokedAt: null,
      },
    ],
    audit: () => undefined,
  };
  const uploads: UploadStore = {
    uploads: new Map(),
    cas: new Map(),
    casByTenantDigest: new Map(),
    now: () => 1_000,
  };
  const upload = createUpload(uploads, "ten_a", {
    fileName: "reference.mp4",
    sizeBytes: 12,
  });
  upload.chunks.push(
    Uint8Array.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]),
  );
  upload.actualBytes = 12;
  finalizeUpload(uploads, "ten_a", upload.id);
  upload.media = { fps: 30, frameCount: 120, durationSeconds: 4 };
  const workflow = createCreatorWorkflowStore();
  workflow.availablePreflight = preflight;
  const reviews = createReviewStore();
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "secret",
    uploads,
    creatorWorkflow: workflow,
    reviews,
    now: uploads.now,
  });
  return { app, uploads, workflow, reviews };
};
const headers = { authorization: "Bearer secret-a", "x-tenant-id": "ten_a" };
const reviewerHeaders = {
  authorization: "Bearer reviewer-secret",
  "x-tenant-id": "ten_a",
};
const jobPayload = (uploadId: string, startFrame = 0) => ({
  uploadId,
  sourceFps: 30,
  startFrame,
  outputProfile: "vertical-1080p30",
});
const approveGate = async (
  state: ReturnType<typeof fixture>,
  job: Job,
  gate: "T1" | "T2" | "T3" | "T4",
  predecessorReceiptId: string | null,
  artifactRefs: readonly string[] = [],
): Promise<string> => {
  const response = await state.app.inject({
    method: "POST",
    url: "/v1/reviews",
    headers: reviewerHeaders,
    payload: {
      jobId: job.id,
      attempt: job.attempt,
      gate,
      decision: "APPROVED",
      predecessorReceiptId,
      evidenceDigest: job.evidenceDigest,
      irDigest: job.irDigest,
      runtimeDigest: RUNTIME_DIGEST,
      releaseBaselineDigest: RELEASE_BASELINE_DIGEST,
      reason: `approve ${gate}`,
      artifactRefs,
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return String(response.json().receipt.id);
};
const assertSafe = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(assertSafe);
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    expect(record).not.toHaveProperty("creatorId");
    expect(record).not.toHaveProperty("path");
    expect(record).not.toHaveProperty("bytes");
    expect(record).not.toHaveProperty("stack");
    Object.values(record).forEach(assertSafe);
  }
};

describe("creator workflow API", () => {
  it("creates and reads a tenant-fenced job without exposing private fields", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "job-create-1" },
      payload: jobPayload(uploadId),
    });
    expect(created.statusCode).toBe(201);
    const jobId = created.json().id;
    const detail = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}`,
      headers,
    });
    const receipts = await state.app.inject({
      method: "GET",
      url: `/v1/receipts?jobId=${encodeURIComponent(jobId)}`,
      headers,
    });
    expect(detail.json().state).toBe("PREPARING");
    expect(state.workflow.jobs.get(jobId)?.creatorId).toBe("usr_a");
    assertSafe(created.json());
    assertSafe(detail.json());
    expect(receipts.statusCode).toBe(200);
    expect(receipts.json().items).toEqual([]);
    await state.app.close();
  });
  it("streams a file-backed reference video", async () => {
    const state = fixture();
    const upload = [...state.uploads.uploads.values()][0];
    if (!upload) throw new Error("test upload was not created");
    const directory = mkdtempSync(join(tmpdir(), "rvs-source-"));
    const sourcePath = join(directory, "source.mp4");
    writeFileSync(sourcePath, Buffer.concat(upload.chunks));
    upload.casPath = sourcePath;
    upload.chunks.length = 0;

    try {
      const created = await state.app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { ...headers, "idempotency-key": "file-source-create" },
        payload: jobPayload(upload.id),
      });
      const source = await state.app.inject({
        method: "GET",
        url: `/v1/jobs/${created.json().id}/source-download`,
        headers,
      });

      expect(source.statusCode).toBe(200);
      expect(source.headers["content-length"]).toBe("12");
      expect(source.rawPayload.byteLength).toBe(12);
    } finally {
      await state.app.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });
  it("paginates and filters the creator job list with stable cursors", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const created = [];
    for (const key of ["page-a", "page-b"]) {
      const response = await state.app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { ...headers, "idempotency-key": key },
        payload: jobPayload(uploadId),
      });
      created.push(response.json().id as string);
    }
    const first = await state.app.inject({
      method: "GET",
      url: "/v1/jobs?limit=1",
      headers,
    });
    const second = await state.app.inject({
      method: "GET",
      url: `/v1/jobs?limit=1&after=${first.json().nextCursor}`,
      headers,
    });
    const filtered = await state.app.inject({
      method: "GET",
      url: `/v1/jobs?q=${encodeURIComponent(created[1] ?? "")}`,
      headers,
    });

    expect(first.json()).toMatchObject({
      nextCursor: "1",
      pageInfo: { hasNextPage: true, hasPreviousPage: false },
    });
    expect(second.json().pageInfo).toEqual({
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(
      filtered.json().items.map((item: { id: string }) => item.id),
    ).toEqual([created[1]]);
    await state.app.close();
  });
  it("resolves ambiguity before T2 and launches only the T4-approved IR", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "ready-create" },
      payload: jobPayload(uploadId),
    });
    const job = state.workflow.jobs.get(created.json().id);
    expect(job).toBeDefined();
    if (!job) throw new Error("test job was not created");
    const t1 = await approveGate(state, job, "T1", null);
    job.evidence = {
      state: "NEEDS_CHOICE",
      needsChoice: [
        {
          choiceId: "choice_font_family",
          options: ["Inter", "Arial"],
        },
      ],
      sceneInput: {
        owners: [
          {
            ownerId: "title",
            kind: "product-copy",
            editable: true,
            confidence: 0.98,
          },
        ],
        tracks: [
          {
            trackId: "track-title",
            owner: "title",
            geometryRef: "title",
            lifecycle: { stable: { start: 0, end: 119 } },
            effects: ["bloom"],
          },
        ],
        needsChoice: [
          {
            choiceId: "choice_font_family",
            options: ["Inter", "Arial"],
          },
        ],
      },
    };
    job.evidenceDigest = "e".repeat(64);
    job.irDigest = compilation.browserPassSpec.digest;
    job.pendingCompilation = compilation;
    job.preparationStage = "AWAITING_T2";
    const choiceEtag = job.etag;
    const choices = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}/choices`,
      headers,
    });
    const blockedEligibility = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}/render`,
      headers,
    });
    const blockedLaunch = await state.app.inject({
      method: "POST",
      url: `/v1/jobs/${job.id}/render`,
      headers: {
        ...headers,
        "if-match": choiceEtag,
        "idempotency-key": "ready-render-unresolved-choice",
      },
      payload: {},
    });
    expect(blockedEligibility.json()).toMatchObject({
      eligible: false,
      reason: "UNRESOLVED_CHOICE_SKIPPED",
    });
    expect(blockedLaunch.statusCode).toBe(409);
    expect(blockedLaunch.json().error.code).toBe("JOB_NOT_READY");
    const resolved = await state.app.inject({
      method: "POST",
      url: `/v1/jobs/${job.id}/choices`,
      headers: {
        ...headers,
        "if-match": choiceEtag,
        "idempotency-key": "resolve-font-family-choice",
      },
      payload: {
        choiceId: "choice_font_family",
        polygonOrOwner: { ownerId: "title" },
        reason: "Assign the measured text to the title owner.",
      },
    });
    const resolvedChoices = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}/choices`,
      headers,
    });
    expect(resolved.statusCode).toBe(201);
    expect(resolved.json()).toMatchObject({
      evidenceDigest: job.evidenceDigest,
      irDigest: job.irDigest,
    });
    expect(resolvedChoices.json().choices).toEqual([]);
    job.pendingCompilation = compilation;
    job.irDigest = compilation.browserPassSpec.digest;
    job.preparationStage = "AWAITING_T2";
    const t2 = await approveGate(state, job, "T2", t1);
    const t3 = await approveGate(state, job, "T3", t2, [
      compilation.authoring.versionId,
    ]);
    state.workflow.previews.set(job.id, {
      id: "preview-ready",
      jobId: job.id,
      tenantId: job.tenantId,
      kind: "preview",
      filename: `${job.id}-preview.mp4`,
      contentType: "video/mp4",
      bytes: Uint8Array.from([4, 5, 6]),
      sha256: "b".repeat(64),
      sizeBytes: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
      report: null,
    });
    job.previewSpecDigest = compilation.browserPassSpec.digest;
    job.preparationStage = "AWAITING_T4";
    const beforeT4 = await state.app.inject({
      method: "POST",
      url: `/v1/jobs/${job.id}/render`,
      headers: {
        ...headers,
        "if-match": job.etag,
        "idempotency-key": "render-before-t4",
      },
      payload: {},
    });
    expect(beforeT4.statusCode).toBe(409);
    expect(beforeT4.json().error.code).toBe("JOB_NOT_READY");
    await approveGate(state, job, "T4", t3, ["preview-ready"]);
    const readyEtag = job.etag;
    const detail = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}`,
      headers,
    });
    const sourceMedia = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}/source-download`,
      headers,
    });
    const previewMedia = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}/preview-download`,
      headers,
    });
    const preview = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}/preview?frame=24`,
      headers,
    });
    const topology = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${job.id}/topology`,
      headers,
    });
    const reviewerLaunch = await state.app.inject({
      method: "POST",
      url: `/v1/jobs/${job.id}/render`,
      headers: {
        ...reviewerHeaders,
        "if-match": readyEtag,
        "idempotency-key": "ready-render-reviewer",
      },
      payload: {},
    });
    const launch = await state.app.inject({
      method: "POST",
      url: `/v1/jobs/${job.id}/render`,
      headers: {
        ...headers,
        "if-match": readyEtag,
        "idempotency-key": "ready-render-approved",
      },
      payload: {},
    });

    expect(detail.json()).toMatchObject({
      id: job.id,
      state: "READY",
      etag: readyEtag,
      previewArtifactId: "preview-ready",
    });
    expect(sourceMedia.headers["content-type"]).toContain("video/mp4");
    expect(sourceMedia.rawPayload.byteLength).toBe(12);
    expect(previewMedia.rawPayload).toEqual(Buffer.from([4, 5, 6]));
    expect(preview.json()).toMatchObject({
      frame: 24,
      artifactId: "preview-ready",
      sha256: "b".repeat(64),
    });
    expect(topology.json()).toMatchObject({
      owners: [{ ownerId: "title" }],
      tracks: [{ trackId: "track-title", owner: "title" }],
    });
    expect(choices.json().choices).toHaveLength(1);
    expect(reviewerLaunch.statusCode).toBe(403);
    expect(reviewerLaunch.json().error.code).toBe("ROLE_NOT_PERMITTED");
    expect(launch.statusCode).toBe(202);
    expect(launch.json().state).toBe("QUEUED");
    expect(job.approved).toBe(true);
    await state.app.close();
  });
  it("rejects missing idempotency and stale edits", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const missing = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers,
      payload: { uploadId },
    });
    expect(missing.json().error.code).toBe("INVALID_REQUEST");
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "job-create-2" },
      payload: jobPayload(uploadId),
    });
    const response = await state.app.inject({
      method: "PATCH",
      url: `/v1/jobs/${created.json().id}/authoring-ir`,
      headers: { ...headers, "if-match": '"stale"', "idempotency-key": "ir-1" },
      payload: { ops: [], reason: "edit" },
    });
    expect(response.statusCode).toBe(409);
    await state.app.close();
  });
  it("runs job creation once per idempotency key and rejects changed replays", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const request = jobPayload(uploadId);
    const first = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "same-key-1" },
      payload: request,
    });
    const replay = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "same-key-1" },
      payload: request,
    });
    const changed = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "same-key-1" },
      payload: { ...request, startFrame: 1 },
    });
    expect(replay.body).toBe(first.body);
    expect(changed.statusCode).toBe(400);
    expect(state.uploads.uploads.size).toBe(1);
    await state.app.close();
  });
  it("covers the complete creator read and edit flow", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const createHeaders = { ...headers, "idempotency-key": "flow-create" };
    const payload = jobPayload(uploadId);
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: createHeaders,
      payload,
    });
    const jobId = created.json().id;
    const list = await state.app.inject({
      method: "GET",
      url: "/v1/jobs?limit=1",
      headers,
    });
    const detail = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}`,
      headers,
    });
    const attempts = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/attempts`,
      headers,
    });
    const evidence = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/evidence`,
      headers,
    });
    const job = state.workflow.jobs.get(jobId);
    if (!job) throw new Error("fixture job missing");
    job.state = "READY";
    job.preparationStage = "READY";
    job.evidence = {
      state: "MAPPED",
      sceneInput: {
        owners: [
          {
            ownerId: "title",
            kind: "text-word",
            editable: true,
            confidence: 1,
          },
        ],
        tracks: [],
        needsChoice: [],
      },
    };
    job.compilation = compilation;
    job.irDigest = compilation.browserPassSpec.digest;
    job.approvedSpecDigest = compilation.browserPassSpec.digest;
    const ir = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/authoring-ir`,
      headers,
    });
    const etag = ir.headers.etag;
    const edit = await state.app.inject({
      method: "PATCH",
      url: `/v1/jobs/${jobId}/authoring-ir`,
      headers: { ...headers, "if-match": etag, "idempotency-key": "flow-edit" },
      payload: {
        ops: [{ op: "replace", path: "/copy/title", value: "Draft" }],
        reason: "creator edit",
      },
    });
    const preview = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/preview?frame=0`,
      headers,
    });
    const topology = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/topology`,
      headers,
    });
    const choices = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/choices`,
      headers,
    });
    const eligibility = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/render`,
      headers,
    });
    const receipts = await state.app.inject({
      method: "GET",
      url: "/v1/receipts?limit=1",
      headers,
    });
    const report = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/report-download`,
      headers,
    });
    const delivery = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/delivery-download`,
      headers,
    });
    expect(list.statusCode).toBe(200);
    expect(detail.statusCode).toBe(200);
    expect(attempts.statusCode).toBe(200);
    expect(evidence.statusCode).toBe(404);
    expect(ir.statusCode).toBe(200);
    expect(edit.statusCode).toBe(202);
    expect(edit.json()).toMatchObject({
      state: "PREPARING",
      preparationStage: "COMPILATION_QUEUED",
    });
    expect(job.state).toBe("STALE_APPROVAL");
    expect(preview.statusCode).toBe(404);
    expect(topology.statusCode).toBe(200);
    expect(choices.statusCode).toBe(200);
    expect(eligibility.json().eligible).toBe(false);
    expect(receipts.statusCode).toBe(200);
    expect(report.statusCode).toBe(404);
    expect(delivery.statusCode).toBe(404);
    [
      list,
      detail,
      attempts,
      evidence,
      ir,
      edit,
      preview,
      topology,
      choices,
      eligibility,
      receipts,
      report,
      delivery,
    ].forEach((response) => assertSafe(response.json()));
    await state.app.close();
  });
  it("enforces command and edit headers plus failure preconditions", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const payload = jobPayload(uploadId);
    const missingCreate = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers,
      payload,
    });
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "preconditions" },
      payload,
    });
    const jobId = created.json().id;
    const missingEdit = await state.app.inject({
      method: "PATCH",
      url: `/v1/jobs/${jobId}/authoring-ir`,
      headers: { ...headers, "idempotency-key": "missing-etag" },
      payload: { ops: [], reason: "edit" },
    });
    const missingCancel = await state.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/cancel`,
      headers: { ...headers, "if-match": "fake-etag" },
      payload: {},
    });
    const missingRetry = await state.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/retry`,
      headers: { ...headers, "if-match": "fake-etag" },
      payload: {},
    });
    const missingRender = await state.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/render`,
      headers: { ...headers, "if-match": "fake-etag" },
      payload: {},
    });
    const badCursor = await state.app.inject({
      method: "GET",
      url: "/v1/jobs?limit=101",
      headers,
    });
    const badReceipts = await state.app.inject({
      method: "GET",
      url: "/v1/receipts?limit=101",
      headers,
    });
    const stale = await state.app.inject({
      method: "PATCH",
      url: `/v1/jobs/${jobId}/authoring-ir`,
      headers: {
        ...headers,
        "if-match": '"stale"',
        "idempotency-key": "stale-edit",
      },
      payload: { ops: [], reason: "edit" },
    });
    expect(missingCreate.statusCode).toBe(400);
    expect(missingEdit.statusCode).toBe(409);
    expect(missingCancel.statusCode).toBe(409);
    expect(missingRetry.statusCode).toBe(409);
    expect(missingRender.statusCode).toBe(409);
    expect(badCursor.statusCode).toBe(400);
    expect(badReceipts.statusCode).toBe(400);
    expect(stale.statusCode).toBe(409);
    await state.app.close();
  });

  it("retries from the compiler boundary with a fresh approval attempt", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "retry-create" },
      payload: jobPayload(uploadId),
    });
    const job = state.workflow.jobs.get(created.json().id);
    expect(job).toBeDefined();
    if (!job) throw new Error("fixture job missing");
    job.state = "FAILED";
    job.approved = true;
    job.evidence = { state: "MAPPED" };
    job.runtimePreflight = preflight;
    const retried = await state.app.inject({
      method: "POST",
      url: `/v1/jobs/${job.id}/retry`,
      headers: {
        ...headers,
        "if-match": job.etag,
        "idempotency-key": "retry-attempt-2",
      },
      payload: {},
    });
    expect(retried.statusCode).toBe(201);
    expect(retried.json()).toMatchObject({
      state: "PREPARING",
      attempt: 2,
      progress: null,
      runtimePreflight: preflight,
    });
    expect(job.evidence).toBeNull();
    expect(job.approved).toBe(false);
    expect(state.workflow.attempts.get(job.id)?.at(-1)?.number).toBe(2);
    await state.app.close();
  });
  it("rejects non-accepted, foreign, impossible interval, and unapproved render reads", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const pending = createUpload(state.uploads, "ten_a", {
      fileName: "pending.mp4",
      sizeBytes: 12,
    });
    const pendingResponse = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "pending-1" },
      payload: jobPayload(pending.id),
    });
    const impossible = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "bad-interval" },
      payload: jobPayload(uploadId, 1),
    });
    const foreign = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: {
        ...headers,
        "x-tenant-id": "ten_b",
        "idempotency-key": "foreign-1",
      },
      payload: jobPayload(uploadId),
    });
    expect(pendingResponse.statusCode).toBe(400);
    expect(impossible.statusCode).toBe(400);
    expect(foreign.statusCode).toBe(403);
    await state.app.close();
  });
});
