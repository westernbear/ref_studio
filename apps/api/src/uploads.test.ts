import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import {
  createAttachment,
  MAX_ATTACHMENTS_PER_TENANT,
  MAX_ATTACHMENT_BYTES_PER_TENANT,
  UploadFailure,
  type UploadStore,
} from "./uploads.js";

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

  // I1: video/mp4 is in the attachment allowlist and isMp4Attachment exists
  // to sniff it, but app.ts's video content-type parsers handed the body
  // over as a raw, unbuffered stream, so it was rejected as INVALID_REQUEST
  // before ever reaching that sniff. This exercises the real HTTP path end
  // to end, not a mocked stream.
  it("accepts an mp4 attachment end to end", async () => {
    const { app } = fixture();
    // Minimal "ftyp" box header -- isMp4Attachment only checks bytes[4..8].
    const mp4Bytes = Buffer.from([
      0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109,
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/attachments",
      headers: {
        ...headers,
        "content-type": "video/mp4",
        "idempotency-key": "a4",
      },
      payload: mp4Bytes,
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).attachmentId).toMatch(/^att_/);
    await app.close();
  });

  // I1.3/I1.4: a rejected attachment must surface its own reason code, not
  // a generic one -- this was silently broken independent of the web
  // client's own mapping: ATTACHMENT_TYPE_INVALID wasn't in
  // packages/contracts/src/errors.ts's ErrorCodeSchema, so normalizeError
  // downgraded it to INTERNAL_ERROR before it ever reached a client.
  it("surfaces the attachment's own failure code, not a generic one", async () => {
    const { app } = fixture();
    const res = await app.inject({
      method: "POST",
      url: "/v1/attachments",
      headers: {
        ...headers,
        "content-type": "font/ttf",
        "idempotency-key": "a5",
      },
      payload: Buffer.from("\x7fELF"),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("ATTACHMENT_TYPE_INVALID");
    await app.close();
  });
});

describe("attachment store caps (I2.1)", () => {
  const storeFixture = (): UploadStore => ({
    uploads: new Map(),
    cas: new Map(),
    casByTenantDigest: new Map(),
    now: () => 1_000,
  });
  const png = (paddingBytes: number): Buffer =>
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(paddingBytes),
    ]);

  const expectFailure = (thunk: () => void, code: UploadFailure["code"]) => {
    try {
      thunk();
      throw new Error(`expected UploadFailure(${code}), nothing was thrown`);
    } catch (error) {
      expect(error).toBeInstanceOf(UploadFailure);
      expect((error as UploadFailure).code).toBe(code);
    }
  };

  it("rejects an attachment once a tenant is at the count cap", () => {
    const store = storeFixture();
    for (let index = 0; index < MAX_ATTACHMENTS_PER_TENANT; index++)
      createAttachment(store, "ten_a", png(1));
    expectFailure(
      () => createAttachment(store, "ten_a", png(1)),
      "ATTACHMENT_COUNT_LIMIT_EXCEEDED",
    );
    // A different tenant is unaffected by the first tenant's count.
    expect(() => createAttachment(store, "ten_b", png(1))).not.toThrow();
  });

  it("rejects an attachment once a tenant is at the total-byte budget", () => {
    const store = storeFixture();
    // Chosen so the budget is reached well before the count cap
    // (MAX_ATTACHMENTS_PER_TENANT): 5 files at the per-file size limit
    // exactly fill MAX_ATTACHMENT_BYTES_PER_TENANT (100 MB).
    const perFileBytes = MAX_ATTACHMENT_BYTES_PER_TENANT / 5;
    for (let index = 0; index < 5; index++)
      createAttachment(store, "ten_c", png(perFileBytes - 8));
    expectFailure(
      () => createAttachment(store, "ten_c", png(1)),
      "ATTACHMENT_QUOTA_EXCEEDED",
    );
  });
});
