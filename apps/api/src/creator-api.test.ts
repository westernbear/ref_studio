import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import { createCreatorWorkflowStore } from "./creator-workflow.js";
import { createUpload, finalizeUpload, type UploadStore } from "./uploads.js";

const fixture = (): {
  readonly app: ReturnType<typeof buildAuthApp>;
  readonly uploads: UploadStore;
} => {
  const auth: AuthStore = {
    users: [{ id: "usr_a", email: "a@invalid" }],
    credentials: [],
    memberships: [{ userId: "usr_a", tenantId: "ten_a", role: "OWNER" }],
    assignments: [],
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
    filename: "reference.mp4",
    contentType: "video/mp4",
    sizeBytes: 12,
  });
  upload.chunks.push(
    Uint8Array.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]),
  );
  upload.actualBytes = 12;
  finalizeUpload(uploads, "ten_a", upload.id);
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "secret",
    uploads,
    creatorWorkflow: createCreatorWorkflowStore(),
    now: uploads.now,
  });
  return { app, uploads };
};
const headers = { authorization: "Bearer secret-a", "x-tenant-id": "ten_a" };
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
  it("creates and reads a tenant-fenced job without exposing reviews", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "job-create-1" },
      payload: { uploadId, sourceFps: 30, startFrame: 0, frameCount: 120 },
    });
    expect(created.statusCode).toBe(201);
    const jobId = created.json().id;
    const detail = await state.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}`,
      headers,
    });
    const review = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
    });
    expect(detail.json().state).toBe("PREPARING");
    assertSafe(created.json());
    assertSafe(detail.json());
    expect(review.statusCode).toBe(404);
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
      payload: { uploadId, sourceFps: 30, startFrame: 0, frameCount: 120 },
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
    const request = { uploadId, sourceFps: 30, startFrame: 0, frameCount: 120 };
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
    const payload = { uploadId, sourceFps: 30, startFrame: 0, frameCount: 120 };
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
    expect(evidence.statusCode).toBe(200);
    expect(ir.statusCode).toBe(200);
    expect(edit.statusCode).toBe(201);
    expect(preview.statusCode).toBe(200);
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
    const payload = { uploadId, sourceFps: 30, startFrame: 0, frameCount: 120 };
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
  it("rejects non-accepted, foreign, impossible interval, and unapproved render reads", async () => {
    const state = fixture();
    const uploadId = [...state.uploads.uploads.keys()][0];
    const pending = createUpload(state.uploads, "ten_a", {
      filename: "pending.mp4",
      contentType: "video/mp4",
      sizeBytes: 12,
    });
    const pendingResponse = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "pending-1" },
      payload: {
        uploadId: pending.id,
        sourceFps: 30,
        startFrame: 0,
        frameCount: 120,
      },
    });
    const impossible = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "bad-interval" },
      payload: { uploadId, sourceFps: 30, startFrame: 1, frameCount: 120 },
    });
    const foreign = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: {
        ...headers,
        "x-tenant-id": "ten_b",
        "idempotency-key": "foreign-1",
      },
      payload: { uploadId, sourceFps: 30, startFrame: 0, frameCount: 120 },
    });
    expect(pendingResponse.statusCode).toBe(400);
    expect(impossible.statusCode).toBe(400);
    expect(foreign.statusCode).toBe(403);
    await state.app.close();
  });
});
