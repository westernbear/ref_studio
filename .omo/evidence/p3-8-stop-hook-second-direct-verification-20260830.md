# P3.8 second stop-hook verification

This is a fresh verification run; no prior report was used as proof.

## Invocation

```bash
git ls-tree c36ee7a94a634787e2af2d05e527889f5c1ccc8e apps/worker
git -C apps/worker rev-parse HEAD
git -C apps/worker status --porcelain=v1 | wc -l
pnpm --dir apps/worker format:check
pnpm --dir apps/worker build
pnpm --dir apps/worker test --run --reporter=dot src/partial-render-cache.test.ts src/gen-render-delivery.test.ts src/worker-job-handler.generate.test.ts
pnpm --dir apps/worker test --run --reporter=dot
```

## Direct output

```text
root_tree=160000 commit 38d859e9f18730a55b1032a969e4c07af65e0b2c apps/worker
worker_head=38d859e9f18730a55b1032a969e4c07af65e0b2c
worker_dirty_count=0

Checking formatting...
All matched files use Prettier code style!

$ tsc

Focused:
Test Files  3 passed (3)
Tests       23 passed (23)
Duration    1.58s

Full:
Test Files  36 passed | 1 skipped (37)
Tests       318 passed | 2 skipped (320)

combined process exit code: 0
```

## Judgment

- The claimed root commit still resolves exactly to the claimed worker commit.
- The worker commit was checked with a zero-entry porcelain status.
- Formatting, compilation, the focused observable partial-render scenarios, and all non-opt-in worker tests passed in this second run.
- The only skips remain the explicit real-Chromium cases unavailable without the pinned container Chrome/font. They were not counted as passes.
- No failure was observed and no correction was required.
