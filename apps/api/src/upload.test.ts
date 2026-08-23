import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import {
  cleanupExpiredUploads,
  createUpload,
  MAX_CHUNK_BYTES,
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
  const header = [0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109];
  data.set(header.slice(0, size));
  return data;
};
const headers = (token: string, tenant: string) => ({
  authorization: `Bearer ${token}`,
  "x-tenant-id": tenant,
});

describe("sandboxed upload sessions", () => {
  it("streams a synthetic MP4 in chunks and creates tenant-local CAS after finalize", async () => {
    const state = fixture();
    const app = buildAuthApp({
      store: state.auth,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "secret",
      uploads: state.uploads,
      now: state.uploads.now,
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: headers("secret-a", "ten_a"),
      payload: {
        filename: "reference.mp4",
        contentType: "video/mp4",
        sizeBytes: 16,
      },
    });
    const uploadId = created.json().upload.id;
    await app.inject({
      method: "POST",
      url: `/v1/uploads/${uploadId}/chunks`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
      },
      payload: mp4(8),
    });
    await app.inject({
      method: "POST",
      url: `/v1/uploads/${uploadId}/chunks`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
      },
      payload: mp4(16).subarray(8),
    });
    const finalized = await app.inject({
      method: "POST",
      url: `/v1/uploads/${uploadId}/finalize`,
      headers: headers("secret-a", "ten_a"),
    });
    expect(created.statusCode).toBe(201);
    expect(finalized.statusCode).toBe(200);
    expect(finalized.json().upload.state).toBe("ACCEPTED");
    expect(state.uploads.cas.size).toBe(1);
    expect(finalized.json()).not.toHaveProperty("path");
    await app.close();
  });
  it("allows same-origin session uploads without a bearer token", async () => {
    const state = fixture();
    state.auth.sessions.push({
      id: "session-a",
      userId: "usr_a",
      tenantId: "ten_a",
      expiresAt: 9_000,
      revokedAt: null,
    });
    const app = buildAuthApp({
      store: state.auth,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "secret",
      uploads: state.uploads,
      now: state.uploads.now,
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: {
        cookie: "rvs_session=session-a",
        origin: "https://studio.invalid",
        "x-csrf-token": "csrf",
      },
      payload: {
        filename: "session.mp4",
        contentType: "video/mp4",
        sizeBytes: 16,
      },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().upload.tenantId).toBe("ten_a");
    await app.close();
  });
  it("accepts the documented maximum chunk size", async () => {
    const state = fixture();
    const app = buildAuthApp({
      store: state.auth,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "secret",
      uploads: state.uploads,
      now: state.uploads.now,
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: headers("secret-a", "ten_a"),
      payload: {
        filename: "max-chunk.mp4",
        contentType: "video/mp4",
        sizeBytes: MAX_CHUNK_BYTES,
      },
    });
    const uploadId = created.json().upload.id;
    const chunk = mp4(MAX_CHUNK_BYTES);
    const appended = await app.inject({
      method: "POST",
      url: `/v1/uploads/${uploadId}/chunks`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
      },
      payload: chunk,
    });

    expect(appended.statusCode).toBe(200);
    expect(appended.json().upload.actualBytes).toBeUndefined();
    expect(state.uploads.uploads.get(uploadId)?.actualBytes).toBe(
      MAX_CHUNK_BYTES,
    );
    await app.close();
  });
  it("quarantines wrong magic, rejects unsafe metadata and exact size overflow", async () => {
    const state = fixture();
    const app = buildAuthApp({
      store: state.auth,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "secret",
      uploads: state.uploads,
      now: state.uploads.now,
    });
    const unsafe = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: headers("secret-a", "ten_a"),
      payload: {
        filename: "../secret.mp4",
        contentType: "video/mp4",
        sizeBytes: 4,
      },
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: headers("secret-a", "ten_a"),
      payload: { filename: "bad.mp4", contentType: "video/mp4", sizeBytes: 4 },
    });
    const id = created.json().upload.id;
    await app.inject({
      method: "POST",
      url: `/v1/uploads/${id}/chunks`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
      },
      payload: Buffer.from("xxxx"),
    });
    const wrong = await app.inject({
      method: "POST",
      url: `/v1/uploads/${id}/finalize`,
      headers: headers("secret-a", "ten_a"),
    });
    const overflow = await app.inject({
      method: "POST",
      url: `/v1/uploads/${id}/chunks`,
      headers: {
        ...headers("secret-a", "ten_a"),
        "content-type": "application/octet-stream",
      },
      payload: Buffer.from("x"),
    });
    expect(unsafe.json().error.code).toBe("INVALID_REQUEST");
    expect(wrong.json().error.code).toBe("VIDEO_TYPE_INVALID");
    expect(overflow.json().error.code).toBe("VIDEO_SIZE_LIMIT_EXCEEDED");
    expect(state.uploads.uploads.get(id)?.state).toBe("QUARANTINED");
    await app.close();
  });
  it("hides foreign resources and cleans expired interrupted sessions", async () => {
    const state = fixture();
    const app = buildAuthApp({
      store: state.auth,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "secret",
      uploads: state.uploads,
      now: state.uploads.now,
    });
    const upload = createUpload(state.uploads, "ten_a", {
      filename: "a.mp4",
      contentType: "video/mp4",
      sizeBytes: 4,
    });
    const foreign = await app.inject({
      method: "POST",
      url: `/v1/uploads/${upload.id}/finalize`,
      headers: headers("secret-b", "ten_b"),
    });
    state.advance(24 * 60 * 60 * 1000 + 1);
    const removed = cleanupExpiredUploads(state.uploads);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error.code).toBe("RESOURCE_NOT_FOUND");
    expect(removed).toBe(1);
    await app.close();
  });
});
