# Motion Workspace Design State

## Current Objective

Implement the Stitch `stitch_ui_todo.zip` Scene Review reference as a real bidirectional motion workspace with no disconnected controls.

## Locked Decisions

- The extracted Stitch screen is the visual contract; the existing Cosmic Engineering tokens remain the implementation source.
- Existing `CompilerDialogue` remains the restore-track experience and is reused as the non-motion fallback.
- Motion chat and direct manipulation share the versioned motion-scene ETag contract.
- Native is the enabled backend. Adobe stays visibly capability-locked until connector enrollment and real AE release gates are available; no simulated connection state.
- No state manager, splitter, or canvas dependency is added.

## Source Inputs

- `.omo/drafts/motion-workspace-ui-todo.md`
- `/home/singlerr/ref_studio/stitch_ui_todo.zip`
- Extracted reference: `/tmp/ref-studio-stitch-ui.khaLQW/screen.png`
- Project design system: `DESIGN.md`, `apps/web/src/styles/tokens.css`

## Design Brief

Primary users are creators refining a generated motion scene and operators inspecting render state. The primary journey is inspect, select, adjust or describe a change, verify the new immutable version, render, and download. The interface uses the reference's near-black two-pane control-room composition without its nonfunctional search, notification, settings, or topology controls.

## Inclusive Personas

- Keyboard-only creator: can resize, switch tabs, select layers, edit properties, undo, rollback, rerender, and download without pointer-only steps.
- Screen-reader creator: receives named regions, separator values, selected layer/frame context, async status, and explicit unavailable capabilities.
- Motion-sensitive creator: receives the same state information with continuous and transform motion removed.
- Narrow-screen creator: completes the full workflow at 320px without horizontal page scrolling or lost panel state.

## Adaptive Preferences

Korean and English copy, 44px targets, visible focus, `prefers-reduced-motion`, semantic tabs, and logical layout properties are required.

## Verification Matrix

- Contract tests: ETag conflict, rollback, rerender, idempotency, previous artifact preservation.
- Component/e2e: splitter pointer and keyboard range, localStorage, mobile state, shared scene operations, action-state feedback.
- Real surface: `$browse` with `GSTACK_CHROMIUM_NO_SANDBOX=1` at 375, 768, and 1280 widths.
- Final gates: typecheck, tests, production build, react-doctor, visual QA, accessibility/persona/heuristic walkthrough, review-work.

## Design Debt Register

None accepted. Adobe connection controls remain absent while the backend capability is unavailable, rather than recorded as fake or deferred UI.
