# P4.5 Adobe ExtendScript readback evidence

- Bridge baseline: `108cd4612f34fba7b56203e351922ea8dd4d3b7b`
- Bridge result: `7b47c657b07b1749bda7524265bcc2b656c6196b`
- Root integration: `9289e80` (Adobe gitlink plus synchronized canonical vector only)
- Scope: `integrations/adobe-bridge` dispatcher, VM fixture/vector tests, and the authorized two-line panel result seam.
- Runtime: Bun 1.3.14, Node `node:vm` executing the installed ES3 dispatcher.

## RED

Command:

```sh
bun test test/dispatcher-readback.test.ts test/dispatcher.test.ts
```

Observed before implementation: exit 1, 2 pass / 5 fail. Every positive dispatcher scenario failed with `TypeError: RVS dispatcher/readback was not installed`, proving the previous dispatcher exposed payload-only routing and no project readback/full result.

## Binary observables

- Canonical digest: VM dispatcher SHA-256 of `abc` equals `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`; canonical project snapshot digest independently matches Node `createHash("sha256")`.
- Mutation: text creation changes before/after digest and reads back `layer:2`, kind `text`, source `Read me`.
- Composition/layers: create/update and shape/solid/camera/null/duplicate/delete produce distinct typed handles and actual state readback.
- Animation: frames 0/12/36 read back at 0/0.4/1.2 seconds with linear/easeOut/easeInOut.
- Properties/mask/effects/templates: typed property values, subtract mask vertices/closed state, Drop Shadow, and loop-cycle expression apply/remove read back from VM state.
- Lifecycle: prior command status reads `SUCCEEDED`; cancel returns terminal `CANCELLED`; render returns connector-owned safe plan; verify mismatch emits one bounded warning.
- Safety: unknown/stale handles, raw script-shaped top fields, unapproved property/effect/template, malformed/non-finite keyframes, partial batch, digest-tampered rollback all throw before mutation; snapshot remains byte/deep equal.
- Rollback: first mutation captures the working-copy snapshot; matching digest restores it; mismatch is rejected. The original AEP path is never accepted or mutated.
- Panel: dispatcher result is written unchanged, retaining actual before/after digest, changedFields, warnings, status, and payload.

## GREEN and repeatability

Command:

```sh
bun test && bun run build && bun run check && bun test && bun run build
```

Observed: exit 0. Both complete passes reported `52 pass, 0 fail, 1606 expect() calls`; both builds bundled 244 modules; contract vector, Biome, and `tsc --noEmit` passed.

Post-integration root gate:

```sh
pnpm contracts:openapi:check && pnpm typecheck
```

Observed: exit 0. OpenAPI canonical and both mirrors reported SHA-256 `95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33`; contracts/API/worker/web TypeScript builds passed.

Focused real VM command:

```sh
bun test test/dispatcher-readback.test.ts
```

Observed: exit 0, `7 pass, 0 fail, 43 expect() calls`.

Cleanup checks:

```sh
git diff --check
rg -n '(debugger;|\\[DEBUG\\]|TODO DEBUG)' scripts test
```

Observed: exit 0 / no debug artifacts. Bridge status contains only the dispatcher/result implementation and its contract/fixture/panel/vector tests.

## Hardware gate

No After Effects binary is installed in this Linux workspace. The deterministic Node VM executes the actual installed JSX and is the closest runnable product surface. Installed-AE readback, render, and AEP hash verification remain explicitly assigned to P4.8; this evidence does not claim that hardware gate.
