import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import type { UploadStore } from "./uploads.js";

const fixture = (): { readonly app: ReturnType<typeof buildAuthApp> } => {
  const auth: AuthStore = {
    users: [{ id: "usr_a", email: "a@invalid" }],
    credentials: [],
    memberships: [{ userId: "usr_a", tenantId: "t1", role: "OWNER" }],
    assignments: [],
    sessions: [],
    apiTokens: [
      {
        id: "tok_a",
        userId: "usr_a",
        tenantId: "t1",
        tokenHash: hashBearer("secret-a"),
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
    now: () => 1_000,
  };
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "secret",
    uploads,
    now: uploads.now,
  });
  return { app };
};

const headers = { authorization: "Bearer secret-a", "x-tenant-id": "t1" };

// A minimal, valid 1x1 PNG.
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("attachment upload", () => {
  it("accepts a png attachment", async () => {
    const { app } = fixture();
    const res = await app.inject({
      method: "POST",
      url: "/v1/attachments",
      headers: {
        ...headers,
        "content-type": "image/png",
        "idempotency-key": "a1",
      },
      payload: onePixelPng,
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).attachmentId).toMatch(/^att_/);
    await app.close();
  });
  it("rejects an executable disguised as a font", async () => {
    const { app } = fixture();
    const res = await app.inject({
      method: "POST",
      url: "/v1/attachments",
      headers: {
        ...headers,
        "content-type": "font/ttf",
        "idempotency-key": "a2",
      },
      payload: Buffer.from("\x7fELF"),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
  it("rejects an attachment over the per-file size limit", async () => {
    const { app } = fixture();
    const oversized = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(20 * 1024 * 1024 + 1),
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/attachments",
      headers: {
        ...headers,
        "content-type": "image/png",
        "idempotency-key": "a3",
      },
      payload: oversized,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
