# P3.6 final gate review

- recommendation: APPROVE
- reviewed worker SHA: `c2543b3b4f2580dbfa54a0a6f5d1316e24fee082`
- reviewed root integration SHA: `101b3daa6aec7934b2fe7c0db3335d8ddb239ab5`

## Original intent

Ship the plan's P3.6 Blender/3D capability: a real pinned Blender image/version and CPU fixture-gated capability, a bounded local/embedded-only SHA-256 GLB contract, deterministic script-free rendering, and a typed still/frame sequence routed through the existing Native package and verification pipeline. An unavailable runtime must fail closed before generation and must not flatten the request.

## Desired outcome

An object-form 3D request renders only when the exact registered runtime and fixture predicate are present; every admitted GLB and texture is content-addressed and within the exact resource budget; Blender runs with static deterministic settings and cancellation cleanup; the resulting typed frame follows the existing Native path.

## User outcome review

The reworked artifact satisfies the requested outcome. The exact container digest resolves locally, the checked-in CPU fixture rendered twice under the locked-down container and produced the registered canonical digest both times, both prior GLB boundary failures now reject, and the focused tests/build/format gates pass. Missing capability still stops before Hi3DGen and the object-form route has no flat fallback.

## Blockers

None.

## Prior blockers reverified

- `P3.6-GLB-SHA256-TEXTURES`: direct mismatched URI/content probe now returns `URI_MISMATCH_REJECTED GLB_CONTRACT_REJECTED:texture-hash`.
- `P3.6-EXACT-RESOURCE-BUDGET`: the original 236-byte GLB plus 1024-byte texture under a 336-byte limit now returns `TOTAL_BYTES_REJECTED ... GLB_RESOURCE_BUDGET_EXCEEDED:bytes`.
- `P3.6-PINNED-BLENDER-IMAGE-FIXTURE`: `pnpm blender:fixture` exits 0 after two real renders and reports `lscr.io/linuxserver/blender@sha256:d1d01373e76c2dc678cb20dd38af4416daaa6ae583fa2458faa54e4f10d0c1b2`, CPU, and canonical digest `cbc57b7c9e48b413bf2f0aabed5849117c70550f8a94783f21cbe6e147da407e`. Local image inspection reports the same RepoDigest.

## Checked artifacts and commands

- Plan: `/home/singlerr/ref_studio/.omo/plans/motion-graphics-ai-completion-v2.md`, P3.6 lines 528-537.
- Submitted evidence (treated as untrusted): `/home/singlerr/ref_studio/.omo/evidence/motion-complete-p3-6-20260830T183800KST.md`.
- Diff: worker `5f79119..c2543b3`; root commit `101b3daa`.
- `pnpm exec vitest run src/blender-capability.test.ts src/blender-glb-contract.test.ts src/self-hosted-3d-material-provider.test.ts src/worker-config.test.ts`: 4 files, 39 tests passed.
- `pnpm format:check`: passed.
- `pnpm build`: passed.
- Focused cancellation test: passed; before/after `/tmp/rvs-hi3dgen-*` sets equal (`TEMP_CLEANUP_OK`).
- `pnpm blender:fixture`: passed with the exact registered image, Blender 5.2.1 CPU, two equal canonical frame hashes, no network, read-only root, 2 CPUs, 4 GiB memory, 256 PIDs, and bounded tmpfs.
- Worker status at `c2543b3`: clean. Root `101b3daa` is current, changes only `apps/worker`, and points the gitlink to `c2543b3`; unrelated API/Adobe shared-worktree changes remain unstaged.
- Static review confirmed `--background`, `--factory-startup`, `--disable-autoexec`, `--python-exit-code 1`, fixed CPU, seed, 128 samples, adaptive sampling off, denoising off, one thread, fixed camera/lights/output settings, five-minute timeout, and `finally` cleanup.
- Static/dataflow review confirmed missing capability is checked before the Hi3DGen client, and `BlenderRenderResult.frames[0]` is returned by the existing object-form Native material provider without a flat-image fallback.
- Direct adversarial probes re-ran the exact previously failing mismatched SHA URI and aggregate local texture byte cases; both reject.
- `remove-ai-slops`/`programming` pass: the two added regression cases protect observable trust-boundary behavior and are not tautological or implementation-mirroring. The final reviewability-only refactor changes only the construction of the same four-string `ALLOWED_EXTENSIONS` set and reduces `blender-glb-contract.ts` to exactly 250 pure LOC.

## Evidence gaps

- No separate code-review report or manual QA matrix artifact was supplied; this gate directly performed those checks and executed the real fixture surface.
- The fixture command emits the final structured identity/digest record but not each intermediate render hash separately. Its source compares both hashes and the successful exit proves equality to the registered digest.
