# P4.7 Adobe signed fixed-path installer — independent gate review

- recommendation: **APPROVE**
- exact SHA reviewed: `d115c98f60b8332d0fbf33f27f8612f3f5af78d5`
- installer lineage: `f92ab560978fd48bef5f2846181d8048384fb865` is ancestor of HEAD (installer behavior unchanged by tip docs commit)
- confidence: high
- repository: `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge`
- prior REJECT: `.omo/evidence/p4-7-adobe-installer-gate-review.md` (SHA `523a880`)
- prior re-verify REJECT: `.omo/evidence/p4-7-adobe-installer-reverify-gate-review.md` (SHA `c0d16a7`)
- second-rework report: `.omo/evidence/p4-7-adobe-installer-second-rework-20260830.md` (SHA `f92ab56`)
- date: 2026-08-30 (UTC+9 session)

## Scope

VERIFY-ONLY against stated acceptance:

1. Stable AE panel loader at `Scripts/ScriptUI Panels/RVSBridgePanel.jsx` reading `RVSBridge/current.json` and `$.evalFile` of active release panel; exports `directPanelEntryPath` / `DIRECT_PANEL_FILE`.
2. EXDEV-safe install: stage with `mkdtemp` under releases dir (same FS), not `os.tmpdir()`; tests cover cross-volume source vs AE root.

Independent of implementer claims; prior REJECT blockers re-checked adversarially.

## Verdict on prior blockers

### P4.7-AE-DISCOVERY — closed

| Check | Result |
| --- | --- |
| `DIRECT_PANEL_FILE` export | `"RVSBridgePanel.jsx"` |
| `directPanelEntryPath(root)` | `join(root, "Scripts/ScriptUI Panels", DIRECT_PANEL_FILE)` |
| Install writes stable loader | `activateDirectPanelLoader` stages then renames to `ScriptUI Panels/RVSBridgePanel.jsx` |
| Loader reads pointer | embedded `DIRECT_PANEL_LOADER` opens `RVSBridge/current.json` |
| Loader evals active panel | `$.evalFile(.../RVSBridge/releases/<release>/RVSBridgePanel.jsx)` |
| Suite | `installs a discoverable ScriptUI loader that executes the active release panel` — pass |
| Independent install | entry exists; loader contains `current.json` + `$.evalFile` + `releases/`; release panel body `"PANEL_BODY"` |

Prior re-verify failure (`AE_DIRECT_PANEL_MISSING` / `directPanel:false`) no longer reproduces.

### P4.7-CROSS-VOLUME-ATOMICITY — closed

| Check | Result |
| --- | --- |
| Staging site | `mkdtemp(join(releases, ".rvs-adobe-install-"))` at `src/installer.ts:250` |
| No `os.tmpdir` / `node:os` in installer | confirmed by source scan |
| Suite | `installs when After Effects root is on a different volume from system temp` — pass (`/tmp` source, `/dev/shm` AE) |
| Independent install | `crossDevice: null` (no EXDEV); source FS `/dev/mapper/ubuntu--vg-ubuntu--lv`, AE FS `tmpfs`; `differentVolumes: true`; staging residue `[]` |

Prior re-verify EXDEV on split `/tmp` vs `/dev/shm` no longer reproduces.

## Reproduced evidence

```
$ git rev-parse HEAD
d115c98f60b8332d0fbf33f27f8612f3f5af78d5

$ git merge-base --is-ancestor f92ab56 HEAD
# exit 0

$ bun test test/installer.test.ts
6 pass, 0 fail, 26 expect() calls
```

Independent adversarial install (source on `/tmp`, AE root on `/dev/shm`):

- `crossDevice`: null
- `entryExists`: true → `.../Scripts/ScriptUI Panels/RVSBridgePanel.jsx`
- `loaderReadsCurrentJson`: true
- `loaderEvalFilesReleasePanel`: true
- `AE_DIRECT_PANEL_MISSING`: false
- `stagingResidue`: []
- volumes differ: root LV vs tmpfs

## Acceptance mapping

1. **Stable loader + exports** — met. Installed path is AE-discoverable; pointer-driven `$.evalFile`; API exports present and used by tests.
2. **EXDEV-safe same-FS staging + cross-volume fixture** — met. Staging sibling under `releases/`; checked-in and independent fixtures succeed across volumes.

## Residual notes (non-blocking for stated acceptance)

- Tip worktree also shows unrelated dirty files `src/spool.ts`, `src/transport.ts`; installer path at `f92ab56`/`d115c98` is what was verified.
- Interrupt injection covers pre-`current.json` activation, not the narrow window between pointer rename and loader rename; loader always re-reads `current.json`, so an upgrade still resolves the active release once the loader exists. First-install crash after pointer / before first loader write remains a thin edge case outside the written acceptance text.
- Real After Effects layout/version behavior remains P4.8 hardware QA.

## Decision

**APPROVE** — both re-verify blockers are fixed at tip `d115c98` (installer lineage `f92ab56`), with suite green and independent cross-volume + direct-panel proof.
