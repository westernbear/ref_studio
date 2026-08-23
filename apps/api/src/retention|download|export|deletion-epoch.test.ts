import { describe, expect, it } from "vitest"
import { createRetentionStore, advanceDeletionEpoch, assertWorkerEpoch, authorizeExpiringAccess, cleanupRetention, issueExpiringGrant, RetentionFailure, type RetentionItem } from "./retention.js"
import type { Principal } from "./auth.js"

const principal = (tenantId: string): Principal => ({ userId: "user", tenantId, roles: ["OWNER"], capabilities: [], releaseReviewer: false })
const item = (id: string, kind: RetentionItem["kind"], state: RetentionItem["state"], now: number): RetentionItem => ({ id, tenantId: "tenant-a", kind, state, createdAt: new Date(now - 1000).toISOString(), retentionUntil: new Date(now - 1).toISOString(), deletionEpoch: 0 })

describe("retention and fenced access", () => {
  it("cleans every expiring class idempotently while preserving audit and receipt history", () => {
    let now = 10_000
    const store = createRetentionStore(() => now)
    for (const kind of ["uploadPart", "failedDiagnostic", "source", "checkpoint", "preview", "delivery", "report", "export"] as const) store.items.set(kind, item(kind, kind, "READY", now))
    store.audit.push(item("audit", "source", "READY", now)); store.receipts.push(item("receipt", "source", "READY", now))
    const first = cleanupRetention(store); const second = cleanupRetention(store)
    expect(first).toBe(8); expect(second).toBe(0); expect(store.audit).toHaveLength(1); expect(store.receipts).toHaveLength(1)
  })
  it("rejects foreign, expired, failed, partial, quarantined, deleted, and direct-path access", () => {
    let now = 10_000; const store = createRetentionStore(() => now)
    const states = ["FAILED", "PARTIAL", "QUARANTINED", "DELETED"] as const
    for (const state of states) { const id = state.toLowerCase(); store.items.set(id, { ...item(id, "delivery", state, now), retentionUntil: new Date(now + 1000).toISOString() }); expect(() => issueExpiringGrant(store, principal("tenant-a"), id, new Date(now + 1000).toISOString())).toThrowError(new RetentionFailure("ARTIFACT_UNAVAILABLE")) }
    const ready = { ...item("ready", "delivery", "READY", now), retentionUntil: new Date(now + 1000).toISOString() }; store.items.set(ready.id, ready); const grant = issueExpiringGrant(store, principal("tenant-a"), ready.id, new Date(now + 1000).toISOString())
    expect(() => authorizeExpiringAccess(store, principal("tenant-b"), grant.id)).toThrowError("RESOURCE_NOT_FOUND"); expect(() => authorizeExpiringAccess(store, principal("tenant-a"), grant.id, "/private/file")).toThrowError("DIRECT_PATH_FORBIDDEN"); now += 1001; expect(() => authorizeExpiringAccess(store, principal("tenant-a"), grant.id)).toThrowError("ARTIFACT_EXPIRED")
  })
  it("advances epoch before cleanup and fences stale worker publication/download", () => {
    let now = 10_000; const store = createRetentionStore(() => now); const ready = { ...item("ready", "delivery", "READY", now), retentionUntil: new Date(now + 1000).toISOString() }; store.items.set(ready.id, ready); const grant = issueExpiringGrant(store, principal("tenant-a"), ready.id, new Date(now + 1000).toISOString()); expect(advanceDeletionEpoch(store, "tenant-a")).toBe(1); expect(() => assertWorkerEpoch(store, "tenant-a", grant.deletionEpoch)).toThrowError(new RetentionFailure("DELETION_EPOCH_STALE")); expect(() => authorizeExpiringAccess(store, principal("tenant-a"), grant.id)).toThrowError(new RetentionFailure("DELETION_EPOCH_STALE")); cleanupRetention(store)
  })
})
