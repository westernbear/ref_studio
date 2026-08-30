# P4.4 Adobe ScriptUI panel gate review

- recommendation: `REJECT`
- reviewed SHA: `dd4b461515980ee37c9465d005fae516cb7b8543`
- repository: `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge`
- confidence: high

## Original intent

Ship an Adobe ScriptUI bridge panel that preserves the upstream-inspired 2-second polling and Auto-run/manual controls while enforcing job-scoped working-copy, enrollment, command-binding, mutation confirmation, single-mutation, cancellation, and bounded status/log behavior.

## Desired outcome

The panel visibly and correctly represents `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, and `CANCELLED`; never mutates an original AEP; rejects mismatched device/job/nonce/spool bindings; prevents duplicate scheduling; and makes shutdown cancellation terminal while releasing the mutation lock.

## User outcome review

The SHA implements the 2-second poll, Auto-run toggle, manual run-next button, mutation confirmation, current-state field, 100-line log cap, working-copy suffix check, panel/command binding checks, and a mutation lock. The full bridge check/build/test pipeline passed twice at the exact SHA. However, two observable lifecycle requirements are not met: queued work is never displayed as `QUEUED`, and a shutdown during an active dispatch writes `CANCELLED` but immediately overwrites it with `SUCCEEDED` when dispatch returns.

## Blockers

1. `violatedCriterion: P4.4-status-display`
   - Observation: the UI/controller never emits or displays a valid command's `QUEUED` lifecycle state. `QUEUED` appears only in an input guard/refusal message. The declared `TERMINAL` map is unused, and the panel tests assert only `RUNNING` and `SUCCEEDED`.
   - Evidence pointer: `scripts/panel/RVSBridgePanel.jsx:4,28,35-39,45-54`; `test/panel.test.ts:138-160`; `rg -n "TERMINAL|QUEUED|RUNNING|SUCCEEDED|FAILED|CANCELLED" ...` output from this review.

2. `violatedCriterion: P4.4-shutdown-cancellation`
   - Observation: re-entrant shutdown during `RVSDispatch` calls `complete(..., "CANCELLED")`, releases the lock and removes the running file, but execution resumes in `runNext` and calls `complete(..., "SUCCEEDED")`. The final result is `SUCCEEDED`, so cancellation is not terminal.
   - Evidence pointer: `/tmp/verify-p4-4-panel.ts` executed against the exact source produced states `["cmd-panel-01 RUNNING","cmd-panel-01 CANCELLED","CANCELLED","cmd-panel-01 SUCCEEDED"]` and final result status `SUCCEEDED`; production flow is at `scripts/panel/RVSBridgePanel.jsx:35-39`.

## Checked artifacts

- `/home/singlerr/ref_studio-motion-complete/.omo/evidence/p4-4-adobe-panel-20260830.md`
- `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge/scripts/panel/RVSBridgePanel.jsx`
- `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge/test/panel.test.ts`
- `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge/UPSTREAM.md`
- exact commit diff and ancestry for `dd4b461515980ee37c9465d005fae516cb7b8543`

## Reproduced evidence

- `bun run check && bun run build && bun test` twice: exit 0 both times; 43 tests, 1532 assertions per run.
- Existing suites covered strict contract parsing, malformed/oversized spool data, injection/unknown fields, path/replay/concurrency/cancel/residue behavior.
- Panel VM fixture covered working-copy suffix, successful read-only execution, mutation confirmation, enrollment mismatch, command binding mismatch, and existing lock refusal.
- Independent VM adversarial scenario reproduced the non-terminal shutdown cancellation defect.
- Bridge worktree was clean at the exact SHA before and after validation; `git diff ... --check` passed.
- `UPSTREAM.md` pins reference commit `88d5fbf08b7ae9f015ee98e5f8c4904095cf8202` and states it is neither a runtime dependency nor vendored source.

## Remove-AI-slops and programming review

- Blocking false confidence: `panel fixture exposes working-copy and terminal-state contracts` does not exercise any terminal state and does not cover `FAILED`, `CANCELLED`, shutdown, scheduling, or the log bound.
- Unused production declaration: `TERMINAL` is dead code.
- No prohibited type escapes or prompt-string assertions were added in the TypeScript test diff.
- The panel source remains compact, but multiple unrelated lifecycle responsibilities are compressed into one-line functions; this is a maintenance note, not a stated-criterion blocker.

## Exact evidence gaps

- No passing observable test proves that `QUEUED` is displayed.
- No passing observable test proves that shutdown cancellation cannot be overwritten by later success/failure completion.
- No focused test directly asserts the 100-line log bound or duplicate schedule prevention; source inspection supports both, so these are notes rather than blockers.

## Residual risk

Actual After Effects ScriptUI execution is not available in this Linux environment. `node:vm` exercises the controller and UI wiring contract but cannot validate host-specific File/Folder/scheduleTask behavior. This remains a later real-AE QA gate.
