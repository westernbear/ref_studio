# Graph Report - graphify-corpus  (2026-08-21)

## Corpus Check
- Corpus is ~29,017 words - fits in a single context window. You may not need a graph.

## Summary
- 144 nodes · 154 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 58% EXTRACTED · 42% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.89)
- Token cost: 44,500 input · 13,700 output

## Community Hubs (Navigation)
- Admin UI Screens
- Creator Workflow UI
- Renderer Pipeline
- Authority Handoff
- Evidence Contracts
- Validation Fixtures
- Scene Review Evidence
- Admin RBAC Ops
- Editable Scene Design
- Tenant Intake Boundary
- QA Harness
- Recovery Isolation
- Runtime Preflight
- Deletion Epoch Model
- Deployment Runbook

## God Nodes (most connected - your core abstractions)
1. `Admin Shared Components` - 6 edges
2. `Pre Flight Checks UI` - 6 edges
3. `Queue Delivery Screen` - 6 edges
4. `T1-T6 Receipt Ledger` - 5 edges
5. `REF_STUDIO Landing Screen` - 5 edges
6. `Scene Review Approval Screen` - 5 edges
7. `Observed Measurements Panel` - 5 edges
8. `Dark Data Table Pattern` - 5 edges
9. `Reference Video Studio Final Handoff` - 4 edges
10. `Reference Video Studio SaaS ULW Plan` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Observed Measurements Panel` --semantically_similar_to--> `OCR UI Bounds`  [INFERRED] [semantically similar]
  stitch_screens/scene_review_approval/code.html → reference-interpretation-contract.json
- `Runtime Preflight` --semantically_similar_to--> `Runtime Pin Contract`  [INFERRED] [semantically similar]
  saas-operations.md → authority-ledger.json
- `Recovery Isolation` --semantically_similar_to--> `Backup And Recovery`  [INFERRED] [semantically similar]
  recovery-report.json → saas-operations.md
- `Temporal Evidence Feature Card` --semantically_similar_to--> `Temporal Volume Contract`  [INFERRED] [semantically similar]
  stitch_screens/ref_studio_landing/code.html → reference-interpretation-contract.json
- `Camera Motion Card` --semantically_similar_to--> `Camera Motion Separation`  [INFERRED] [semantically similar]
  stitch_screens/scene_review_approval/code.html → reference-interpretation-contract.json

## Hyperedges (group relationships)
- **Handoff Authority Chain** — readme_trial_1_compiler_v1_9_authority, readme_trial_2_compiler_v1_13_authority, authority_ledger_t1_t6_receipts, stale_history_v1_8_rejected [EXTRACTED 1.00]
- **Evidence To Render Pipeline** — saas_architecture_quarantine, saas_architecture_tenant_scoped_cas, saas_architecture_reference_compiler, saas_architecture_human_review, saas_architecture_authoringir_sceneir_browserpassspec, saas_architecture_render_worker, saas_architecture_ffmpeg_delivery [EXTRACTED 1.00]
- **Fail Closed Safety Boundary** — saas_architecture_tenant_fencing, saas_architecture_deletion_epoch, saas_architecture_safe_errors, saas_architecture_append_only_receipts, reference_interpretation_fail_closed_states [INFERRED 0.95]
- **Creator Workflow UI Screens** — stitch_screens_ref_studio_landing_code_landing_screen, stitch_screens_upload_validation_code_upload_validation_screen, stitch_screens_scene_review_approval_code_scene_review_screen, stitch_screens_job_queue_delivery_code_queue_delivery_screen [INFERRED 0.95]
- **Admin Operations UI Screens** — stitch_screens_admin_sign_in_code_admin_sign_in_screen, stitch_screens_admin_tenants_code_tenant_list_screen, stitch_screens_admin_quarantine_code_quarantine_screen, stitch_screens_admin_receipt_chain_code_receipt_chain_screen, stitch_screens_admin_audit_log_code_audit_log_screen [INFERRED 0.95]
- **Cosmic Design Language** — stitch_screens_cosmic_engineering_design_near_black_canvas, stitch_screens_cosmic_engineering_design_typography_system, stitch_screens_cosmic_engineering_design_component_tokens, stitch_screens_shared_dark_data_tables [EXTRACTED 1.00]

## Communities (15 total, 3 thin omitted)

### Community 0 - "Admin UI Screens"
Cohesion: 0.10
Nodes (25): Audit Export Workflow, Audit Log Specification, Job Queue Screen Specification, Login Screen Specification, Quarantine Manager Specification, Receipt Chain Viewer Specification, Admin Shared Components, Tenant List Screen Specification (+17 more)

### Community 1 - "Creator Workflow UI"
Cohesion: 0.11
Nodes (20): Admin Job Cancellation Workflow, POST /v1/jobs, POST /v1/reviews, Queue Delivery Screen, Queued Job Row, Rendering Job Row, Shared REF_STUDIO Top Nav, Audio Track Check (+12 more)

### Community 2 - "Renderer Pipeline"
Cohesion: 0.11
Nodes (19): WebGL2 Browser Incumbent, Blender Partial Renderer, Browser Renderer Passed, Renderer Bakeoff Report, Unavailable Renderers, Forbidden Admin Actions, GET /v1/receipts, Append Only Receipts (+11 more)

### Community 3 - "Authority Handoff"
Cohesion: 0.15
Nodes (14): T1-T6 Receipt Ledger, Deterministic Execution Contract, Momus And Oracle Review Gate, Must Not Have Guardrails, T1-T6 Gate Plan, Reference Video Studio SaaS ULW Plan, Path Based Provenance, Canonical Recovery Report JSON (+6 more)

### Community 4 - "Evidence Contracts"
Cohesion: 0.20
Nodes (10): Research Ledger Decisions, Owner Integrity Guard, Residual Canvas Separation, OCR UI Bounds, Owner Effect Association, Segmentation And Matting, Temporal Volume Contract, Evidence First Admin UI (+2 more)

### Community 5 - "Validation Fixtures"
Cohesion: 0.20
Nodes (10): Pilot Fixed Frame Checks, Pilot Media Contract, Pilot Evidence PASS, Adversarial Fixture Cases, Frame Contracts, Reference Fixtures Manifest, Fail Closed States, VLM Label Only Boundary (+2 more)

### Community 6 - "Scene Review Evidence"
Cohesion: 0.22
Nodes (9): Audio Anchors, Camera Motion Separation, Rhythm And Audio Cues, Camera Motion Card, Light Fields Card, Observed Measurements Panel, OCR Measurement Card, Scene Review Approval Screen (+1 more)

### Community 7 - "Admin RBAC Ops"
Cohesion: 0.22
Nodes (9): Ops Admin Role, Quota Change Workflow, Admin RBAC Matrix, Super Admin Role, Viewer Role, Admin API, Admin Panel System, Admin Operations Runbook (+1 more)

### Community 8 - "Editable Scene Design"
Cohesion: 0.25
Nodes (8): AuthoringIR, BrowserPassSpec, Editable Scene Contract, SceneIR, Engineered Cosmic Aesthetic, REF_STUDIO Landing Screen, Semantic UI Portability Feature Card, Render Mapping Panel

### Community 9 - "Tenant Intake Boundary"
Cohesion: 0.29
Nodes (7): Tenant Fenced API Contract, POST /v1/uploads, Multi Tenant Product Boundary, Quarantine Boundary, Tenant Fencing, Safe Mode Notice, Video Dropzone

### Community 10 - "QA Harness"
Cohesion: 0.40
Nodes (5): Failure QA Runner, Handoff QA Commands, Happy QA Validator, Final Verification Wave, Plan QA Harness

### Community 11 - "Recovery Isolation"
Cohesion: 1.00
Nodes (3): Recovery Isolation, Recovery Report PASS, Backup And Recovery

## Knowledge Gaps
- **46 isolated node(s):** `Canonical Recovery Report JSON`, `Momus And Oracle Review Gate`, `Deterministic Execution Contract`, `Plan QA Harness`, `Final Verification Wave` (+41 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Queue Delivery Screen` connect `Creator Workflow UI` to `Admin UI Screens`, `Renderer Pipeline`?**
  _High betweenness centrality (0.302) - this node is a cross-community bridge._
- **Why does `Shared REF_STUDIO Top Nav` connect `Creator Workflow UI` to `Editable Scene Design`, `Scene Review Evidence`?**
  _High betweenness centrality (0.260) - this node is a cross-community bridge._
- **Why does `Dark Data Table Pattern` connect `Admin UI Screens` to `Creator Workflow UI`?**
  _High betweenness centrality (0.252) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Queue Delivery Screen` (e.g. with `Dark Data Table Pattern` and `Shared REF_STUDIO Top Nav`) actually correct?**
  _`Queue Delivery Screen` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `T1-T6 Receipt Ledger` (e.g. with `Path Based Provenance` and `Predecessor Chain Panel`) actually correct?**
  _`T1-T6 Receipt Ledger` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `REF_STUDIO Landing Screen` (e.g. with `Engineered Cosmic Aesthetic` and `Shared REF_STUDIO Top Nav`) actually correct?**
  _`REF_STUDIO Landing Screen` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Canonical Recovery Report JSON`, `Momus And Oracle Review Gate`, `Deterministic Execution Contract` to the rest of the system?**
  _46 weakly-connected nodes found - possible documentation gaps or missing edges._