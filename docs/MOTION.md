# Motion graphics developer docs

Pinned toolchain for the motion-complete worktree. Run gates offline except the authenticated Adobe relay.

## Versions

| Tool             | Pin / note                                           |
| ---------------- | ---------------------------------------------------- |
| Node             | as required by root `packageManager` / engines       |
| pnpm             | `11.20.0` (`packageManager` field)                   |
| Bun              | Adobe bridge (`integrations/adobe-bridge`)           |
| Chrome           | worker preflight pin (Scene Package / Native render) |
| ffmpeg / ffprobe | worker media QC path                                 |
| Blender          | pinned image digest in Blender capability admission  |
| After Effects    | 2024 / 2025 / 2026 (P4.8 hardware gate)              |

## Native authoring quick start

```bash
pnpm install
pnpm --filter @rvs/contracts test
pnpm --filter @rvs/api test --run
pnpm --filter @rvs/web build
```

Create or open a job with verified motion authoring enabled, then use the creator workspace chat/canvas/inspector. Native remains the default backend.

## Local Adobe fixture walkthrough

```bash
cd integrations/adobe-bridge
bun run check
bun test
bun run build
```

Signed installer (P4.7):

```bash
bun test test/installer.test.ts
```

Real After Effects readback, original-AEP invariance, and per-version screenshots are **P4.8** and require installed AE. Until that gate passes, UI/admin Adobe controls stay locked.

## Contract reference

- Motion/Adobe/SceneSpec contracts: `packages/contracts/src/`
- OpenAPI generation: `pnpm contracts:openapi` / `pnpm contracts:openapi:check`
- Error envelope: `SafeErrorSchema` (`code`, `message`, `causeCategory`, `remediation`, `docsUrl`, `correlationId`, `details`, optional `safePredecessor`)
- Resource budgets: `RESOURCE_BUDGETS` in `packages/contracts/src/resource-budgets.ts`
- Redaction: `redactSensitive` in `packages/contracts/src/redact.ts`

## Migrations

Motion SQL lives under `apps/api/database/migrations`:

| File                               | Additive columns / tables                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `021_motion_provider_canaries.sql` | tenant/provider/model canary rows                                             |
| `022_motion_plan_metadata.sql`     | `plan_digest`, `predecessor_version`, `artifact_digest`, `predicate_ids_json` |
| `025_motion_knowledge_rewrite.sql` | first-party card prose and sources; same 15 domain ids                        |

Fresh DB: open the API database helper (tests use `openApiDatabase(":memory:")`). Upgraded DB: apply pending files in order. Do not rewrite applied history.

```bash
pnpm --filter @rvs/api test --run src/durable-state.test.ts
```

## Offline gate matrix

Run without network except an explicitly authenticated Adobe relay:

```bash
pnpm format:check
pnpm typecheck
pnpm contracts:openapi:check
pnpm --filter @rvs/contracts test
pnpm --filter @rvs/api test --run
pnpm --filter @rvs/web test --run
pnpm --filter @rvs/worker test --run
cd integrations/adobe-bridge && bun run check && bun test
```

## Observability dashboard

`GET /admin/motion-observability` (SUPER_ADMIN) returns the in-process event/metric ring plus `MOTION_OBSERVABILITY_DASHBOARD`. Static copy: `docs/motion-observability-dashboard.json`.

## Error-code index

Human messages and remediations are defined in `packages/contracts/src/errors.ts`. Deep links use `/docs/errors#<CODE>` (for example `/docs/errors#VERSION_CONFLICT`). UI maps codes through `apps/web/messages/{en-US,ko-KR}.json` → `MotionWorkspace.errors.*` and appends API `remediation` as the next step.

## `$browse` / manual QA guide

```bash
GSTACK_CHROMIUM_NO_SANDBOX=1
# production web build + real API fixtures
# exercise desktop 1440/1280, tablet 768, mobile 390/375, 320 px
# EN/KO, reduced motion, keyboard splitter, scene edits, conflict/retry,
# render/downloads, Adobe disabled vs enrolled
```

Store evidence under `.omo/evidence/motion-complete-browse-<timestamp>/`.

## Related docs

- `docs/OPERATIONS.md` — operations
- `docs/HANDOFF.md` — handoff package
- `docs/RECOVERY.md` — recovery
- Plan: `.omo/plans/motion-graphics-ai-completion-v2.md` (canonical copy may live on the main worktree)

## Observability

API process emits redacted JSON lines on stdout:

- `channel: "motion.event"` — lookup/canary/plan/operations/verification/adobe signals via `emitMotionEvent`
- `channel: "motion.metric"` — counters/histograms via `sampleMotionMetric`

Sink is installed in `createApiServer`. Contracts catalog: `packages/contracts/src/motion-observability.ts`.

## Provider canary

Authoring calls `ensureFreshMotionToolCanary` with `providerMotionLookupCanaryAdapter` before exposing `motion.lookup`. The adapter sends a schema-shaped `motion.lookup` call (`query: "opacity"`) and validates the structured card. Admins can force a run with `POST /admin/motion-provider-canaries/run` (idempotency key required). Secrets are never stored.
