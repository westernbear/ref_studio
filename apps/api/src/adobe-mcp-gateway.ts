import { createHmac, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  AdobeCommandEnvelopeV1Schema,
  AdobeCommandResultV1Schema,
  type AdobeCommandEnvelopeV1,
  type AdobeCommandResultV1,
} from "../../../packages/contracts/src/adobe.js";
import { canonicalJson } from "../../../packages/contracts/src/canonical-json.js";
import { z } from "zod";

const KEY_LIFETIME_MS = 86_400_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;

const DeviceRows = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["ENROLLED", "REVOKED"]),
    createdAtMs: z.number().int().nonnegative(),
    lastSeenAtMs: z.number().int().nonnegative().nullable(),
  }),
);
const KeyRow = z.object({
  id: z.string(),
  deviceId: z.string(),
  tenantId: z.string(),
  notBeforeMs: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().positive(),
  revokedAtMs: z.number().int().nonnegative().nullable(),
});
const CommandRow = z.object({
  id: z.string(),
  deviceId: z.string(),
  jobId: z.string(),
  status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
  resultJson: z.string().nullable(),
});

export class AdobeRelayFailure extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "AdobeRelayFailure";
  }
}

const isUniqueNonce = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes("UNIQUE constraint failed: adobe_relay_nonces");

export type AdobeGatewayStore = ReturnType<typeof createAdobeGatewayStore>;

export const createAdobeGatewayStore = (
  db: Database.Database,
  now: () => number,
  masterSecret = "test-only-adobe-relay-secret",
) => {
  const secretFor = (keyId: string): string =>
    createHmac("sha256", masterSecret).update(keyId).digest("hex");

  const enroll = (
    tenantId: string,
    name: string,
    existingDeviceId?: string,
  ) => {
    const timestamp = now();
    const deviceId = existingDeviceId ?? `device-${randomUUID()}`;
    const keyId = `key-${randomUUID()}`;
    const expiresAtMs = timestamp + KEY_LIFETIME_MS;
    db.transaction(() => {
      if (existingDeviceId === undefined)
        db.prepare(
          "INSERT INTO adobe_devices(id,tenant_id,name,status,created_at_ms) VALUES (?,?,?,'ENROLLED',?)",
        ).run(deviceId, tenantId, name, timestamp);
      else {
        const changed = db
          .prepare(
            "UPDATE adobe_devices SET name=? WHERE id=? AND tenant_id=? AND status='ENROLLED'",
          )
          .run(name, deviceId, tenantId).changes;
        if (changed !== 1)
          throw new AdobeRelayFailure("ADOBE_DEVICE_NOT_FOUND");
        db.prepare(
          "UPDATE adobe_device_keys SET revoked_at_ms=? WHERE tenant_id=? AND device_id=? AND revoked_at_ms IS NULL",
        ).run(timestamp, tenantId, deviceId);
      }
      db.prepare(
        "INSERT INTO adobe_device_keys(id,tenant_id,device_id,not_before_ms,expires_at_ms) VALUES (?,?,?,?,?)",
      ).run(keyId, tenantId, deviceId, timestamp, expiresAtMs);
    })();
    return {
      version: 1 as const,
      deviceId,
      keyId,
      secret: secretFor(keyId),
      expiresAtMs,
    };
  };

  const list = (tenantId: string) =>
    DeviceRows.parse(
      db
        .prepare(
          "SELECT id,name,status,created_at_ms AS createdAtMs,last_seen_at_ms AS lastSeenAtMs FROM adobe_devices WHERE tenant_id=? ORDER BY created_at_ms,id",
        )
        .all(tenantId),
    );

  const key = (keyId: string) => {
    const row = KeyRow.safeParse(
      db
        .prepare(
          "SELECT id,device_id AS deviceId,tenant_id AS tenantId,not_before_ms AS notBeforeMs,expires_at_ms AS expiresAtMs,revoked_at_ms AS revokedAtMs FROM adobe_device_keys WHERE id=?",
        )
        .get(keyId),
    );
    return row.success
      ? { ...row.data, secret: secretFor(row.data.id) }
      : undefined;
  };

  const consumeNonce = (
    deviceId: string,
    keyId: string,
    nonce: string,
  ): boolean => {
    const timestamp = now();
    const recent = z.number().parse(
      db
        .prepare(
          "SELECT count(*) FROM adobe_relay_nonces WHERE key_id=? AND consumed_at_ms>=?",
        )
        .pluck()
        .get(keyId, timestamp - RATE_WINDOW_MS),
    );
    if (recent >= RATE_LIMIT)
      throw new AdobeRelayFailure("ADOBE_RELAY_RATE_LIMIT");
    try {
      const inserted = db
        .prepare(
          "INSERT INTO adobe_relay_nonces(key_id,nonce,consumed_at_ms) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM adobe_device_keys WHERE id=? AND device_id=?)",
        )
        .run(keyId, nonce, timestamp, keyId, deviceId).changes;
      return inserted === 1;
    } catch (error) {
      if (isUniqueNonce(error)) return false;
      throw error;
    }
  };

  const enqueue = (tenantId: string, command: AdobeCommandEnvelopeV1) => {
    const parsed = AdobeCommandEnvelopeV1Schema.parse(command);
    const commandJson = canonicalJson(parsed);
    const timestamp = now();
    db.transaction(() => {
      const bound = db
        .prepare(
          "SELECT 1 FROM adobe_devices JOIN jobs ON jobs.tenant_id=adobe_devices.tenant_id WHERE adobe_devices.tenant_id=? AND adobe_devices.id=? AND adobe_devices.status='ENROLLED' AND jobs.id=?",
        )
        .get(tenantId, parsed.deviceId, parsed.jobId);
      if (bound === undefined)
        throw new AdobeRelayFailure("ADOBE_RELAY_BINDING_REJECTED");
      const existing = db
        .prepare("SELECT command_json FROM adobe_commands WHERE id=?")
        .pluck()
        .get(parsed.commandId);
      if (existing !== undefined) {
        if (existing !== commandJson)
          throw new AdobeRelayFailure("ADOBE_COMMAND_REPLAY_MISMATCH");
        return;
      }
      db.prepare(
        "INSERT INTO adobe_commands(id,tenant_id,device_id,job_id,command_json,status,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?,'QUEUED',?,?)",
      ).run(
        parsed.commandId,
        tenantId,
        parsed.deviceId,
        parsed.jobId,
        commandJson,
        timestamp,
        timestamp,
      );
    })();
    return {
      version: 1 as const,
      commandId: parsed.commandId,
      deviceId: parsed.deviceId,
      jobId: parsed.jobId,
      status: "QUEUED" as const,
      result: null,
    };
  };

  const status = (tenantId: string, commandId: string) => {
    const row = CommandRow.safeParse(
      db
        .prepare(
          "SELECT id,device_id AS deviceId,job_id AS jobId,status,result_json AS resultJson FROM adobe_commands WHERE tenant_id=? AND id=?",
        )
        .get(tenantId, commandId),
    );
    if (!row.success) throw new AdobeRelayFailure("ADOBE_COMMAND_NOT_FOUND");
    const result: AdobeCommandResultV1 | null =
      row.data.resultJson === null
        ? null
        : AdobeCommandResultV1Schema.parse(JSON.parse(row.data.resultJson));
    return {
      version: 1 as const,
      commandId: row.data.id,
      deviceId: row.data.deviceId,
      jobId: row.data.jobId,
      status: row.data.status,
      result,
    };
  };

  return { enroll, list, key, consumeNonce, enqueue, status };
};
