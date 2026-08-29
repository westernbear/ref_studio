# Motion Graphics AI and Native/Adobe MCP Renderer

## TL;DR

Build a verifiable motion-authoring pipeline: reference lookup produces a typed `MotionPlan`, bounded scene operations mutate an immutable scene version, predicates verify the result (at most four correction attempts), and a capability snapshot selects Native or opt-in Adobe delivery. Native delivers MP4 plus an editable offline Scene Package; Adobe delivers MP4 plus a report through an enrolled local MCP connector.

## Scope and architecture

```text
reference + user instruction
  -> motion.lookup
  -> MotionPlan + predicates
  -> SceneOperationBatch
  -> scene apply
  -> verify / correct (max 4)
  -> BackendCapabilitySnapshot
       |-> Native: MP4 + Scene Package/HTML
       `-> Adobe: cloud MCP -> local stdio/AE panel -> working-copy AEP -> MP4/report
```

Keep motion semantics, executable scene state, and verification separate. Reuse the existing SQLite FTS5 index, exact aliases, existing easing and renderer primitives, and current host-owned preview/finalization. Do not add a vector database, embedding service, agent framework, splitter/canvas library, or independent skill per domain.

## W0: execution base and evidence recovery

- Work from `/home/singlerr/ref_studio-motion-v2-worktree` in isolated worker worktrees; do not modify dirty `master`.
- Persist this plan at `.omo/plans/motion-graphics-ai-skill-renderer.md` and the UI prompt at `.omo/drafts/motion-workspace-ui-todo.md`.
- Recover and re-run the existing evidence parser, duplicate JSON receipt checks, OpenAPI single-source check, real render, Playwright, and security gates. Existing PASS reports are not evidence until reproduced.

## W1: motion knowledge

Create one `motion-authoring` skill with 15 tags: reference; timing/easing; spatial choreography; layers; transitions; typography; paths/morphs; masks/mattes; camera/3D; lighting/compositing; effects; audio; expressions; interaction; verification/accessibility.

Each card contains Korean/English definitions, aliases, distinctions, parameters with units/ranges, required capabilities, operation/verifier references, and sources. `motion.lookup` is host-first and is exposed as a model tool only after a provider tool-canary passes. The fixed corpus must reach exact-alias Recall@1 100%, aggregate Recall@3 >=95%, domain/language >=90%, and zero unsupported false accepts.

## W2: SceneSpec v1 and verified authoring

Add `MotionPlanV1`, `SceneOperationBatchV1`, `BackendCapabilitySnapshotV1`, `VerificationReportV1`, and `MotionSceneSnapshotV1`. The first renderer supports renderable text/image/shape, x/y, uniform scale, opacity, existing easing, and drop-shadow.

Expose only `motion_lookup`, `context_inspect`, `scene_apply_operations`, and `scene_verify` internally. The host owns preview and final confirmation. Candidate generation, verification, and correction stop after four attempts; failure, timeout, or stale digest preserves the last safe scene and artifact.

Add immutable scene-version rows and a Job current-version pointer. Existing v1 Jobs remain unchanged and are not auto-converted. `SceneOperationBatchV1` requires `baseSceneDigest`, 1-16 `set|unset` operations, stable `opId`, and a reason.

## W3: Native renderer and delivery

First fix cancellation propagation, remove video shape fallback, make Chrome and fonts deterministic, and validate AAC/GOP/duration. Native Scene Package contains `manifest.json`, editable `scene.json`, hash-pinned assets, capability and verification reports, and an offline standalone HTML runtime with no external URLs.

Add rotation, anchor, per-axis scale, easing, parent transforms, deterministic video decode, and limited audio only when capability and tests support them. Defer Blender/3D and interaction paths until pinned Blender, GLB contracts, resource budgets, and device tests exist. Defer partial-beat rendering until full-render performance data exists.

## W4: Adobe local/cloud MCP

Implement the private `westernbear/ref_studio_adobe_bridge` separately. Pin reference behavior to `Dakkshin/after-effects-mcp` commit `88d5fbf08b7ae9f015ee98e5f8c4904095cf8202` in `UPSTREAM.md`; reimplement behavior without a runtime dependency or git submodule.

Production topology is an authenticated RVS Cloud MCP Gateway, an enrolled local connector (local-only stdio or outbound relay), per-command atomic JSON spool, ScriptUI polling, and an After Effects working-copy AEP. Use command files `commands/<commandId>.pending.json`, `.running.json`, and `results/<commandId>.json`; lifecycle is `QUEUED -> RUNNING -> SUCCEEDED|FAILED|CANCELLED`. Serialize mutations per AE process, and distinguish repeats with command ID, nonce, and scene digest. The panel polls every two seconds by default and provides Auto-run, manual confirmation, current command, and bounded logs.

Provide versioned tools for project/composition, layer creation and mutation, animation/keyframes, masks, approved effects and expression templates, command status/cancel, verify, render/upload, and rollback: `adobe.project.get_v1`, `adobe.composition.{list,create,update}_v1`, `adobe.layer.{get,create_text,create_shape,create_solid,create_camera,create_null,duplicate,delete,set_properties,batch_set_properties}_v1`, `adobe.animation.set_keyframes_v1`, `adobe.mask.set_v1`, `adobe.effect.{apply,apply_template}_v1`, `adobe.expression.{apply_template,remove}_v1`, and execution tools `adobe.command.{status,cancel}_v1`, `adobe.verify_v1`, `adobe.render_upload_v1`, `adobe.rollback_v1`.

Do not expose generic scripts, arbitrary expressions, raw preset paths, unstable indexes/names, local paths, upload URLs, tokens, or tenant/user IDs. Use reviewed expression template IDs, approved preset IDs, local handles, and `AdobeCommandEnvelopeV1`, `AdobeCommandResultV1`, `AdobeCapabilitySnapshotV1` with unknown fields rejected. Original AEP is read-only; mutate only a working copy and return command ID, before/after digests, changed fields, bounded warnings, and MP4 metadata.

## HTTP contracts and flags

- `GET /v1/jobs/:jobId/motion-scene` returns scene, version, `sceneEtag`, history, capability, and latest verification.
- `PATCH /v1/jobs/:jobId/motion-scene` requires `If-Match` and `Idempotency-Key`; stale digests return `409 VERSION_CONFLICT` with no automatic rebase. Generated-job `POST /v1/jobs/:jobId/refine-prompt` uses the same applier and ETag.
- `GET /v1/jobs/:jobId/deliverables` returns Native MP4/Scene Package or Adobe MP4/report.
- Feature flags are `RVS_VERIFIED_MOTION_AUTHORING`, `RVS_NATIVE_SCENE_V2`, and `RVS_ADOBE_MCP`. Disabling admission does not remove existing versions, reports, or downloads.

## Verification and rollout

Verify the mixed-language corpus, the concrete anticipation/overshoot/settle/stagger keyframes, four-attempt preservation, native package hashes/offline execution/repeated-frame hashes, and equivalent Adobe local/cloud golden command results. On AE fixtures, read back composition, text/shape/solid/camera/null, batches, keyframes, masks, effect templates, duplicate/delete. Test replay rejection, crash/restart recovery, unknown tools/properties, raw script/expression/preset rejection, and original-AEP hash stability across success/failure/cancel/rollback.

Release Native progressively: internal -> 1% -> 10% -> 50% -> 100%. Adobe is opt-in beta only after protocol parity, security/signing, and real AE QA gates. Web manual QA uses the gstack `$browse` skill with no-sandbox browser execution.

## Assumptions

- Adobe licensing is treated as resolved and is outside this plan's release gate.
- The upstream commit is reference-only and never auto-updated.
- Third-party plugins and arbitrary expressions are out of v1.
- Native is the default when no explicitly selected enrolled Adobe device exists.
- UI code is unchanged in this execution; the requested workspace design is recorded in the companion TODO.
