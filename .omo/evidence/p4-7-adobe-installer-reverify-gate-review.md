# P4.7 Adobe signed installer re-verification

- recommendation: REJECT
- exact SHA: `c0d16a7b2751c892d6d58c886ae052cadaffd710`
- confidence: high
- repository: `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge`
- executor evidence: `/home/singlerr/ref_studio-motion-complete/.omo/evidence/p4-7-adobe-installer-20260830.md`

## Original intent

Install the signed panel and dispatcher into the fixed After Effects ScriptUI Panels location on supported platforms, with exact hashes, no shell interpolation, canonical platform paths, and an atomic release transition that never exposes a mixed pair.

## User outcome review

The prior mixed-Windows-path and two-sequential-file-transition findings are corrected. Canonical Windows roots and mixed-root rejection now pass, and interruption before the single pointer transition keeps the old pointer. The replacement design still does not produce a usable, cross-volume-safe AE installation: no directly discoverable ScriptUI panel is installed, no AE-side loader consumes the pointer, and staging under the system temporary directory cannot be renamed atomically to an AE installation on another filesystem/drive.

## Blockers

### P4.7-AE-DISCOVERY

- violatedCriterion: `copy only the panel and dispatcher into the fixed ScriptUI Panels location` / user-visible installed AE panel
- observation: the installer places both JSX files under `ScriptUI Panels/RVSBridge/releases/<digest>/` and writes `RVSBridge/current.json`, but it creates no `ScriptUI Panels/RVSBridgePanel.jsx`. The checked-in panel does not read `current.json`; `activeSignedPanelRelease` is referenced only by installer tests. Therefore the pointer does not select what After Effects loads, and retained releases can expose zero or multiple nested panels depending on AE scan behavior.
- evidencePointer: `src/installer.ts:159-179,212-250`; repository search for `current.json|activeSignedPanelRelease|RVSBridge/releases`; `scripts/panel/RVSBridgePanel.jsx:1-2`; independent install reported `AE_DIRECT_PANEL_MISSING` and `directPanel:false`.
- requiredFix: install one stable, directly discoverable ScriptUI loader/panel at the fixed path that resolves the active release and dispatcher, or use another AE-supported single activation boundary; verify by executing the installed entrypoint, not only reading nested files.

### P4.7-CROSS-VOLUME-ATOMICITY

- violatedCriterion: `atomic restrictive install` across macOS/Linux/Windows supported roots
- observation: the complete release is staged with `mkdtemp(tmpdir())` and then renamed into the AE installation. Atomic rename requires the same filesystem. A real split-volume layout (system temp on one volume, AE on another) fails before activation with `EXDEV`.
- evidencePointer: `src/installer.ts:217,231-232`; independent invocation staged source/tmp on `/tmp` and the recognized `Adobe After Effects 2026` root on `/dev/shm`, producing `crossDevice:"EXDEV"`.
- requiredFix: create the release staging directory as a hidden sibling beneath the destination `releases` directory, then atomically rename within that filesystem; add a cross-filesystem source/temp fixture proving install succeeds while activation remains atomic.

## Reproduced passing evidence

- Exact `HEAD` equals the requested SHA; previous SHA is an ancestor; bridge worktree clean.
- `bun test test/installer.test.ts`: 4 pass, 17 assertions, twice.
- `bun run check`: contract vector, Biome, TypeScript pass, twice.
- `bun run build`: pass, twice.
- `bun test`: 62 pass, 0 fail, 1646 assertions, twice.
- Windows root fixture now emits canonical backslashes and rejects `D:\\Adobe/Adobe After Effects 2026`.
- Interruption injection leaves the prior `current.json` release active; rerun activates the complete pair.
- Exact manifest tuple, Ed25519 signature, SHA-256 hashes, supported version, unknown field/file, traversal, shell-shaped filename, invalid signature, bad hash and unsupported version boundaries remain covered.
- No child process, `exec`, `spawn`, or shell invocation exists in installer scope.
- No `rvs-adobe-install-*` residue remained after the checked-in suites. Independent manual-test temp directories were enumerated exactly and deleted after the test.
- `UPSTREAM.md` retains pinned upstream commit `88d5fbf08b7ae9f015ee98e5f8c4904095cf8202`.

## Direct slop/programming pass

- The pointer test proves Node-side state, not AE-visible behavior, and therefore gives false confidence for the installed product surface.
- The destination-root staging abstraction should reuse same-filesystem directory rename; the current system-temp staging is a platform/filesystem boundary bug, not a style preference.
- No unsafe TypeScript escape hatches or shell interpolation were introduced in the rework.

## Residual note

Actual AE version/layout testing remains P4.8. The two failures above occur without AE hardware and directly violate P4.7 installation and atomicity criteria, so they cannot be deferred to P4.8.
