# P4.5 Adobe readback gate review

- recommendation: APPROVE
- reviewed bridge SHA: `7b47c657b07b1749bda7524265bcc2b656c6196b`
- reviewed root SHA: `9289e80918fb515ae7dafae1a26b04d7650790e0`

## Original intent and desired outcome

Implement all 25 versioned Adobe dispatcher tools with strict argument/property allowlists, canonical SHA-256 project snapshots before and after execution, actual state readback, bounded result metadata, terminal cancel, safe render planning and working-copy rollback. The ScriptUI panel must persist the dispatcher result unchanged, and hostile inputs must fail before project mutation. The bridge contract must remain in parity with the root canonical contract.

## User outcome review

The bridge implementation is executable and meets the assigned P4.5 dispatcher/readback behavior in the deterministic Node `vm` AE fixture. Root commit `9289e809...` integrates only the synchronized canonical mirror and the gitlink to the reviewed bridge SHA. The repository's semantic contract gate passes.

## Blockers

None in the bridge commit.

No parent handoff remains for P4.5.

## Reproduced evidence

- `bun run check && bun test && bun run build`: PASS, 52 tests, 1,606 assertions, build exit 0.
- Focused dispatcher/panel/transport tests: PASS, 20 tests, 283 assertions.
- All 25 golden commands execute through the installed JSX dispatcher in `node:vm` and local/cloud dispatch results agree.
- Canonical SHA-256 known vector and independent Node hash comparison pass.
- Mutation readback covers compositions, text/shape/solid/camera/null, duplicate/delete, typed properties/batch, keyframes, mask, effect/template, expression apply/remove, verify, render plan, cancel and rollback.
- Adversarial cases cover unknown fields/handles/properties/effects/templates, raw script-shaped input, malformed/non-finite keyframes, atomic batch failure, and digest-tampered rollback with unchanged fixture state.
- Panel result preservation test passes for full status/digest/changedFields/warnings/payload.
- `git diff --check 7b47c65^ 7b47c65`: PASS; bridge worktree clean at the reviewed SHA.
- Root commit `9289e809...` contains exactly two paths: `integrations/adobe-bridge` and `verification/contract/adobe-mcp-v1.json`; its gitlink resolves to `7b47c657...`.
- Root `pnpm contracts:openapi:check && pnpm typecheck`: PASS at `9289e809...`.
- Unrelated dirty `apps/worker` state and untracked evidence files are present in the shared worktree but are absent from commit `9289e809...`.

## Direct remove-ai-slops/programming pass

- No `as any`, `as unknown`, TypeScript suppression, skipped/only tests, debug residue, or deletion-only tests found in the changed scope.
- Tests assert observable dispatcher state and independent digests rather than mirroring production output.
- The 485-line ES3 dispatcher and 430-line readback test are large, but the dispatcher has an explicit AE single-file runtime constraint and size alone does not violate a stated P4.5 success criterion.

## Evidence gaps and notes

- Real proprietary After Effects execution is not available in this Linux environment and remains explicitly assigned to P4.8; this is a note, not a P4.5 blocker under the provided VM-fixture assignment.
- No separate code-review report was supplied for this exact SHA. The direct gate pass above covers the required programming and overfit/slop criteria.
