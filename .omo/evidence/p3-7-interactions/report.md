# P3.7 typed interaction path evidence

- Date: 2026-08-30 Asia/Seoul
- Root product commits: `c950419` (creator parity), `0e068bd` (worker target-size gitlink)
- Worker commits: `c298fcc` (typed interactions), `db91c12` (actual 44 px SVG hit targets)
- Scope: Native offline Scene Package and creator `SceneCanvas`

## Success criteria and direct observations

| Scenario | Invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| RED, broad event/source injection | `pnpm test --run src/native-scene-package.test.ts` before implementation | 2 failures; `createNativeInteractionModel is not a function` | terminal attempt at 19:21 KST |
| Typed allowlist and deterministic state | worker focused test, twice | 24/24 PASS twice; initial target `headline`; pointer/keyboard/focus present; injected `source` and unsupported key reject | `apps/worker/src/native-scene-package.test.ts` |
| Package/creator parity | web focused tests, twice | 10/10 PASS twice; Shift+ArrowRight is `{x:10,y:0}` on both surfaces | `apps/web/test/scene-interactions.test.mjs` |
| Worker compile and formatting | `pnpm build`; Prettier on three changed worker files | exit 0; all matched | worker SHAs above |
| Web compile/build | `pnpm --filter @rvs/web exec tsc --noEmit`; `pnpm --filter @rvs/web build` | exit 0; Next compiled and generated 21/21 pages | root SHA `c950419` |
| Offline pointer/focus/keyboard | `$browse` with `GSTACK_CHROMIUM_NO_SANDBOX=1` on package `index.html` | Tab focuses `headline`, outline `solid`; Shift+Right changes transform `0→10`; Delete leaves `10`; pointer selects `hero-image` | `native-desktop.png` |
| Offline actual target size | browser `getBoundingClientRect()` | `headline=400×100`, `hero-image=44×44`, `closer=400×100` | `native-desktop.png` |
| Offline reduced motion | set the page-owned `MediaQueryList.matches=true`, dispatch `change`, click Play | reduced `true`; control remains `Play` | package `index.html` |
| Offline no network/eval source | browser scripts/network/console | external scripts `[]`; only local HTML/font requests, both 200; no console errors; CSP `default-src 'none'`; unit source scan rejects `eval`/`new Function`/HTTP | package manifest and browser log |
| Creator real pointer/keyboard/API path | live Next fixture on `127.0.0.1:3117`, `$browse` no-sandbox, click canvas target, Shift+Right | `PATCH /motion-scene → 200`; history Version 2; target `666×44`; `touch-action:none`; hover handler false | `creator-desktop.png` |
| Creator focus/mobile/touch | 320×568, activate Editor tab, focus real target | target `222×44`; focus outline `solid 2px`; scroll width `320`; no console errors | `creator-320-editor.png` |
| Unsupported events | Delete in offline package; strict Zod parsing in both reducers | transform and state unchanged; wheel/Delete/source/negative target return null | focused tests and browser attrs |
| Determinism/integrity | build package twice in unit test; verify manifest | byte-identical manifest/index; package verifier PASS | `native-package/manifest.json` |

## Artifact hashes

- `native-desktop.png`: `a8d99da8b1eee2ddf11e7015035a6be3b3574d8e87cfb222ae3133e78cd9aa5b`
- `native-320.png`: `74b5ee70e49beb4c337f489ee36325a257c6767b6f359fc3f25ac0ab6871f1f8`
- `creator-desktop.png`: `08e927059ed142e2445c5f92b811cc4d314cf4f3d341afe65d671d6f8ea2431d`
- `creator-320-editor.png`: `5f4f1d1d181eec4917626a3d10165810876d49e562c3846dafb971b18cb63fa4`
- `native-package/manifest.json`: `4f55ea45b95ce9cd0a60be1e50afadcfc04c78b6791341160b252872b231816b`

## Adversarial and cleanup receipt

- Rejected/no-op classes: unknown event kind, unknown keyboard key, injected `source`, negative target index, unknown element target, action not present in generated allowlist, external URL, active SVG content, and `eval`/function construction.
- `$browse` initially confirmed host Chromium sandbox failure; the required no-sandbox run used the documented `GSTACK_CHROMIUM_NO_SANDBOX=1` switch.
- The API fixture and Next server were stopped with SIGINT. The pre-fix package was moved to `/tmp/p3-7-native-package-stale-20260830` for recoverability.
- Concurrent P3.8 changes advanced the shared worker/root HEAD after the exact P3.7 commits. P3.7 did not stage, revert, or commit those paths.
