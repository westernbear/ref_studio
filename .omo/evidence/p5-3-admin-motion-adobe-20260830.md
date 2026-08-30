# P5.3 Admin motion and Adobe operations evidence

## Scope and trust boundaries

- Root worktree: `/home/singlerr/ref_studio-motion-complete`
- Branch: `motion-graphics-complete-v2`
- Production fields are assembled from the immutable motion scene head, live workflow artifact/runtime state, and tenant-scoped Adobe device/command rows.
- Responses never include command JSON, result JSON, provider keys, relay secrets, local paths, raw prompts, or AEP bytes.
- Mutations use the existing admin authentication, tenant assignment, CSRF, idempotency, and audit path. State preconditions are enforced before a result is returned.

## Binary scenarios

1. Admin read/filter: `GET /admin/jobs?backend=adobe&capability=opacity&commandState=QUEUED` returned exactly the seeded `job_admin_motion`; the panel rendered scene/plan/capability integrity values, Adobe device and command state.
2. Real retry: signed-in browser clicked `Retry Adobe command`; SQLite `adobe_commands.status` changed from `FAILED` to `QUEUED`, the retry control disappeared, and the refreshed detail reported `QUEUED`.
3. False success: `command-succeeded/retry` returned HTTP 400 in `admin-mutation.test.ts`; no allowed audit event was created.
4. Tenant/auth boundary: assigned ops fixture succeeds only for `tenant-a`; mismatched command/device IDs fail before mutation. An unauthenticated live admin request returned HTTP 403.
5. Audit: all four successful motion/Adobe actions produced both the in-memory event and the production persistence callback; the focused test observed four persisted event IDs.
6. Responsive: `$browse` ran with `GSTACK_CHROMIUM_NO_SANDBOX=1`. At 320×800, `scrollWidth=clientWidth=320`; controls, detail fields, and action buttons remained reachable.

## Automated verification

- API focused suite twice: `30/30` each (`admin-read.test.ts`, `admin-mutation.test.ts`).
- Web focused suite twice: `12/12` each (`admin-components.test.mjs`, `admin-proxy-routes.test.mjs`).
- API full suite twice: `39 files, 457 tests` each.
- Web full suite twice: `12 files, 97 tests` each.
- `pnpm format:check`: pass.
- `pnpm typecheck`: contracts/API/worker/web pass.
- `pnpm contracts:openapi:check`: all three copies SHA-256 `95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33`.
- `pnpm --filter @rvs/api db:verify`: integrity OK, foreign keys valid.
- `pnpm --filter @rvs/web build`: production build pass.

## Browser artifacts

- `.omo/evidence/p5-3-admin-desktop.png`: signed-in desktop filters and empty state.
- `.omo/evidence/p5-3-admin-320.png`: empty-state 320px layout.
- `.omo/evidence/p5-3-admin-action-success.png`: live Adobe command after successful retry (`QUEUED`).
- `.omo/evidence/p5-3-admin-data-320.png`: full motion/Adobe detail at 320px without document overflow.

The earlier `.omo/evidence/p5-3-admin-action-result.png` intentionally records the RED browser failure that exposed a missing web proxy allowlist entry. The proxy route list and its API parity test were then updated; the success artifact above is the post-fix result.
