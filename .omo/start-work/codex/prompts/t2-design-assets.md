TASK: Act as an implementation worker for Todo 2 only in /home/singlerr/ref_studio. Do not use OpenCode task/subagents. Do not run git. Do not start Todo 3 or later.

DELIVERABLE: Implement Todo 2 from .omo/plans/reference-video-studio-saas.md lines 191-197: vendor approved design tokens, fonts, icons, and local asset manifest.

SCOPE:
- Read first: .omo/plans/reference-video-studio-saas.md lines 191-197; stitch-extracted/stitch_design_system_ui_implementation/cosmic_engineering/DESIGN.md; all stitch-extracted/stitch_design_system_ui_implementation/*/code.html; stitch-extracted/INVENTORY_STITCH.md; runtime/supply-closure-manifest.json; runtime/runtime-artifact-manifest.json; verification/contract/fonts/WantedSansVariable.ttf; verification/contract/fonts/Inter.ttf.
- Create/update only T2-related files: apps/web/src/styles/tokens.css, CSS import/theme config, local font files under apps/web/public/fonts or equivalent, apps/web/src/components/Icon.tsx or local SVG icon components, runtime/asset-manifest.json, scripts/assets/verify.mjs, web token/font tests, and .omo/evidence/wave1/task-2-reference-video-studio-saas.json. Root package.json may be edited only to replace the T2-relevant assets:verify script. Do not edit API/DB/contracts.

REQUIREMENTS:
- Every token from DESIGN.md must be represented as CSS custom properties and web theme mapping. Preserve Cosmic Engineering authority; do not redesign screens.
- Runtime assets must be local only. assets:verify must reject fonts.googleapis.com, fonts.gstatic.com, CDN URLs, AdGuard scripts, and any remote font/icon runtime load.
- Use T1-verified fonts where available. If a required font is absent from frozen authority, fail explicitly with RUNTIME_PREREQUISITE_MISSING instead of silent substitution.
- Create runtime/asset-manifest.json with source URL, official release/tag, local path, sha256, license, allowed consumer, and status for every font/model-independent visual asset.
- Add a deterministic font probe for Korean text `분석 완료`.

VERIFY:
- Run and capture: pnpm assets:verify
- Run and capture: pnpm --filter web test --run tokens
- Run and capture failure: pnpm assets:verify --fixture missing-font must exit non-zero with RUNTIME_PREREQUISITE_MISSING.
- Write .omo/evidence/wave1/task-2-reference-video-studio-saas.json with commands, exit codes, stdout/stderr summaries, asset hashes/licenses, font probe results, adversarial classes, and cleanup.

ADVERSARIAL CLASSES:
- malformed_input: manifest validation/missing-font fixture.
- stale_state: recompute hashes from disk.
- misleading_success_output: assert failure token and non-zero exit.
- generated/stale artifact: verify CSS/manifest generated state.
- flaky_tests: repeat font probe or make it deterministic.
- hung/long commands: use command timeouts where appropriate.
- dirty_worktree not applicable: not a git repo. prompt_injection/cancel_resume/repeated_interruptions not applicable unless you identify a trigger.

FINAL RESPONSE: Return DoneClaim JSON with changed_files, tests, manual_qa artifact, cleanup, risks.
