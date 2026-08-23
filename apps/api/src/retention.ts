import type { Principal } from "./auth.js";

export const RETENTION_MS = {
  uploadPart: 24 * 60 * 60 * 1000,
  failedDiagnostic: 7 * 24 * 60 * 60 * 1000,
  source: 30 * 24 * 60 * 60 * 1000,
  checkpoint: 30 * 24 * 60 * 60 * 1000,
  preview: 30 * 24 * 60 * 60 * 1000,
  delivery: 30 * 24 * 60 * 60 * 1000,
  report: 30 * 24 * 60 * 60 * 1000,
  export: 90 * 24 * 60 * 60 * 1000,
  adminSession: 30 * 60 * 1000,
} as const;

export type RetentionKind = keyof typeof RETENTION_MS;
export type RetentionState =
  "PENDING" | "READY" | "FAILED" | "PARTIAL" | "QUARANTINED" | "DELETED";
export type RetentionItem = {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: RetentionKind;
  readonly createdAt: string;
  readonly retentionUntil: string;
  state: RetentionState;
  readonly deletionEpoch: number;
  readonly privatePath?: string;
};
export type ExpiringGrant = {
  readonly id: string;
  readonly artifactId: string;
  readonly tenantId: string;
  readonly deletionEpoch: number;
  readonly expiresAt: string;
};
export type RetentionStore = {
  readonly items: Map<string, RetentionItem>;
  readonly grants: Map<string, ExpiringGrant>;
  readonly deletionEpochs: Map<string, number>;
  readonly audit: RetentionItem[];
  readonly receipts: RetentionItem[];
  readonly adminSessions: Map<
    string,
    { readonly tenantId: string; readonly expiresAt: string }
  >;
  readonly now: () => number;
};

export const createRetentionStore = (
  now: number | (() => number) = Date.now(),
): RetentionStore => ({
  items: new Map(),
  grants: new Map(),
  deletionEpochs: new Map(),
  audit: [],
  receipts: [],
  adminSessions: new Map(),
  now: typeof now === "function" ? now : () => now,
});

export class RetentionFailure extends Error {
  readonly name = "RetentionFailure";
  constructor(
    readonly code:
      | "RESOURCE_NOT_FOUND"
      | "DELETION_EPOCH_STALE"
      | "ROLE_NOT_PERMITTED"
      | "ARTIFACT_EXPIRED"
      | "ARTIFACT_UNAVAILABLE"
      | "DIRECT_PATH_FORBIDDEN",
  ) {
    super(code);
  }
}

export function currentDeletionEpoch(
  store: RetentionStore,
  tenantId: string,
): number {
  return store.deletionEpochs.get(tenantId) ?? 0;
}

export function advanceDeletionEpoch(
  store: RetentionStore,
  tenantId: string,
): number {
  const next = currentDeletionEpoch(store, tenantId) + 1;
  store.deletionEpochs.set(tenantId, next);
  for (const item of store.items.values())
    if (item.tenantId === tenantId && item.deletionEpoch < next)
      item.state = "DELETED";
  return next;
}

export function cleanupRetention(store: RetentionStore): number {
  const now = store.now();
  let removed = 0;
  for (const [id, item] of store.items) {
    if (item.state !== "DELETED" && Date.parse(item.retentionUntil) > now)
      continue;
    store.items.delete(id);
    removed += 1;
  }
  for (const [id, grant] of store.grants)
    if (
      Date.parse(grant.expiresAt) <= now ||
      grant.deletionEpoch !== currentDeletionEpoch(store, grant.tenantId)
    )
      store.grants.delete(id);
  for (const [id, session] of store.adminSessions)
    if (Date.parse(session.expiresAt) <= now) store.adminSessions.delete(id);
  return removed;
}

export function issueExpiringGrant(
  store: RetentionStore,
  principal: Principal,
  artifactId: string,
  expiresAt: string,
): ExpiringGrant {
  const item = store.items.get(artifactId);
  if (!item || item.tenantId !== principal.tenantId)
    throw new RetentionFailure("RESOURCE_NOT_FOUND");
  if (item.state !== "READY" || Date.parse(item.retentionUntil) <= store.now())
    throw new RetentionFailure("ARTIFACT_UNAVAILABLE");
  const grant: ExpiringGrant = {
    id: `grant_${artifactId}`,
    artifactId,
    tenantId: principal.tenantId,
    deletionEpoch: currentDeletionEpoch(store, principal.tenantId),
    expiresAt,
  };
  store.grants.set(grant.id, grant);
  return grant;
}

export function authorizeExpiringAccess(
  store: RetentionStore,
  principal: Principal,
  grantId: string,
  requestedPath?: string,
): RetentionItem {
  if (requestedPath) throw new RetentionFailure("DIRECT_PATH_FORBIDDEN");
  const grant = store.grants.get(grantId);
  const item = grant ? store.items.get(grant.artifactId) : undefined;
  if (!grant || !item || grant.tenantId !== principal.tenantId)
    throw new RetentionFailure("RESOURCE_NOT_FOUND");
  if (
    Date.parse(grant.expiresAt) <= store.now() ||
    Date.parse(item.retentionUntil) <= store.now()
  )
    throw new RetentionFailure("ARTIFACT_EXPIRED");
  if (grant.deletionEpoch !== currentDeletionEpoch(store, principal.tenantId))
    throw new RetentionFailure("DELETION_EPOCH_STALE");
  if (item.state !== "READY")
    throw new RetentionFailure("ARTIFACT_UNAVAILABLE");
  return item;
}

export function assertWorkerEpoch(
  store: RetentionStore,
  tenantId: string,
  epoch: number,
): void {
  if (currentDeletionEpoch(store, tenantId) !== epoch)
    throw new RetentionFailure("DELETION_EPOCH_STALE");
}
