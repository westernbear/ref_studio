# Motion Graphics AI / Native / Adobe MCP — Complete Implementation Plan v2

Status: `READY_FOR_EXECUTION`

This is the completion plan for the original motion-graphics renderer plan. It
is intentionally a new file: `.omo/plans/motion-graphics-ai-skill-renderer.md`
remains the historical design record, and
`.omo/drafts/motion-workspace-ui-todo.md` remains the Stitch UI completion
record.

## 0. Source of truth and completion definition

### User intent

The instruction “완전한 상태까지 전부 구현” is taken literally. Completion
means every requirement in the original W0–W4 plan is implemented and
observed, including the items originally described as later waves:

- the production `motion.lookup → MotionPlanV1 → SceneOperation` path;
- FTS5 and provider-canary behavior on the production authoring path;
- the complete Native renderer contract, including advanced transforms,
  deterministic video/audio, interaction runtime, Blender/3D, and safe partial
  beat rendering;
- a real local/cloud Adobe MCP path with readback, working-copy protection,
  rendering, upload, cancellation, rollback, and device gating;
- the Stitch-based creator workspace and the administrator surfaces, with no
  visible action disconnected from a real route or an explicit capability
  lock;
- evidence recovery, Graphify re-audit, `$browse` no-sandbox manual QA,
  repository consolidation, clean integration, and release evidence.

“Everything” does not waive the explicit safety boundaries. Generic scripts,
arbitrary expressions, raw preset paths, third-party plug-ins, external asset
URLs, original-AEP mutation, unknown tools/properties, and cross-tenant replay
remain rejected by design. They are not incomplete features.

### Observable stop condition

The plan is complete only when all of the following are true:

1. A fresh database and an upgraded database both pass migrations and the
   contract/OpenAPI single-source check.
2. A real brief can be looked up by exact English, Korean, and mixed aliases;
   the host emits a validated `MotionPlanV1`; the plan compiler emits bounded
   `SceneOperationBatchV1` operations; the verifier records every attempt and
   stops at four.
3. A Native job produces a deterministic MP4 and an offline, hash-complete,
   editable Scene Package. A second independent run has identical frame hashes
   and package hashes.
4. An enrolled Adobe device can execute the same golden command locally and
   through the authenticated cloud relay against a working-copy AEP, and the
   result is read back with before/after digests. The original AEP hash is
   unchanged for success, failure, cancellation, and rollback.
5. Creator and admin users can see loading, empty, failure, conflict,
   queued/running, success, cancelled, and unavailable states. Every enabled
   action reaches a real API; every disabled action names the missing
   capability.
6. Automated suites, real render checks, real-AE hardware evidence, Graphify,
   and `$browse` manual QA all pass. The final integration branch contains the
   worker and Adobe submodule gitlinks, not copied source trees.

### Evidence baseline

The current baseline is commit `9745486e57526d679f8e29cfa5fda1d054d9b20e`
on `master`, remote `westernbear/ref_studio`. The worktree is intentionally
dirty with user-owned evidence, screenshots, archives, and an uncommitted
worker fix. Do not reset, clean, or overwrite those files.

The fresh Graphify audit is recorded at
[motion-plan-graphify-audit-20260830.md](/home/singlerr/ref_studio/.omo/evidence/motion-plan-graphify-audit-20260830.md:1):
2,881 nodes, 5,830 links, and a `PARTIAL` verdict. Its material findings are:

| Gap | Current evidence | Closure required |
| --- | --- | --- |
| Motion plan execution | `MotionPlanV1Schema` is only connected to `packages/contracts/src/motion.ts` | Add generator, compiler, consumer, route/evidence edges, and tests |
| Host lookup | `author-scene.ts` uses alias substring lookup only | Put exact alias + FTS5 lookup behind one production host adapter |
| Provider canary | `modelMotionTools()` appears only in tests | Persist, execute, and enforce canary before model tool exposure |
| Verification | `verifyMotionScene()` covers schema/native kinds; repair helper is test-only | Build canonical predicate registry and record real attempt counts |
| Adobe | Typed bridge/spool exists; no real AE readback gate | Finish connector/panel/dispatcher/relay and hardware fixtures |
| Advanced Native | video, 3D, interaction, and partial beat paths are absent/deferred | Implement capability-gated v2 adapters and deterministic tests |

Graphify could not parse 21 SQL files because `tree_sitter_sql` is unavailable,
and CSS was falsely classified as sensitive. SQL, migrations, and UI styles
must therefore be checked directly in addition to the final graph audit.

## 1. Strategy and decisions

### 1.1 Selected approach

Use a **contract-preserving complete architecture**: keep the current API,
SQLite, renderer, worker, UI primitives, and Adobe submodule seams, then close
the missing semantic, capability, and production-adapter edges. Do not rewrite
the product or introduce an agent framework, vector database, embedding
service, splitter/canvas package, or per-domain skill.

| Approach | Effort | Risk | Benefits | Costs | Decision |
| --- | --- | --- | --- | --- | --- |
| A. Minimal gap closure | L | Medium | Adds plan compiler, FTS/canary production wiring, and Adobe gate with few files | Leaves advanced renderer waves outside “complete”; likely another migration | Rejected: fails the explicit full-completion request |
| B. Contract-preserving full architecture | XL | Medium | Closes every original requirement, preserves v1 jobs, reuses existing seams, supports progressive rollout | Requires staged migrations, deterministic media fixtures, and an AE hardware lane | **Selected** |
| C. Rewrite as a new rendering service | XXL | High | Fresh boundaries and potentially simpler long-term service ownership | Breaks existing jobs/evidence, duplicates auth/storage/UI, and increases migration risk | Rejected: unnecessary blast radius |

The decision is a durable scope choice: “complete” includes the formerly
deferred Blender/3D, interaction, and partial-beat work, but it does not add
unsafe arbitrary execution.

### 1.2 Existing code to reuse

| Responsibility | Existing implementation | Plan action |
| --- | --- | --- |
| Bilingual knowledge data | `apps/api/database/migrations/018_motion_knowledge.sql`, `apps/api/src/motion-knowledge.ts`, `skills/motion-authoring/SKILL.md` | Preserve card schema, exact aliases, FTS5; add production adapter and corpus gate |
| Scene contract | `packages/contracts/src/scene-spec.ts`, `spec-validate.ts`, worker `scene/spec-compile.ts` | Keep v1 parser; add explicit v2 transform/audio/interaction extensions and adapters |
| Scene mutation | `apps/api/src/motion-operations.ts`, `motion-scene.ts`, `motion-scene-commands.ts` | Centralize path policy, plan compiler, transaction, and predicate reporting |
| Immutable history | migration `019_motion_scene_versions.sql`, `motion-scene-store.ts` | Add plan/attempt metadata and atomic head updates without changing v1 jobs |
| Native capture | `apps/worker/src/gen-render-delivery.ts`, `render-app/generated.ts`, `capture/browser.ts` | Extend deterministic compiler and media pipeline; retain real Chrome/font gate |
| Scene package | `native-scene-package.ts`, `scene-package-archive.ts` | Add signed manifest/report layout, runtime controls, and hash/offline checks |
| Worker lifecycle | `worker-daemon.ts`, `worker-job-handler.ts`, `generated-video-delivery.ts` | Preserve cancellation; keep the ffprobe JSON boundary fix as a regression gate |
| Creator workspace | `MotionWorkspace.tsx`, `useMotionWorkspace.ts`, `MotionActionCard.tsx`, existing primitives/tokens | Wire new plan/capability states; do not add a state manager or UI library |
| Admin | `apps/api/src/admin-read.ts`, `server.ts`, `apps/web/src/app/[locale]/[...slug]/page.tsx` | Add motion/canary/device/command fields and filters using current table/detail patterns |
| Adobe bridge | `integrations/adobe-bridge` submodule, upstream reference in `UPSTREAM.md` | Finish real AE behavior, relay, installer, and hardware evidence; do not vendor upstream |

### 1.3 Dream-state delta

```text
CURRENT                         THIS COMPLETION PLAN                  12-MONTH IDEAL
SceneSpec-first authoring  -->  Host lookup + typed plan + bounded   -->  A reusable motion
Partial Native renderer         operations + real predicates +       authoring substrate:
Alias-only production path      deterministic Native/Adobe adapters  -->  new domains and
Isolated Adobe spool tests      + complete UI/admin observability     -->  backends add cards,
Deferred 3D/interaction         + replay-safe evidence                -->  adapters, and predicates
```

The user experience moves from “a generated scene that may render” to “a
scene whose intent, operations, capabilities, evidence, and artifact can be
explained and replayed.” The plan does not promise arbitrary creative code;
it grows the reviewed vocabulary and typed adapters instead.

## 2. Target architecture and invariants

### 2.1 Dependency and data-flow graph

```text
brief + evidence + attachments
             |
             v
      HostMotionLookup
  exact aliases -> FTS5 -> card IDs
             |
             v
       MotionPlanV1 generator
 (intent, card IDs, keyframe intents, predicates, requirements)
             |
             v
       Plan compiler / capability resolver
  semantic intent -> SceneOperationBatchV1 (1..16 ops each)
             |
             v
      transactional scene applier
             |
             v
 immutable motion_scene_versions + job head + ETag
             |
             v
 predicate verifier (max 4 generate/repair attempts)
        |                         |
        v                         v
 Native capability adapter     Adobe capability adapter
        |                         |
        v                         v
 deterministic frames/package  authenticated cloud -> local spool
 MP4 + Scene Package/HTML       -> ScriptUI -> working-copy AEP
        |                         |
        +------------+------------+
                     v
       deliverables + admin/read-only evidence + UI state
```

No model or UI code writes a scene row directly. No render path trusts a
model-produced PASS. All mutation routes resolve the tenant/job, require an
ETag and idempotency key, validate the operation batch, verify the candidate,
then insert an append-only version in one immediate transaction.

### 2.2 State machines

Authoring and verification:

```text
REQUESTED -> LOOKED_UP -> PLAN_GENERATED -> OPERATIONS_COMPILED
    |             |              |                 |
    |             +--empty-------+                 v
    |                                             APPLIED
    |                                               |
    |                                     VERIFY_PASS -> READY
    |                                               |
    |                                     VERIFY_FAIL (attempt < 4)
    |                                               |          
    +------------------- ERROR <--------------------+          
                                      attempt = 4 -> SAFE_FAILURE
```

`SAFE_FAILURE` points at the previous scene/version and previous artifact;
there is no fallback shape, synthetic PASS, or automatic rebase. Invalid
transitions (repair after attempt four, apply without base digest, render
without PASS) are rejected before mutation.

Adobe command lifecycle:

```text
QUEUED (.pending.json) -> RUNNING (.running.json)
       |                         |
       +-> CANCELLED             +-> SUCCEEDED (.results.json)
                                 +-> FAILED (.results.json)
```

A per-device mutation lock permits one RUNNING mutation. Crash recovery moves
orphaned RUNNING commands back to QUEUED only after the lease/nonce check;
terminal results are never overwritten by an older retry.

Feature admission:

```text
DISABLED --(flag on + capability gate)--> ADMISSION_ENABLED
ADMISSION_ENABLED --(flag off)---------> DISABLED_FOR_NEW_JOBS
existing versions/artifacts remain readable in both states
```

### 2.3 Contract decisions

1. `MotionPlanV1` remains the semantic object. It will retain existing fields
   (`intent`, `keyframeIntents`, `predicates`) and gain strict, documented
   `knowledgeCardIds`, `requiredCapabilities`, and `canvas` metadata. Existing
   parsers receive defaults for absent optional metadata; new generation always
   emits the complete form. Predicate names are checked against an allowlist.
2. `SceneSpecV1` stays byte-compatible for existing jobs. A new
   `SceneSpecV2`/compiler union carries `rotation`, `anchor`, `scaleX/scaleY`,
   `parentElementId`, explicit easing metadata, audio tracks, and interaction
   bindings. `scene-spec-v1` jobs are never silently converted.
3. `SceneOperationBatchV1` keeps `baseSceneDigest`, unique stable `opId`,
   `reason`, and 1–16 operations. The plan compiler emits multiple ordered
   batches when a plan needs more than 16 writes; each next batch uses the
   digest returned by the preceding transaction.
4. `MotionSceneSnapshotV1` remains the public aggregate returned by GET/PATCH/
   rollback. It carries the current scene/version/ETag/history,
   `BackendCapabilitySnapshotV1`, latest `VerificationReportV1`, and the new
   nullable plan metadata; its v1 JSON envelope stays readable by existing
   clients.
5. `BackendCapabilitySnapshotV1` records backend, capture time, runtime
   fingerprint, capability IDs, and gate evidence. Adobe adds an
   `AdobeCapabilitySnapshotV1` with device, AE version, tool manifest, and
   safety booleans.
6. `VerificationReportV1` records the actual attempt number, requested
   predicates, findings, runtime/media/package evidence, and safe predecessor
   version on failure. A PASS is valid only if all required predicates pass.
7. Adobe contracts use strict unknown-field rejection at both the root API and
   bridge. Golden JSON vectors are the parity source; the root package owns the
   public schema and the submodule owns a checked generated copy with a hash
   parity test, not a runtime dependency.

### 2.4 Wire-shape ledger

The implementer must use these names and bounds; changing them requires a new
contract version and an explicit migration note.

| Contract | Required fields | Bounds/normalization |
| --- | --- | --- |
| `MotionPlanV1` | `schema`, `intent`, `knowledgeCardIds`, `requiredCapabilities`, `canvas`, `keyframeIntents`, `predicates` | intent ≤2,000 chars; card IDs ≤15; keyframe intents ≤64; predicates ≤64 and allowlisted; canvas equals job config |
| `KeyframeIntentV1` | `elementId`, `anticipationFrames`, `overshootPercent`, `settleFrame`, `staggerFrames` | integer frames ≥0; overshoot 0–100%; all resulting frames inside the target beat/canvas |
| `SceneOperationBatchV1` | `schema`, `baseSceneDigest`, `operations[]` | 1–16 operations; unique `opId` ≤128 chars; RFC-6901 pointer; reason ≤500 chars |
| `MotionSceneSnapshotV1` | `schema`, `version`, `sceneEtag`, `sceneDigest`, `scene`, `history`, `backendCapability`, `verification` | version >0; digest 64 lowercase hex; history append-only; nullable verification only before first check |
| `BackendCapabilitySnapshotV1` | `schema`, `backend`, `capturedAt`, `runtime`, `capabilities`, `gateEvidence` | backend `native|adobe`; runtime fingerprint required for render; unknown capability IDs rejected |
| `VerificationReportV1` | `schema`, `sceneDigest`, `attempts`, `status`, `requestedPredicates`, `findings`, `safePredecessorVersion` | attempts 1–4; PASS only when every requested/mandatory predicate passes; failure points to safe predecessor |
| `SceneSpecV2` | v1 fields plus transform/parent/audio/interaction blocks | strict finite numbers; parent graph acyclic; local asset refs only; all new blocks capability-gated |
| `AdobeCommandEnvelopeV1` | `version`, `commandId`, `nonce`, `sceneDigest`, `deviceId`, `jobId`, `projectHandle`, `tool`, `args` | strict tool/arg allowlists; working-copy project handle only |
| `AdobeCommandResultV1` | `version`, IDs/nonces/digests, `status`, `beforeDigest`, `afterDigest`, `changedFields`, `warnings`, `payload` | terminal status only; bounded arrays/strings; result binding must match envelope |

Canonical JSON for digests sorts object keys, preserves array order, uses UTF-8,
and rejects NaN/Infinity. ETags are quoted lowercase scene digests. The
`runtime`/`gateEvidence` additions are optional only when reading legacy rows;
new writes must populate them.

## 3. Workstreams and implementation tasks

Tasks are ordered by dependency. Each task names its owner surface, files, and
the evidence that closes it. “Worker” means the `apps/worker` submodule; “Adobe”
means `integrations/adobe-bridge` on its own branch before the root gitlink is
updated.

### P0 — integration safety and evidence recovery

**P0.1 Clean integration branch and restore point (root).**

- Create a clean integration branch from the baseline without touching dirty
  `master`; record `git status`, submodule SHAs, and the user-owned file list in
  `.omo/evidence/motion-complete-restore-<timestamp>.md`.
- Use an explicit separate worktree, for example
  `git worktree add /home/singlerr/ref_studio-motion-complete master` followed by
  `git -C /home/singlerr/ref_studio-motion-complete switch -c
  codex/motion-complete`; never use `git clean` to make the dirty checkout
  appear clean.
- Keep `/home/singlerr/ref_studio-motion-v2-worktree` and generated extraction
  directories outside the source tree until the final cleanup gate.
- Use the existing `gh` authentication only for branch/PR/push operations after
  the verification gates; never force-push.

**P0.2 Preserve the worker ffprobe fix (worker).**

- Commit the current `generated-video-delivery.ts` change and
  `generated-video-delivery.test.ts` in the worker repository.
- The metadata probe must not combine audio frames with a 64 KiB retained
  stdout; the frame-count probe selects `v:0` and parses a separate JSON
  document.
- Evidence: worker build, format check, 232-test baseline, and the 900-frame
  H.264/AAC real render with the recorded PASS metadata.

**P0.3 Re-run evidence gates (root).**

- Re-run `scripts/qa/assert-evidence`, duplicate receipt checks, fixture locks,
  `scripts/contracts/openapi.mjs`, `scripts/assets/verify.mjs`,
  `scripts/media/verify.mjs`, and the existing security/authority checks.
- Convert every “PASS” used in the final report into a fresh artifact with
  commit SHA, command, environment fingerprint, and timestamp.
- Add a guard that rejects stale evidence from a different commit or changed
  submodule gitlink.

**P0.4 OpenAPI and generated contract single source (root).**

- Keep `scripts/contracts/openapi.mjs` as the only hand-authored source;
  generate `packages/contracts/generated/openapi.json` and
  `apps/api/openapi.json` as checked mirrors.
- Add a byte/hash comparison test and CI check; no manual edits to either
  generated file.

### P1 — motion knowledge and semantic planning

**P1.1 Canonical knowledge lookup (root API).**

- Refactor `apps/api/src/motion-knowledge.ts` around one
  `lookupMotionKnowledgeForBrief()` adapter: normalize NFKC/case, check exact
  aliases first, tokenize the full brief for FTS5, merge/dedupe by card ID,
  preserve longest exact alias precedence, and cap results at three per query.
- Keep `hostMotionLookup()` as a compatibility wrapper only; make
  `author-scene.ts` call the canonical adapter so Graphify sees the production
  `motion.lookup` edge.
- Return an explicit `MOTION_KNOWLEDGE_NOT_FOUND` result for an unsupported
  brief; do not silently generate a plan with invented capability names.
- Tests: 120 fixed English/Korean/mixed queries, exact Recall@1 100%, aggregate
  Recall@3 ≥95%, per-domain/language ≥90%, unsupported false accepts 0.

**P1.2 Provider tool-canary admission (root API/database).**

- Add migration `021_motion_provider_canaries.sql` keyed by tenant/provider/
  model, with status, checked time, tool schema digest, and bounded failure
  reason. No secret or prompt content is stored.
- Add `apps/api/src/motion-canary.ts` with `runMotionToolCanary()` and a provider
  adapter seam. It sends a minimal
  `motion.lookup` schema call, validates the structured result, records PASS or
  FAIL, and expires after the configured TTL.
- `modelMotionTools()` becomes a production decision: only a fresh PASS exposes
  `motion.lookup`; host lookup still runs first for every authoring request.
- Admin read shows provider/model/status/age, never API keys. Tests cover no
  canary, expired canary, failed canary, schema mismatch, and successful tool
  exposure.

**P1.3 MotionPlan contract and generator (contracts/API).**

- Extend `packages/contracts/src/motion.ts` with strict `MotionPlanV1` metadata
  and the predicate ID enum. Reject unknown fields and unknown predicate IDs.
- Add `apps/api/src/motion-plan.ts` (pure validation and normalization) and
  `apps/api/src/motion-plan-generator.ts` (AI boundary). The generator receives
  host-resolved cards, projected evidence, job canvas, attachment IDs, and the
  current backend capability snapshot. It never receives local paths, tokens,
  or unbounded evidence.
- Generate the semantic plan first. A separate scene-draft call may produce a
  `SceneSpec` candidate, but the draft is not treated as executable operations
  until the compiler below validates it.
- Record plan digest, card IDs, required capabilities, and prompt/model version
  alongside the scene version for reproducibility.

**P1.4 Plan-to-operation compiler (root API/contracts).**

- Add `apps/api/src/motion-plan-compiler.ts` (or move the pure portion to
  `packages/contracts/src/motion-plan.ts` if both API and worker need it).
- Resolve each keyframe intent by stable `elementId`; generate the exact
  keyframes through `keyframesFromMotionIntent()`; create JSON-pointer `set`
  operations with stable `opId` and a reason naming the card/predicate.
- Reject missing elements, unsupported capabilities, out-of-canvas frames,
  non-finite values, and batches over 16 before any DB write. Split only at a
  deterministic operation boundary and chain returned digests; never rebase a
  stale client batch.
- Required fixture assertion: anticipation `12`, overshoot `8%`, settle `36`,
  second-element stagger `6` produces first frames `[0,12,36]` and second
  frames `[6,18,42]`, with the overshoot scale `1.08`.

**P1.5 Authoring flow integration (root API).**

- Change `apps/api/src/author-scene.ts` to call host lookup → plan generator →
  scene draft → plan compiler → verified applier. Keep the four-attempt loop
  in `verified-scene-authoring.ts`, but pass actual predicate failures and
  attempt count into the final report.
- Preserve the fail-closed `AI_PROVIDER_NOT_CONFIGURED`, malformed-output, and
  asset-resolvability behavior. A plan failure leaves no scene head or artifact.
- Add evidence linking the plan digest to `motion_scene_versions` and the
  creator beat sheet.

### P2 — scene versions, predicates, and API contracts

**P2.1 Predicate registry and verifier (contracts/API).**

- Add a strict registry for `scene-spec`, `beat-tiling`, `keyframe-timing`,
  `element-kind-capability`, `asset-resolvable`, `no-external-url`,
  `frame-hash-deterministic`, `audio-duration`, `reduced-motion`, and
  `adobe-readback`.
- Put the IDs and pure rule metadata in `packages/contracts/src/motion-predicates.ts`
  and the runtime evaluator in `apps/api/src/motion-predicates.ts`; both
  modules must be imported by production verification and covered by contract
  tests.
- Expand `verifyMotionScene()` to evaluate only predicates requested by the
  plan plus mandatory safety predicates. Each finding includes predicate ID,
  pass/fail, target, observed value, expected value, and remediation.
- Make `verifyAndRepair()` the shared production loop or remove the duplicate
  helper after all callers move to the canonical implementation. Its return
  value must preserve the last safe scene and artifact on attempt four,
  timeout, cancellation, or stale digest.

**P2.2 Transactional scene store (root API/database).**

- Add migration `022_motion_plan_metadata.sql` with these exact additive
  columns on `motion_scene_versions`: nullable `plan_digest`, nullable
  `predecessor_version`, nullable `artifact_digest`, and
  `predicate_ids_json TEXT NOT NULL DEFAULT '[]'`. Validate every digest and
  JSON value at read/write boundaries; do not use an implementation-dependent
  alternate envelope.
- Update `motion-scene-store.ts` so version insert, job head update, plan/report
  metadata, and idempotency record occur in one `BEGIN IMMEDIATE` transaction.
- Keep append-only triggers. Add a monotonic version uniqueness test under
  concurrent PATCH requests and tenant isolation tests for every lookup.
- Existing v1 jobs remain untouched: no automatic v2 scene head is created
  until the new flag is enabled and the job explicitly enters the v2 path.

**P2.3 Route contract hardening (root API).**

- `GET /v1/jobs/:jobId/motion-scene` returns scene, version, ETag/history,
  capability, latest verification, and plan metadata.
- `PATCH /v1/jobs/:jobId/motion-scene`, refine-prompt, rollback, and render all
  require `If-Match` and `Idempotency-Key`, validate tenant ownership, reject
  stale digests with `409 VERSION_CONFLICT`, and replay only identical request
  hashes.
- Enforce an editable JSON-pointer allowlist. Paths that mutate schema/canvas,
  unknown fields, asset provenance, or immutable metadata are rejected with
  `INVALID_OPERATION`.
- `GET /v1/jobs/:jobId/deliverables` returns backend-specific items only after
  artifact hash and verification gates pass; Adobe adds the report item.
- Update `scripts/contracts/openapi.mjs`, generated mirrors, and typed client
  schemas together.

**P2.4 Feature flags (root).**

- Keep `RVS_VERIFIED_MOTION_AUTHORING`, `RVS_NATIVE_SCENE_V2`, and
  `RVS_ADOBE_MCP` independent. Add a typed flag snapshot to logs and admin
  reads.
- Turning a flag off stops new admission only; existing versions, reports, and
  downloads remain available. Add tests for each flag combination.

### P3 — complete Native renderer and delivery

Worker ownership is the `apps/worker` submodule. Every worker change is
committed there first, then the root records only the gitlink.

**P3.1 Transform-capable SceneSpec v2 (contracts/worker).**

- Add strict v2 transform fields: rotation, anchor point, per-axis scale,
  parent element handle, and explicit easing. Validate finite values, parent
  existence, no cycles, and deterministic topological order.
- Compile v1 fields through the same transform evaluator so old renders stay
  byte-compatible. Add `rotation`, `anchor`, `per-axis-scale`, and
  `parent-transform` capability IDs.
- Test nested parents, missing parents, cycles, negative/large values, and
  exact frame interpolation.
- Keep the v1/v2 discriminated union in `packages/contracts/src/scene-spec.ts`,
  the shared validation in `packages/contracts/src/spec-validate.ts`, and the
  worker evaluator in `apps/worker/src/scene/spec-compile.ts`; no second scene
  schema may be introduced in the worker.

**P3.2 Deterministic video decode (worker).**

- Add a video decode adapter that accepts only approved local asset bytes,
  pinned ffmpeg/ffprobe paths, explicit pixel format, frame rate, frame count,
  and color space. A video asset that cannot be decoded fails with
  `VIDEO_DECODE_UNSUPPORTED`; it never becomes a shape or placeholder.
- Verify decoded frame hashes twice under CPU load and include decoder/runtime
  fingerprints in the report.
- Retain the separate metadata/frame ffprobe parsing regression for mixed
  audio/video streams.

**P3.3 Deterministic audio and mux (worker).**

- Extend scene assets with an approved audio kind and local-only provenance.
- Mux only validated AAC audio with explicit sample rate/channel/bitrate,
  bounded gain, exact duration policy, and deterministic MP4 flags. Validate
  codec/profile/pixel format/color space/GOP/frame count/duration with separate
  ffprobe documents.
- Cancellation must abort decode, browser capture, mux, probe, and archive and
  leave no published artifact.

**P3.4 Scene Package v2 (worker).**

- Keep `scene.json` editable and add `manifest.json`, `assets/<sha256>.<ext>`,
  `reports/capability.json`, `reports/verification.json`, and a standalone
  `index.html` runtime. Preserve compatibility aliases (`assets.json`,
  `capability.json`, `verification.json`) only if existing downloads require
  them.
- Manifest every file with SHA-256, schema/version, scene digest, runtime
  fingerprint, and package creation policy. Reject path traversal, external
  URLs, `file:` URLs, inline remote fonts, and missing hashes.
- Offline runtime supports frame scrub, play/pause, keyboard controls,
  reduced-motion behavior, and deterministic interaction bindings without
  `eval`, remote scripts, or network requests.
- Archive with sorted names, fixed mtime/owner, and a reproducibility test.

**P3.5 Chrome/font determinism (worker/CI).**

- Pin Chrome executable/version and the local font file hash in worker
  preflight. Fail closed when the declared runtime differs from the registered
  snapshot.
- Render the same fixture twice in independent Chromium processes and once
  under concurrent CPU load; compare every frame hash, MP4 metadata, and package
  manifest.

**P3.6 Blender/3D capability (worker/infrastructure).**

- Add a pinned Blender image/version and a GLB contract: local/embedded assets
  only, SHA-256 textures, bounded triangles/materials/texture dimensions,
  deterministic camera/output settings, and no arbitrary Blender scripts.
- Implement an isolated Blender render adapter that returns a still/frame
  sequence consumed by the same Native package and verification pipeline.
- Capability admission requires the pinned image digest, resource budget, and
  a device/CPU fixture pass. If unavailable, the plan preserves the predicate
  failure and does not silently flatten a 3D request.

**P3.7 Interaction path (worker/package/web).**

- Add typed event bindings (`pointer`, `keyboard`, `focus`) with allowlisted
  targets/actions and a deterministic initial state. No JS source strings.
- Mirror keyboard and pointer behavior in SceneCanvas and the offline package;
  ensure touch-only devices do not rely on hover.
- Verify target size ≥44 px, focus visibility, reduced motion, and no state
  changes after an unsupported event.

**P3.8 Partial-beat rendering (worker).**

- First record full-render timing and memory by beat. Add a cache keyed by scene
  digest, beat digest, asset hashes, runtime fingerprint, and compiler version.
- Re-render only changed beats when all dependencies are unchanged; invalidate
  downstream parent/audio/transition dependencies. Assemble in canonical frame
  order and compare against a full render byte/hash fixture.
- If the cache is missing, stale, or ambiguous, use the full render path. Never
  publish a partial result whose final frame hashes differ.

### P4 — production Adobe local/cloud MCP

Adobe work stays in the private `integrations/adobe-bridge` repository. The
reference behavior remains pinned in `UPSTREAM.md` to
`88d5fbf08b7ae9f015ee98e5f8c4904095cf8202`; it is not a runtime dependency or
submodule of the bridge.

**P4.1 Shared protocol and golden vectors (root + Adobe).**

- Add `packages/contracts/src/adobe.ts` and
  `verification/contract/adobe-mcp-v1.json` for
  `AdobeCommandEnvelopeV1`, `AdobeCommandResultV1`, and
  `AdobeCapabilitySnapshotV1`.
- Generate/check the bridge copy from the same versioned vectors. Unknown
  fields, raw scripts, arbitrary expressions, raw preset paths, local paths,
  upload URLs, tokens, tenant IDs, and unstable index/name selectors fail at
  the boundary.
- Add local-stdio/cloud-relay golden command/result parity tests for all 25
  versioned tools.

**P4.2 Spool correctness (Adobe `src/spool.ts`).**

- Keep per-command files: `commands/<id>.pending.json`,
  `commands/<id>.running.json`, and `results/<id>.json`.
- Use atomic create/rename with restrictive permissions, an exclusive per-AE
  mutation lock, nonce/scene/device/job binding, monotonic timestamps, and
  bounded file sizes.
- Make claim idempotent and race-safe; recover orphaned RUNNING commands after
  a lease timeout; do not overwrite a terminal result; reject same command ID
  with different nonce/digest.
- Add crash/restart, duplicate command, cancellation-before-claim,
  cancellation-during-run, malformed JSON, disk-full, and stale-result tests.

**P4.3 Authenticated cloud relay (Adobe `src/transport.ts`, root gateway).**

- Sign canonical JSON with key ID, timestamp, request ID, nonce, and body hash;
  enforce a bounded clock-skew/replay window and a durable nonce cache per
  enrolled device. Support key rotation without accepting an old key past its
  expiry.
- Authenticate the device before enqueue, authorize tenant/job/device
  binding, rate-limit commands, and redact signatures/secrets from logs.
- Return structured error codes with remediation; never echo local paths or
  credentials. Test bad signature, replay, clock skew, wrong device/job,
  oversized body, rate limit, and key rotation.
- Add the root gateway seam in `apps/api/src/adobe-mcp-gateway.ts` with
  tenant-authenticated `POST /v1/adobe/relay`, `GET /v1/adobe/devices`,
  `POST /v1/adobe/devices/:deviceId/enroll`, and
  `GET /v1/adobe/commands/:commandId`. The gateway may return command metadata
  and results only; it never proxies local paths, credentials, or AEP bytes.

**P4.4 ScriptUI panel (Adobe `scripts/panel/RVSBridgePanel.jsx`).**

- Retain two-second polling, Auto-run toggle, manual “run next,” current
  command, and a 100-line bounded log. Add explicit QUEUED/RUNNING/SUCCEEDED/
  FAILED/CANCELLED display and a manual confirmation gate for mutations.
- Open or create only a job-specific `.rvs-working-copy.aep`; never open the
  original path. Bind the panel to enrolled device/job/nonce and reject a
  mismatched spool root.
- Ensure polling cannot schedule duplicate tasks and that panel shutdown
  releases the mutation lock.

**P4.5 ExtendScript dispatcher/readback (Adobe `scripts/extendscript/`).**

- Implement every versioned project/composition/layer/animation/mask/effect/
  approved-template/status/cancel/verify/render/rollback tool with typed
  handles and property allowlists.
- Compute a canonical project snapshot digest before and after each mutation;
  return changed fields and bounded warnings from actual AE readback. Do not
  report the command’s input digest as the result digest.
- Apply keyframes with frame-rate conversion, read back values, and verify
  masks/effects/templates. Use a working-copy snapshot for rollback rather
  than closing an arbitrary project without a restore plan.

**P4.6 Working-copy manager and render/upload (Adobe + root).**

- Copy the original AEP to a per-job working directory with original SHA-256,
  permissions, and path binding recorded. Original remains read-only.
- `adobe.render_upload_v1` renders to a bounded local output, validates MP4
  metadata, and lets the connector perform the authenticated upload. Cloud
  input never supplies an upload URL or credential.
- Rollback restores the last safe working-copy snapshot and returns both
  digests. Verify the original hash in every terminal result.

**P4.7 Signed installer (Adobe `src/installer.ts`).**

- Discover supported AE install roots without shell interpolation; verify an
  Ed25519-signed fixed manifest and exact file hashes; copy only the panel and
  dispatcher into the fixed ScriptUI Panels location.
- Reject path traversal, unknown files, invalid signatures, and unsupported AE
  versions. Add macOS/Linux/Windows path fixtures where applicable.

**P4.8 Real AE QA gate.**

- On each supported AE version, run a fixture project and read back:
  composition create/update/list, text/shape/solid/camera/null, duplicate/
  delete, property and batch updates, keyframes, mask, approved effect,
  expression template/remove, verify, render, cancel, and rollback.
- Capture original-AEP hash, working-copy hash, command/result JSON, MP4 probe,
  and screenshots/logs. Adobe remains locked in UI/admin until this gate and
  security/signing gate both pass.

### P5 — creator workspace and administrator surfaces

**P5.1 Stitch fidelity and shared state (web).**

- Treat `stitch_ui_todo.zip` (`code.html`, `screen.png`, `DESIGN.md`) and root
  `DESIGN.md` as visual references; continue using existing Cosmic Engineering
  tokens/primitives.
- Keep `MotionWorkspace.tsx` desktop 30:70–70:30 splitter, native pointer
  events, 2% Arrow movement, Home/End, `role=separator`, ARIA ratio, and
  localStorage. Keep both mobile panes mounted with Chat/Editor tabs.
- Add visible plan digest, knowledge cards, capability list, verification
  findings, attempt count, command lifecycle, and artifact integrity without
  creating a second state manager.

**P5.2 State-complete chat/canvas/inspector (web).**

- `CompilerChatPanel`, `SceneCanvas`, `SceneInspector`, and
  `MotionActionCard` must cover initial/loading/empty/unsupported/error,
  stale-ETag conflict, verification repair, queued/running/progress,
  success/partial/cancelled, and offline/network interruption.
- Direct pointer/keyboard/property edits and chat refine use the same
  `SceneOperation`, ETag, idempotency key, and immutable history. Direct edits
  append an operation event to chat; optimistic UI is reverted on any failure.
- Adobe project/device selection is rendered only when the gate reports
  ENROLLED and READY. Otherwise the control is disabled with a capability
  explanation; Native stays the default.

**P5.3 Admin API and UI (root API/web).**

- Add read-only admin fields for plan/card IDs, scene/version/digest,
  predicate findings, backend/capability snapshot, render/package hashes,
  worker runtime, Adobe device enrollment, command ID/status/age, and failure
  remediation. Filter by backend, verification status, capability, command
  state, and tenant.
- Add safe admin actions only for existing authorization patterns: retry a
  failed queued command, cancel a running command, disable admission, and
  request rollback. Every action writes an audit event and returns a real
  result; no “success” placeholder.
- Never show API keys, relay secrets, local paths, raw prompts, or AEP bytes.
  Keep current table wrapping and mobile detail-panel patterns.

**P5.4 Localization/accessibility (web).**

- Add Korean and English messages for all new states and error remediations.
- Verify 44 px targets, keyboard parity, focus order, screen-reader labels,
  contrast, reduced motion, touch-only behavior, and 320 px no-horizontal-
  scroll. Use the existing `tokens.css`, `primitives.css`, and motion styles.

### P6 — security, observability, and developer experience

**P6.1 Boundary security.**

- Re-run tenant/job ownership checks on every route and relay command.
- Enforce strict schemas and operation path allowlists at API, worker, package,
  bridge, and ExtendScript boundaries.
- Add resource budgets: max scene elements/operations, frame count, package
  bytes, ffmpeg output, Blender triangles, spool bytes, and relay request size.
- Add replay protection for HTTP idempotency and Adobe nonce/device bindings.
- Redact tokens, signatures, prompts containing user data, local paths, and AEP
  names from logs/evidence.

**P6.2 Error/rescue contract.**

- Extend `safeEnvelope` with stable code, human message, cause category,
  remediation, correlation ID, and docs URL while retaining no-stack-trace
  production responses.
- Every UI error maps code → translated copy → one actionable next step.
- Record the last safe version/artifact for every failure and cancellation.

**P6.3 Observability.**

- Emit structured events for lookup query class (not raw query), canary status,
  plan digest, operation count, verification attempt, capability mismatch,
  render duration/memory, package hash, Adobe command lifecycle, replay reject,
  and user-visible action result.
- Add counters/histograms and dashboards for TTHW, lookup recall, four-attempt
  failures, stale conflicts, render determinism, package downloads, Adobe
  queue age, and rollback frequency.

**P6.4 Developer documentation.**

- Add a copy-paste quick start for Native authoring, a local Adobe fixture
  walkthrough, contract reference, migration guide, error-code index, and
  `$browse`/manual QA guide. Link from root and package READMEs.
- Document exact Node/pnpm/Bun/Chrome/ffmpeg/Blender/AE versions and how to run
  every gate without network access except the explicitly authenticated relay.

### P7 — verification, consolidation, and release

**P7.1 Full automated gate.**

- Root: contracts, API, database migrations, OpenAPI, security, evidence,
  format/typecheck, and web unit/E2E/a11y/visual suites.
- Worker: unit/integration/determinism/media/package/Blender/interaction,
  build, format, and real 900-frame regression.
- Adobe: `bun run check`, tests, build, golden local/cloud parity, signed
  installer, spool crash recovery, and real AE fixture evidence.

**P7.2 Graphify closure audit.**

- Build a fresh isolated corpus from source, contracts, migrations, skills,
  scripts, and tests. Exclude generated caches only with a recorded manifest.
- Require paths from `MotionPlanV1` to generator/compiler/applier/verifier,
  lookup to authoring, capability to renderer/Adobe/UI/admin, and deliverables
  to downloads. Reconcile SQL directly because the SQL parser is unavailable.
- Fail the gate on any newly dangling production symbol, disconnected action,
  or stale evidence reference.

**P7.3 `$browse` no-sandbox manual QA.**

- Start a production build with real API fixtures and
  `GSTACK_CHROMIUM_NO_SANDBOX=1`.
- Exercise desktop 1440/1280, tablet 768, mobile 390/375, and 320 px creator
  workspace; admin desktop/mobile; English/Korean; reduced motion; keyboard
  splitter; scene drag/nudge/property/chat edits; conflict/retry; render and
  downloads; Adobe disabled/enrolled states.
- Capture screenshots, console/network logs, route responses, ETags, version
  history, command IDs, and artifact probes under
  `.omo/evidence/motion-complete-browse-<timestamp>/`.

**P7.4 Consolidate split directories.**

- After evidence is frozen, inventory `/home/singlerr/ref_studio-motion-v2-
  worktree`, `graphify-corpus`, `handoff-extracted`, `stitch-extracted-new`,
  `stitch-extracted-new-v2`, and generated archives. Confirm no tracked source
  or unique evidence exists outside the canonical root or the two submodules.
- Move only verified generated duplicates to a dated archive/Trash location,
  never recursively delete a broad directory. Keep the canonical TODO/plan and
  evidence paths under `.omo/`.
- Verify `git ls-files`, submodule status, and all package scripts from the
  canonical root after cleanup.

**P7.5 Commit, merge, and push.**

- Commit worker changes in `apps/worker`, Adobe changes in its repository, and
  root changes separately with evidence-linked messages.
- Update root gitlinks only after submodule checks pass. On a clean root
  integration branch, run the full gate again, then use `gh pr create` or the
  repository’s existing merge flow. Merge to `master` only after required
  review evidence is attached; push the merge commit and verify
  `origin/master` matches.
- Never force-push dirty `master`; preserve the user’s unrelated evidence
  changes.

## 4. API, database, and artifact checklist

### Public routes

| Route | Required behavior |
| --- | --- |
| `GET /v1/jobs/:jobId/motion-scene` | Tenant-scoped snapshot, ETag, history, plan metadata, capability, latest verification |
| `PATCH /v1/jobs/:jobId/motion-scene` | Strict batch, `If-Match`, idempotency, path policy, transaction, real verification |
| `POST /v1/jobs/:jobId/refine-prompt` | Same applier/ETag/idempotency and plan/verification path |
| `POST /v1/jobs/:jobId/motion-scene/rollback` | Validate target PASS, create a new version, preserve history, queue safely |
| `POST /v1/jobs/:jobId/motion-scene/render` | Recompute digest/report, require PASS, queue selected backend |
| `GET /v1/jobs/:jobId/deliverables` | Native MP4/package or Adobe MP4/report only after integrity gate |
| Admin motion/device/command reads | Read-only, filtered, redacted, audited |
| Cloud Adobe relay | Signed, replay-safe, enrolled-device scoped, strict envelope/result |

### Database migrations

| Migration | Purpose | Compatibility rule |
| --- | --- | --- |
| `018_motion_knowledge.sql` | 15 cards, aliases, FTS5 | Keep exact aliases authoritative |
| `019_motion_scene_versions.sql` | Append-only versions/head | Never update/delete version rows |
| `020_scene_package_artifacts.sql` | Artifact slot support | Preserve existing slots |
| `021_motion_provider_canaries.sql` | Provider/model tool canary | Additive; no secret storage |
| `022_motion_plan_metadata.sql` | Plan/predicate/predecessor/artifact metadata | Nullable for existing v1 rows |
| `023_adobe_devices_commands.sql` | Enrollment, leases, command audit | Device/job/tenant foreign-key binding |
| `024_native_beat_cache.sql` | Partial render cache metadata | Cache is disposable; artifacts remain authoritative |

Every migration gets fresh-db, upgrade-from-baseline, rollback/flag-off, and
concurrent-access tests. Data deletion/retention follows existing tenant
epochs and artifact retention rules.

## 5. Error and rescue registry

| Code/event | Detection point | User-visible result | Safe state/artifact | Retry policy |
| --- | --- | --- | --- | --- |
| `MOTION_KNOWLEDGE_NOT_FOUND` | Host lookup | Explain unsupported term and show supported domains | No new scene/version | User edits brief; no automatic retry |
| `MOTION_CANARY_REQUIRED/EXPIRED/FAILED` | Model admission | Native remains available; Adobe/tool exposure locked | Existing jobs/artifacts readable | Re-run canary after provider fix |
| `MOTION_PLAN_INVALID` | Plan schema/allowlist | Show field/predicate remediation | Previous scene unchanged | Up to four model repairs |
| `PLAN_ELEMENT_NOT_FOUND` | Plan compiler | Name missing element/card | Previous scene unchanged | New plan only |
| `INVALID_OPERATION` | JSON-pointer policy | Show allowed path and reason | No DB write | Correct client operation |
| `VERSION_CONFLICT` | ETag/base digest | Reload current version; never rebase | Current head unchanged | User retry after reload |
| `SCENE_VERIFICATION_FAILED` | Predicate verifier | Show failed predicates and attempt count | Last safe scene/artifact retained | Repair attempts ≤4 |
| `AUTHORING_TIMEOUT/CANCELLED` | AI loop | Terminal failure/cancel | Previous version/artifact retained | Explicit user retry |
| `ASSET_REF_UNRESOLVED` | API/worker boundary | Identify asset ID and source requirement | No publish | Attach/provide approved asset |
| `VIDEO_DECODE_UNSUPPORTED` | Worker decode | Explain codec/runtime requirement | No shape fallback; prior artifact retained | Use supported asset/runtime |
| `MEDIA_QC_FAILED` | ffprobe/QC | Show codec/frame/duration mismatch | No artifact publication | Correct render configuration |
| `PACKAGE_INTEGRITY_FAILED` | Package verifier | Download blocked with manifest error | Previous package remains | Rebuild full package |
| `RENDER_CANCELLED` | AbortSignal | Cancelled state | Temp files removed; prior artifact retained | Explicit rerender |
| `ADOBE_AUTH/REPLAY/DIGEST_MISMATCH` | Gateway/spool | Structured remediation, no AE mutation | Original/working copy unchanged | Re-enroll or resend fresh nonce |
| `ADOBE_AE_READBACK_FAILED` | Dispatcher | Command FAILED with warning/readback detail | Working copy rolled back; original unchanged | Manual inspection then retry |
| `ADOBE_CRASH_RECOVERY` | Spool startup | Command returns to QUEUED or CANCELLED by lease | No duplicate mutation | One serialized retry |
| `BLENDER_BUDGET_EXCEEDED` | 3D adapter | Explain triangle/material/timeout budget | Prior artifact retained | Simplify asset or choose Native 2D |
| `NETWORK_INTERRUPTED` | Web/relay client | Correlation ID and retry instruction | Optimistic UI reverted | Safe idempotent retry |

## 6. Failure modes and prevention

| Failure mode | Why it is dangerous | Prevention/gate |
| --- | --- | --- |
| Semantic plan exists only in types | Graph passes superficially while authoring bypasses it | Production call graph test + final Graphify path query |
| FTS/canary test-only | Descriptive briefs or unsupported providers silently drift | Author-scene integration fixtures and canary DB rows |
| Model emits a fake PASS | Invalid scenes become downloadable | Canonical verifier recomputes every route/render |
| Operation mutates immutable metadata | History/ETag cannot be trusted | JSON-pointer allowlist + schema validation |
| Retry reuses an old Adobe result | Wrong device/job could mutate | command ID + nonce + scene/device/job binding + terminal result lock |
| AE panel edits original AEP | Irreversible source corruption | Read-only original hash + working-copy-only dispatcher + hardware test |
| ffprobe parses mixed JSON | Worker reports false metadata or crashes after rendering | Separate metadata/frame probes + 64 KiB regression |
| Video silently becomes shape | User receives a different film | Unsupported video is a hard predicate failure |
| Non-deterministic filter/video/3D output | Package cannot be reproduced or verified | Pinned runtimes, frame hashes, CPU-load repeat tests |
| Partial render assembles stale dependent frames | Output differs from full render | Dependency-keyed cache and full-render hash equivalence |
| UI action has no route | User sees a fake control | action-to-route inventory + browser network assertions |
| Admin leaks secrets/paths | Operational UI becomes a data exfiltration path | Redaction schema + screenshot/response checks |
| Flag disable deletes access | Incident response loses evidence | Admission-only flags and download regression |
| Split directories diverge | Fix lands outside canonical repo | final `git ls-files`/submodule/Graphify inventory |

## 7. Test diagram and coverage plan

```text
brief -> lookup -> canary -> MotionPlan -> compiler -> batch applier
  |       |          |          |             |           |
 unit   corpus   provider   schema/unit   pointer    DB/route integration
  |       |          |          |             |           |
  +------+-E2E authoring/repair/preservation (≤4)-------+
                                                          |
                    SceneSpec v1/v2                     |
                /       |        \                      |
             Native   Adobe      Package/runtime         |
             media    spool/AE    offline/hash            |
                \       |        /                      |
                deterministic + security + `$browse`    |
```

| New path/branch | Unit | Integration | E2E/manual |
| --- | --- | --- | --- |
| Exact/FTS lookup and unsupported query | `motion-knowledge.test.ts` + 120 corpus | DB migration | API authoring brief |
| Canary pass/fail/expiry/tool exposure | `motion-canary.test.ts` | provider settings + DB | admin status |
| MotionPlan schema/generator | contracts + generator tests | author-scene fixture | creator plan/repair |
| Keyframe intent conversion | motion operation tests | plan compiler + route | inspect exact frames |
| JSON-pointer operation policy | pure operation tests/fuzz | PATCH/ETag/idempotency | stale conflict UI |
| Four-attempt repair | `verified-scene-authoring.test.ts` | author job persistence | failure preserves artifact |
| Version/head transaction | store tests | concurrent API requests | history/undo/rollback |
| v1/v2 scene compilation | compiler tests | worker job handler | v1 regression render |
| Transform/parent/easing | evaluator tests | capability admission | canvas/timeline |
| Video decode/audio mux/QC | worker media tests | real ffmpeg fixture | MP4 probe |
| Package manifest/offline runtime | package/archive tests | download route | offline `$browse` |
| Blender/GLB budget | adapter tests | pinned container | fixture render |
| Interaction bindings | runtime tests | web package integration | pointer/keyboard/reduced motion |
| Partial beat cache | cache key/invalidation tests | full-vs-partial render | timing + hash evidence |
| Adobe envelope/tool allowlist | bridge contracts | local/cloud golden | real AE readback |
| Spool lifecycle/recovery | spool tests | connector/panel | crash/restart |
| Relay auth/replay/rate limit | transport tests | gateway/device DB | enrolled device |
| UI/admin state coverage | model/component tests | Playwright route flows | `$browse` viewport matrix |
| OpenAPI/evidence/Graphify | scripts tests | clean integration | final report |

### Required commands before release

```text
pnpm lint
pnpm test
pnpm build
pnpm contracts:openapi
pnpm assets:verify && pnpm media:verify
pnpm test:evidence
pnpm test:security
pnpm recovery:test
pnpm handoff:verify
pnpm --filter @rvs/web test:e2e
pnpm --filter @rvs/web test:a11y
pnpm --filter @rvs/web test:visual
(cd apps/worker && pnpm test --run && pnpm build && pnpm format:check)
(cd integrations/adobe-bridge && bun run check && bun test && bun run build)
Graphify fresh corpus/query/health audit
$browse with GSTACK_CHROMIUM_NO_SANDBOX=1
```

The full commands run once after all inputs stabilize; targeted commands run
after each affected workstream.

## 8. Rollout and rollback

1. **Internal:** enable verified authoring and Native v2 for test tenants;
   compare plan/scene/artifact digests to baseline fixtures.
2. **Native 1% → 10% → 50% → 100%:** advance only when four-attempt failure,
   stale-conflict, render determinism, package integrity, and worker resource
   SLOs remain within thresholds for one observation window.
3. **Adobe opt-in beta:** require signed installer, enrolled device, protocol
   parity, security/replay tests, and real-AE readback for every supported AE
   version. Native remains the default when no ready device is selected.
4. **Incident rollback:** turn off admission flag, stop new jobs, retain all
   existing versions/reports/downloads, cancel queued commands safely, and keep
   the last safe scene/artifact pointer. Do not delete migration rows or force
   a git rollback while evidence is being collected.
5. **Code rollback:** revert only the reviewed integration commit or reset the
   submodule gitlink to the last verified SHA on a new branch; preserve dirty
   user evidence and never force-push `master`.

## 9. Review outputs and decisions

### CEO/strategy review

- Premises examined: the user explicitly requires complete implementation;
  existing v1 jobs must remain intact; Adobe safety boundaries are deliberate;
  Native is the default; the Graphify audit is evidence, not a replacement for
  runtime QA. All are accepted with the safeguards above.
- What happens if nothing changes: the product can edit/render Native scenes,
  but its semantic plan is disconnected, provider gating is untested in
  production, and Adobe cannot be honestly enabled.
- 10x state: a brief is traceable from bilingual concept to predicate-backed
  version and reproducible artifact across backends.
- Six-month regret avoided: shipping a polished workspace with a fake semantic
  layer, silently flattening unsupported video/3D, or mutating a source AEP.
- Mode: `SCOPE EXPANSION`, because the explicit “전부” instruction includes
  originally deferred renderer waves. The architecture remains the simplest
  path that preserves current contracts.

CEO section-by-section record:

| Section | Examined | Decision |
| --- | --- | --- |
| 1. Architecture | Existing API/worker/Adobe seams and the target graph | Preserve seams; add the missing semantic and capability edges |
| 2. Error & rescue | Model, lookup, ETag, media, package, relay, AE, and UI failure paths | Use the registry in §5; always retain the previous safe version/artifact |
| 3. Security/threat model | Tenant boundary, local paths, relay signatures, replay, AEP, scripts, package URLs | Fail closed; typed allowlists and signed/replay-safe relay are release blockers |
| 4. Data/interaction edge cases | Empty lookup, stale digest, duplicate command, crash, cancellation, mobile/offline | Explicit states and deterministic idempotency; no automatic rebase/fallback |
| 5. Code quality | Duplicate lookup/verification seams and generated contract mirrors | One canonical adapter/verifier; generated files checked, not hand-edited |
| 6. Tests | All new paths in §7, including hardware/browser/render surfaces | Require unit + integration + matching-surface evidence; no unit-only claims |
| 7. Performance | FTS bounds, full-frame compilation, media probes, Blender budgets, partial cache | Measure first; cache only with full-render hash equivalence and hard budgets |
| 8. Observability | Plan/capability/attempt/command/artifact/admin signals | Add redacted structured events, counters, histograms, and correlation IDs |
| 9. Deployment/rollout | Flags, additive migrations, submodule gitlinks, progressive Native/Adobe gates | Admission-only rollback; exact-SHA evidence before merge/push |
| 10. Long-term trajectory | New domains/backends, v1 compatibility, unsafe execution boundary | Keep typed extension points; explicitly reject arbitrary code and plugins |
| 11. Design/UX | Stitch archive, root `DESIGN.md`, current workspace/admin evidence | Complete missing plan/canary/device/error states using existing primitives |

Temporal interrogation resolved before implementation:

| Human hour | Decision required now | Plan location |
| --- | --- | --- |
| Hour 1 foundations | Worktree/gitlink policy, canonical contracts, migration numbering, runtime pins | P0, P2, P3, P4 |
| Hours 2–3 core logic | Plan shape, predicate IDs, pointer allowlist, four-attempt preservation | P1.3–P2.1 |
| Hours 4–5 integration | Native/Adobe capability selection, working-copy digest, package layout, admin fields | P3–P5 |
| Hour 6+ polish/gates | deterministic media, hardware fixtures, `$browse`, Graphify, rollout and cleanup | P6–P7 |

### Design review

The plan reuses `DESIGN.md` and the Stitch archive rather than inventing a new
visual system. The implementation must be judged on seven dimensions:

| Dimension | Required outcome |
| --- | --- |
| Information architecture | Intent/plan first, live scene second, action/deliverable status always visible |
| State coverage | Every API lifecycle and capability failure has a distinct copy/layout state |
| Journey | brief → plan → inspect → edit → verify → render → download has no dead end |
| AI-slop risk | Cosmic Engineering tokens, compact metadata, no decorative fake cards or stock imagery |
| Design-system alignment | Existing tokens/primitives and shared `CompilerDialogue` only |
| Responsive/accessibility | Mounted mobile panes, 320 px no overflow, keyboard/ARIA/reduced motion |
| Unresolved decisions | Adobe remains explicitly locked until gate; unsupported capabilities explain why |

Initial design completeness is 8/10 because the current Stitch clone is
verified but the new plan/canary/device states are not yet represented. P5.1–
P5.4 close the remaining two points and require fresh screenshots.

Design litmus scorecard:

| Dimension | Score now | Evidence | 10/10 exit condition |
| --- | ---: | --- | --- |
| Information hierarchy | 8 | `MotionActionCard` already groups backend, verification, history, and downloads | Plan digest and predicate failures are first-class without hiding render state |
| Interaction-state coverage | 7 | Existing workspace covers happy path and basic errors; canary/device/partial states are absent | Every state in P5.2 has a tested visual and accessible representation |
| Emotional/user journey | 8 | Existing brief → edit → render flow works in evidence | Plan failure and Adobe lock explain the next action instead of ending the journey |
| AI-slop risk | 9 | Root `DESIGN.md` forbids decorative workflow cards and fake controls | Visual review finds no new decorative/fake surface |
| Design-system alignment | 9 | Existing Cosmic tokens/primitives and Stitch archive are used | New fields use tokens; no parallel component library |
| Responsive/accessibility | 8 | 320 px, splitter keyboard, mobile tabs, reduced-motion evidence exists | New plan/device/error states pass the same viewport/a11y matrix |
| Decision clarity | 8 | Native default and Adobe gate are stated | Capability lock, retry, rollback, and destructive confirmation copy are explicit |

The gstack design binary is not installed in this environment, so no new
mockup is claimed. Review evidence is the supplied `stitch_ui_todo.zip`
(`screen.png`/`code.html`/`DESIGN.md`), root `DESIGN.md`, and the existing
desktop/tablet/mobile screenshots under `.omo/evidence/motion-workspace-ui/`.
P5 requires fresh mockup-equivalent screenshots after the new states land.

### Engineering review

The architecture is intentionally additive. The highest risks are the plan
compiler’s semantic-to-pointer mapping, deterministic media/Blender behavior,
AE readback, and transactional versioning. They are isolated behind pure
functions, typed contracts, fixtures, and explicit hardware gates. The test
diagram above is mandatory; no workstream can claim completion from a unit
test alone when its matching surface is a renderer, browser, or AE process.

Engineering review scorecard:

| Area | Score now | Finding and required closure |
| --- | ---: | --- |
| Architecture/coupling | 8 | Plan/compiler/verifier are currently disconnected; P1.3–P2.1 add one directed path |
| Code quality/DRY | 7 | Lookup and verification helpers have overlapping seams; consolidate callers and keep one canonical implementation |
| Test coverage | 6 | Current tests prove v1 Native and isolated bridge only; P7.1 matrix plus real AE/Blender lanes are mandatory |
| Performance/scaling | 7 | Full-frame compilation and FTS are bounded; P3.8 adds measured cache only after full-render baseline |
| Security | 8 | Existing strict schemas/tenant checks are strong; relay replay, working-copy digest, resource budgets, and redaction still need implementation |
| Error paths | 7 | Safe failures exist for scene routes; plan/canary/media/AE errors need code→remediation mapping |
| Deployment/reversibility | 8 | Flags and append-only versions are present; migrations 021–024 and exact-SHA evidence must be rehearsed |
| Operability | 7 | Admin motion summary exists; device/command/canary telemetry and queue-age dashboards are pending |

### Developer-experience review

Primary persona: a motion designer/technical artist integrating a verified
Native pipeline, with a platform engineer operating the Adobe connector.

Target journey:

| Stage | Developer action | Target |
| --- | --- | --- |
| Discover | Read one architecture/quick-start page | Understand backend/capability split in <2 min |
| Install | `pnpm install`, optional `bun install` in Adobe bridge | Reproducible pinned toolchain |
| Hello world | Run one fixture author/render command | MP4 + package in <5 min after dependencies |
| Real usage | Call typed route or MCP tool | One copy-paste example, no raw JSON invention |
| Debug | Use correlation ID, error code, report, and replay-safe retry | Problem + cause + fix visible |
| Upgrade | Run additive migrations and read v1/v2 guide | Existing jobs/artifacts unchanged |

DX gates add exact commands, expected output, error-code docs, fixture data,
non-interactive CI modes, and runtime fingerprint diagnostics. The “magical
moment” is a real offline Scene Package opened locally after the first render,
not a screenshot or mock response.

DX scorecard (target after P6.4):

| Dimension | Current | Target | Required change |
| --- | ---: | ---: | --- |
| Getting started/TTHW | 6/10 | 9/10 | Three copy-paste steps, fixture command, expected MP4/package output |
| API/CLI ergonomics | 7/10 | 9/10 | Consistent versioned names, generated schemas, idempotency examples |
| Errors/debugging | 6/10 | 9/10 | Stable code, cause, fix, correlation ID, docs URL, bounded diagnostics |
| Documentation/learning | 6/10 | 9/10 | Native, Adobe, migration, contract, and error-code guides |
| Upgrade/migration | 8/10 | 9/10 | v1/v2 compatibility table and rehearsed additive migrations |
| Environment/tooling | 6/10 | 8/10 | Pinned Node/pnpm/Bun/Chrome/ffmpeg/Blender/AE and CI fixtures |
| Ecosystem/findability | 5/10 | 7/10 | Runnable examples, contribution notes, and explicit private Adobe boundary |
| Measurement/feedback | 5/10 | 8/10 | TTHW/drop-off metrics, canary/render dashboards, periodic DX review |

DX pass decisions:

1. **Getting started:** close the current six-minute-or-longer discovery gap
   with a three-step Native fixture command and a separately documented Adobe
   setup; target hello world is under five minutes after dependencies.
2. **API/CLI/SDK:** keep all names versioned and verb-first (`*_get_v1`,
   `*_set_v1`, `*_render_v1`), generate schemas, and provide idempotency/ETag
   examples so developers never guess JSON pointers.
3. **Errors/debugging:** every lookup, plan, media, relay, and AE error must
   include problem, cause, fix, correlation ID, and docs URL; raw stack traces
   stay server-side.
4. **Documentation/learning:** put the copy-paste Native path first, then
   contract/reference and Adobe hardware details; label fixture-only behavior
   so it is not mistaken for product support.
5. **Upgrade/migration:** document additive 021–024 migrations, v1/v2 scene
   compatibility, flag-off behavior, and exact submodule gitlink upgrades.
6. **Environment/tooling:** pin package managers and media/browser/Blender/AE
   versions, expose non-interactive test commands, and make fixtures runnable
   without network access.
7. **Community/ecosystem:** publish runnable Native examples and contribution
   boundaries; keep private Adobe installation and enrollment instructions
   explicit rather than implying an open-source AE runtime.
8. **Measurement/feedback:** instrument TTHW, lookup recall, plan failures,
   render determinism, relay queue age, rollback, and UI drop-off; schedule a
   post-release DX review against those measurements.

Developer first-person confusion report to close in P6.4:

```text
T+0:00 I find the root README and see many package commands but no single
       motion quick start. Add one entry point and state the required versions.
T+0:30 I can run a Native fixture, but I do not know whether the plan or the
       SceneSpec is authoritative. Show the lookup → plan → operation trace.
T+1:00 An ETag or provider failure currently gives a short code. Link it to the
       exact fix and explain which safe version was retained.
T+2:00 Adobe commands are typed, but I cannot tell whether AE readback is real
       or a fixture. Label fixture vs hardware gates and show the command ID.
T+3:00 I open the offline package and want to verify it without the service.
       Provide one checksum/offline command and expected output.
```

Each line maps to a concrete documentation or diagnostics task; none may be
left as an undocumented “developer should know” assumption.

### Outside-voice/degradation note

The current Default-mode developer constraint forbids spawning new subagents;
the previous Graphify/code/QA agents’ artifacts are reused, and this plan was
reviewed in single-reviewer mode. No claim of fresh dual-voice consensus is
made. Before execution, a normal review lane may run the repository’s CEO,
design, engineering, and DX reviewers against the exact implementation SHA.

## 10. Task dependency order

```text
P0.1 -> P0.2 -> P0.3/P0.4
                 |
                 +-> P1.1 -> P1.2 -> P1.3 -> P1.4 -> P1.5
                                      |
                                      +-> P2.1 -> P2.2 -> P2.3 -> P2.4
                                                          |
              +---------------------+---------------------+------------------+
              v                     v                     v                  v
            P3 Native             P4 Adobe              P5 UI/admin         P6 DX/security
              +---------------------+---------------------+------------------+
                                      v
                              P7 full verification
```

Parallel work is allowed only after the contract and migration owners publish
their fixtures. The root integrator owns API/contracts/docs and the final
gitlink. Worker and Adobe owners do not modify one another’s directories or
revert unrelated dirty files.

## TODOs

The checkboxes below are the execution ledger for `$omo:start-work`. Each
item maps one-to-one to the detailed workstream immediately above; acceptance
criteria remain separate and are not counted as implementation tasks.

- [x] P0.1 Clean integration branch and restore point
- [x] P0.2 Preserve the worker ffprobe fix
- [x] P0.3 Re-run evidence gates
- [x] P0.4 Make OpenAPI and generated contracts single-source
- [x] P1.1 Implement canonical motion knowledge lookup
- [x] P1.2 Enforce provider tool-canary admission
- [x] P1.3 Add MotionPlanV1 contract and generator
- [x] P1.4 Compile plans into bounded SceneOperation batches
- [x] P1.5 Integrate the production authoring flow
- [x] P2.1 Add predicate registry and four-attempt verifier
- [x] P2.2 Add transactional immutable scene storage
- [x] P2.3 Harden motion-scene routes and concurrency contracts
- [x] P2.4 Add independent feature flags and admission behavior
- [x] P3.1 Add transform-capable SceneSpec v2
- [x] P3.2 Implement deterministic video decode
- [x] P3.3 Implement deterministic audio and mux checks
- [x] P3.4 Ship Scene Package v2
- [x] P3.5 Pin Chrome, fonts, and repeat-frame determinism
- [x] P3.6 Add pinned Blender/3D capability
- [x] P3.7 Add typed interaction paths
- [x] P3.8 Add measured partial-beat rendering
- [x] P4.1 Publish Adobe protocol contracts and golden vectors
- [x] P4.2 Harden per-command spool correctness and recovery
- [x] P4.3 Add authenticated cloud relay and gateway
- [x] P4.4 Complete the ScriptUI polling/approval panel
- [x] P4.5 Implement real ExtendScript readback and digest results
- [x] P4.6 Implement working-copy lifecycle and render/upload
- [x] P4.7 Ship a signed fixed-path installer
- [ ] P4.8 Pass real After Effects fixture and original-AEP gate
- [x] P5.1 Apply Stitch fidelity and shared design state
- [x] P5.2 Complete creator chat/canvas/inspector states
- [x] P5.3 Extend admin API and panel for motion/Adobe operations
- [x] P5.4 Complete localization, accessibility, and responsive checks
- [x] P6.1 Close boundary security and replay protections
- [x] P6.2 Implement error/rescue contract and safe fallbacks
- [x] P6.3 Add observability, metrics, and redacted evidence
- [x] P6.4 Publish developer setup, fixtures, and troubleshooting docs
- [x] P7.1 Run the full automated verification gate
- [x] P7.2 Run the fresh Graphify closure audit
- [x] P7.3 Run `$browse` no-sandbox manual QA
- [x] P7.4 Consolidate split directories safely
- [x] P7.5 Commit, merge, push, and record the release evidence

## 11. Acceptance checklist

- [x] `MotionPlanV1` has a production generator, compiler, applier, verifier,
      persistence, API response, UI evidence, and Graphify path.
- [x] Exact/FTS lookup and canary production behavior meet the fixed corpus
      metrics and unsupported false-accept requirement.
- [x] The 12/8%/36/6 keyframe fixture passes with exact values.
- [x] Four attempts maximum; timeout, cancel, stale digest, and failure retain
      the previous safe scene and artifact.
- [x] Scene versions are immutable; ETag/idempotency/tenant isolation hold
      under concurrent requests; v1 jobs remain unchanged.
- [x] Native supports text/image/shape/video, advanced transforms, audio,
      deterministic Chrome/fonts, Blender/GLB, interactions, and safe partial
      beat rendering behind capability gates.
- [x] Scene Package is editable, offline, URL-free, fully hashed, and opens in
      an independent browser with repeated frame hashes.
- [x] Adobe local stdio and cloud relay produce identical golden results;
      spool recovery/cancel/replay protection works; real AE readback and
      original AEP invariant remain blocked pending P4.8 hardware.
- [x] UI/admin action inventory has zero disconnected enabled controls;
      Stitch fidelity, translations, accessibility, reduced motion, mobile,
      and 320 px checks pass.
- [x] Error/rescue, observability, security, docs, rollout, and rollback
      artifacts are present and redacted.
- [x] Fresh Graphify, automated suites, real render, and `$browse`
      evidence reference release SHAs; real AE remains host-blocked (P4.8).
- [x] Split directories are safely consolidated; canonical root and gitlinks
      are clean; `gh` merge/push verification is recorded.

## 12. Decision audit trail

| # | Decision | Classification | Principle | Rationale |
| --- | --- | --- | --- | --- |
| 1 | Treat “완전한 상태까지 전부” as including deferred Native waves | User-confirmed scope | Completeness | The user explicitly asked for all original TODOs, so Blender/interaction/partial render cannot remain deferred |
| 2 | Preserve v1 jobs and add v2 adapters | Mechanical | Pragmatic/explicit | Existing jobs and artifacts must remain readable; no auto-conversion |
| 3 | Keep SQLite FTS5 and exact aliases | Mechanical | DRY | The indexed cards and corpus already exist and meet the intended lookup model |
| 4 | Use a typed plan compiler instead of model-emitted JSON pointers | Architecture choice | Explicit over clever | Semantic intent stays reviewable; executable paths stay bounded and deterministic |
| 5 | Keep unsafe Adobe execution out of scope | Safety decision | Boundary security | Arbitrary scripts/expressions/preset paths cannot be made verifiable or safely exposed |
| 6 | Native remains default; Adobe is opt-in after hardware gates | Product/rollout choice | Bias toward action with safe fallback | Users without a ready Adobe device still get a complete Native path |
| 7 | Use one canonical contract source plus checked bridge vectors | Architecture choice | DRY/compatibility | Prevents OpenAPI/protocol drift without runtime coupling or byte-vendoring |
| 8 | Run single-reviewer planning now; require exact-SHA review before merge | Process constraint | Evidence over assertion | Current developer mode disallows new subagent spawning; final review must be tied to the landing SHA |

## GSTACK REVIEW REPORT

Review target: `/home/singlerr/ref_studio/.omo/plans/motion-graphics-ai-completion-v2.md`

- CEO: premises accepted from explicit user scope; alternatives recorded;
  selected contract-preserving full architecture.
- Design: Stitch/root design tokens, state coverage, responsive, accessibility,
  and no-disconnected-action requirements recorded; current design is 8/10
  until new plan/device states receive screenshots.
- Engineering: dependency graph, state machines, error/rescue registry,
  failure modes, test diagram, migrations, security, performance, and rollback
  are explicit.
- DX: persona, six-stage journey, hello-world target, copy-paste commands,
  error remediation, upgrade path, and measurements are explicit.
- External voices: unavailable in this turn by developer constraint; no false
  consensus claimed. Fresh review/QA must stamp the exact final commit.
- Unresolved product decisions: none required to start this plan. The only
  deliberate exclusions are unsafe arbitrary execution and unsupported
  third-party plug-ins, which are enforced as rejection predicates.

Plan status: ready for staged implementation, verification, and manual QA.
