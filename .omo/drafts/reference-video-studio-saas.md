---
slug: reference-video-studio-saas
status: reviewed-approved
intent: clear
review_required: true
pending-action: ready for separate $start-work execution
approach: Greenfield pnpm workspace in /home/singlerr/ref_studio — separate Next.js web, Fastify API, Node worker, shared contracts, and uv-managed Python compiler; all 9 stitch screens and all 151 controls map to real route/action/state behavior; full vision pipeline (bounded ingest/quarantine → exact 4-second selected interval → temporal measurements → T1-T6 review → AuthoringIR→SceneIR→BrowserPassSpec → exact Chromium 151.0.7922.138 DOM/SVG+WebGL2 capture → FFmpeg delivery); SQLite WAL on one local host with transactional leases and one serialized receipt writer; browser cookie+CSRF and API bearer auth share server-derived principals; Linux-native tests-after QA harness.
---

# Draft: reference-video-studio-saas

## Components (topology ledger)
<!-- id | outcome | status | evidence path -->
- C1 web-ui | 9 stitch screens ported to Next.js with Cosmic Engineering tokens; 151/151 interactive elements wired | active | stitch-extracted/stitch_design_system_ui_implementation/*/code.html
- C2 api-persistence | Creator + admin REST per saas-api-spec; SQLite; session auth; RBAC; tenant fencing; idempotency | active | handoff-extracted/saas-api-spec.md, saas-admin-panel-spec.md
- C3 ingest-boundary | Upload session, quarantine, magic bytes/size/ffprobe duration+fps validation, tenant-scoped CAS, safe errors | active | handoff-extracted/saas-api-spec.md, workflow.md
- C4 reference-compiler | Temporal-volume measurement (OCR ko, matting, tracking, camera, rhythm, effects, audio anchors) → OBSERVED/MAPPED/NEEDS CHOICE evidence bundle; fail-closed states | active | handoff-extracted/reference-interpretation-contract.json, reference-fixtures-manifest.json
- C5 scene-render | AuthoringIR→SceneIR→BrowserPassSpec compile (OWNER_MISMATCH guard); pinned Chrome CDP renderFrame(frame) DOM/SVG+WebGL2; FFmpeg assembly + delivery QC | active | handoff-extracted/editable-scene-contract.json, saas-architecture.md
- C6 gates-receipts-audit | T1-T6 gate controller, stale-approval invalidation, append-only receipts, admin audit log, retention/deletion epochs | active | handoff-extracted/saas-architecture.md §8-9, saas-admin-panel-spec.md, workflow.md

## Open assumptions (announced defaults)
<!-- assumption | adopted default | rationale | reversible? -->
- Web stack | Next.js + TypeScript + pnpm | Handoff docs already chose it | no (docs-fixed)
- DB | SQLite (better-sqlite3), single file under data/ | Docs name no DB; zero-infra, real persistence, single authoritative queue/writer matches docs' deferred scale-out | yes (early)
- Auth | Cookie sessions + CSRF for browser UI; bearer token + X-Tenant-Id for /v1 and /admin APIs; both resolve a server-derived principal; bcrypt credentials only for seeded local users | Reconciles admin_sign_in UI with the API contract | yes
- Chromium pin | Container hydrates exact Chrome-for-Testing 151.0.7922.138 from Google's known-good-versions manifest; host .169 is development-only and cannot pass T1 | Authority contract requires exact .138 and forbids silent substitution | no without formal runtime-pin change + T1 reapproval
- Runtime | Docker Node 24; uv-managed Python 3.12 CPU environment replaces Conda through an explicit Linux-runtime deviation ADR; host Node 25/Python 3.14 never defines production | Reconciles runbook with available Linux host and model wheels | yes via new approved ADR
- Wanted Sans font | Vendor WantedSansVariable.ttf from official Wanted Lab OFL release at build time | Contract requires it; system has only Unifont/WQY for Korean | yes
- QA harness | Linux-native: node/bash validators + fixtures under .omo/fixtures/plan-qa/, same happy+failure discipline as original PowerShell harness | Env is Linux; original .ps1 commands are Windows-only | n/a
- UI copy language | Stitch HTML copy verbatim (English UI); Korean only where docs/screens show Korean | Designs are the authority for copy | yes
- Billing | Metadata-only (plan/quota fields); NO payment integration | Spec: "No payment-card data" | n/a
- VLM | Heuristic labeler only; no external VLM calls (XAI_API_KEY absent → docs say planner is heuristic) | Docs sanction heuristic path | yes
- Analysis admission | Source remains 1s-5min, but the selected compiler/render interval is exactly 4.0s and at most 240 frames; one active compile/render worker, CPU/RSS/stage deadlines enforced | Only 4-second trials are approved; 5min×60fps full-frame ML is unbounded on 4 CPU cores | later benchmark + separate approval
- SQLite topology | local disk only, WAL, busy_timeout, BEGIN IMMEDIATE job claims, lease expiry, one receipt writer, no NFS | Required for crash-safe single authoritative queue/order | scale-out requires datastore migration plan

## Findings (cited - path:lines)
- Handoff authority: Trial1 compiler v1.9, Trial2 compiler v1.13, T1-T6 APPROVED; v1.8 rejected-history — handoff-extracted/README.md, authority-ledger.json
- Measurement contract: temporal volume, OCR/UI bounds px, matting alpha, tracking samples, camera pan/tilt/zoom, rhythm beats, residual canvas, audio 48kHz stereo anchors, confidence [0,1], VLM label-only, 11 fail-closed states — handoff-extracted/reference-interpretation-contract.json
- Editable scene chain AuthoringIR→SceneIR→BrowserPassSpec with ownerIntegrity OWNER_MISMATCH; full example scene (1080x1920@30, 7 tracks, 10 passes, shaders named) — handoff-extracted/editable-scene-contract.json
- API surface: POST /v1/uploads, POST /v1/jobs, GET /v1/jobs/:id, GET /v1/receipts, POST /v1/reviews + admin endpoints (tenants, tenant jobs, job cancel, receipts, audit-log, quarantine list/release, billing) + 20 error codes + 5 data models — handoff-extracted/saas-api-spec.md
- Job states: UPLOADING→VALIDATING→PREPARING→READY→QUEUED→RENDERING→ASSEMBLING→COMPLETED + alternates — handoff-extracted/workflow.md
- RBAC matrix 15 capabilities × 3 roles; 21 audit event types; admin cannot approve T2-T6 / mutate receipts/renders — handoff-extracted/saas-admin-panel-spec.md
- UI/UX spec: 6 admin screens with components/states/copy rules — handoff-extracted/saas-admin-uiux-spec.md
- Renderer bake-off: browser PASSED reference-similar (determinism 1.0, SSIM 0.935); blender partial; natron/resolve/nuke/remotion/hyperframes NOT-AVAILABLE — handoff-extracted/renderer-bakeoff-report.json
- Stitch: 9 screens (landing, sign-in, upload_validation, scene_review_approval, job_queue_delivery, admin_tenants, admin_receipt_chain, admin_quarantine, admin_audit_log), 151 interactive elements, all href="#"/unwired; only admin_tenants has toggleDetails JS — stitch-extracted/INVENTORY_STITCH.md
- Design tokens: Cosmic Engineering (dark canvas #0a0a0a, Manrope/Inter/Geist, spacing/radius/component tokens) — stitch-extracted/.../cosmic_engineering/DESIGN.md
- Env: Ubuntu 24.04, 4 cores, 15GB RAM, 230GB free, no NVIDIA, node v25.5.0, pnpm 11.20.0, ffmpeg 8.0.1, Chrome 151.0.7922.169, uv 0.11.8, py3.14 system, npm/pypi/HF/github reachable — env probe 2026-08-21
- Graphify: graphify-out/graph.json 144 nodes/154 edges/15 communities; screen↔contract links verified (scene_review_approval↔reference-interpretation-contract; queue_delivery bridges creator/admin/renderer)

## Decisions (with rationale)
- FULL VISION PIPELINE (user chose over stand-in renderer, 2026-08-21): real reference compiler measuring every frame of the admitted 4-second interval. One PyTorch CPU stack minimizes runtime duplication: RVM MobileNetV3 matting, EasyOCR ko+en, MiDaS-small-class depth, OpenCV camera/tracking, image/signal effect and audio profilers. Exact direct versions are fixed in `reference-video-studio-saas-dependency-pins-v2.json`; the authority bootstrap may only resolve their transitive closure with pinned pnpm/uv, hydrate it, prove a frozen offline install, and extend the parent authority root. No task selects “newest,” ranges, alternatives, or substitutions.
- CANONICAL STATE MODEL: persist the full workflow enum from workflow.md; creator API projects it to the documented six public states, while authorized admin/detail views expose full internal state plus safe reason. One transition table controls API, worker, UI, and receipts.
- DESIGNATED REVIEWER: reviewer_assignments binds user+tenant+gate; only an assigned DESIGNATED_REVIEWER can approve T1-T6. System/compiler may emit evidence-ready records but never approvals. super-admin, ops-admin, viewer, OWNER, ADMIN remain forbidden for T2-T6.
- graphify + ponytail ultra + caveman-spirit applied per user request; caveman skill not installed (terse style adopted manually).
- Pilot from D:\motions is unreachable → QA uses synthetic fixture videos generated by ffmpeg per reference-fixtures-manifest (identity, occlusion, ui-text, camera, rhythm, vfx-ownership, audio, coherent-wrong, pass-swapped, ablation + 2 frame contracts).

## Scope IN
- All 9 stitch screens as Next.js routes; all 151 inventoried interactive elements wired to real behavior (nav routing, forms, filters, drawers, pagination, confirms, toasts) — zero dead controls.
- Creator API + admin API per saas-api-spec; auth/RBAC; tenant fencing; idempotency keys; safe error schema with correlationId.
- Ingest: bounded upload (MP4, ≤2GB, 1s-5min, CFR 24/25/30/50/60), quarantine, magic bytes, ffprobe validation, tenant CAS; immutable original and normalized CFR working input are distinct artifact types and compiler/renderer cannot read quarantined/raw bytes.
- Compiler: full temporal measurement per contract; evidence bundle; human review surface with OBSERVED/MAPPED/NEEDS CHOICE.
- Gates T1-T6 with designated reviewer assignments and stale-approval invalidation; append-only receipts; admin audit log (21 event types); media retention 30d/7d/24h, admin audit/export retention 90d, admin idle session timeout 30m, deletion epochs.
- Render: AuthoringIR→SceneIR→BrowserPassSpec; Chrome CDP worker; renderFrame(frame) deterministic; DOM/SVG semantic UI + WebGL2 effect passes; FFmpeg mux + delivery QC; download of completed artifact + render report.
- Runtime preflight (exact .138, SwiftShader, fonts, ffmpeg, locked Python/model assets, blocked network) failing closed; Linux-native QA harness with happy+failure fixtures per task.
- Seed data: 3 tenants, roles, sample jobs/receipts matching stitch demo content.
- Machine-readable 151-control action manifest: route, accessible selector/name, role/state policy, enabled/disabled reason, endpoint or bounded local behavior, expected result; Playwright executes every row at desktop and narrow viewports.
- Tenant-fenced expiring video/report/receipt/audit export downloads; foreign, expired, failed, and partial artifacts never download.

## Scope OUT (Must NOT have)
- Diffusion/video-generation models as render authority; captured screenshot in place of semantic DOM/SVG UI; flattened UI; generic cube layouts; camera-only "similarity"; synthetic fixed trajectories; unmeasured prose claims; contact-sheet compiler; VLM deleting measured layers; subtitle geometry derived from title box; merged bloom+defocus; unbound VFX; residual baked into product UI; network during render; silent font/browser/shader fallback; wall-clock animation; stale approval reuse; cross-tenant access; mutable receipts; admin approving T2-T6; hash gating; successful-encode-as-approval.
- Payment processing, real billing; email/SMS/password-reset backend (Forgot Secret routes to bounded support flow); horizontal scale-out (docs defer); Windows/PowerShell harness; mobile native apps; multi-language UI.
- No claim that arbitrary 5-minute clips are production-quality; delivered capability is explicitly a 4-second selected-interval pilot until separate benchmark/quality approval.

## Open questions
- (none — topology locked 6 components, test strategy = tests-after + per-task QA harness, render-depth fork = full pipeline; all resolved 2026-08-21)

## Approval gate
status: approved
approved-by-user: 2026-08-21
plan-path: .omo/plans/reference-video-studio-saas.md
plan-shape: 7 waves; 45 implementation todos; 4 final verification tasks
metis: completed; 18 findings folded into authority, auth, state, resource, SQLite, supply-chain, UI-control, accessibility, and pilot-boundary decisions
next-action: ready for separate $start-work execution using the Round 9 approved binding

## High-accuracy review state
phase: review_round_9_completed_approved
round_status: approved
workspace_root: /home/singlerr/ref_studio
runtime_home: null
target: .omo/plans/reference-video-studio-saas.md
plan_sha256: 4bfa2573d0013b6b75abb864cc4d0b819fb561a252960b86b1b8f68c557baac5
plan_bytes: 120040
authority_root_path: .omo/drafts/reference-video-studio-saas-authority-root.md
authority_root_sha256: 8c0df9b22418180ab4a79d229fc5671640a50c875e62603d5ad99bb5dbe918e2
authority_root_bytes: 4890
authority_root_verification: PASS; all 14 manifest entries match live bytes and SHA-256; exactly one fenced JSON block parsed; 151 control rows; 45 implementation tasks and 4 final tasks; no stale-token anomalies
authority_root_verifier_sessions: ses_fda7577b0ffekwb1DNXb8KZOzC
review_round_id: ha-r9-20260821-4bfa2573-root8c0df9b2
prior_round:
  round_identity: ha-r3-20260821-6f832bc0-root2ba14b3d
  artifact_identity: 6f832bc05a2bc5a3e94517442a5d8814ca1cd2f165148266d73e49943854a094
  artifact_bytes: 112261
  authority_root_sha256: 2ba14b3db7530d36bce7660e2f63f37afd220eae2aa55a0bd77c4e50dddbf4d4
  authority_root_bytes: 4239
  momus_session: ses_fdb2f43c3ffeaKrQO1RO6Gb4Qk
  momus_result: REJECT
  oracle_session: ses_fdb2f4175ffe0nxVc5xJiDz45w
  oracle_result: CHANGES_REQUESTED
  fix_summary: added root-bound visual landmark manifest; patched visual, fixture, supply-chain, audit/control, execution and API-action contracts; fixed API action contract to rvs-api-action-contract-v3; aligned audit/control contracts on QUARANTINE_RELEASE_REVIEWED and forbade QUARANTINE_RELEASED alias; rebound the authority root to the updated plan and contract artifacts.
momus:
  status: changes_requested
  launch_id: momus-ha-r4-8dc44006-rootf8c67e95
  session: ses_fdae68a3cffejniGGxr2aZ3GcF
  result: REJECT
  receipt_identity: session_or_process_identity=unavailable
  echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=8dc44006750cf694e67f48a7ab87139e52c89f831e9fbb4265af0f0926fb29c6; authority_root_sha256=f8c67e95184417cadedebfec7d89fd58ff7b6558358595225a711d4f8ad33477; round_identity=ha-r4-20260821-8dc44006-rootf8c67e95; launch_identity=momus-ha-r4-8dc44006-rootf8c67e95
independent:
  reviewer: oracle
  status: changes_requested
  launch_id: oracle-ha-r4-8dc44006-rootf8c67e95
  session: ses_fdae686b1ffeWKLqdREUStRBQV
  result: CHANGES_REQUESTED
  receipt_identity: session_or_process_identity=not-visible
  echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=8dc44006750cf694e67f48a7ab87139e52c89f831e9fbb4265af0f0926fb29c6; authority_root_sha256=f8c67e95184417cadedebfec7d89fd58ff7b6558358595225a711d4f8ad33477; round_identity=ha-r4-20260821-8dc44006-rootf8c67e95; launch_identity=oracle-ha-r4-8dc44006-rootf8c67e95
round_3_blockers:
  momus: root manifest did not bind the visual landmarks artifact, leaving visual geometry assertions unanchored; quarantine release audit/control terminology remained ambiguous enough to permit alias drift
  oracle: API action schema/control coverage still allowed version drift and alias mismatch; authority root did not yet bind all updated visual/fixture/control/API artifacts under one final digest
round_4_binding:
  workspace_root: /home/singlerr/ref_studio
  runtime_home: null
  target: .omo/plans/reference-video-studio-saas.md
  plan_sha256: 8dc44006750cf694e67f48a7ab87139e52c89f831e9fbb4265af0f0926fb29c6
  plan_bytes: 115380
  authority_root_path: .omo/drafts/reference-video-studio-saas-authority-root.md
  authority_root_sha256: f8c67e95184417cadedebfec7d89fd58ff7b6558358595225a711d4f8ad33477
  authority_root_bytes: 4541
  required_reviewer_echo: workspace_root, runtime_home, target, artifact_identity, authority_root_sha256, round_identity, launch_identity
round_4_blockers:
  momus:
    - T6 release review auth was undefined because generic /v1 required X-Tenant-Id while T6 reviewer assignments are release-scoped with tenantId=null.
    - Todo 17 consumed the Todo 4 capacity fixture without depending on Todo 4.
  oracle:
    - API PageQuery did not allow audit controls eventType/range/object/tenant, and seeded display IDs were used as canonical JobId/ReceiptId path IDs.
    - Fixture oracle was internally impossible: identity drew a rectangle but declared an ellipse, occlusion phases were indistinguishable, dense OCR drew 5 regions while claiming 40, and source MP4 did not include measured audio.
    - Retry semantics allowed PREPARING retry to jump to QUEUED and did not define approval carry/reapproval rules across attempts.
    - Quarantine release returned an accepted artifact from terminal QUARANTINED instead of creating a linked revalidation attempt.
    - Authority child-root policy/evidence index could not bind Todo 3 verifier/final release artifacts, output digests, or browser identity.
    - Final verification F2-F4 shared state/hash writers while F3 ran docker compose down -v; F3 also needed to prove the browser launched by Playwright is Chrome 151.0.7922.138.
  repair_policy: patch only .omo artifacts, rehash changed artifacts, rebind authority root, verify structure/root, and launch a fresh Round 5 against one final plan/root binding.
round_5_binding:
  workspace_root: /home/singlerr/ref_studio
  runtime_home: null
  target: .omo/plans/reference-video-studio-saas.md
  plan_sha256: 4715c4b4a72126e0e13916b1f1a85031ac30c83078118e532c1aee30feeb7274
  plan_bytes: 116763
  authority_root_path: .omo/drafts/reference-video-studio-saas-authority-root.md
  authority_root_sha256: ae746e8f75948e1cc6e0a8ad24d1b19f2e7e13b9c5c32b82c66d38cf7699e7ab
  authority_root_bytes: 4890
  structural_verification_session: ses_fdaa9cbf7ffeTtB56hKjK30AY6
  structural_verification_result: PASS; 14/14 root entries match; required JSON parses; control JSONL has 151 rows; no stale-token anomalies; plan has 45 implementation rows and 4 final rows
  required_reviewer_echo: workspace_root, runtime_home, target, artifact_identity, authority_root_sha256, round_identity, launch_identity
  momus:
    status: approved
    launch_id: momus-ha-r5-4715c4b4-rootae746e8f
    session: ses_fdaa73c89ffep6KPObfG7R6ZLH
    result: OKAY
    receipt_identity: session=ses_fdaa73c89ffep6KPObfG7R6ZLH
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=4715c4b4a72126e0e13916b1f1a85031ac30c83078118e532c1aee30feeb7274; authority_root_sha256=ae746e8f75948e1cc6e0a8ad24d1b19f2e7e13b9c5c32b82c66d38cf7699e7ab; round_identity=ha-r5-20260821-4715c4b4-rootae746e8f; launch_identity=momus-ha-r5-4715c4b4-rootae746e8f
  independent:
    reviewer: oracle
    status: changes_requested
    launch_id: oracle-ha-r5-4715c4b4-rootae746e8f
    session: ses_fdaa6f72effexAciTRuvAeCiWt
    result: CHANGES_REQUESTED
    receipt_identity: session=ses_fdaa6f72effexAciTRuvAeCiWt
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=4715c4b4a72126e0e13916b1f1a85031ac30c83078118e532c1aee30feeb7274; authority_root_sha256=ae746e8f75948e1cc6e0a8ad24d1b19f2e7e13b9c5c32b82c66d38cf7699e7ab; round_identity=ha-r5-20260821-4715c4b4-rootae746e8f; launch_identity=oracle-ha-r5-4715c4b4-rootae746e8f
round_5_blockers:
  oracle:
    - F2-F4 final verification commands used the default Compose project and shared `.omo/evidence`, so F3 `docker compose down -v` could destroy parallel verifier state despite the isolation contract.
    - `PageQuery` omitted bounded `outcome` even though Todo 40 requires outcome filtering.
    - Quarantine controls used `QT-*` display IDs as canonical path IDs and their release result implied direct release instead of linked revalidation preserving the terminal `QUARANTINED` record.
    - Fixture/media contracts were not physically reproducible: camera used frame variable `n` in scale without frame eval; media normalization kept unresolved channel-matrix placeholders; camera/rhythm/VFX recipes did not generate declared oracles.
    - Todo 7 and Todo 8 wording still implied global `/v1` `X-Tenant-Id` enforcement without the `POST /v1/release-reviews` no-tenant-header exception.
  repair_policy: patch only .omo artifacts, rehash changed artifacts, rebind authority root, verify structure/root, and launch a fresh Round 6 against one final plan/root binding.
round_6_binding:
  workspace_root: /home/singlerr/ref_studio
  runtime_home: null
  target: .omo/plans/reference-video-studio-saas.md
  plan_sha256: 13ef3af2b8a8abbb2b9536e810ce4ffea1e970a1f4cd7f56b3fd2c0fb39ae58a
  plan_bytes: 119229
  authority_root_path: .omo/drafts/reference-video-studio-saas-authority-root.md
  authority_root_sha256: 85467f1d68f7ee0c254b6271188856bb6bed80cec3e8e279284d1c049e7d8f9c
  authority_root_bytes: 4890
  structural_verification_session: ses_fda98c7ceffesAxAwf0I29JofU
  structural_verification_result: PASS; 14/14 root entries match; required JSON parses; control JSONL has 151 rows; no stale-token anomalies; plan has 45 implementation rows and 4 final rows
  required_reviewer_echo: workspace_root, runtime_home, target, artifact_identity, authority_root_sha256, round_identity, launch_identity
  momus:
    status: approved
    launch_id: momus-ha-r6-13ef3af2-root85467f1d
    session: ses_fda96c47affe6alaxQlTJcW1UX
    result: OKAY
    receipt_identity: session=ses_fda96c47affe6alaxQlTJcW1UX
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=13ef3af2b8a8abbb2b9536e810ce4ffea1e970a1f4cd7f56b3fd2c0fb39ae58a; authority_root_sha256=85467f1d68f7ee0c254b6271188856bb6bed80cec3e8e279284d1c049e7d8f9c; round_identity=ha-r6-20260821-13ef3af2-root85467f1d; launch_identity=momus-ha-r6-13ef3af2-root85467f1d
  independent:
    reviewer: oracle
    status: changes_requested
    launch_id: oracle-ha-r6-13ef3af2-root85467f1d
    session: ses_fda9682bcffe7aNxZIyE1obTdn
    result: CHANGES_REQUESTED
    receipt_identity: session=ses_fda9682bcffe7aNxZIyE1obTdn
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=13ef3af2b8a8abbb2b9536e810ce4ffea1e970a1f4cd7f56b3fd2c0fb39ae58a; authority_root_sha256=85467f1d68f7ee0c254b6271188856bb6bed80cec3e8e279284d1c049e7d8f9c; round_identity=ha-r6-20260821-13ef3af2-root85467f1d; launch_identity=oracle-ha-r6-13ef3af2-root85467f1d
round_6_blockers:
  oracle:
    - `identity`, `camera`, and `coherent-wrong` fixture filtergraphs used `n` inside drawbox position expressions that Oracle reproduced as invalid under pinned FFmpeg 8.0.1.
    - Camera fixture physical recipe still did not match the static-background affine oracle, and the VFX positive/ablation authority did not provide independently reproducible bloom profile and Gaussian defocus sigma evidence required by Todo 21.
  repair_policy: patch only .omo artifacts, rehash changed artifacts, rebind authority root, verify structure/root, and launch a fresh Round 7 against one final plan/root binding.
round_7_binding:
  workspace_root: /home/singlerr/ref_studio
  runtime_home: null
  target: .omo/plans/reference-video-studio-saas.md
  plan_sha256: d5a6c11f6bfdbeab02a4ffd64b32b74ba6c7c6a9d4d3f4535ee5afe9c5b160e7
  plan_bytes: 119569
  authority_root_path: .omo/drafts/reference-video-studio-saas-authority-root.md
  authority_root_sha256: 0b66a52d31b1d63013314534f6497d2c5768b95ff9e9d547afb149c8c5963ba8
  authority_root_bytes: 4890
  structural_verification_session: ses_fda8a9e66ffekib07YpgS77QD9
  structural_verification_result: PASS; 14/14 root entries match; required JSON parses; control JSONL has 151 rows; no stale-token anomalies; no fixture drawbox x/y expression uses n; plan has 45 implementation rows and 4 final rows
  required_reviewer_echo: workspace_root, runtime_home, target, artifact_identity, authority_root_sha256, round_identity, launch_identity
  momus:
    status: approved
    launch_id: momus-ha-r7-d5a6c11f-root0b66a52d
    session: ses_fda88c2aaffeeZ65T0tKkNTHP3
    result: OKAY
    receipt_identity: session=ses_fda88c2aaffeeZ65T0tKkNTHP3
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=d5a6c11f6bfdbeab02a4ffd64b32b74ba6c7c6a9d4d3f4535ee5afe9c5b160e7; authority_root_sha256=0b66a52d31b1d63013314534f6497d2c5768b95ff9e9d547afb149c8c5963ba8; round_identity=ha-r7-20260821-d5a6c11f-root0b66a52d; launch_identity=momus-ha-r7-d5a6c11f-root0b66a52d
  independent:
    reviewer: oracle
    status: changes_requested
    launch_id: oracle-ha-r7-d5a6c11f-root0b66a52d
    session: ses_fda887fe2fferTMdt1jdAHWXuL
    result: CHANGES_REQUESTED
    receipt_identity: session=ses_fda887fe2fferTMdt1jdAHWXuL
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=d5a6c11f6bfdbeab02a4ffd64b32b74ba6c7c6a9d4d3f4535ee5afe9c5b160e7; authority_root_sha256=0b66a52d31b1d63013314534f6497d2c5768b95ff9e9d547afb149c8c5963ba8; round_identity=ha-r7-20260821-d5a6c11f-root0b66a52d; launch_identity=oracle-ha-r7-d5a6c11f-root0b66a52d
round_7_blockers:
  oracle:
    - Camera fixture used temporally changing `testsrc2` while truth claimed static background, contaminating the affine oracle.
    - VFX bloom rings were invisible/overwritten under FFmpeg 8.0.1, so the positive fixture did not actually prove separable bloom.
    - Ablations existed only as prose, not executable/hash-bound variant graphs or digests.
    - Success criteria said two Linux pilots while Todo 44/F3 require five FPS profiles.
  repair_policy: patch only .omo artifacts, rehash changed artifacts, rebind authority root, verify structure/root, and launch a fresh Round 8 against one final plan/root binding.
round_8_binding:
  workspace_root: /home/singlerr/ref_studio
  runtime_home: null
  target: .omo/plans/reference-video-studio-saas.md
  plan_sha256: 4bfa2573d0013b6b75abb864cc4d0b819fb561a252960b86b1b8f68c557baac5
  plan_bytes: 120040
  authority_root_path: .omo/drafts/reference-video-studio-saas-authority-root.md
  authority_root_sha256: c7f3bb465c8afbb2bda9ef1fce729d6f096a4f8c3d611ae6240b677e7a1954d7
  authority_root_bytes: 4890
  structural_verification_session: ses_fda7f5a53ffepXhJaT6OSZZe5U
  structural_verification_result: PASS; 14/14 root entries match; required JSON parses; control JSONL has 151 rows; no stale-token anomalies; no fixture drawbox x/y expression uses n; camera contains no testsrc2; ablation variants present; plan has 45 implementation rows and 4 final rows
  required_reviewer_echo: workspace_root, runtime_home, target, artifact_identity, authority_root_sha256, round_identity, launch_identity
  momus:
    status: approved
    launch_id: momus-ha-r8-4bfa2573-rootc7f3bb46
    session: ses_fda7cec2dffe44yhtQYlQtsS43
    result: OKAY
    receipt_identity: session=ses_fda7cec2dffe44yhtQYlQtsS43
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=4bfa2573d0013b6b75abb864cc4d0b819fb561a252960b86b1b8f68c557baac5; authority_root_sha256=c7f3bb465c8afbb2bda9ef1fce729d6f096a4f8c3d611ae6240b677e7a1954d7; round_identity=ha-r8-20260821-4bfa2573-rootc7f3bb46; launch_identity=momus-ha-r8-4bfa2573-rootc7f3bb46
  independent:
    reviewer: oracle
    status: changes_requested
    launch_id: oracle-ha-r8-4bfa2573-rootc7f3bb46
    session: ses_fda7cb278ffega1ReEvYknXMya
    result: CHANGES_REQUESTED
    receipt_identity: session=ses_fda7cb278ffega1ReEvYknXMya
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=4bfa2573d0013b6b75abb864cc4d0b819fb561a252960b86b1b8f68c557baac5; authority_root_sha256=c7f3bb465c8afbb2bda9ef1fce729d6f096a4f8c3d611ae6240b677e7a1954d7; round_identity=ha-r8-20260821-4bfa2573-rootc7f3bb46; launch_identity=oracle-ha-r8-4bfa2573-rootc7f3bb46
round_8_blockers:
  oracle:
    - VFX positive fixture and removeBloom/removeDefocus ablation variant filtergraphs were malformed as lavfi inputs because they opened additional sources via comma chains and referenced nonexistent external `[0:v]` labels.
  repair_policy: patch only .omo artifacts, rehash changed artifacts, rebind authority root, verify structure/root, and launch a fresh Round 9 against one final plan/root binding.
round_9_binding:
  workspace_root: /home/singlerr/ref_studio
  runtime_home: null
  target: .omo/plans/reference-video-studio-saas.md
  plan_sha256: 4bfa2573d0013b6b75abb864cc4d0b819fb561a252960b86b1b8f68c557baac5
  plan_bytes: 120040
  authority_root_path: .omo/drafts/reference-video-studio-saas-authority-root.md
  authority_root_sha256: 8c0df9b22418180ab4a79d229fc5671640a50c875e62603d5ad99bb5dbe918e2
  authority_root_bytes: 4890
  structural_verification_session: ses_fda7577b0ffekwb1DNXb8KZOzC
  structural_verification_result: PASS; 14/14 root entries match; required JSON parses; control JSONL has 151 rows; no stale-token anomalies; no fixture drawbox x/y expression uses n; camera contains no testsrc2; ablation variants present; VFX graphs have no external [0:v] or comma-introduced second color source; plan has 45 implementation rows and 4 final rows
  required_reviewer_echo: workspace_root, runtime_home, target, artifact_identity, authority_root_sha256, round_identity, launch_identity
  momus:
    status: approved
    launch_id: momus-ha-r9-4bfa2573-root8c0df9b2
    session: ses_fda738168ffesOPRTkDcypz2n4
    result: OKAY
    receipt_identity: session=ses_fda738168ffesOPRTkDcypz2n4
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=4bfa2573d0013b6b75abb864cc4d0b819fb561a252960b86b1b8f68c557baac5; authority_root_path=.omo/drafts/reference-video-studio-saas-authority-root.md; authority_root_sha256=8c0df9b22418180ab4a79d229fc5671640a50c875e62603d5ad99bb5dbe918e2; authority_root_bytes=4890; round_identity=ha-r9-20260821-4bfa2573-root8c0df9b2; launch_identity=momus-ha-r9-4bfa2573-root8c0df9b2
    summary: OKAY; plan and authority root hashes match; 14 manifest entries match; VFX positive/removeBloom/removeDefocus use internal labels only and no external [0:v]
  independent:
    reviewer: oracle
    status: approved
    launch_id: oracle-ha-r9-4bfa2573-root8c0df9b2
    session: ses_fda7340e4ffeKxP4OtyzSrOTIW
    result: APPROVED
    receipt_identity: session=ses_fda7340e4ffeKxP4OtyzSrOTIW
    echoed_binding: workspace_root=/home/singlerr/ref_studio; runtime_home=null; target=.omo/plans/reference-video-studio-saas.md; artifact_identity=4bfa2573d0013b6b75abb864cc4d0b819fb561a252960b86b1b8f68c557baac5; authority_root_path=.omo/drafts/reference-video-studio-saas-authority-root.md; authority_root_sha256=8c0df9b22418180ab4a79d229fc5671640a50c875e62603d5ad99bb5dbe918e2; authority_root_bytes=4890; round_identity=ha-r9-20260821-4bfa2573-root8c0df9b2; launch_identity=oracle-ha-r9-4bfa2573-root8c0df9b2
    summary: APPROVED; no blockers; plan/root manifest verified; VFX graphs executed via declared lavfi pattern; prior repairs rechecked including static camera, ablations, five FPS pilots, verifier isolation, outcome query, qitem IDs, linked revalidation, and release-review tenant-header exception
round_9_result:
  terminal_verdict: APPROVED
  handoff_status: ready_for_start_work
  approved_plan_path: .omo/plans/reference-video-studio-saas.md
  approved_plan_sha256: 4bfa2573d0013b6b75abb864cc4d0b819fb561a252960b86b1b8f68c557baac5
  approved_plan_bytes: 120040
  approved_authority_root_path: .omo/drafts/reference-video-studio-saas-authority-root.md
  approved_authority_root_sha256: 8c0df9b22418180ab4a79d229fc5671640a50c875e62603d5ad99bb5dbe918e2
  approved_authority_root_bytes: 4890
  review_sessions: [ses_fda738168ffesOPRTkDcypz2n4, ses_fda7340e4ffeKxP4OtyzSrOTIW]
  mutation_rule: any subsequent mutation of the approved plan or authority root requires a new review identity before execution handoff
