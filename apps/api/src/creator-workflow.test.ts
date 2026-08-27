import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type Assignment, type AuthStore } from "./auth.js";
import {
  createCreatorWorkflowStore,
  RUNTIME_DIGEST,
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

const fixture = () => {
  const assignments: Assignment[] = (
    ["T1", "T2", "T3", "T4", "T5"] as const
  ).map((gate) => ({
    reviewerId: "usr_reviewer",
    tenantId: "t1",
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
      { userId: "usr_a", tenantId: "t1", role: "OWNER" },
      { userId: "usr_reviewer", tenantId: "t1", role: "DESIGNATED_REVIEWER" },
    ],
    assignments,
    sessions: [],
    apiTokens: [
      {
        id: "tok_a",
        userId: "usr_a",
        tenantId: "t1",
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
  const upload = createUpload(uploads, "t1", {
    fileName: "reference.mp4",
    sizeBytes: 12,
  });
  upload.chunks.push(
    Uint8Array.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]),
  );
  upload.actualBytes = 12;
  finalizeUpload(uploads, "t1", upload.id);
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
  return { app, uploads, workflow, reviews, uploadId: upload.id };
};

const headers = { authorization: "Bearer secret-a", "x-tenant-id": "t1" };

describe("generation config on job creation", () => {
  it("stores the generation config on the job", async () => {
    const state = fixture();
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "k1" },
      payload: {
        uploadId: state.uploadId,
        sourceFps: 30,
        startFrame: 0,
        outputProfile: "vertical-1080p30",
        generation: {
          brief: "신발 광고",
          durationSec: 20,
          aspect: "9:16",
          attachmentIds: [],
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const job = created.json();
    expect(job.generation.durationSec).toBe(20);
    await state.app.close();
  });
  it("omits generation when not provided", async () => {
    const state = fixture();
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "k2" },
      payload: {
        uploadId: state.uploadId,
        sourceFps: 30,
        startFrame: 0,
        outputProfile: "vertical-1080p30",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().generation).toBeUndefined();
    await state.app.close();
  });
  it("rejects an invalid generation config", async () => {
    const state = fixture();
    const created = await state.app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: { ...headers, "idempotency-key": "k3" },
      payload: {
        uploadId: state.uploadId,
        sourceFps: 30,
        startFrame: 0,
        outputProfile: "vertical-1080p30",
        generation: {
          brief: "x",
          durationSec: 4,
          aspect: "9:16",
          attachmentIds: [],
        },
      },
    });
    expect(created.statusCode).toBe(400);
    await state.app.close();
  });
});
