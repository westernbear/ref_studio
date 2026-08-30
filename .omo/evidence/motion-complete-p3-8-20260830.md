# P3.8 verified partial-beat render evidence

- Recorded: 2026-08-30T19:35:58+09:00
- Root commit: `c36ee7a94a634787e2af2d05e527889f5c1ccc8e`
- Worker commit: `38d859e9f18730a55b1032a969e4c07af65e0b2c`
- Worker baseline: `2c61ceffce8d56c3f63f8230c0aa17baaa430647`

## RED

`pnpm test --run src/gen-render-delivery.test.ts -t "re-renders only"`
failed on the baseline with `expected [30, 30] to deeply equal [30, 15]`, proving the second delivery still captured every frame.

## Observable scenarios

| Scenario | Invocation | Binary observable |
| --- | --- | --- |
| Changed beat only | `pnpm test --run src/gen-render-delivery.test.ts` | capture counts `[30,15,30]`; partial changed render uses 15 frames and its 30 canonical hashes exactly equal an independent full render |
| Dependency invalidation | `pnpm test --run src/partial-render-cache.test.ts` | image digest rerenders its beat; transition rerenders that beat and downstream beats; audio/runtime/compiler changes fall back full |
| Untrusted cache | same | missing, malformed, duplicate/ambiguous, missing frame, symlink and hash mismatch never reuse cached output |
| Cancellation and bounds | same | aborted or hash/resource-invalid commit leaves the prior manifest byte-identical; per-frame 32 MiB and per-job 2 GiB limits apply |
| Worker integration | `pnpm test --run src/worker-job-handler.generate.test.ts` | tenant/job-scoped SHA-256 cache path is passed to gen-render; cancellation publishes no artifact |
| Timing and memory | gen-render focused test | full report contains per-beat elapsed milliseconds and RSS plus total elapsed/RSS |
| CPU contention | focused three-file suite while a bounded SHA-256 load loop ran | 23/23 passed, no cache divergence |

## Repeated verification

- Focused suite: 23/23 passed repeatedly, including after formatting and under CPU load.
- Full worker suite after the P3.6/P3.7 namespace reconciliation: 318 passed, 2 explicitly skipped, twice.
- `pnpm format:check`: passed repeatedly.
- `pnpm build`: passed repeatedly.
- New production modules measured at 46, 221 and 110 nonblank/non-comment LOC; the new test module is exactly 250.
- Worker worktree was clean immediately after commit.

## Environment boundary

The real generated-scene Chromium fixture could not run on this host because `/opt/chrome/chrome` and `/opt/rvs/fonts/WantedSansVariable.ttf` are absent. Real ffmpeg/AAC/video worker fixtures did run in the full suite. The pinned-image Chrome determinism gate remains covered by the existing container fixture; P3.8 adds full-vs-partial frame-byte hash equivalence at the render-delivery boundary.

## Cleanup

All test cache directories used `mkdtemp` and were recursively removed in `finally`. The bounded CPU-load process was killed and waited. No test cache or render workspace was retained.
