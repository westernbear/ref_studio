import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import { createCreatorWorkflowStore } from "./creator-workflow.js";
import {
  cleanupExpiredUploads,
  createUpload,
  finalizeUpload,
  MAX_CHUNK_BYTES,
  putChunk,
  type UploadMedia,
  type UploadStore,
} from "./uploads.js";

const fixture = (): {
  readonly auth: AuthStore;
  readonly uploads: UploadStore;
  advance: (milliseconds: number) => void;
} => {
  let now = 1_000;
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
        expiresAt: 200_000_000,
        revokedAt: null,
      },
      {
        id: "tok_b",
        userId: "usr_b",
        tenantId: "ten_b",
        tokenHash: hashBearer("secret-b"),
        expiresAt: 200_000_000,
        revokedAt: null,
      },
    ],
    audit: () => undefined,
  };
  const uploads: UploadStore = {
    uploads: new Map(),
    cas: new Map(),
    casByTenantDigest: new Map(),
    now: () => now,
  };
  return {
    auth,
    uploads,
    advance: (milliseconds) => {
      now += milliseconds;
    },
  };
};
const mp4 = (size = 16): Uint8Array => {
  const data = Buffer.alloc(size);
  data.set([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]);
  return data;
};
const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const headers = (token: string, tenant: string) => ({
  authorization: `Bearer ${token}`,
  "x-tenant-id": tenant,
});
const commandHeaders = (token: string, tenant: string, key: string) => ({
  ...headers(token, tenant),
  "idempotency-key": key,
  "x-correlation-id": "00000000-0000-4000-8000-000000000000",
});
const appFor = (
  state: ReturnType<typeof fixture>,
  validateUpload: () => Promise<UploadMedia> = async () => ({
    fps: 25,
    frameCount: 100,
    durationSeconds: 4,
  }),
) =>
  buildAuthApp({
    store: state.auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "secret",
    uploads: state.uploads,
    creatorWorkflow: createCreatorWorkflowStore(),
    validateUpload,
    now: state.uploads.now,
  });
const uploadBytes = async (
  app: ReturnType<typeof buildAuthApp>,
  bytes: Uint8Array,
  suffix: string,
): Promise<string> => {
  const created = await app.inject({
    method: "POST",
    url: "/v1/uploads",
    headers: commandHeaders("secret-a", "ten_a", `create-${suffix}`),
    payload: {
      fileName: `${suffix}.mp4`,
      mimeHint: "video/mp4",
      sizeBytes: bytes.byteLength,
    },
  });
  expect(created.statusCode).toBe(201);
  expect(created.json()).toMatchObject({
    chunkSize: MAX_CHUNK_BYTES,
    state: "PENDING",
  });
  const uploadId = String(created.json().uploadId);
  const chunk = await app.inject({
    method: "PUT",
    url: `/v1/uploads/${uploadId}/chunks/0`,
    headers: {
      ...headers("secret-a", "ten_a"),
      "content-type": "application/octet-stream",
      "content-range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
      "x-chunk-sha256": sha256(bytes),
    },
    payload: bytes,
  });
  expect(chunk.statusCode).toBe(204);
  expect(chunk.headers["x-received-bytes"]).toBe(String(bytes.byteLength));
  const finalized = await app.inject({
    method: "POST",
    url: `/v1/uploads/${uploadId}/finalize`,
    headers: commandHeaders("secret-a", "ten_a", `finalize-${suffix}`),
    payload: { orderedChunkCount: 1, declaredSha256: sha256(bytes) },
  });
  expect(finalized.statusCode).toBe(202);
  expect(finalized.json()).toEqual({ uploadId, state: "VALIDATING" });
  return uploadId;
};

describe("sandboxed upload sessions", () => {
  it("replays upload creation and finalization only for identical requests", async () => {
    const state = fixture();
    let validations = 0;
    const app = appFor(state, async () => {
      validations += 1;
      return { fps: 25, frameCount: 100, durationSeconds: 4 };
    });
    const bytes = mp4();
    const createRequest = {
      method: "POST" as const,
      url: "/v1/uploads",
      headers: commandHeaders("secret-a", "ten_a", "same-create"),
      payload: { fileName: "same.mp4", sizeBytes: bytes.byteLength },
    };
    const first = await app.inject(createRequest);
    const replay = await app.inject(createRequest);
    const missingKey = await app.inject({
      ...createRequest,
      headers: headers("secret-a", "ten_a"),
    });
    const changed = await app.inject({
      ...createRequest,
      payload: { fileName: "changed.mp4", sizeBytes: bytes.byteLength },
    });
    const uploadId = String(first.json().uploadId);
    await app.inject({
      method: "PUT",
      url: `/v1/uploads/${uploadId}/chunks/0`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
        "content-range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
        "x-chunk-sha256": sha256(bytes),
      },
      payload: bytes,
    });
    const finalizeRequest = {
      method: "POST" as const,
      url: `/v1/uploads/${uploadId}/finalize`,
      headers: commandHeaders("secret-a", "ten_a", "same-finalize"),
      payload: { orderedChunkCount: 1, declaredSha256: sha256(bytes) },
    };
    const finalized = await app.inject(finalizeRequest);
    const finalizeReplay = await app.inject(finalizeRequest);
    const changedFinalize = await app.inject({
      ...finalizeRequest,
      payload: { orderedChunkCount: 2, declaredSha256: sha256(bytes) },
    });

    expect(first.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(state.uploads.uploads.size).toBe(1);
    expect(missingKey.json().error.code).toBe("INVALID_REQUEST");
    expect(changed.json().error.code).toBe("INVALID_REQUEST");
    expect(finalized.statusCode).toBe(202);
    expect(finalizeReplay.json()).toEqual(finalized.json());
    expect(changedFinalize.json().error.code).toBe("INVALID_REQUEST");
    expect(validations).toBe(1);
    await app.close();
  });

  it("uses indexed hashes, server-probed 25fps metadata, and tenant-local duplicate CAS", async () => {
    const state = fixture();
    const app = appFor(state);
    const bytes = mp4();
    const firstId = await uploadBytes(app, bytes, "first");
    const status = await app.inject({
      method: "GET",
      url: `/v1/uploads/${firstId}`,
      headers: headers("secret-a", "ten_a"),
    });
    const job = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: commandHeaders("secret-a", "ten_a", "job-25fps"),
      payload: {
        uploadId: firstId,
        startFrame: 0,
        sourceFps: 25,
        outputProfile: "vertical-1080p30",
      },
    });
    const secondId = await uploadBytes(app, bytes, "second");

    expect(status.json()).toEqual({
      uploadId: firstId,
      state: "ACCEPTED",
      fps: 25,
      frameCount: 100,
      durationSeconds: 4,
    });
    expect(job.statusCode).toBe(201);
    expect(job.json()).toMatchObject({ sourceFps: 25, frameCount: 100 });
    expect(secondId).not.toBe(firstId);
    expect(state.uploads.cas.size).toBe(1);
    expect(state.uploads.uploads.get(firstId)?.sourceSha256).toBe(
      sha256(bytes),
    );
    await app.close();
  });

  it("allows same-origin session creation without exposing tenant internals", async () => {
    const state = fixture();
    state.auth.sessions.push({
      id: "session-a",
      userId: "usr_a",
      tenantId: "ten_a",
      expiresAt: 9_000,
      revokedAt: null,
    });
    const app = appFor(state);
    const created = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: {
        cookie: "rvs_session=session-a",
        origin: "https://studio.invalid",
        "x-csrf-token": "csrf",
        "idempotency-key": "session-create",
        "x-correlation-id": "00000000-0000-4000-8000-000000000000",
      },
      payload: { fileName: "session.mp4", sizeBytes: 16 },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).not.toHaveProperty("tenantId");
    expect(state.uploads.uploads.get(created.json().uploadId)?.tenantId).toBe(
      "ten_a",
    );
    await app.close();
  });

  it("accepts the exact maximum chunk size", async () => {
    const state = fixture();
    const app = appFor(state);
    const bytes = mp4(MAX_CHUNK_BYTES);
    const created = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: commandHeaders("secret-a", "ten_a", "max-create"),
      payload: { fileName: "max.mp4", sizeBytes: bytes.byteLength },
    });
    const uploadId = String(created.json().uploadId);
    const chunk = await app.inject({
      method: "PUT",
      url: `/v1/uploads/${uploadId}/chunks/0`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
        "content-range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
        "x-chunk-sha256": sha256(bytes),
      },
      payload: bytes,
    });

    expect(chunk.statusCode).toBe(204);
    expect(state.uploads.uploads.get(uploadId)?.actualBytes).toBe(
      MAX_CHUNK_BYTES,
    );
    await app.close();
  });

  it("rejects unsafe names, invalid ranges and hashes, and quarantines wrong magic", async () => {
    const state = fixture();
    const app = appFor(state);
    const unsafe = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: commandHeaders("secret-a", "ten_a", "unsafe-create"),
      payload: { fileName: "../secret.mp4", sizeBytes: 4 },
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: commandHeaders("secret-a", "ten_a", "bad-create"),
      payload: { fileName: "bad.mp4", sizeBytes: 4 },
    });
    const uploadId = String(created.json().uploadId);
    const badBytes = Buffer.from("xxxx");
    const wrongHash = await app.inject({
      method: "PUT",
      url: `/v1/uploads/${uploadId}/chunks/0`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
        "content-range": "bytes 0-3/4",
        "x-chunk-sha256": "0".repeat(64),
      },
      payload: badBytes,
    });
    const wrongRange = await app.inject({
      method: "PUT",
      url: `/v1/uploads/${uploadId}/chunks/0`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
        "content-range": "bytes 1-4/4",
        "x-chunk-sha256": sha256(badBytes),
      },
      payload: badBytes,
    });
    await app.inject({
      method: "PUT",
      url: `/v1/uploads/${uploadId}/chunks/0`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
        "content-range": "bytes 0-3/4",
        "x-chunk-sha256": sha256(badBytes),
      },
      payload: badBytes,
    });
    const finalized = await app.inject({
      method: "POST",
      url: `/v1/uploads/${uploadId}/finalize`,
      headers: commandHeaders("secret-a", "ten_a", "bad-finalize"),
      payload: { orderedChunkCount: 1, declaredSha256: sha256(badBytes) },
    });

    expect(unsafe.json().error.code).toBe("INVALID_REQUEST");
    expect(wrongHash.json().error.code).toBe("HASH_MISMATCH");
    expect(wrongRange.json().error.code).toBe("UPLOAD_RANGE_INVALID");
    expect(finalized.json().error.code).toBe("VIDEO_TYPE_INVALID");
    expect(state.uploads.uploads.get(uploadId)?.state).toBe("QUARANTINED");
    await app.close();
  });

  it("hides foreign uploads and expires interrupted sessions", async () => {
    const state = fixture();
    const app = appFor(state);
    const upload = createUpload(state.uploads, "ten_a", {
      fileName: "a.mp4",
      sizeBytes: 4,
    });
    const foreign = await app.inject({
      method: "GET",
      url: `/v1/uploads/${upload.id}`,
      headers: headers("secret-b", "ten_b"),
    });
    state.advance(24 * 60 * 60 * 1000 + 1);
    const expired = await app.inject({
      method: "PUT",
      url: `/v1/uploads/${upload.id}/chunks/0`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
        "content-range": "bytes 0-3/4",
        "x-chunk-sha256": sha256(Buffer.from("xxxx")),
      },
      payload: Buffer.from("xxxx"),
    });

    expect(foreign.statusCode).toBe(404);
    expect(expired.statusCode).toBe(410);
    expect(cleanupExpiredUploads(state.uploads)).toBe(1);
    await app.close();
  });

  it("writes tenant-fenced chunks to disk and promotes the verified source", () => {
    const directory = mkdtempSync(join(tmpdir(), "rvs-upload-disk-"));
    const bytes = mp4();
    const uploads: UploadStore = {
      uploads: new Map(),
      cas: new Map(),
      casByTenantDigest: new Map(),
      now: () => 1_000,
      stagingRoot: join(directory, "staging"),
      casRoot: join(directory, "cas"),
    };
    const upload = createUpload(uploads, "ten_a", {
      fileName: "disk.mp4",
      sizeBytes: bytes.byteLength,
    });
    putChunk(
      uploads,
      "ten_a",
      upload.id,
      0,
      bytes,
      `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
      sha256(bytes),
    );
    putChunk(
      uploads,
      "ten_a",
      upload.id,
      0,
      bytes,
      `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
      sha256(bytes),
    );
    finalizeUpload(uploads, "ten_a", upload.id, {
      orderedChunkCount: 1,
      declaredSha256: sha256(bytes),
    });

    expect(upload.stagingPath).toContain(`${join("staging", "ten_a")}`);
    expect(upload.actualBytes).toBe(bytes.byteLength);
    expect(existsSync(upload.casPath ?? "")).toBe(true);
    expect(readFileSync(upload.casPath ?? "")).toEqual(Buffer.from(bytes));
    rmSync(directory, { recursive: true, force: true });
  });
});
