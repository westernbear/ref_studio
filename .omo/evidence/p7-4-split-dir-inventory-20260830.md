# P7.4 split-directory inventory
- root SHA: 23f1f8775e1e3b2040526ff01e8fb1893defbb34
- date: 2026-08-30T12:32:58Z

## Plan-listed paths
- ABSENT: /home/singlerr/ref_studio-motion-v2-worktree
- PRESENT: ./graphify-corpus (468K)
- PRESENT: ./handoff-extracted (360K)
- ABSENT: stitch-extracted-new
- ABSENT: stitch-extracted-new-v2
- PRESENT: ./final-handoff-package.zip (56K)
- PRESENT: ./stitch_design_system_ui_implementation.zip (2.1M)

## Unique tracked source check
- git ls-files count: 856
- submodule status:
 c6845d7f472209e83b15c0619c0dee989b282920 apps/worker (heads/master-21-gc6845d7)
 d115c98f60b8332d0fbf33f27f8612f3f5af78d5 integrations/adobe-bridge (remotes/origin/motion-graphics-complete-v2-16-gd115c98)

## Decision
- motion-v2-worktree / stitch-extracted*: already absent — no action
- graphify-corpus + handoff-extracted: generated/stale handoff duplicates; archive (not delete recursively)
- zip archives: generated packages; archive

## Archive location
`.omo/archive/split-dirs-20260830T122900Z/`

Contains: `graphify-corpus/`, `handoff-extracted/`, `final-handoff-package.zip`, `stitch_design_system_ui_implementation.zip`, `root-graphify-out-stale-handoff/`

## Post-move verification
- `git ls-files` count remains 856 tracked paths before commit of deletions
- Submodules: worker `c6845d7`, adobe-bridge `d115c98`
- `pnpm contracts:openapi:check` verified
- Package roots present (`package.json`, `apps/api`, `apps/web`)
- Canonical motion Graphify closure remains under `.omo/evidence/graphify-closure-20260830/`
