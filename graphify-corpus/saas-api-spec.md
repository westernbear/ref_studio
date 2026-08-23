# SaaS API and data model specification

Version: 1.0. Scope: tenant-fenced creator ingest, render, review, and receipt access.

## Contract rules

- Base URL: `https://api.example.invalid`.
- Every request requires `Authorization: Bearer <token>` and `X-Tenant-Id: <tenant-id>`.
- The authenticated tenant must equal `X-Tenant-Id` and the resource tenant. Caller-supplied IDs never override this check. A mismatch fails closed as `TENANT_BOUNDARY_BYPASS` in QA and as a safe generic authorization error at the product boundary.
- Accepted input is one local MP4, 1 second through 5 minutes, constant 24, 25, 30, 50, or 60 fps, and no larger than 2 GB. Variable frame rate, unsupported codec/container, invalid magic bytes, and unsafe parsing remain quarantined.
- SHA-256 CAS identity is provenance and deduplication metadata only. It is not an approval or hash-verification gate.
- Errors return a stable `code`, safe `message`, `correlationId`, and optional field details. They never expose storage paths, raw bytes, stack traces, or another tenant's state.

## Common headers

| Header | Required | Meaning |
|---|---:|---|
| `Authorization` | yes | Authenticated user or service token. |
| `X-Tenant-Id` | yes | Immutable tenant fence for the request. |
| `Idempotency-Key` | POST only | Client retry key. Reuse returns the original result, not a second user-visible job. |
| `Content-Type` | request body | `application/json` except upload bytes or multipart upload. |

## Job states

Public lifecycle states are `QUEUED`, `PREPARING`, `RENDERING`, `COMPLETED`, `CANCELLED`, and `FAILED`.

Internal intake states may include `UPLOADING`, `VALIDATING`, `READY`, `STALE_APPROVAL`, and `CANCEL_REQUESTED`; they are never treated as completed output. `CANCEL_REQUESTED` becomes `CANCELLED` only after worker acknowledgement. Completed or cancelled attempts are immutable; retry creates a linked attempt.

| State | Meaning | Allowed next states |
|---|---|---|
| `QUEUED` | Validated job waiting for the authoritative queue. | `PREPARING`, `CANCELLED`, `FAILED` |
| `PREPARING` | Editable scene and worker inputs are being prepared. | `RENDERING`, `CANCELLED`, `FAILED` |
| `RENDERING` | Pinned browser worker renders frame-indexed output. | `COMPLETED`, `CANCELLED`, `FAILED` |
| `COMPLETED` | Delivery checks passed and artifact is publishable. | terminal |
| `CANCELLED` | Cancellation acknowledged; source remains available until retention expiry. | terminal |
| `FAILED` | Non-retryable failure or exhausted retries. | terminal; retry creates a new attempt |

## REST endpoints

### `POST /v1/uploads`

Creates an upload session. Auth: tenant fencing, tenant member with upload permission. Validation: declared MP4 type, maximum 2 GB, multipart parts are bounded, and final bytes must pass magic-byte and safe-container checks. Failed input stays in quarantine and cannot be referenced by a job.

Request JSON:

```json
{
  "filename": "reference.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 184320000
}
```

Response `201`:

```json
{
  "upload": {"id":"upl_123","tenantId":"ten_123","state":"PENDING","expiresAt":"2026-08-22T00:00:00Z"},
  "uploadUrl":"https://upload.example.invalid/upl_123",
  "requiredHeaders":{"Content-Type":"video/mp4"}
}
```

### `POST /v1/jobs`

Creates a render job from an accepted upload. Auth: tenant fencing, tenant member with job-create permission. Validation: upload belongs to the tenant and is accepted; source metadata is 1 second to 5 minutes, constant 24/25/30/50/60 fps, and at most 2 GB. The job starts at `QUEUED`. No stale approval is silently reused.

Request JSON:

```json
{
  "uploadId":"upl_123",
  "sceneId":"scene_123",
  "approvalId":"apr_123",
  "output":{"width":1080,"height":1920,"fps":30,"audio":true},
  "metadata":{"sourceInterval":{"startSeconds":0,"endSeconds":4}}
}
```

Response `202`:

```json
{
  "job":{"id":"job_123","tenantId":"ten_123","state":"QUEUED","attempt":1,"createdAt":"2026-08-21T12:00:00Z"},
  "links":{"self":"/v1/jobs/job_123","receipt":"/v1/receipts?jobId=job_123"}
}
```

### `GET /v1/jobs/:id`

Returns one tenant-owned job. Auth: tenant fencing, tenant member with job-read permission. A foreign or unknown ID returns the same safe `404` shape, never cross-tenant data.

Response `200`:

```json
{
  "id":"job_123","tenantId":"ten_123","state":"COMPLETED","attempt":1,
  "uploadId":"upl_123","sceneId":"scene_123","progress":{"framesRendered":120,"framesTotal":120},
  "artifact":{"id":"cas_delivery_123","contentType":"video/mp4","expiresAt":"2026-09-20T12:00:00Z"},
  "error":null,"createdAt":"2026-08-21T12:00:00Z","updatedAt":"2026-08-21T12:04:00Z"
}
```

### `GET /v1/receipts`

Lists append-only, tenant-scoped receipts. Auth: tenant fencing, tenant member with receipt-read permission. Query parameters: `jobId`, `gate`, `cursor`, `limit` where `limit` is 1 to 100. Receipts cannot be edited or deleted. Platform staff may operate infrastructure but cannot rewrite decisions or approve T2-T6.

Response `200`:

```json
{"items":[{"id":"rcpt_123","tenantId":"ten_123","jobId":"job_123","gate":"T5","decision":"APPROVED","actorId":"usr_123","predecessorId":"rcpt_122","artifactCasIds":["cas_delivery_123"],"createdAt":"2026-08-21T12:04:00Z"}],"nextCursor":null}
```

### `POST /v1/reviews`

Records a user review or approval event against the current job attempt. Auth: tenant fencing, authorized designated reviewer. `OWNER` and `ADMIN` may manage tenant members, quota, and cancellation, but cannot approve T2-T6. Platform roles cannot approve T2-T6. The API rejects a stale source or scene approval with `STALE_APPROVAL_UNSAFE`.

Request JSON:

```json
{"jobId":"job_123","attempt":1,"gate":"T5","decision":"APPROVED","comment":"Would use this shot."}
```

Response `201`:

```json
{"review":{"id":"rev_123","tenantId":"ten_123","jobId":"job_123","gate":"T5","decision":"APPROVED","actorId":"usr_123","createdAt":"2026-08-21T12:03:00Z"}}
```

## Error schema and codes

```json
{"error":{"code":"RUNTIME_PREREQUISITE_MISSING","message":"The render service is unavailable. Retry later.","correlationId":"cor_123","details":[]}}
```

| HTTP | Code | Fail-closed condition |
|---:|---|---|
| 400 | `INVALID_REQUEST` | Malformed JSON or missing required field. |
| 400 | `VIDEO_DURATION_OUT_OF_RANGE` | Duration is outside 1 second to 5 minutes. |
| 400 | `VIDEO_FPS_UNSUPPORTED` | FPS is not constant 24, 25, 30, 50, or 60. |
| 400 | `VIDEO_SIZE_LIMIT_EXCEEDED` | Source exceeds 2 GB. |
| 400 | `VIDEO_TYPE_INVALID` | Type, magic bytes, or safe parsing fails. |
| 401 | `AUTHENTICATION_REQUIRED` | Token absent or invalid. |
| 403 | `TENANT_BOUNDARY_BYPASS` | Authenticated tenant and resource tenant differ. |
| 403 | `ROLE_NOT_PERMITTED` | Caller cannot perform the requested review or mutation. |
| 404 | `RESOURCE_NOT_FOUND` | Resource is absent or not visible to this tenant. |
| 409 | `STALE_APPROVAL_UNSAFE` | Source or editable scene changed after approval. |
| 409 | `DELETION_EPOCH_STALE` | Work was issued before tenant deletion epoch advanced. |
| 409 | `RECEIPT_IMMUTABLE` | Existing receipt mutation attempted. |
| 422 | `UPLOAD_QUARANTINED` | Intake has not accepted the upload. |
| 422 | `OWNER_MISMATCH` | Scene or effect owner is not linked to editable AuthoringIR. |
| 422 | `UNRESOLVED_CHOICE_SKIPPED` | Required review choice is unresolved. |
| 423 | `TENANT_SUSPENDED` | Tenant is blocked from new work. |
| 429 | `QUOTA_EXCEEDED` | Tenant quota or rate limit exceeded. |
| 500 | `INTERNAL_ERROR` | Safe generic product-boundary failure. |
| 503 | `RUNTIME_PREREQUISITE_MISSING` | Pinned browser, font, WebGL2, or required runtime is unavailable. |
| 503 | `WORKER_TRANSIENT_FAILURE` | Retryable worker or assembly failure. |

## Data models

| Model | Required fields | Invariants |
|---|---|---|
| `Tenant` | `id`, `name`, `deletionEpoch`, `status`, `createdAt` | IDs are immutable. Every tenant-owned record stores `tenantId`. |
| `Upload` | `id`, `tenantId`, `filename`, `contentType`, `sizeBytes`, `state`, `casObjectId`, `createdAt`, `expiresAt` | Quarantine precedes acceptance. Abandoned parts expire after 24 hours. |
| `Job` | `id`, `tenantId`, `creatorId`, `uploadId`, `sceneId`, `state`, `attempt`, `deletionEpoch`, `createdAt` | Exactly one tenant. Workers re-check tenant and epoch before reads and writes. |
| `Receipt` | `id`, `tenantId`, `jobId`, `gate`, `decision`, `actorId`, `predecessorId`, `artifactCasIds`, `createdAt` | Append-only and tenant-scoped. Hashes are provenance only. |
| `CasObject` | `id`, `tenantId`, `sha256`, `contentType`, `sizeBytes`, `purpose`, `retentionUntil` | CAS references are tenant-fenced. Garbage collection removes unreferenced bytes after retention. |

## Tenant fencing and deletion

The service derives tenant identity from the authenticated token, compares it with `X-Tenant-Id`, then applies the same check to every upload, CAS object, job, receipt, quota record, download, and deletion request. Workers repeat the check before consuming inputs, writing outputs, or publishing receipts. Deleting an asset advances the tenant deletion epoch, invalidating older queued or running work. Historical receipts remain append-only; tenant references and eligible CAS bytes are removed or scheduled for cleanup.

## Example curl

```bash
curl -X POST https://api.example.invalid/v1/jobs \
  -H 'Authorization: Bearer eyJ...' \
  -H 'X-Tenant-Id: ten_123' \
  -H 'Idempotency-Key: job-create-001' \
  -H 'Content-Type: application/json' \
  -d '{"uploadId":"upl_123","sceneId":"scene_123","approvalId":"apr_123","output":{"width":1080,"height":1920,"fps":30,"audio":true}}'

curl https://api.example.invalid/v1/jobs/job_123 \
  -H 'Authorization: Bearer eyJ...' \
  -H 'X-Tenant-Id: ten_123'
```

## Admin API

Admin endpoints are operational surfaces for authenticated `super-admin`,
`ops-admin`, and `viewer` roles. Every request requires
`Authorization: Bearer <admin-token>` and `X-Tenant-Id: <tenant-id>` unless the
endpoint is a cross-tenant `super-admin` read. The authenticated role and
immutable tenant scope are checked before resource lookup. `super-admin` may
read platform-wide state, `ops-admin` is limited to assigned tenants, and
`viewer` is read-only. Caller-supplied IDs never override tenant scope.

Admin roles **cannot approve T2-T6 or rewrite receipts**. They also cannot
mutate render output, published artifacts, source artifacts, or editable
checkpoints in place. Forbidden attempts create restricted audit events and
return `ROLE_NOT_PERMITTED`.

### `GET /admin/tenants`

Auth: `super-admin` may list all tenants. `ops-admin` and `viewer` may list only
assigned tenants. Tenant scope is enforced by the authenticated role, with
optional `status`, `plan`, `cursor`, and `limit` filters.

Response `200`:

```json
{
  "items":[{"id":"ten_123","name":"Acme Studio","status":"ACTIVE","plan":"PRO","activeJobs":2,"quota":{"used":18,"limit":100},"createdAt":"2026-08-01T10:00:00Z"}],
  "nextCursor":null
}
```

### `GET /admin/tenants/:id/jobs`

Auth: `super-admin` may inspect any tenant. `ops-admin` and `viewer` require
assignment to `:id`. Tenant scope is checked before returning jobs. Query
parameters are `state`, `cursor`, and `limit`, where `limit` is 1 to 100.

Response `200`:

```json
{"tenantId":"ten_123","items":[{"id":"job_123","state":"RENDERING","attempt":1,"creatorId":"usr_123","progress":{"framesRendered":60,"framesTotal":120},"createdAt":"2026-08-21T12:00:00Z"}],"nextCursor":null}
```

### `POST /admin/jobs/:id/cancel`

Auth: `super-admin` may cancel any tenant job. `ops-admin` may cancel jobs for
assigned tenants. `viewer` is denied. Tenant scope and allowed states
(`QUEUED`, `PREPARING`, `RENDERING`) are checked before the worker flow.

Request JSON:

```json
{"reason":"Operator requested cancellation","expectedAttempt":1}
```

Response `202`:

```json
{"job":{"id":"job_123","tenantId":"ten_123","state":"CANCEL_REQUESTED","attempt":1},"auditEventId":"aud_123"}
```

### `GET /admin/receipts`

Auth: `super-admin` may inspect all receipt chains. `ops-admin` and `viewer` may
inspect only authorized tenant scope. Query parameters are `tenantId`, `jobId`,
`gate`, `cursor`, and `limit`. Results are append-only inspection records.

Response `200`:

```json
{"items":[{"id":"rcpt_123","tenantId":"ten_123","jobId":"job_123","gate":"T5","decision":"APPROVED","actorId":"usr_123","predecessorId":"rcpt_122","createdAt":"2026-08-21T12:04:00Z"}],"nextCursor":null}
```

### `GET /admin/audit-log`

Auth: `super-admin` may query the platform log. `ops-admin` and `viewer` receive
only records in their assigned or authorized tenant scope. Query parameters are
`tenantId`, `actorId`, `eventType`, `jobId`, `outcome`, `from`, `to`, `cursor`,
and `limit`. The query itself records `AUDIT_LOG_VIEWED`.

Response `200`:

```json
{"items":[{"id":"aud_123","eventType":"JOB_CANCEL_REQUESTED","tenantId":"ten_123","jobId":"job_123","actorId":"adm_123","authorization":"ALLOW","correlationId":"cor_123","outcome":"ACCEPTED","createdAt":"2026-08-21T12:05:00Z"}],"nextCursor":null}
```

### `GET /admin/quarantine`

Auth: `super-admin` may inspect all quarantined intake. `ops-admin` and `viewer`
may inspect only authorized tenant scope. Query parameters are `tenantId`,
`reason`, `state`, `cursor`, and `limit`. Raw bytes and private storage paths
are never returned.

Response `200`:

```json
{"items":[{"id":"upl_456","tenantId":"ten_123","state":"QUARANTINED","declaredType":"video/mp4","magicBytes":"FAIL","containerParse":"NOT_RUN","reason":"VIDEO_TYPE_INVALID","createdAt":"2026-08-21T12:06:00Z"}],"nextCursor":null}
```

### `POST /admin/quarantine/:id/release`

Auth: `super-admin` may release after intake checks pass. `ops-admin` may
release within assigned tenant scope. `viewer` is denied. Release re-runs and
records bounded type, magic-byte, size, and safe-container checks; failed checks
remain quarantined.

Request JSON:

```json
{"reason":"Checks re-run after corrected upload metadata","expectedState":"QUARANTINED"}
```

Response `200`:

```json
{"upload":{"id":"upl_456","tenantId":"ten_123","state":"ACCEPTED","acceptedAt":"2026-08-21T12:08:00Z"},"auditEventId":"aud_124"}
```

### `GET /admin/billing/:tenantId`

Auth: `super-admin` may inspect any tenant. `ops-admin` and `viewer` require
assignment to `:tenantId`; billing fields may be redacted. This endpoint never
returns payment-card data or payment secrets.

Response `200`:

```json
{"tenantId":"ten_123","plan":"PRO","billingStatus":"ACTIVE","quota":{"used":18,"limit":100,"resetAt":"2026-09-01T00:00:00Z"},"renewalAt":"2026-09-01T00:00:00Z","paymentMethod":{"type":"REDACTED"}}
```

Admin errors use the common error schema. Cross-tenant access fails closed as
`TENANT_BOUNDARY_BYPASS`; missing or hidden records use `RESOURCE_NOT_FOUND`.
Every successful mutation and denied request records an append-only audit event.
