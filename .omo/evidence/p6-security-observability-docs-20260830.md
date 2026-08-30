# P6 security / error / observability / docs evidence

- root worktree: `/home/singlerr/ref_studio-motion-complete`
- branch: `motion-graphics-complete-v2`
- adobe bridge SHA: `f92ab560978fd48bef5f2846181d8048384fb865`
- date: 2026-08-30T12:06Z

## P6.1 Boundary security

- Canonical `RESOURCE_BUDGETS` in `packages/contracts/src/resource-budgets.ts` (elements, operations, frames, package/ffmpeg bytes, Blender triangles, spool, relay).
- `applySceneOperations` fails closed with `RESOURCE_BUDGET_EXCEEDED` before publish.
- `redactSensitive` strips tokens/signatures/prompts/raw queries/local paths/AEP names.
- Existing tenant fencing, HTTP idempotency, and Adobe nonce replay remain the ownership/replay seams.

Focused proof:

```
pnpm --filter @rvs/contracts test
# resource-budgets + redaction + observability cases pass
```

## P6.2 Error/rescue

- `SafeErrorSchema` now requires `causeCategory`, `remediation`, `docsUrl` and optional `safePredecessor`.
- Motion/Adobe registry codes added to `ErrorCodes` with catalog messages.
- OpenAPI `SafeErrorEnvelope` regenerated (`pnpm contracts:openapi:check` verified).
- Web maps API remediation into chat as `errors.nextStep` (EN/KO).

Focused proof:

```
pnpm --filter @rvs/contracts test
pnpm --filter @rvs/web test --run motion-workspace
pnpm --filter @rvs/web exec tsc --noEmit
pnpm --filter @rvs/api test --run src/motion-scene-commands.test.ts
```

## P6.3 Observability

- `emitMotionEvent` / `sampleMotionMetric` in `packages/contracts/src/motion-observability.ts` with redacted fields and in-memory sink for tests/dashboards.

## P6.4 Developer docs

- `docs/MOTION.md` — quick start, Adobe fixture, versions, browse QA
- `docs/errors.md` — error-code index
- Linked from `apps/worker/README.md` and `integrations/adobe-bridge/README.md`

## P4.8 note

No After Effects binary on this Linux host. P4.8 remains hardware-blocked; Adobe UI stays locked until real AE evidence exists.
