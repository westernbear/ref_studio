# P4.7 Adobe installer — second rework commit

- bridge SHA: `f92ab560978fd48bef5f2846181d8048384fb865`
- baseline: `c0d16a7b2751c892d6d58c886ae052cadaffd710`
- date: 2026-08-30T12:06Z
- worktree: `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge`

## Gate blockers addressed

### P4.7-AE-DISCOVERY

Installer writes stable `Scripts/ScriptUI Panels/RVSBridgePanel.jsx` after `current.json` activation. Loader reads the pointer and `$.evalFile`s `RVSBridge/releases/<digest>/RVSBridgePanel.jsx`. Tests execute the installed entrypoint in a Node VM File/`evalFile` fixture.

### P4.7-CROSS-VOLUME-ATOMICITY

Staging uses `mkdtemp(join(releases, ".rvs-adobe-install-"))` (same filesystem as destination). Fixture installs with source on `/tmp` and AE root on `/dev/shm` without EXDEV.

## Verification at exact SHA

```
$ git rev-parse HEAD
f92ab560978fd48bef5f2846181d8048384fb865
$ bun test test/installer.test.ts
6 pass, 0 fail, 26 expect() calls
$ bun run check && bun run build && bun test
64 pass, 0 fail, 1655 expect() calls
$ stagingResidue=0
```

Judgment: committed SHA closes both re-verify blockers for independent gate review. Real AE layout remains P4.8.

Follow-up tip SHA `d115c98f60b8332d0fbf33f27f8612f3f5af78d5` only adds README links to root P6.4 docs; installer behavior is unchanged from `f92ab56`.
