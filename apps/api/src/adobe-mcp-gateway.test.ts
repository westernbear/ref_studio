import Database from "better-sqlite3";
import { createHmac } from "node:crypto";
import { canonicalJson, sha256Hex } from "@rvs/contracts";
import { describe, expect, it, vi } from "vitest";
import { migrate, seed } from "../database/db.mjs";
import { createAdobeGatewayStore } from "./adobe-mcp-gateway.js";
import { buildAuthApp, hashBearer } from "./app.js";

const sceneDigest = "a".repeat(64);
const authStore = () => ({
  users: [{ id: "usr_platform", email: "platform@example.invalid" }],
  credentials: [],
  memberships: [
    { userId: "usr_platform", tenantId: "ten_platform", role: "SUPER_ADMIN" },
  ],
  assignments: [],
  sessions: [],
  apiTokens: [
    {
      id: "tok_adobe",
      userId: "usr_platform",
      tenantId: "ten_platform",
      tokenHash: hashBearer("creator-token"),
      expiresAt: 10_000,
      revokedAt: null,
    },
  ],
  audit: () => undefined,
});

const prepareDb = () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seed(db);
  db.exec(
    "INSERT INTO uploads VALUES ('upl_adobe','ten_platform','source.mp4','video/mp4',1,'ACCEPTED',NULL,'2026-08-30','2026-08-31'); INSERT INTO jobs VALUES ('job-adobe-1','ten_platform','usr_platform','upl_adobe','scene_adobe','QUEUED',0,0,'2026-08-30')",
  );
  return db;
};

const command = (deviceId: string, commandId = "cmd-adobe-1") => ({
  version: 1 as const,
  commandId,
  nonce: `nonce-${commandId}`,
  sceneDigest,
  deviceId,
  jobId: "job-adobe-1",
  projectHandle: "project:working-copy" as const,
  tool: "adobe.project.get_v1" as const,
  args: {},
});

const signedHeaders = (
  body: unknown,
  enrollment: { keyId: string; secret: string },
  nonce = "relay-nonce-1",
) => {
  const bodyHash = sha256Hex(body);
  const fields = [enrollment.keyId, "1000", "request-adobe-1", nonce, bodyHash];
  return {
    "x-rvs-key-id": enrollment.keyId,
    "x-rvs-timestamp-ms": "1000",
    "x-rvs-request-id": "request-adobe-1",
    "x-rvs-nonce": nonce,
    "x-rvs-body-hash": bodyHash,
    "x-rvs-signature": createHmac("sha256", enrollment.secret)
      .update(fields.join("\n"))
      .digest("hex"),
  };
};

describe("Adobe MCP gateway", () => {
  it("enrolls a tenant device and consumes a relay nonce once", () => {
    const db = prepareDb();
    const gateway = createAdobeGatewayStore(
      db,
      () => 1_000,
      "gateway-test-secret",
    );
    const enrolled = gateway.enroll("ten_platform", "Studio Mac");
    expect(enrolled.secret).toHaveLength(64);
    expect(
      gateway.consumeNonce(enrolled.deviceId, enrolled.keyId, "nonce-1"),
    ).toBe(true);
    expect(
      gateway.consumeNonce(enrolled.deviceId, enrolled.keyId, "nonce-1"),
    ).toBe(false);
    db.close();
  });

  it("rotates keys rate limits durable nonces and rejects foreign job bindings", () => {
    const db = prepareDb();
    const gateway = createAdobeGatewayStore(
      db,
      () => 1_000,
      "gateway-test-secret",
    );
    const first = gateway.enroll("ten_platform", "Studio Mac");
    expect(
      gateway.consumeNonce(
        first.deviceId,
        first.keyId,
        "nonce-across-rotation",
      ),
    ).toBe(true);
    const rotated = gateway.enroll(
      "ten_platform",
      "Studio Mac rotated",
      first.deviceId,
    );
    expect(gateway.key(first.keyId)?.revokedAtMs).toBe(1_000);
    expect(gateway.key(rotated.keyId)?.revokedAtMs).toBeNull();
    expect(
      gateway.consumeNonce(
        rotated.deviceId,
        rotated.keyId,
        "nonce-across-rotation",
      ),
    ).toBe(false);
    for (let index = 0; index < 59; index += 1)
      expect(
        gateway.consumeNonce(
          rotated.deviceId,
          rotated.keyId,
          `rate-nonce-${index}`,
        ),
      ).toBe(true);
    expect(() =>
      gateway.consumeNonce(rotated.deviceId, rotated.keyId, "rate-overflow"),
    ).toThrow("ADOBE_RELAY_RATE_LIMIT");
    expect(() =>
      gateway.enqueue("ten_platform", {
        ...command(rotated.deviceId, "cmd-wrong-job"),
        jobId: "job-foreign",
      }),
    ).toThrow("ADOBE_RELAY_BINDING_REJECTED");
    expect(() =>
      gateway.enqueue(
        "ten_platform",
        command("device-foreign", "cmd-wrong-device"),
      ),
    ).toThrow("ADOBE_RELAY_BINDING_REJECTED");
    db.close();
  });

  it("enrolls lists relays and reads command metadata through real HTTP routes", async () => {
    const db = prepareDb();
    const app = buildAuthApp({
      store: authStore(),
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "gateway-test-secret",
      now: () => 1_000,
      db,
      featureFlags: {
        verifiedMotionAuthoring: false,
        nativeSceneV2: false,
        adobeMcp: true,
      },
    });
    const userHeaders = {
      authorization: "Bearer creator-token",
      "x-tenant-id": "ten_platform",
    };
    const enrolled = await app.inject({
      method: "POST",
      url: "/v1/adobe/devices/device-http-1/enroll",
      headers: userHeaders,
      payload: { name: "Studio Mac" },
    });
    const enrollment = enrolled.json();
    const body = { version: 1, command: command(enrollment.deviceId) };
    const relayed = await app.inject({
      method: "POST",
      url: "/v1/adobe/relay",
      headers: signedHeaders(body, enrollment),
      payload: body,
    });
    const devices = await app.inject({
      method: "GET",
      url: "/v1/adobe/devices",
      headers: userHeaders,
    });
    const status = await app.inject({
      method: "GET",
      url: "/v1/adobe/commands/cmd-adobe-1",
      headers: userHeaders,
    });

    expect(enrolled.statusCode).toBe(201);
    expect(enrollment.deviceId).toBe("device-http-1");
    expect(relayed.statusCode).toBe(202);
    expect(devices.json().devices).toHaveLength(1);
    expect(status.json()).toEqual({
      version: 1,
      commandId: "cmd-adobe-1",
      deviceId: enrollment.deviceId,
      jobId: "job-adobe-1",
      status: "QUEUED",
      result: null,
    });
    const resultBody = {
      version: 1,
      result: {
        version: 1,
        commandId: "cmd-adobe-1",
        nonce: "nonce-cmd-adobe-1",
        sceneDigest,
        deviceId: enrollment.deviceId,
        jobId: "job-adobe-1",
        status: "SUCCEEDED",
        beforeDigest: sceneDigest,
        afterDigest: sceneDigest,
        changedFields: [],
        warnings: [],
        payload: { uploadId: "upl-http-local" },
        mp4: {
          sha256: "b".repeat(64),
          codec: "h264",
          profile: "High",
          frameCount: 30,
          durationSeconds: 1,
          width: 320,
          height: 240,
        },
      },
    };
    const completed = await app.inject({
      method: "POST",
      url: "/v1/adobe/results",
      headers: signedHeaders(resultBody, enrollment, "relay-result-1"),
      payload: resultBody,
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json().result).toEqual(resultBody.result);
    expect(canonicalJson(JSON.parse(canonicalJson(body)))).toBe(
      canonicalJson(body),
    );
    await app.close();
    db.close();
  });

  it("rejects replay bad signatures wrong bindings and redacts hostile payloads", async () => {
    const db = prepareDb();
    const app = buildAuthApp({
      store: authStore(),
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "gateway-test-secret",
      now: () => 1_000,
      db,
      featureFlags: {
        verifiedMotionAuthoring: false,
        nativeSceneV2: false,
        adobeMcp: true,
      },
    });
    const enrolled = await app.inject({
      method: "POST",
      url: "/v1/adobe/devices/enroll",
      headers: {
        authorization: "Bearer creator-token",
        "x-tenant-id": "ten_platform",
      },
      payload: { name: "Studio Mac" },
    });
    const enrollment = enrolled.json();
    const body = { version: 1, command: command(enrollment.deviceId) };
    const headers = signedHeaders(body, enrollment);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/adobe/relay",
          headers,
          payload: body,
        })
      ).statusCode,
    ).toBe(202);
    const replay = await app.inject({
      method: "POST",
      url: "/v1/adobe/relay",
      headers,
      payload: body,
    });
    expect(replay.statusCode).toBe(403);
    expect(replay.json().error.code).toBe("ADOBE_RELAY_REPLAY");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/adobe/relay",
          headers: {
            ...signedHeaders(body, enrollment, "relay-nonce-2"),
            "x-rvs-signature": "0".repeat(64),
          },
          payload: body,
        })
      ).statusCode,
    ).toBe(403);

    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const hostile = {
      version: 1,
      command: command(enrollment.deviceId, "cmd-hostile-1"),
      accessToken: "token-secret",
      localPath: "/private/project.aep",
      prompt: "private prompt",
    };
    await app.inject({
      method: "POST",
      url: "/v1/adobe/relay",
      headers: signedHeaders(hostile, enrollment, "relay-nonce-hostile"),
      payload: hostile,
    });
    const log = warning.mock.calls.flat().join(" ");
    expect(log).not.toContain("token-secret");
    expect(log).not.toContain("/private/project.aep");
    expect(log).not.toContain("private prompt");
    warning.mockRestore();
    await app.close();
    db.close();
  });

  it("stores only bound terminal delivery metadata", () => {
    const db = prepareDb();
    const gateway = createAdobeGatewayStore(
      db,
      () => 1_000,
      "gateway-test-secret",
    );
    const enrollment = gateway.enroll("ten_platform", "Studio Mac");
    gateway.enqueue("ten_platform", command(enrollment.deviceId));
    const result = {
      version: 1 as const,
      commandId: "cmd-adobe-1",
      nonce: "nonce-cmd-adobe-1",
      sceneDigest,
      deviceId: enrollment.deviceId,
      jobId: "job-adobe-1",
      status: "SUCCEEDED" as const,
      beforeDigest: sceneDigest,
      afterDigest: sceneDigest,
      changedFields: [],
      warnings: [],
      payload: { uploadId: "upl-local-1" },
      mp4: {
        sha256: "b".repeat(64),
        codec: "h264" as const,
        profile: "High" as const,
        frameCount: 30,
        durationSeconds: 1,
        width: 320,
        height: 240,
      },
    };
    expect(() =>
      gateway.complete("ten_platform", {
        ...result,
        nonce: "nonce-tampered-result",
      }),
    ).toThrow("ADOBE_RELAY_BINDING_REJECTED");
    expect(gateway.complete("ten_platform", result).result).toEqual(result);
    expect(JSON.stringify(result)).not.toContain(".aep");
    expect(JSON.stringify(result)).not.toContain("token");
    db.close();
  });
});
