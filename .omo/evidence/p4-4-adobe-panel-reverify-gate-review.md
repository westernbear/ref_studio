# P4.4 Adobe ScriptUI panel re-verification gate

- recommendation: `APPROVE`
- reviewed SHA: `108cd4612f34fba7b56203e351922ea8dd4d3b7b`
- confidence: high

## Original intent and desired outcome

Provide a ScriptUI bridge panel with 2-second polling, Auto-run/manual execution, visible lifecycle state, bounded logs, explicit mutation confirmation, job-scoped working-copy and enrollment binding, duplicate-execution protection, and terminal cancellation that releases spool/lock state.

## User outcome review

The rework closes both prior blockers. A valid pending command now emits `QUEUED` before `RUNNING`. A shutdown invoked while dispatch is active completes the command as `CANCELLED`; the post-dispatch fence observes that the controller is no longer active and cannot overwrite cancellation with `SUCCEEDED` or `FAILED`. The mutation lock and running command are removed.

## Reproduced evidence

- Exact HEAD was `108cd4612f34fba7b56203e351922ea8dd4d3b7b`; prior rejected SHA `dd4b461515980ee37c9465d005fae516cb7b8543` is its ancestor.
- Focused `bun test test/panel.test.ts`: 6 passed, 22 assertions.
- `bun run check && bun run build && bun test` passed twice: 44 tests, 1537 assertions each run.
- Independent VM driver observed states `QUEUED → RUNNING → CANCELLED`, final result `CANCELLED`, no mutation lock, and no running command.
- Existing tests retained mutation confirmation, original AEP refusal, enrolled device/job/spool/working-copy checks, nonce/digest binding rejection, and mutation-lock refusal.
- Full suites retained malformed/oversized spool, injection/unknown field, replay, concurrency, cancellation, transport parity, installer, and residue coverage.
- Bridge worktree remained clean; commit diff check passed.
- Upstream reference remains pinned in `UPSTREAM.md` to `88d5fbf08b7ae9f015ee98e5f8c4904095cf8202` without runtime/vendored coupling.

## Checked artifacts

- `/home/singlerr/ref_studio-motion-complete/.omo/evidence/p4-4-adobe-panel-rework-20260830.md`
- `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge/scripts/panel/RVSBridgePanel.jsx`
- `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge/test/panel.test.ts`
- `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge/UPSTREAM.md`

## Slop/programming pass

- The new assertions cover observable state/result/residue and do not mirror implementation internals or pin prose.
- The three-line production change is the minimum shared-seam correction and introduces no new abstraction or dependency.
- Existing unused `TERMINAL` remains a non-blocking dead-code note; it does not violate a stated acceptance criterion.

## Residual risk

Actual After Effects ScriptUI host behavior remains outside this Linux verification environment and belongs to the planned real-AE QA gate. The `node:vm` fixture directly validates controller and panel wiring logic.
