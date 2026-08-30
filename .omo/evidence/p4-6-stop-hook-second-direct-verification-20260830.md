# P4.6 second stop-hook direct verification

This is a fresh execution. No prior report or gate verdict was used as proof.

## Shared-worktree discovery

The shared Adobe bridge had a concurrent uncommitted change in `test/installer.test.ts`. A direct `bun run check` exited 1 on formatting, and focused `tsc --noEmit` exited 2 because that concurrent test imported a not-yet-exported installer symbol. These failures were not attributed to P4.6 and were not hidden or modified.

## Isolation procedure

1. Created detached root worktree `/tmp/rvs-p4-6-root-KpYyxL` at `7c0898e96239d072ad4cf094f3a00bd89fd4f7eb`.
2. The public submodule remote did not yet contain `212aa3010dd5167243afc4bd9fb455cae9989af5`; remote checkout failed with `not our ref`.
3. Added the existing local bridge repository as an isolation-only remote, fetched the exact object, and detached at `212aa3010dd5167243afc4bd9fb455cae9989af5`.
4. Confirmed the bridge worktree was clean and used the real root layout required by `scripts/check-contract-vector.mjs`.

One earlier bridge-only temp worktree invocation failed because the contract checker correctly could not find the root-level canonical vector. It was not counted.

## Exact isolated invocation

Working directory: `/tmp/rvs-p4-6-root-KpYyxL/integrations/adobe-bridge`

Command: `bun install --frozen-lockfile && bun run check && bun run build && bun test`

Recorded output and judgment:

- Exit code: `0`
- Frozen install: 100 packages, no lockfile mutation.
- Contract vector, Biome, TypeScript: passed; 28 files checked.
- Build: 246 modules, `dist/cli.js` 1.1 MB.
- Tests: 59 passed, 0 failed, 1,631 assertions, 11 files.
- Runtime scenarios passed: production CLI prepare/finalize cancellation; original AEP invariance; actual rollback file digest; path traversal and false MP4 rejection; H.264 High real ffmpeg/ffprobe QC; connector upload auth absent in renderer child; crash/restart/replay/cancel cleanup; P4.5 render-plan finalization.

## Root evidence retained from the same exact root revision

The immediately preceding fresh direct root run at `7c0898e96239d072ad4cf094f3a00bd89fd4f7eb` produced exit 0 for full API 458/458, Adobe contracts 5/5, contracts/API builds, DB integrity/foreign keys, formatting, and all three OpenAPI mirrors. Raw command results are summarized in `p4-6-stop-hook-direct-verification-20260830.md`.

Verdict: exact committed P4.6 source passes its full bridge gate in an isolated production-layout worktree. The only shared-worktree failure belongs to an uncommitted concurrent installer task and remains untouched.
