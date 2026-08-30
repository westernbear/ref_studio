# Motion completion restore point (P0.1)

timestamp_utc: 20260830T012734Z
baseline_commit: `9745486e57526d679f8e29cfa5fda1d054d9b20e`
branch: `motion-graphics-complete-v2`
worktree: `/home/singlerr/ref_studio-motion-complete`
root: `/home/singlerr/ref_studio`

## Baseline characterization

Commands run from the clean task worktree:

```text
git rev-parse HEAD
9745486e57526d679f8e29cfa5fda1d054d9b20e
git branch --show-current
motion-graphics-complete-v2
git status --porcelain=v1
(empty)
git submodule status
-20acfd5dc47c5cec7931fbf73f0febd7be600596 apps/worker
-b4a3c5dfbbc542df02abc3f82647145b8c5b7c8a integrations/adobe-bridge
```

Root verification:

```text
git -C /home/singlerr/ref_studio rev-parse HEAD
9745486e57526d679f8e29cfa5fda1d054d9b20e
git -C /home/singlerr/ref_studio status --porcelain=v1
```

Explicit user-owned dirty files observed at baseline (root only):

```text
 M .omo/boulder.json
 M .omo/evidence/wave7/task-42-visual/admin_quarantine-1440x900.png
 M .omo/evidence/wave7/task-42-visual/admin_sign_in-1440x900.png
 M .omo/evidence/wave7/task-42-visual/admin_tenants-1440x900.png
 M .omo/evidence/wave7/task-42-visual/ref_studio_landing-1440x900.png
 M .omo/evidence/wave7/task-42-visual/upload_validation-1440x900.png
 M .omo/run-continuation/ses_fdc31a2adffeUPnrFG6lPBYLVk.json
 M apps/worker
 D final-handoff-package.zip
 D stitch_design_system_ui_implementation.zip
?? .omo/drafts/motion-graphics-ai-skill-renderer.md
?? .omo/evidence/admin-ui-css-20260823/
?? .omo/evidence/admin-ui-css-gate-review.md
?? .omo/evidence/ai-thinking-animation-fix-gate-review.md
?? .omo/evidence/ai-thinking-animation-gate-review.md
?? .omo/evidence/cumulative-production-hardening-code-review.md
?? .omo/evidence/cumulative-production-hardening-gate-review.md
?? .omo/evidence/final-live-20260823/
?? .omo/evidence/final-review-ledger.md
?? .omo/evidence/live-status-20260823-gate-review.md
?? .omo/evidence/live-status-20260823/
?? .omo/evidence/manual-qa-20260823-executor/
?? .omo/evidence/manual-qa-20260823-final/
?? .omo/evidence/manual-qa-20260824-progress-gate/
?? .omo/evidence/manual-qa-20260824/
?? .omo/evidence/manual-qa-714bd024/
?? .omo/evidence/manual-qa-a16cc5b-worker-b751470f/
?? .omo/evidence/manual-qa-admin-dashboard.png
?? .omo/evidence/manual-qa-admin.png
?? .omo/evidence/manual-qa-new-project-desktop.png
?? .omo/evidence/manual-qa-new-project-mobile.png
?? .omo/evidence/manual-qa-signin.png
?? .omo/evidence/motion-complete-test-plan-20260830.md
?? .omo/evidence/motion-plan-graphify-audit-20260830.md
?? .omo/evidence/pre-commit-review-code-review.md
?? .omo/evidence/progress-approval-pass-a-gate-review.md
?? .omo/evidence/progress-gate-gate-review.md
?? .omo/evidence/progress-ui-20260823/
?? .omo/evidence/progress-ui-gate-review.md
?? .omo/evidence/reference-video-studio-gate-review.md
?? .omo/evidence/reference-video-studio-runtime-audit-gate-review.md
?? .omo/evidence/reference-video-studio-saas-code-review.md
?? .omo/evidence/reference-video-studio-saas-gate-review.md
?? .omo/evidence/reference-video-studio-security-audit-gate-review.md
?? .omo/evidence/review-work-security-audit-gate-review.md
?? .omo/evidence/root-api-contract/
?? .omo/evidence/root-operational-hardening-20260823/
?? .omo/evidence/scene-review-fix-gate-review.md
?? .omo/evidence/scene-review-visual-qa-gate-review.md
?? .omo/evidence/security-auditor-gate-review.md
?? .omo/evidence/security-hardening-gate-review.md
?? .omo/evidence/t1-auto-20260824-gate-review.md
?? .omo/evidence/t1-auto-20260824/
?? .omo/evidence/t1-auto-visual-fidelity-gate-review.md
?? .omo/evidence/visual-qa-pass-a-gate-review.md
?? .omo/evidence/visual-qa-pass-b-gate-review.md
?? .omo/evidence/wave7/task-42-visual/admin_audit-1440x900.png
?? .omo/evidence/wave7/task-42-visual/admin_jobs-1440x900.png
?? .omo/evidence/wave7/task-42-visual/admin_receipts-1440x900.png
?? .omo/evidence/wave7/task-42-visual/progress-1440x900.png
?? .omo/evidence/wave7/task-42-visual/scene_review-1440x900.png
?? .omo/evidence/wave7/task-42-visual/progress-1440x900.png
?? .omo/evidence/wave7/task-42-visual/workflow-1440x900.png
?? .omo/evidence/worker-live-status-code-review.md
?? .omo/evidence/worker-observability-gate-review.md
?? .omo/plans/motion-graphics-ai-completion-v2.md
?? "MOTION PROMPT Claude.pdf"
?? graphify-out/.graphify_learning.json
?? graphify-out/.vocab.txt
?? graphify-out/cache/
?? graphify-out/reflections/
?? reference-compiler-authoring-agent-handoff.zip
?? stitch-extracted-new-v2/
?? stitch-extracted-new/
?? stitch_ui_todo.zip
```

The duplicate `progress-1440x900.png` line above reflects the captured root
listing as written during baseline collection; the filesystem entry is one
path.

## Independence and verification

The task worktree is a separate checkout at the path recorded above and was
characterized independently from the root. No root product files were changed;
only this restore evidence file was added in the task worktree.

Manual-QA commands and results:

```text
git -C /home/singlerr/ref_studio-motion-complete status --porcelain=v1
 M .omo/evidence/motion-complete-restore-20260830T012734Z.md
git -C /home/singlerr/ref_studio-motion-complete rev-parse --abbrev-ref HEAD
motion-graphics-complete-v2
test -s /home/singlerr/ref_studio-motion-complete/.omo/evidence/motion-complete-restore-20260830T012734Z.md
PASS (exit 0)
```

The expected post-write status contains only the artifact itself; the clean
baseline status was captured before writing it. Root HEAD and dirty listing
were rechecked after writing and remained unchanged.

## Adversarial classes

- dirty_worktree: PASS; root and task worktree probed independently.
- stale_state: PASS; exact baseline SHA and UTC timestamp recorded.
- misleading_success_output: PASS; porcelain status and `test -s` checked.
- long_external_commands: not applicable.
- malformed_input: not applicable.
- prompt_injection: not applicable.
- cancel/resume: not applicable.
- generated_artifacts: not applicable.
- repeated_interruptions: not applicable.

No failing-first proof is applicable: this is a metadata checkpoint.

DoneClaim: cleanup: none. changed_files: `.omo/evidence/motion-complete-restore-20260830T012734Z.md` only. product_behavior: none.
