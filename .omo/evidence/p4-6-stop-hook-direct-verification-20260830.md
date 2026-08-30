# P4.6 stop-hook direct verification

Verified directly on 2026-08-30. Existing evidence and prior gate verdicts were not used as proof.

## Exact revisions

- Root `git rev-parse HEAD`: `7c0898e96239d072ad4cf094f3a00bd89fd4f7eb`
- `git submodule status integrations/adobe-bridge`: `212aa3010dd5167243afc4bd9fb455cae9989af5`
- Bridge `git rev-parse HEAD`: `212aa3010dd5167243afc4bd9fb455cae9989af5`

## Initial invalid invocation

The first combined command was run from inside the bridge while requesting the root pathspec `integrations/adobe-bridge`. It exited 1 with `pathspec ... did not match`. This was a verifier working-directory error, not accepted as product evidence. The checks below were rerun from their correct repositories.

## Bridge direct run

Invocation: `bun run check && bun run build && bun test` in `integrations/adobe-bridge`.

Binary observables:

- Exit code: `0`
- Contract-vector check, Biome, and `tsc --noEmit`: passed; 28 files checked.
- Build: `dist/cli.js`, 1.1 MB, 246 modules.
- Tests: `59 pass`, `0 fail`, `1631 expect() calls`, 11 files.
- Filesystem lifecycle observations exercised: CLI prepare/finalize cancellation, original AEP unchanged, safe rollback, restored-file digest, traversal rejection, crash recovery, replay/cancel overlap cleanup.
- Real delivery observations exercised: system ffmpeg output accepted only after ffprobe reported H.264 High, 30 frames, 1 second, 320x240; false MP4 rejected.
- Credential boundary observation: a real renderer child process exited successfully only when `RVS_ADOBE_UPLOAD_AUTH` was absent from its environment.

## Root direct run

Invocations and exact observables:

- Targeted Prettier check: exit `0`, all six P4.6 root files formatted.
- Contracts build: exit `0`.
- API build: exit `0`.
- Adobe contract tests: `5 passed`, exit `0`.
- Full API: `39 passed` files, `458 passed` tests, exit `0`.
- DB verification: exit `0`, `integrity=ok`, `foreignKeysValid=true`, WAL and foreign keys enabled.
- OpenAPI check: exit `0`; canonical, contracts mirror, and API mirror all equal `95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33`.

The first root aggregate invocation reached the 30-second tool boundary during API tests and returned no exit code. It was not counted. The full API command was rerun alone and produced exit code `0` with 458/458 passing.

## Worktree judgment

Bridge product worktree was clean. Root contains a concurrent modification to `apps/web/test/motion-workspace-responsive.test.mjs` and unrelated untracked evidence artifacts. P4.6 did not modify or clean them. No P4.6 product residue is present outside the exact commits above.

Verdict: P4.6 is directly reproduced at the stated exact revisions; all relevant executable gates returned exit code 0.
