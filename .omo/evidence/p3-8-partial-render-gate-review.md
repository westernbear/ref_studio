# P3.8 partial-beat render gate review

- recommendation: **APPROVE**
- reviewed root commit: `c36ee7a94a634787e2af2d05e527889f5c1ccc8e`
- reviewed worker commit: `38d859e9f18730a55b1032a969e4c07af65e0b2c`
- worker baseline: `2c61ceffce8d56c3f63f8230c0aa17baaa430647`

## Original intent

Add a verified partial-beat render path only after recording full-render timing and memory. The cache must bind scene/beat/assets/runtime/compiler, reuse only unchanged beats, invalidate parent/audio/transition dependencies, assemble canonical frames equal to a full render, fall back on untrusted cache state, and never publish a cancelled or hash-divergent partial result.

## Desired outcome and user outcome review

The worker now keeps a tenant/job-scoped verified frame cache and renders only invalid beats. A two-beat observable delivery reproduced capture counts `[30, 15, 30]`; the partial result's 30 canonical frame hashes exactly equalled the independent full-render result, while the unchanged first beat retained its prior hashes. Missing/invalid/ambiguous/stale cache state fails closed to full rendering. Cancellation and resource/hash failures do not replace the prior manifest, and the job handler does not upload on cancellation. This satisfies the requested worker-visible outcome.

## Checked artifacts

- `/home/singlerr/ref_studio-motion-complete/.omo/evidence/motion-complete-p3-8-20260830.md` (treated as untrusted and reproduced)
- worker diff `2c61ceffce8d56c3f63f8230c0aa17baaa430647..38d859e9f18730a55b1032a969e4c07af65e0b2c`
- `src/partial-render-dependencies.ts`
- `src/partial-render-plan.ts`
- `src/partial-render-cache.ts`
- `src/gen-render-delivery.ts`
- `src/worker-job-handler.ts`
- corresponding three focused test files

## Reproduced evidence

- Root commit `c36ee7...` changes only the `apps/worker` gitlink from `2c61ce...` to exact worker commit `38d859...`; it is an ancestor of the current integration head. Worker HEAD remains exact `38d859...` and clean.
- Focused suite: `23/23` passed.
- TypeScript build: `pnpm build` exited 0.
- Format gate: `pnpm format:check` exited 0.
- Full worker suite: `318` passed, `2` explicitly skipped.
- A separate built-module driver changed a v2 parent element transform and observed the containing beat's `dependencyDigest` change (`5dfc97...` to `0d6b90...`), so parent/child output is invalidated at the beat granularity.
- Audio/font digests are global invalidators; transition digest changes invalidate the changed beat and every downstream beat; referenced visual asset changes invalidate their owning beat.
- Canonical input ordering is explicit for asset IDs and canonical JSON digests. Materialization iterates frames in numeric canonical order and re-hashes every source.
- Cache manifest parsing is strict. Missing/malformed, duplicate beat IDs, missing frames, range overlap, symlinks, oversized frames/jobs, and hash mismatch cannot be reused.
- Manifest replacement is atomic (`temporary` plus `rename`) and happens only after all canonical frames pass size/hash/cancellation checks. Uploads occur only after `renderGeneratedDelivery` returns.
- Telemetry reports total and per-beat elapsed milliseconds plus peak RSS.

## Direct remove-ai-slops and programming pass

No deletion-only, prose-pin, tautological, or implementation-mirroring test was found. The key integration test compares independently rendered observable frame hashes and capture counts. No new dependency, generic abstraction, `any`, suppression directive, raw debug output, or speculative API was added. New production modules remain below 250 pure LOC (`46`, `110`, `221`); the new focused test module is `250`. Existing large worker modules remain pre-existing architecture surfaces; this change adds only the required integration seam.

## Blockers

None.

## Notes and exact evidence gaps

- The host lacks `/opt/chrome/chrome` and `/opt/rvs/fonts/WantedSansVariable.ttf`, so the real pinned-Chromium determinism fixture remains one of the two explicit skips. The required full-vs-partial equality was reproduced at the render-delivery frame-byte boundary; real ffmpeg/AAC/video tests passed in the full suite.
- No separate configured static-security scanner applies to this worker-only cache change. Boundary/path/resource behavior was inspected and covered by focused adversarial tests.
- The shared root worktree contains unrelated concurrent evidence and Adobe gitlink changes after `c36ee7...`; exact-commit isolation was verified from the commit tree rather than treating the later dirty aggregate state as P3.8 output.
