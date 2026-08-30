# P4.5 third stop-hook direct verification

Fresh commands were executed for this third hook. All three command groups exited `0`.

## Immutable identities

```text
current root: 9e44babe0d4c29c511d0e9f300aa60a827fa4e07
P4.5 integration ancestor check: PASS
HEAD Adobe gitlink: 7b47c657b07b1749bda7524265bcc2b656c6196b
HEAD canonical contract blob: 9873038ed18dc087ebe196f44679814b9511b84e
HEAD canonical contract sha256: 735d54193b81cae4f19dba64fe156f986fbe6e336c5b80942cc6943e305058b1
```

Commands:

```sh
git rev-parse HEAD
git merge-base --is-ancestor 9289e80918fb515ae7dafae1a26b04d7650790e0 HEAD
git rev-parse HEAD:integrations/adobe-bridge
git rev-parse HEAD:verification/contract/adobe-mcp-v1.json
git show HEAD:verification/contract/adobe-mcp-v1.json | sha256sum
```

## Dispatcher real VM readback

Command:

```sh
bun test test/dispatcher-readback.test.ts
```

Observed:

```text
7 pass
0 fail
43 expect() calls
Ran 7 tests across 1 file.
```

The seven scenarios directly exercised canonical SHA-256, composition/layer mutation readback, expressions/status/verify/render planning, replay and digest-tamper rejection, properties/keyframes/masks/effects/templates, atomic invalid-input rejection, terminal cancel, and working-copy rollback.

## Connector, relay, panel, and immutable original

Command:

```sh
bun test test/e2e.test.ts test/transports.test.ts test/panel.test.ts
```

Observed:

```text
13 pass
0 fail
190 expect() calls
Ran 13 tests across 3 files.
```

This included original-AEP immutability, stdio MCP, all 25 authenticated relay golden vectors, and unchanged full-result propagation through the panel.

## Static and build gates

Commands:

```sh
bun run check
bun run build
node scripts/contracts/openapi.mjs --check
git diff --check
git -C integrations/adobe-bridge diff --check
```

Observed:

```text
Checked 24 files. No fixes applied.
Bundled 244 modules
cli.js 1.0 MB
OpenAPI status: verified
canonical/api/contracts SHA: 95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33
```

Judgment: P4.5 is directly verified at the current root and unchanged bridge SHA. Installed After Effects execution is not claimed and remains the separate P4.8 hardware gate.
