# P4.7 Adobe installer evidence

Commit target: `523a880ca606a31204981507165c61bb41b75e05` from bridge baseline `212aa3010dd5167243afc4bd9fb455cae9989af5`.

Implemented `integrations/adobe-bridge/src/installer.ts` and the fixed v1 manifest schema.

- Scenario: valid Ed25519 manifest with two exact SHA-256 asset hashes for AE 2026.
  Invocation: `bun test test/installer.test.ts`.
  Observable: only `RVSBridgePanel.jsx` and `rvs-dispatcher.jsx` are installed under `Scripts/ScriptUI Panels`, with mode `0644`.
- Scenario: malformed/traversal/shell-shaped filename, extra manifest field, bad signature, bad asset hash, and unsupported release version.
  Invocation: `bun test test/installer.test.ts`.
  Observable: all are rejected before destination mutation.
- Scenario: replacement failure on the second fixed destination.
  Invocation: `bun test test/installer.test.ts`.
  Observable: the already-replaced panel is restored to `old panel`.
- Scenario: macOS, Linux Wine, and Windows fixed installation roots.
  Invocation: `bun test test/installer.test.ts`.
  Observable: supported version roots enumerate only 2024, 2025, and 2026.
- Regression suite: `bun run check && bun run build && bun test`, executed twice after the final changes.
  Observable: check/build succeed; bridge suite reports 62 passing tests on both runs.

No shell is invoked by the installer. Staging is created with `mkdtemp`, release content is verified before destination writes, destination replacement uses `rename`, and any post-staging failure restores prior target bytes.

## Direct verification, 2026-08-30

Working directory: `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge`.

```
$ git rev-parse HEAD
523a880ca606a31204981507165c61bb41b75e05
$ git status --short
(no output)
$ bun test test/installer.test.ts
4 pass, 0 fail, 14 expect() calls
$ bun run check
Checked 28 files; no fixes applied.
$ bun run build
Bundled 246 modules; cli.js 1.1 MB
$ bun test
62 pass, 0 fail, 1643 expect() calls
```

Judgment: the exact committed bridge SHA has a clean bridge worktree and passes the installer behavior, contract/type/lint check, build, and full bridge suite. Root worktree changes observed during the check are concurrent work by other agents and were not modified by P4.7.

## Cleanup verification, 2026-08-30

The first residue probe found three empty `rvs-adobe-install-*` directories dated during pre-final test activity. Their exact paths were inspected, then removed as task-owned temporary artifacts:

```
/tmp/rvs-adobe-install-EZodpg
/tmp/rvs-adobe-install-LjaAcj
/tmp/rvs-adobe-install-VdkWFA
```

After removal, a new direct invocation was run:

```
$ bun test test/installer.test.ts
4 pass, 0 fail, 14 expect() calls
$ find /tmp -maxdepth 1 -type d -name 'rvs-adobe-install-*' -printf '%f\\n'
(no output)
```

Judgment: the current committed cleanup path leaves no `rvs-adobe-install-*` staging residue after the installer tests. The earlier empty directories were removed and are recoverable only from no source data because they contained no files.

## Commit-content verification, 2026-08-30

```
$ git rev-parse HEAD
523a880ca606a31204981507165c61bb41b75e05
$ git show --stat --oneline HEAD
523a880 feat: harden Adobe panel installer
installer/manifest.schema.json | 36 changes
src/installer.ts               | 221 changes
test/installer.test.ts         | 188 changes
$ bun test test/installer.test.ts
4 pass, 0 fail, 14 expect() calls
$ test -z "$(find /tmp -maxdepth 1 -type d -name 'rvs-adobe-install-*' -print -quit)"
stagingResidue=0
$ git status --short
(no output)
```

Judgment: the installation behavior and its fixed manifest/schema/test files are in the exact clean committed SHA, and the direct installation test leaves no task-owned temporary staging directory.

## Gate rework, 2026-08-30

Gate findings were corrected in bridge commit `c0d16a7b2751c892d6d58c886ae052cadaffd710`.

- Windows roots now use the declared platform path implementation: Windows results use `win32.join` and therefore canonical backslashes on a Linux verifier. A `D:\\Adobe/Adobe After Effects 2026` mixed-separator root is rejected before mutation.
- Each signed two-file release is fully materialized under `RVSBridge/releases/<manifest-digest>/`. The single `RVSBridge/current.json` pointer is renamed only after both assets have hashes and modes verified. An interruption before pointer activation keeps the prior pointer, so readers never see one old and one new asset. Re-running activates the complete staged release.
- Direct checks after the rework: `bun test test/installer.test.ts` reports 4 pass / 17 assertions; `bun run check`, `bun run build`, and full `bun test` were each run twice, with 62 pass / 0 fail on both full runs.

Judgment: the former mixed-separator and sequential-file-transition failures are removed at the exact rework SHA. Independent re-verification remains required.

## Rework direct verification, 2026-08-30

```
$ git rev-parse HEAD
c0d16a7b2751c892d6d58c886ae052cadaffd710
$ git status --short
(no output)
$ bun test test/installer.test.ts
4 pass, 0 fail, 17 expect() calls
$ bun run check
Checked 28 files; no fixes applied.
$ bun run build
Bundled 246 modules; cli.js 1.1 MB
$ bun test
62 pass, 0 fail, 1646 expect() calls
$ test -z "$(find /tmp -maxdepth 1 -type d -name 'rvs-adobe-install-*' -print -quit)"
stagingResidue=0
```

Judgment: direct execution verifies the exact rework SHA is clean, its canonical Windows/malformed-path and atomic-interruption installer scenarios pass, the full bridge suite passes, and no installer stage residue remains.

## Pointer scenario recheck, 2026-08-30

```
$ bun test test/installer.test.ts
4 pass, 0 fail, 17 expect() calls
$ git rev-parse HEAD
c0d16a7b2751c892d6d58c886ae052cadaffd710
$ git status --short
(no output)
$ find /tmp -maxdepth 1 -type d -name 'rvs-adobe-install-*' -print
(no output)
```

The focused scenario creates an old active release, interrupts a fully staged new release before the atomic `current.json` pointer rename, verifies the old pointer stays active, then retries and reads both assets from the new release selected by the one pointer.

## Final focused command record, 2026-08-30

```
$ git rev-parse HEAD
c0d16a7b2751c892d6d58c886ae052cadaffd710
$ bun test test/installer.test.ts
4 pass, 0 fail, 17 expect() calls
$ test -f .omo/evidence/p4-7-adobe-installer-20260830.md
true
```

Judgment: the exact bridge rework commit's focused installer contract passes directly; this evidence artifact exists and contains the direct command records above.

## Second rework (AE discovery + cross-volume), 2026-08-30

Gate re-verify at `c0d16a7` rejected two remaining blockers: missing discoverable ScriptUI entry that consumes `current.json`, and `EXDEV` when staging under system temp while AE root is on another volume.

Fixes applied in the adobe-bridge worktree (not yet committed at evidence time):

1. **P4.7-AE-DISCOVERY** — After pointer activation, install a stable loader at `Scripts/ScriptUI Panels/RVSBridgePanel.jsx` that reads `RVSBridge/current.json` and `$.evalFile`s the active release panel. Export `directPanelEntryPath`. Tests execute the installed entrypoint in a Node VM File/`evalFile` fixture and assert it resolves the release panel path.
2. **P4.7-CROSS-VOLUME-ATOMICITY** — Stage with `mkdtemp(join(releases, ".rvs-adobe-install-"))` (hidden sibling under destination `releases/`) instead of `tmpdir()`, so `rename` into the final digest stays same-filesystem. Added fixture with source on `/tmp` and AE root on `/dev/shm`.

Independent EXDEV baseline (old strategy would still fail):

```
cross_rename /tmp → /dev/shm → errno=18 EXDEV match=True
```

### Direct verification (dirty worktree vs baseline `c0d16a7`)

```
$ git rev-parse HEAD
c0d16a7b2751c892d6d58c886ae052cadaffd710
$ git status --short
 M src/installer.ts
 M test/installer.test.ts
$ bun test test/installer.test.ts
6 pass, 0 fail, 26 expect() calls
$ bun run check
Checked 28 files; no fixes applied.
$ bun run build
Bundled 246 modules; cli.js 1.1 MB
$ bun test
64 pass, 0 fail, 1655 expect() calls
```

Second identical `check` / `build` / `bun test` run: 64 pass / 0 fail / 1655 expect() calls. Staging residue probe: `stagingResidue=0`.

Judgment: both re-verify blockers are addressed in the local bridge diff with executable loader proof and a real `/tmp`↔`/dev/shm` install. Commit the bridge SHA before independent gate re-verification.

