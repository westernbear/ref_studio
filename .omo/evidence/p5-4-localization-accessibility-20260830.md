# P5.4 localization, accessibility, and responsive evidence

## Scope

- Added APG-style `aria-controls` / reciprocal `aria-labelledby` relationships for mobile workspace tabs and inspector tabs.
- Added roving-tab keyboard parity: Arrow/Home/End switches both mobile and inspector tabs, wraps at each boundary, and moves focus to the active tab.
- Added source contracts for the relationships and a full English/Korean workspace message-leaf parity test. Existing messages cover all 13 workspace states and all API remediation/error codes.

## RED then green

- `pnpm --filter @rvs/web exec vitest run test/motion-workspace-responsive.test.mjs` failed before the implementation: the expected `motion-workspace-chat-tab` ID was absent.
- After the implementation, the focused responsive/localization suite passed: 5/5.

## Automated validation (run twice after the change)

- `pnpm --filter @rvs/web test --run`: 14 files, 107 tests passed on each run.
- `pnpm --filter @rvs/web exec tsc --noEmit`: passed on each run.
- `pnpm --filter @rvs/web build`: passed twice; `/[locale]/scene-review` production route built successfully.
- `pnpm exec prettier --check ...`: passed.

## Live browser fixture

The fixture API was started by `node test/motion-workspace-browser-server.mjs` on port 3199, and production Next was started on port 3101 with `RVS_INTERNAL_API_URL=http://127.0.0.1:3199`, expected origin, and insecure test cookies. A real Chromium run authenticated with the fixture session and visited both locales.

- EN and KO at 1440, 1280, 768, 390, 375, and 320: workspace rendered (`.motion-workspace` count = 1) and `documentElement.scrollWidth <= innerWidth` was true at every width.
- Mobile keyboard: focus Chat then `ArrowRight` produced editor `aria-selected=true` in both locales.
- Desktop keyboard: focus separator then `End` produced `aria-valuenow=70` in both locales.
- Axe WCAG 2 A/AA + 2.1 A/AA: zero violations in both locales.
- Reduced motion: every element resolved to no animation or 0s/0.01ms duration in both locales.
- Console: zero errors in both locales.
- Reverification after the semantic-tab repair: on both EN and KO, ArrowLeft/ArrowRight wrap, Home selects Chat, End selects Editor, and both controlled workspace panes reported `role=tabpanel` with reciprocal tab IDs.
- Screenshot artifacts: `p5-4-browser/en-US-{1440,1280,768,390,375,320}.png` and `p5-4-browser/ko-KR-{1440,1280,768,390,375,320}.png`. Visual inspection included EN 1280 and KO 320; Korean wrapping remained legible and no horizontal scrolling occurred.

## Browse limitation

The required gstack browse executable was not installed (`NEEDS_SETUP`). Its own instructions require an explicit one-time user confirmation before installing; no setup was performed. Chromium/Playwright completed the equivalent live browser scenarios above.

## Stop-hook direct verification

At exact HEAD `f82ea33f46872b5cea8e200af51a41ea50b9a19d`, direct rerun passed:

- `pnpm --filter @rvs/web exec vitest run test/motion-workspace-model.test.mjs test/motion-workspace-responsive.test.mjs test/motion-workspace-localization.test.mjs`: 3 files / 26 tests passed.
- `pnpm --filter @rvs/web exec tsc --noEmit`: passed.
- `pnpm exec prettier --check` for all touched workspace components and tests: passed.
- `git diff --check`: passed.

The model test covers both starting tabs for ArrowLeft, ArrowRight, Home, End, and unrelated keys. The exact commit remains HEAD; no validation failure was observed.
