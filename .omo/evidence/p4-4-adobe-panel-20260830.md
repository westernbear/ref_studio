# P4.4 Adobe ScriptUI panel evidence

Verified bridge commit: `dd4b461515980ee37c9465d005fae516cb7b8543`.

## Observable scenarios

- `bun test test/panel.test.ts` executes the ScriptUI source in `node:vm`: a queued read-only command produces a `SUCCEEDED` result; mutation requires confirmation; original working-copy paths and enrolled binding mismatches are refused; stale command binding and existing mutation lock are refused.
- The panel has one scheduled 2-second poll at a time, a 100-line log cap, explicit mutation confirmation, terminal result states, and shutdown cancellation/release behavior in `scripts/panel/RVSBridgePanel.jsx`.
- `bun run check && bun run build && bun test` passed twice after the final change: 43 tests, 1532 assertions, including malformed/oversized spool, injection/unknown-field, path, replay, concurrency, and residue coverage.

## Commands

```text
cd integrations/adobe-bridge
bun run check && bun run build && bun test
bun run check && bun run build && bun test
```

Both commands exited 0. A post-commit verification also exited 0 at the SHA above: `check` inspected 23 files, `build` produced `dist/cli.js`, and `test` passed 43 tests with 1532 assertions. `git status --short` at the bridge SHA was empty. No generated `dist/` residue is tracked.

## Stop-hook direct recheck

At `dd4b461515980ee37c9465d005fae516cb7b8543`, `bun test test/panel.test.ts` exited 0: 5 tests and 17 assertions passed. The output proved VM execution of the actual `RVSBridgePanel.jsx` for success, explicit mutation confirmation, original-path/enrollment rejection, and command-binding/mutation-lock rejection. `git status --short` emitted no bridge worktree entries.
