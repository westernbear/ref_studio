# P4.8 Real After Effects QA — blocked

- date: 2026-08-30T12:07Z
- host: Linux (no Adobe After Effects / Wine AE install detected)
- adobe bridge tip: `d115c98f60b8332d0fbf33f27f8612f3f5af78d5`

## Required for PASS (plan P4.8)

- Run fixture project on AE 2024/2025/2026
- Read back composition/layer/animation/mask/effect/template/verify/render/cancel/rollback
- Capture original-AEP hash, working-copy hash, command/result JSON, MP4 probe, screenshots/logs
- Prove original AEP hash invariant on all terminal paths

## Current state

- Local stdio/cloud golden vectors, spool, installer, and VM dispatcher fixtures exist
- UI/admin Adobe controls remain locked until this gate and signing/security gates pass

## Unblock

Re-run on a macOS/Windows host (or accepted Wine+AE layout) with installed AE versions and attach evidence under `.omo/evidence/p4-8-ae-qa-<timestamp>/`.
