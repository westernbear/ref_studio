# P4.4 stop-hook raw verification

Working directory: `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge`.

Executed command:

```text
git rev-parse HEAD; git status --short; bun run check; bun run build; bun test test/panel.test.ts
```

Raw observable result:

```text
dd4b461515980ee37c9465d005fae516cb7b8543
$ node scripts/check-contract-vector.mjs && biome check . && tsc --noEmit
Checked 23 files in 27ms. No fixes applied.
$ bun build src/cli.ts --target=node --outdir=dist
Bundled 244 modules in 48ms
bun test v1.3.14
5 pass / 0 fail / 17 expect() calls
```

`git status --short` produced no line between the SHA and check command. The actual `node:vm` panel fixture exercised the installed JSX and proved: queued read-only command produces `SUCCEEDED`; mutations need confirmation; original/mismatched enrollment paths are rejected; nonce/job/device/digest binding and mutation-lock mismatch are rejected. The zero exit status is the completion judgment for this exact SHA.
