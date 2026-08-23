# SaaS Deployment and Operations Runbook

This runbook operates the Reference Video Studio service. The active renderer is the deterministic WebGL2 browser renderer. Unreal artifacts are historical evidence only.

## Prerequisites

- Docker with permission to run the worker container.
- Node.js 24 and pnpm available to the service user.
- The pinned Chromium executable, version `151.0.7922.138`, running with ANGLE SwiftShader.
- FFmpeg and FFprobe installed and available to the service user.
- The `motions` Conda environment, including the pinned PyTorch and compiler dependencies.
- Network access restricted to approved service endpoints. Renderer jobs must not depend on external network content.
- A writable job workspace and an append-only evidence area.

Required environment variables:

```powershell
$env:CHROMIUM_BIN = 'C:\runtime\chromium\chrome.exe'
$env:FFMPEG_BIN = 'C:\runtime\ffmpeg\bin\ffmpeg.exe'
$env:FFPROBE_BIN = 'C:\runtime\ffmpeg\bin\ffprobe.exe'
```

## Deploy

1. Build the Docker image from the repository root. Include Node.js 24, pnpm, FFmpeg, FFprobe, and the `motions` Conda environment in the worker image or mount them from the approved runtime image.
2. Mount only the job workspace, evidence directory, and required media paths. Do not mount host credentials or unrelated tenant directories.
3. Start the API and worker with the same renderer sources and runtime configuration. Interactive review and PNG capture must use the same frame-indexed renderer entry point.
4. Configure Chromium to run headless with `--enable-gpu --use-angle=swiftshader`. Keep device scale, fonts, color profile, and renderer seed fixed for a deployment.
5. Run preflight before accepting jobs. A failed preflight blocks the worker instead of falling back to another browser or renderer.

FFmpeg remains responsible for final muxing, audio checks, and delivery checks. A successful browser capture alone is not a completed delivery.

## Preflight

Run the supplied PowerShell 5.1 check:

```powershell
$env:CHROMIUM_BIN = 'C:\runtime\chromium\chrome.exe'
$env:FFMPEG_BIN = 'C:\runtime\ffmpeg\bin\ffmpeg.exe'
$env:FFPROBE_BIN = 'C:\runtime\ffmpeg\bin\ffprobe.exe'
& powershell -NoProfile -File D:\motions\.omo\fixtures\plan-qa\runtime-preflight.ps1 `
  -ExpectedVersion '151.0.7922.138' -RequireAngle 'SwiftShader'
```

The check confirms `CHROMIUM_BIN` exists and reports the expected version, verifies the SwiftShader probe, and checks `pnpm`, `conda`, `ffprobe`, and the `motions` Conda environment. It must print `PASS` before the worker is enabled. `FFMPEG_BIN` and `FFPROBE_BIN` must also resolve to executable files before a render or mux job starts.

## Monitoring

- Monitor API health, worker liveness, queue age, job failure rate, render duration, FFmpeg mux failures, and disk usage.
- Monitor the append-only T1 to T6 receipt chain. A downstream gate cannot be treated as approved unless its predecessor is approved by the required actor. Platform staff must not rewrite receipts or approve T2 to T6.
- Retain explicit gate states: approved, rejected-history, proposed, and unverified. Never report progress from rendered-frame count.
- Run the pilot determinism check on each runtime or renderer deployment. Repeated renders of the same frame and the fixed pilot frame set must match the pilot contract. Investigate any mismatch before accepting tenant jobs.
- Alert on missing or unconsumed Motion IR owners, VFX owner mismatches, external network access, missing fonts, WebGL2 failure, shader failure, or frame identity mismatch.
- Track tenant ownership, cancellation, deletion epoch, quarantine status, and artifact lifecycle in job logs. Logs must not contain secrets.

## Backup/Recovery

- Back up the editable HTML/JS/WebGL scene specification, compiler outputs, runtime configuration, media manifests, gate receipts, and operational scripts.
- Keep `recovery-report.json` as the canonical recovery result. Do not replace it with a Markdown recovery report.
- Restore into a different path, isolated from the source package and active job workspace. The approved report uses `D:\motions\.omo\evidence\final-handoff-package\restored` and records `pathIsolationCheck: true`, `noPathEscapes: true`, and `recoveryStatus: PASS`.
- Run the recovery validator, then render the fixed comparison frames from the restored path. The restored project must resolve all editable owners and preserve the approved runtime contract.
- Keep provenance and receipt references with the backup. Hashes are provenance only in this runbook and are not an additional deployment or recovery gate.

## Troubleshooting

### `RUNTIME_PREREQUISITE_MISSING`

Check that `CHROMIUM_BIN` points to an executable file, the SwiftShader headless probe succeeds, `pnpm`, `conda`, and `ffprobe` are on `PATH`, and the `motions` Conda environment exists. Also verify `FFMPEG_BIN` and `FFPROBE_BIN` before retrying the job.

### `RUNTIME_VERSION_MISMATCH`

The executable reported by `CHROMIUM_BIN` is not `151.0.7922.138`. Stop the worker, restore the approved pinned runtime, and rerun `runtime-preflight.ps1`. Do not silently substitute another Chrome build or GPU backend.

### `TENANT_BOUNDARY_BYPASS`

Quarantine the job and revoke its worker lease. Check tenant ownership on the job, input, output, receipt, and deletion-epoch records. Confirm that workspace mounts and artifact paths cannot cross tenant roots. Preserve the incident evidence, deny publication, and rotate any exposed credentials through the normal secrets process.

For stale approval, source changes, or scene changes, invalidate the approval and require explicit re-approval. For unclassified overlap, missing evidence, or unresolved owner links, fail closed instead of inventing a fallback.

## Scaling

Horizontal worker scaling is deferred until tenant fencing, quarantine, deletion epochs, append-only receipts, pilot determinism, and recovery isolation remain proven under concurrent jobs. Do not add a second renderer, loosen runtime pinning, or introduce queue fan-out that can reorder gate decisions as a scaling shortcut.

When scaling work resumes, preserve per-tenant quotas, cancellation ownership, isolated workspaces, deterministic frame inputs, bounded GPU or SwiftShader capacity, and receipt ordering. Load testing must prove these invariants before production rollout.

## Admin Operations Runbook

### Admin deployment

1. Deploy `admin-service` as a separately managed service behind the admin API gateway. Keep its runtime image, configuration, and release receipt separate from the render worker.
2. Provision the append-only audit-log store with tenant scope, actor identity, correlation ID, authorization result, safe outcome, and timestamp fields. The store must reject update and delete operations for existing records.
3. Apply the admin RBAC seed before enabling traffic. The seed must contain `super-admin`, `ops-admin`, and `viewer` roles, their allowed capabilities, and immutable tenant-scope rules from `saas-admin-panel-spec.md`.
4. Confirm that admin operations cannot approve T2 through T6, rewrite receipts, mutate render output, or bypass tenant fencing. Admin deployment must not add a new hash gate.

Required admin environment variables:

```text
ADMIN_AUDIT_RETENTION=90d
ADMIN_SESSION_TIMEOUT=30m
```

`ADMIN_AUDIT_RETENTION` controls the minimum retention period for audit records and scoped exports. `ADMIN_SESSION_TIMEOUT` controls the maximum idle session lifetime. Both values must be explicit in the deployment configuration and recorded in the deployment evidence.

### Admin preflight

- Run the standard runtime preflight before enabling the service, including the pinned Chromium and FFmpeg checks required by the main worker.
- Run the admin RBAC seed check. Verify that every required role and capability is present, role scopes are tenant-bound, forbidden T2 through T6 approval permissions are absent, and no seed grants receipt mutation or render-output mutation.
- Confirm that a denied cross-tenant request fails closed and creates only a restricted audit record. Confirm that an admin session expires according to `ADMIN_SESSION_TIMEOUT`.
- Do not enable the admin service when the RBAC seed is missing, duplicated, broader than the specification, or inconsistent with the deployed API policy.

### Admin monitoring

- Monitor audit-log growth, write failures, retention cleanup, export volume, and storage headroom. Alert before the audit-log store reaches its configured capacity.
- Monitor quarantine queue depth, oldest quarantined item age, release and retain outcomes, and repeated intake failures.
- Monitor RBAC violations, including denied requests by role, cross-tenant attempts, forbidden gate-approval attempts, receipt mutation attempts, and render-output mutation attempts.
- Monitor admin session failures, expired sessions, service health, request latency, and correlation-ID coverage. Alerts must not expose credentials, private paths, raw uploads, or other tenants' state.

### Admin backup and recovery

- Back up the audit-log store with append-only records, tenant scope, actor identity, correlation IDs, authorization results, and retention metadata intact.
- Keep backups immutable and separate from the live admin service. Test restoration into an isolated path without permitting writes to the source store.
- After restoration, verify record counts, ordering, tenant filtering, export scoping, and the absence of update or delete capability for historical records.
- Record the backup and recovery result with the same operational evidence discipline as `recovery-report.json`. A successful service restart is not proof that audit records were recovered.

### Admin troubleshooting

#### `RBAC_DENIED`

Verify the authenticated role, requested capability, immutable tenant scope, RBAC seed version, and policy loaded by `admin-service`. Do not broaden permissions as a workaround. Preserve the restricted audit record, return the safe product error, and rerun the RBAC seed check after correcting the policy or seed.

#### `TENANT_BOUNDARY_BYPASS`

Quarantine the request and revoke the associated session or worker lease. Check the tenant identifier on the request, session, job, artifact, audit record, and storage path. Confirm that caller-supplied IDs cannot override authenticated ownership. Deny publication, preserve incident evidence, and rotate exposed credentials through the normal secrets process.

#### `STALE_APPROVAL`

Stop the affected job and invalidate the stale approval. Check for source, scene, compiler, Motion IR, runtime, or product changes after the approval timestamp. Require the applicable gate to be explicitly approved again by its designated actor. Never rerun from a stale approval or rewrite the existing receipt.

### Scaling notes

Scale `admin-service` horizontally only after audit-log ordering, tenant fencing, RBAC enforcement, quarantine ownership, and session timeout behavior remain correct under concurrent requests. Use idempotency keys for admin mutations and preserve a single authoritative ordering for audit events.

Partition audit-log queries by tenant and time range, but keep writes append-only and independently durable. Scale quarantine workers with bounded concurrency and explicit ownership leases. Load testing must include concurrent denied requests, cross-tenant attempts, audit-store backpressure, queue drain, retry, quarantine release, and stale-approval invalidation before production rollout.
