# P4.6 Adobe working-copy delivery evidence

- Root commit: `7c0898e96239d072ad4cf094f3a00bd89fd4f7eb`
- Bridge commit: `212aa3010dd5167243afc4bd9fb455cae9989af5`

## Observable scenarios

1. Working-copy lifecycle: production CLI `prepare` copies `source.aep` to `<root>/<job>/project.rvs-working-copy.aep` and captures a safe snapshot; CLI `finalize` binds the panel result to the claimed spool command. It preserves original SHA-256 and mode, mutates only the copy, restores the named safe snapshot, returns the restored file's actual SHA-256, and rejects `../` job/output traversal. Observable: working-copy 3/3 and CLI E2E 4/4 pass.
2. Real render/QC/upload: the same test invokes system `ffmpeg`, then production `ffprobe`; observable metadata is codec `h264`, profile `High`, 30 frames, 1.0 seconds, 320x240. The connector-owned authorization reaches only the local upload adapter, is explicitly deleted from the renderer child environment, and is absent from returned JSON. False-success text output is rejected before upload.
3. P4.5 readback integration: `bun test test/execution.test.ts` consumes the panel render plan, renders/probes/uploads locally, and returns only upload ID plus MP4 metadata. Observable: 1/1 pass.
4. Cloud result seam: `pnpm --filter @rvs/api test --run src/adobe-mcp-gateway.test.ts` signs and posts `/v1/adobe/results`; the gateway stores a strict result with no AEP bytes/path/token and rejects nonce/scene/device/job mismatch. Observable: 5/5 pass.
5. Crash/restart/replay/cancel cleanup: bridge full suite exercises filesystem-backed CLI cancel invariance, stranded running recovery, terminal replay binding, cancel/claim overlap, lease expiry, orphan transition recovery, restrictive files, and temporary-file cleanup. Observable: 58/58 pass, 1,631 assertions.

## Verification invocations

- Bridge twice: `bun run check && bun run build && bun test` -> 56 pass, 0 fail on each complete run.
- Root twice: Prettier checks; contracts/API TypeScript builds; Adobe contracts 5/5; gateway 5/5; DB `integrity=ok`, foreign keys valid; OpenAPI canonical and both mirrors SHA-256 `95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33`.
- Full API regression at exact root content: `pnpm --filter @rvs/api test --run` -> 39 files, 458 tests passed.

## Adversarial outcomes

- Original mutation: terminal assertion raises `ADOBE_ORIGINAL_CHANGED`.
- Traversal/path rebinding: rejected before copy/render.
- Missing local upload auth, invalid comp handle, non-MP4, wrong codec/profile, empty/oversized output: rejected before upload and render residue removed.
- Cloud credential/local path/AEP bytes and unknown result fields: strict result schema rejects them.
- Result replay or command/nonce/scene/device/job mismatch: rejected before durable update.

No product files remain uncommitted by P4.6; other `.omo/evidence` files are concurrent task artifacts and were not modified.
