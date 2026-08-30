# P4.5 second stop-hook reverification

This is a fresh execution. No prior report was used as proof.

## Current root and ancestry

Commands:

```sh
git rev-parse HEAD
git merge-base --is-ancestor 9289e80918fb515ae7dafae1a26b04d7650790e0 HEAD
git show --format='%H %s' --no-patch 9289e80918fb515ae7dafae1a26b04d7650790e0
git ls-tree HEAD integrations/adobe-bridge verification/contract/adobe-mcp-v1.json
```

All exited `0`.

```text
current root: 9e44babe0d4c29c511d0e9f300aa60a827fa4e07
P4.5 ancestor: 9289e80918fb515ae7dafae1a26b04d7650790e0 feat(adobe): integrate project readback results
Adobe gitlink: 7b47c657b07b1749bda7524265bcc2b656c6196b
canonical blob: 9873038ed18dc087ebe196f44679814b9511b84e
```

The current root advanced by an unrelated `apps/worker` commit after P4.5. The verified P4.5 integration remains an ancestor and the Adobe gitlink is unchanged.

The committed and working canonical contract hashes are identical:

```text
735d54193b81cae4f19dba64fe156f986fbe6e336c5b80942cc6943e305058b1
```

## Root OpenAPI contract check

Command:

```sh
node scripts/contracts/openapi.mjs --check
```

Exit: `0`

```json
{"status":"verified","canonicalSha256":"95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33","contractsMirrorSha256":"95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33","apiMirrorSha256":"95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33"}
```

## Fresh focused Adobe execution

Command:

```sh
bun test test/dispatcher-readback.test.ts test/dispatcher.test.ts test/panel.test.ts test/transports.test.ts
bun run check
bun run build
```

All exited `0`.

```text
20 pass
0 fail
283 expect() calls
Ran 20 tests across 4 files.
Checked 24 files. No fixes applied.
Bundled 244 modules
cli.js 1.0 MB
```

Observed scenarios included canonical SHA-256, real VM mutation/readback, composition/layer/keyframe/mask/effect/expression operations, terminal cancel, safe rollback, digest tamper/no-mutation rejection, all 25 golden vectors over stdio/relay, and unchanged panel result propagation.

## Integrity

`git diff --check` passed for both root and bridge. The previous evidence file is non-empty (2702 bytes). This new file records the second independent command execution.

Conclusion: P4.5 remains verified in the current root at bridge SHA `7b47c657b07b1749bda7524265bcc2b656c6196b`. Installed After Effects hardware execution is still explicitly outside P4.5 and remains P4.8.
