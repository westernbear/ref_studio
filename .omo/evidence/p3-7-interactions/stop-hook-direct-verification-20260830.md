# P3.7 stop-hook direct verification

Verified directly on 2026-08-30 after the first completion claim.

## Exact revisions

- Current root: `596401f97539a05f1d95b17e7c77b5cf7d7df8a0`
- Current worker: `38d859e9f18730a55b1032a969e4c07af65e0b2c`
- `git merge-base --is-ancestor 0e068bd HEAD`: exit 0
- `git -C apps/worker merge-base --is-ancestor db91c12 HEAD`: exit 0

The later worker SHA contains concurrent P3.8 work; the P3.7 worker commit remains an ancestor.

## Direct commands and results

| Scenario | Invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| Worker typed/offline interactions | `pnpm --filter @rvs/worker test --run src/native-scene-package.test.ts` | PASS, 25/25 tests | terminal output, this receipt |
| Creator/package parity and responsive contract | `pnpm --filter @rvs/web test --run test/scene-interactions.test.mjs test/motion-workspace-responsive.test.mjs` | PASS, 10/10 tests | terminal output, this receipt |
| Worker compile | `pnpm --filter @rvs/worker build` | `tsc`, exit 0 | current worker tree |
| Creator type/build | `pnpm --filter @rvs/web exec tsc --noEmit`; `pnpm --filter @rvs/web build` | exit 0; Next compile PASS; 21/21 static pages | current root tree |
| Changed-file formatting | `pnpm exec prettier --check ...P3.7 files` | `All matched files use Prettier code style!` | current trees |
| Offline package integrity | import and call `verifyNativeScenePackage(.omo/evidence/p3-7-interactions/native-package)` | `native-package verification PASS` | `native-package/manifest.json` |
| Browser receipt semantics | parse JSON and assert keyboard after=`translate(10 0)`, Delete before=after, every target ≥44, creator PATCH=200, no mobile overflow, no console errors | `browser receipt assertions PASS` | `browser-observations.json` |
| Screenshot integrity | `file native-focus.png creator-desktop.png creator-320-editor.png` | valid PNG: 1280×720, 1280×720, 320×568 | named PNG files |

## Artifact hashes re-read during this verification

- `browser-observations.json`: `10063091fcdd7bc7e7c4772fd356e03ae1ce334d4715f172c8f58f7d08594d66`
- `native-focus.png`: `08077e5b4bb23b93d587100a8991c862161280778fb852a7291e815f32776db1`
- `native-package/manifest.json`: `4f55ea45b95ce9cd0a60be1e50afadcfc04c78b6791341160b252872b231816b`

## Verdict

PASS. The directly rerun focused tests, compilers, production web build, formatting, package verifier, receipt assertions, ancestry checks, and image signature checks all exited successfully. No P3.7 failure was observed.
