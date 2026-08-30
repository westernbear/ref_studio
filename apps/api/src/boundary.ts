import { createHash, randomBytes } from "node:crypto";
import type {
  ErrorCode,
  SafeError,
} from "../../../packages/contracts/src/errors.js";
import { normalizeError } from "../../../packages/contracts/src/errors.js";
import type { Principal } from "./auth.js";

export type FencedResource = {
  readonly tenantId: string;
  readonly deletionEpoch?: number;
};
export type BoundaryFailure = {
  readonly code: Extract<
    ErrorCode,
    | "TENANT_BOUNDARY_BYPASS"
    | "RESOURCE_NOT_FOUND"
    | "DELETION_EPOCH_STALE"
    | "ROLE_NOT_PERMITTED"
  >;
};
export type FencedAccess = {
  readonly principal: Principal;
  readonly resource: FencedResource;
  readonly tenantId: string;
  readonly deletionEpoch: number;
};
export type RestrictedAudit = {
  readonly action: string;
  readonly userId: string;
  readonly tenantId: string | null;
  readonly decision: "DENIED";
};
export const requestPersistence = Symbol("requestPersistence");
export type PersistenceRequest = {
  [requestPersistence]?: true;
};

export const correlationId = (): string =>
  `cor_${randomBytes(12).toString("base64url")}`;
export const requestHash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function fenceRequest(
  principal: Principal,
  tenantHeader: string | undefined,
): BoundaryFailure | null {
  if (!tenantHeader || principal.tenantId !== tenantHeader)
    return { code: "TENANT_BOUNDARY_BYPASS" };
  return null;
}

export function fenceResource(
  principal: Principal,
  tenantHeader: string | undefined,
  resource: FencedResource | undefined,
  expectedEpoch: number | undefined,
): FencedAccess | BoundaryFailure {
  const requestFailure = fenceRequest(principal, tenantHeader);
  if (requestFailure) return requestFailure;
  if (!resource || resource.tenantId !== principal.tenantId)
    return { code: "RESOURCE_NOT_FOUND" };
  if (expectedEpoch !== undefined && resource.deletionEpoch !== expectedEpoch)
    return { code: "DELETION_EPOCH_STALE" };
  return {
    principal,
    resource,
    tenantId: principal.tenantId,
    deletionEpoch: resource.deletionEpoch ?? expectedEpoch ?? 0,
  };
}

export function requireCapability(
  principal: Principal,
  capability: string,
): BoundaryFailure | null {
  return principal.capabilities.includes(capability)
    ? null
    : { code: "ROLE_NOT_PERMITTED" };
}

export function recordDenied(
  audit: (event: RestrictedAudit) => void,
  action: string,
  principal: Principal | undefined,
  tenantId: string | null,
): void {
  audit({
    action,
    userId: principal?.userId ?? "unknown",
    tenantId,
    decision: "DENIED",
  });
}

export type IdempotencyRecord = {
  readonly tenantId: string | null;
  readonly key: string;
  readonly requestHash: string;
  readonly response: readonly [number, SafeError | Record<string, unknown>];
  readonly createdAt: string;
};

export class IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();
  private readonly pending = new Map<string, Promise<IdempotencyRecord>>();

  snapshot(): readonly (readonly [string, IdempotencyRecord])[] {
    return [...this.records];
  }

  hydrate(records: readonly (readonly [string, IdempotencyRecord])[]): void {
    this.records.clear();
    for (const [key, record] of records) this.records.set(key, record);
  }

  replayOrReserve(
    scope: string,
    key: string,
    hash: string,
    tenantId: string | null,
    response: readonly [number, SafeError | Record<string, unknown>],
    now = new Date(0).toISOString(),
  ): IdempotencyRecord {
    const identity = `${scope}:${tenantId ?? "release"}:${key}`;
    const existing = this.records.get(identity);
    if (existing) {
      if (existing.requestHash !== hash) throw new Error("INVALID_REQUEST");
      return existing;
    }
    const record = {
      tenantId,
      key,
      requestHash: hash,
      response,
      createdAt: now,
    };
    this.records.set(identity, record);
    return record;
  }

  execute(
    scope: string,
    key: string,
    hash: string,
    tenantId: string | null,
    action: () => readonly [number, SafeError | Record<string, unknown>],
    now = new Date(0).toISOString(),
  ): IdempotencyRecord {
    const identity = `${scope}:${tenantId ?? "release"}:${key}`;
    const existing = this.records.get(identity);
    if (existing) {
      if (existing.requestHash !== hash) throw new Error("INVALID_REQUEST");
      return existing;
    }
    const response = action();
    return this.replayOrReserve(scope, key, hash, tenantId, response, now);
  }

  async executeAsync(
    scope: string,
    key: string,
    hash: string,
    tenantId: string | null,
    action: () => Promise<
      readonly [number, SafeError | Record<string, unknown>]
    >,
    now = new Date(0).toISOString(),
  ): Promise<IdempotencyRecord> {
    const identity = `${scope}:${tenantId ?? "release"}:${key}`;
    const existing = this.records.get(identity);
    if (existing) {
      if (existing.requestHash !== hash) throw new Error("INVALID_REQUEST");
      return existing;
    }
    const pending = this.pending.get(identity);
    if (pending) {
      const record = await pending;
      if (record.requestHash !== hash) throw new Error("INVALID_REQUEST");
      return record;
    }
    const execution = action().then((response) =>
      this.replayOrReserve(scope, key, hash, tenantId, response, now),
    );
    this.pending.set(identity, execution);
    try {
      return await execution;
    } finally {
      this.pending.delete(identity);
    }
  }
}

export function safeEnvelope(
  error: unknown,
  id: string,
  options?: Parameters<typeof normalizeError>[2],
): { readonly error: SafeError } {
  return { error: normalizeError(error, id, options) };
}
