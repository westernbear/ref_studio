# P3.8 third stop-hook direct verification

Fresh run performed after the third completion challenge.

## Command set

1. `git ls-tree c36ee7a94a634787e2af2d05e527889f5c1ccc8e apps/worker`
2. `git -C apps/worker rev-parse HEAD`
3. `git -C apps/worker status --porcelain=v1 | wc -l`
4. `pnpm --dir apps/worker format:check`
5. `pnpm --dir apps/worker build`
6. `pnpm --dir apps/worker test --run src/partial-render-cache.test.ts src/gen-render-delivery.test.ts src/worker-job-handler.generate.test.ts`
7. `pnpm --dir apps/worker test --run`

The command group used `set -o pipefail`; a nonzero command would make the audit fail.

## Extracted direct output

```text
root_tree=160000 commit 38d859e9f18730a55b1032a969e4c07af65e0b2c apps/worker
worker_head=38d859e9f18730a55b1032a969e4c07af65e0b2c
worker_dirty_count=0
All matched files use Prettier code style!
Test Files  3 passed (3)
Tests       23 passed (23)
Test Files  36 passed | 1 skipped (37)
Tests       318 passed | 2 skipped (320)
third_audit_exit=0
```

The full 37,507-byte raw log was captured at `/tmp/tmp.Zd5p6P5C3l/p3-8-third.log` during execution with SHA-256 `e78d3e528ea8ff4c6df20bac45d3738ce84e061566c9fec935c824bc5fade716`. It contains the explicit `$ prettier`, `$ tsc`, focused `$ vitest`, and full `$ vitest` invocations.

## Judgment

- The root tree, checked independently from the current branch pointer, pins the claimed worker SHA.
- The checked worker HEAD equals that SHA and had zero porcelain entries.
- Formatting and TypeScript compilation passed.
- All 23 focused partial-render/cache/integration tests passed.
- All 318 enabled worker tests passed. The two skipped cases are explicitly opt-in pinned-Chromium tests unavailable on this host and are not reported as passes.
- Exit `0` proves no command in the pipefail group failed. No repair is required.
