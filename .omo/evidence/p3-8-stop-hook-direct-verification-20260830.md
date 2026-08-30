# P3.8 stop-hook direct verification

Verified directly after the completion claim against the committed artifacts.

## Exact identity output

```text
root_commit=c36ee7a94a634787e2af2d05e527889f5c1ccc8e
root_gitlink=160000 commit 38d859e9f18730a55b1032a969e4c07af65e0b2c apps/worker
worker_commit=38d859e9f18730a55b1032a969e4c07af65e0b2c
worker_head=38d859e9f18730a55b1032a969e4c07af65e0b2c
worker_status=
```

Judgment: the root commit contains the claimed worker commit exactly, and the worker tree was clean during verification.

## Commands and output

From `/home/singlerr/ref_studio-motion-complete`:

```text
pnpm --dir apps/worker format:check
All matched files use Prettier code style!

pnpm --dir apps/worker build
$ tsc

pnpm --dir apps/worker test --run src/partial-render-cache.test.ts src/gen-render-delivery.test.ts src/worker-job-handler.generate.test.ts
Test Files  3 passed (3)
Tests       23 passed (23)

pnpm --dir apps/worker test --run
Test Files  36 passed | 1 skipped (37)
Tests       318 passed | 2 skipped (320)
Duration    10.95s

exit_status=0
```

The two skips are the existing opt-in real-Chromium determinism cases; this host lacks `/opt/chrome/chrome` and the pinned `/opt/rvs/fonts/WantedSansVariable.ttf`. Real ffmpeg/AAC tests ran and passed.

## Criterion judgment

- Changed-beat rendering, full-vs-partial canonical frame-hash equality, cache invalidation/fallback, cancellation without publication, resource bounds, telemetry, and worker-handler wiring are executed by the 23-test focused suite.
- The entire worker suite passed at the exact worker SHA, so the partial-render path introduced no detected worker regression.
- Build and format checks passed.
- No failed criterion remains. The unavailable opt-in Chrome fixture is explicitly environmental and was not represented as executed.

## Raw-run provenance

- Verification timestamp context: 2026-08-30 Asia/Seoul.
- The direct command used `set -o pipefail`; the combined command exited `0` only after identity, format, build, focused tests, and full tests all succeeded.
- Temporary raw log was `/tmp/tmp.TLHR0wVlpY/verification.log`; the durable decision-relevant output is reproduced above.
