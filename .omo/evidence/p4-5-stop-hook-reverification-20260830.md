# P4.5 stop-hook direct reverification

Reverification was executed directly after the first completion claim. Existing reports were not trusted as proof.

## Exact integration identity and scope

Command:

```sh
git rev-parse HEAD
git show --stat --oneline --no-renames HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git submodule status integrations/adobe-bridge
```

Exit: `0`

Observed:

```text
9289e80918fb515ae7dafae1a26b04d7650790e0
9289e80 feat(adobe): integrate project readback results
 integrations/adobe-bridge               | 2 +-
 verification/contract/adobe-mcp-v1.json | 4 ++--
integrations/adobe-bridge
verification/contract/adobe-mcp-v1.json
7b47c657b07b1749bda7524265bcc2b656c6196b integrations/adobe-bridge
```

Binary judgment: root integration contains exactly the Adobe gitlink and synchronized canonical contract. Concurrent dirty `apps/worker` and untracked evidence are not in the commit.

## Root contracts, OpenAPI, and TypeScript

Command:

```sh
pnpm contracts:openapi:check && pnpm typecheck
```

Exit: `0`

Observed:

```text
{"status":"verified","canonicalSha256":"95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33","contractsMirrorSha256":"95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33","apiMirrorSha256":"95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33"}
$ tsc --noEmit
$ tsc
$ tsc
```

Binary judgment: canonical and both OpenAPI mirrors are identical; contracts, API, worker, and web type checks/builds exited successfully.

## Adobe bridge exact-SHA gate

Working directory: `integrations/adobe-bridge`

Command:

```sh
git rev-parse HEAD
bun run check
bun test
bun run build
```

Exit: `0`

Observed:

```text
7b47c657b07b1749bda7524265bcc2b656c6196b
Checked 24 files. No fixes applied.
52 pass
0 fail
1606 expect() calls
Ran 52 tests across 9 files.
Bundled 244 modules
cli.js 1.0 MB
```

The passing run included:

- all 25 strict golden command/result vectors through local stdio and authenticated relay;
- canonical project SHA-256 and actual mutation readback;
- composition and all supported layer mutations;
- expression, keyframe, property, mask, effect, render-plan, cancel, and rollback behavior;
- malformed/replay/digest-tamper rejection without project mutation;
- panel preservation of dispatcher before/after digests and changed fields;
- immutable-original-AEP CLI scenario.

Binary judgment: P4.5 is verified at root `9289e80918fb515ae7dafae1a26b04d7650790e0` and bridge `7b47c657b07b1749bda7524265bcc2b656c6196b`.

## Remaining external gate

An After Effects binary is unavailable in this Linux environment. No installed-AE hardware claim is made; that remains the explicit P4.8 gate.
