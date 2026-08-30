# P4.7 Adobe signed installer gate review

- recommendation: REJECT
- exact SHA: `523a880ca606a31204981507165c61bb41b75e05`
- confidence: high
- reviewed repository: `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge`
- executor evidence: `/home/singlerr/ref_studio-motion-complete/.omo/evidence/p4-7-adobe-installer-20260830.md`
- upstream record: `/home/singlerr/ref_studio-motion-complete/integrations/adobe-bridge/UPSTREAM.md`

## Original intent

Ship a signed, fixed-path Adobe After Effects installer that discovers supported AE roots without shell interpolation, verifies an Ed25519 manifest and exact asset hashes, installs only the approved panel and dispatcher, rejects hostile or unsupported inputs before mutation, uses restrictive atomic installation with rollback, and has meaningful macOS/Linux/Windows fixtures.

## Desired outcome

A release manifest can install the two approved ScriptUI files on every supported operating system without shell execution or path injection. A rejected release leaves the destination unchanged, a partial failure restores the previous installation, and the final two-file release transition cannot expose a mixed version.

## User outcome review

The signature, hash, allowlist, version, unknown-field, and fixed-destination boundaries are implemented and the checked-in suite is green. The shipped artifact does not yet satisfy the cross-platform fixture or atomic-transition portions of the requested outcome: the Windows fixture accepts a Linux-host-rendered mixed-separator path, and the two final files are renamed one after another.

## Blockers

### P4.7-WINDOWS-FIXTURE

- violatedCriterion: `macOS/Linux/Windows path fixtures where applicable`
- observation: `supportedAfterEffectsRoots("win32", ...)` uses the host `node:path.join`, so a Linux verification host returns mixed `\\` and `/` separators. The checked-in test explicitly accepts the malformed mixed path instead of the canonical Windows path.
- evidencePointer: `src/installer.ts:130-143`, `test/installer.test.ts:163-186`; independent `bun -e` adversarial check failed with `Windows path fixture is not host-independent: ["D:\\Program Files/Adobe/Adobe After Effects 2024", ...]`.
- requiredFix: use the path implementation selected by the declared platform (for example `win32.join` for `win32`) and assert canonical Windows fixture output; exercise discovery against that generated path.

### P4.7-ATOMIC-INSTALL

- violatedCriterion: `atomic restrictive install and partial-copy rollback`
- observation: staged files are committed with a loop of two sequential `rename` calls. A crash or process termination after the first rename and before the second exposes a mixed release, and the in-process catch/restore block cannot run after process death.
- evidencePointer: `src/installer.ts:216-239`, specifically the sequential transition at `src/installer.ts:229-230`.
- requiredFix: commit one atomically replaceable staged directory/symlink boundary or introduce a durable transaction marker plus restart recovery that restores/completes the pair; add an interruption/recovery test between the two target transitions.

## Checked artifacts and reproduced evidence

- `git rev-parse HEAD`: exact target SHA.
- `git merge-base --is-ancestor 212aa3010dd5167243afc4bd9fb455cae9989af5 523a880ca606a31204981507165c61bb41b75e05`: pass.
- bridge worktree and staged diff: clean before and after verification.
- `bun test test/installer.test.ts`: 4 pass, 0 fail, twice.
- `bun run check`: contract vector, Biome, and `tsc --noEmit` pass, twice.
- `bun run build`: pass, twice.
- `bun test`: 62 pass, 0 fail, twice.
- manifest/source inspection: exact two-file tuple, strict unknown-field rejection, Ed25519 verification, SHA-256 comparison, supported-version binding, regular-file check, fixed destination, `0644` files, `0755` destination.
- shell surface search: no child process, exec, spawn, or shell invocation in installer or installer tests.
- hostile inputs covered: traversal, shell-shaped path, unknown field/file, invalid signature, bad hash, unsupported release version.
- manual rollback check: first replaced target restored after second-target failure; prior second target shape remained present in the exercised failure fixture.
- residue check: no installer temporary files were left in the repository.
- `UPSTREAM.md`: pinned upstream `88d5fbf08b7ae9f015ee98e5f8c4904095cf8202` present; no runtime dependency claim changed.

## Direct remove-ai-slops / programming review

- The production installer is 227 pure LOC, within the 250 LOC ceiling but in the warning band.
- No `any`, unsafe assertion, `@ts-ignore`, `@ts-expect-error`, non-null assertion, empty catch, or shell execution was found in the scoped files.
- The combined hostile-input test is weak because it asserts only rejection, not destination immutability for each case.
- The Windows test is an overfit/false-confidence test: it mirrors the current host-dependent implementation and locks an invalid mixed-separator result.
- No separate P4.7 code-review report was present. This direct pass supplies the required skill-perspective coverage but does not cure the two criterion failures above.

## Exact evidence gaps

- No canonical Windows path/discovery fixture that passes on a non-Windows verifier.
- No crash/interruption recovery evidence between the first and second final target transition.
- No assertion that every pre-mutation rejection case preserves an existing destination byte-for-byte.

## Residual risk after blockers

The manifest signature is over a deterministic JSON projection and is adequate for the current fixed schema. Actual platform installation permissions and AE install-layout validity still require P4.8 hardware QA; that is a later gate and is not itself a P4.7 blocker.
