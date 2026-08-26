import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer } from "./auth.js";
import {
  fenceRequest,
  fenceResource,
  IdempotencyStore,
  safeEnvelope,
} from "./boundary.js";
import type { Principal } from "./auth.js";

const principal: Principal = {
  userId: "usr_a",
  tenantId: "ten_a",
  roles: ["OWNER"],
  capabilities: [],
};

describe("tenant boundary", () => {
  it("allows same tenant and rejects header/resource/epoch mismatches", () => {
    expect(fenceRequest(principal, "ten_a")).toBeNull();
    expect(fenceRequest(principal, "ten_b")).toEqual({
      code: "TENANT_BOUNDARY_BYPASS",
    });
    expect(fenceResource(principal, "ten_a", { tenantId: "ten_b" }, 0)).toEqual(
      { code: "RESOURCE_NOT_FOUND" },
    );
    expect(
      fenceResource(
        principal,
        "ten_a",
        { tenantId: "ten_a", deletionEpoch: 2 },
        1,
      ),
    ).toEqual({ code: "DELETION_EPOCH_STALE" });
  });

  it("serializes safe errors without private diagnostic fields", () => {
    const output = safeEnvelope(
      new Error("/private/secret.raw bytes stack"),
      "cor_test",
    );
    expect(output).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Try again later.",
        correlationId: "cor_test",
        details: [],
      },
    });
    expect(JSON.stringify(output)).not.toMatch(/private|secret|stack|bytes/);
  });
});

describe("idempotency boundary", () => {
  it("replays the original result and rejects a changed request", () => {
    const store = new IdempotencyStore();
    const first = store.replayOrReserve(
      "tenant-action",
      "k1",
      "hash-a",
      "ten_a",
      [201, { id: "job_a" }],
    );
    const replay = store.replayOrReserve(
      "tenant-action",
      "k1",
      "hash-a",
      "ten_a",
      [500, { id: "wrong" }],
    );
    expect(replay).toEqual(first);
    expect(() =>
      store.replayOrReserve("tenant-action", "k1", "hash-b", "ten_a", [
        201,
        { id: "job_b" },
      ]),
    ).toThrow("INVALID_REQUEST");
  });

  it("coalesces concurrent async replays", async () => {
    const store = new IdempotencyStore();
    let effects = 0;
    const action = async () => {
      effects += 1;
      await Promise.resolve();
      return [202, { id: "upload_a" }] as const;
    };
    const [first, replay] = await Promise.all([
      store.executeAsync("upload", "k1", "hash-a", "ten_a", action),
      store.executeAsync("upload", "k1", "hash-a", "ten_a", action),
    ]);

    expect(replay).toEqual(first);
    expect(effects).toBe(1);
  });
});

describe("tenant action idempotency boundary", () => {
  it("replays idempotency keys and fences tenant actions by header", async () => {
    const events: Array<{
      readonly action: string;
      readonly tenantId: string | null;
    }> = [];
    let effects = 0;
    const app = buildAuthApp({
      store: {
        users: [{ id: "usr_a", email: "a@invalid" }],
        credentials: [],
        memberships: [{ userId: "usr_a", tenantId: "ten_a", role: "OWNER" }],
        assignments: [],
        sessions: [],
        apiTokens: [
          {
            id: "tok",
            userId: "usr_a",
            tenantId: "ten_a",
            tokenHash: hashBearer("raw"),
            expiresAt: 2_000,
            revokedAt: null,
          },
        ],
        audit: (event) => {
          events.push({ action: event.action, tenantId: event.tenantId });
        },
      },
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "secret",
      idempotency: new IdempotencyStore(),
      onTenantAction: () => {
        effects += 1;
        return { id: "job_a" };
      },
      now: () => 1_000,
    });
    const action = await app.inject({
      method: "POST",
      url: "/v1/tenant-actions",
      headers: {
        authorization: "Bearer raw",
        "x-tenant-id": "ten_a",
        "idempotency-key": "action-1",
      },
      payload: { resourceTenantId: "ten_a", deletionEpoch: 0 },
    });
    const actionReplay = await app.inject({
      method: "POST",
      url: "/v1/tenant-actions",
      headers: {
        authorization: "Bearer raw",
        "x-tenant-id": "ten_a",
        "idempotency-key": "action-1",
      },
      payload: { resourceTenantId: "ten_a", deletionEpoch: 0 },
    });
    const changed = await app.inject({
      method: "POST",
      url: "/v1/tenant-actions",
      headers: {
        authorization: "Bearer raw",
        "x-tenant-id": "ten_a",
        "idempotency-key": "action-1",
      },
      payload: { resourceTenantId: "ten_a", deletionEpoch: 1 },
    });
    const foreign = await app.inject({
      method: "POST",
      url: "/v1/tenant-actions",
      headers: {
        authorization: "Bearer raw",
        "x-tenant-id": "ten_a",
        "idempotency-key": "action-2",
      },
      payload: { resourceTenantId: "ten_b", deletionEpoch: 0 },
    });
    expect(action.statusCode).toBe(200);
    expect(actionReplay.body).toBe(action.body);
    expect(effects).toBe(1);
    expect(changed.json().error.code).toBe("INVALID_REQUEST");
    expect(changed.json().error).toHaveProperty("correlationId");
    expect(foreign.json().error.code).toBe("RESOURCE_NOT_FOUND");
    expect(events).toEqual(
      expect.arrayContaining([
        { action: "TENANT_ACTION_IDEMPOTENCY_DENIED", tenantId: "ten_a" },
        { action: "TENANT_ACTION_RESOURCE_NOT_FOUND", tenantId: "ten_a" },
      ]),
    );
    const tenantMissing = await app.inject({
      method: "GET",
      url: "/v1/identity",
      headers: { authorization: "Bearer raw" },
    });
    expect(tenantMissing.json().error.code).toBe("TENANT_BOUNDARY_BYPASS");
    expect(action.headers["x-correlation-id"]).toMatch(/^cor_/);
    await app.close();
  });
});
