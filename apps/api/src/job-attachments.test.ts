import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import { createCreatorWorkflowStore, RUNTIME_DIGEST } from "./creator-workflow.js";
import { openApiDatabase } from "./durable-state.js";
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
  const directory = mkdtempSync(join(tmpdir(), "rvs-job-attachments-"));
  const db = openApiDatabase(join(directory, "app.sqlite"));
  const auth: AuthStore = {
    users: [
      { id: "usr_a", email: "a@invalid" },
      { id: "usr_b", email: "b@invalid" },
    ],
    credentials: [],
    memberships: [
      { userId: "usr_a", tenantId: "ten_a", role: "OWNER" },
      { userId: "usr_b", tenantId: "ten_b", role: "OWNER" },
    ],
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
      {
        id: "tok_b",
        userId: "usr_b",
        tenantId: "ten_b",
        tokenHash: hashBearer("secret-b"),
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
  upload.media = { fps: 30, frameCount: 1200, durationSeconds: 40 };
  const workflow = createCreatorWorkflowStore();
  workflow.availablePreflight = preflight;
  const attachmentsRoot = join(directory, "attachments");
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "secret",
    uploads,
    creatorWorkflow: workflow,
    now: uploads.now,
    db,
    attachmentsRoot,
  });
  return { app, uploads, workflow, db, directory, uploadId: upload.id };
};

const headersFor = (tenant: "ten_a" | "ten_b") => ({
  authorization: `Bearer secret-${tenant === "ten_a" ? "a" : "b"}`,
  "x-tenant-id": tenant,
});

const createJob = async (
  app: ReturnType<typeof buildAuthApp>,
  uploadId: string,
  key: string,
) => {
  const created = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    headers: { ...headersFor("ten_a"), "idempotency-key": key },
    payload: {
      uploadId,
      sourceFps: 30,
      startFrame: 0,
      outputProfile: "vertical-1080p30",
    },
  });
  return created.json().id as string;
};

describe("job attachments", () => {
  it("stores an attachment and lists it back", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-1");
      const upload = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/attachments`,
        headers: {
          ...headersFor("ten_a"),
          "content-type": "image/png",
          "x-filename": "mood-board.png",
        },
        payload: Buffer.from("fake-png-bytes"),
      });
      expect(upload.statusCode, upload.body).toBe(201);
      const uploaded = upload.json();
      expect(uploaded.filename).toBe("mood-board.png");
      expect(uploaded.sizeBytes).toBe(Buffer.byteLength("fake-png-bytes"));

      const list = await state.app.inject({
        method: "GET",
        url: `/v1/jobs/${jobId}/attachments`,
        headers: headersFor("ten_a"),
      });
      expect(list.statusCode, list.body).toBe(200);
      expect(list.json().items).toMatchObject([
        { filename: "mood-board.png", contentType: "image/png" },
      ]);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("rejects an attachment for a job belonging to a different tenant", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-2");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/attachments`,
        headers: { ...headersFor("ten_b"), "x-filename": "sneaky.png" },
        payload: Buffer.from("bytes"),
      });
      expect(response.statusCode).toBe(404);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("sanitizes a path-traversal filename", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-3");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/attachments`,
        headers: {
          ...headersFor("ten_a"),
          "x-filename": "../../etc/passwd",
        },
        payload: Buffer.from("bytes"),
      });
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json().filename).not.toContain("/");
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });
});
