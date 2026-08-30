# P4.6 third stop-hook direct verification

Fresh commands were executed for this third audit. Prior evidence was not treated as a substitute.

## Isolated committed bridge

- Root worktree: fresh detached checkout at `7c0898e96239d072ad4cf094f3a00bd89fd4f7eb`.
- Bridge: fresh local clone detached at `212aa3010dd5167243afc4bd9fb455cae9989af5`.
- Invocation: `bun install --frozen-lockfile && bun run check && bun run build && bun test`.
- Exit code: `0`.
- Frozen install: 100 packages.
- Contract vector + Biome + `tsc --noEmit`: passed, 28 files checked.
- Build: 246 modules, 1.1 MB CLI bundle.
- Tests: 59 passed, 0 failed, 1,631 assertions across 11 files.

Observed P4.6 runtime scenarios included production CLI prepare/finalize, filesystem-backed cancellation, original AEP SHA/mode preservation, actual restored-file rollback digest, path and malformed media rejection, real ffmpeg/ffprobe H.264 High QC, renderer upload-auth isolation, connector upload metadata, replay/crash recovery, and P4.5 result finalization.

## Fresh root contract/gateway run

Invocation covered targeted Prettier, contracts build, API build, Adobe contracts, Adobe gateway, DB integrity, and OpenAPI mirrors at root `7c0898e96239d072ad4cf094f3a00bd89fd4f7eb`.

- Aggregate exit code: `0`.
- Formatting: all six P4.6 root files matched.
- Adobe contracts: 5/5 passed.
- Adobe gateway: 5/5 passed, including signed result upload and replay/signature rejection.
- DB: `integrity=ok`, foreign keys valid.
- OpenAPI canonical/contracts/API SHA-256: `95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33` for all three.

Verdict: exact committed P4.6 bridge and root seams directly pass all relevant executable gates in this third independent run.
