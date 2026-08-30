# Motion graphics developer docs

Pinned toolchain for the motion-complete worktree. Run gates offline except the authenticated Adobe relay.

## Versions

| Tool | Pin / note |
| --- | --- |
| Node | as required by root `packageManager` / engines |
| pnpm | `11.20.0` (`packageManager` field) |
| Bun | Adobe bridge (`integrations/adobe-bridge`) |
| Chrome | worker preflight pin (Scene Package / Native render) |
| ffmpeg / ffprobe | worker media QC path |
| Blender | pinned image digest in Blender capability admission |
| After Effects | 2024 / 2025 / 2026 (P4.8 hardware gate) |

## Native authoring quick start

```bash
cd /home/singlerr/ref_studio-motion-complete
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

Motion-related SQL migrations live under `apps/api` migration trees (021–024 era and later). Run API migration tests with the package scripts; do not hand-edit applied migration history.

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
