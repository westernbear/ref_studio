# P4.6 Adobe working-copy delivery gate review — remediation verification

## recommendation

APPROVE

## originalIntent

Deliver a production Adobe cloud-to-local workflow that keeps the original AEP hash and mode invariant across success, failure, cancellation, and rollback; performs mutations and rendering only against a job-bound working copy; probes a real H.264 High MP4 locally; confines connector authorization to the local uploader; sends no URLs, credentials, local paths, or AEP bytes to cloud; and preserves strict result binding and crash/replay/cancel cleanup.

## desiredOutcome

The real bridge CLI prepares and finalizes jobs through `AdobeWorkingCopy` and `finalizePanelResult`, reports actual before/after working-copy hashes, and invokes locally configured renderer/uploader processes without exposing upload authorization to any component except the uploader.

## userOutcomeReview

The remediation correctly wires the working-copy implementation into production CLI `prepare`/`finalize`, returns the actual restored-file SHA-256 after rollback, adds filesystem-backed cancellation coverage, and removes `RVS_ADOBE_UPLOAD_AUTH` from the render child environment. The focused real child-process isolation test and complete bridge check/build/test gates pass at the requested SHAs. The requested outcome is confirmed.

## blockers

None.

## resolvedPriorBlockers

- **P4.6-WORKING-COPY-PRODUCTION-PATH: RESOLVED.** `src/cli.ts` imports and invokes `AdobeWorkingCopy.open` and `finalizePanelResult` from production `prepare`/`finalize` modes; the CLI E2E exercises this path.
- **P4.6-ACTUAL-BEFORE-AFTER-DIGESTS: RESOLVED.** `rollback()` now computes `afterDigest` from the restored working-copy bytes, and the test independently hashes the restored path.
- **P4.6-ORIGINAL-INVARIANCE-ALL-TERMINAL-PATHS: RESOLVED for the previously missing cancellation evidence.** The filesystem-backed execution test calls `assertOriginalUnchanged`, and the production CLI E2E prepares/finalizes a cancelled command without changing the original fixture.
- **P4.6-CONNECTOR-ONLY-UPLOAD-AUTH: RESOLVED.** `LocalProgramRenderAdapter` copies the parent environment, deletes `RVS_ADOBE_UPLOAD_AUTH`, and supplies the sanitized environment to `execFileAsync`; a real executable test fails if the credential reaches the child.

## checkedArtifacts

- Root SHA: `7c0898e96239d072ad4cf094f3a00bd89fd4f7eb` (matched `HEAD`)
- Bridge SHA: `212aa3010dd5167243afc4bd9fb455cae9989af5` (matched submodule `HEAD`)
- Final remediation diff: bridge `src/working-copy.ts` and `test/working-copy.test.ts`; root submodule pointer only
- Focused credential-isolation and working-copy tests: PASS, 4/4
- Bridge check: PASS (contract vector, Biome, TypeScript)
- Bridge build: PASS
- Bridge full suite: PASS, 59/59 tests, 1,631 assertions
- Real ffmpeg/ffprobe component result remains PASS: H.264, High, 30 frames, 1 second, 320x240
- Root contracts: PASS, 107/107 tests and TypeScript build
- Root Adobe gateway: PASS, 5/5 tests and API build
- DB: PASS, `integrity=ok`, 10 negative cases, single claim and ordered receipts
- OpenAPI: PASS; canonical and mirrors SHA-256 `95752846ee88d78af48d1a47a3fed7b632915f1807109d48acb1e307f6723b33`
- Product residue: bridge clean; root contains only untracked `.omo/evidence` artifacts

## directSecurityAndBindingReview

- Cloud contracts still cannot provide executable paths or connector authorization.
- Strict result parsing and gateway tenant/command/device/job/nonce/scene binding remain intact.
- Returned result metadata contains no connector secret, upload URL, AEP path, or AEP bytes.
- The render child receives a sanitized environment without `RVS_ADOBE_UPLOAD_AUTH`; the uploader alone receives the connector authorization value.

## removeAiSlopsAndProgrammingReview

- The prior implementation-mirroring rollback assertion was corrected to independently hash restored bytes.
- Production wiring is now exercised through a CLI E2E rather than existing only as test-reachable dead code.
- `src/working-copy.ts` remains over the skill's 250-pure-LOC ceiling; this is a non-blocking NOTE because it is not a stated P4.6 success criterion.
- No excessive deletion-only tests or requested-removal-only tests were introduced. The new cancellation tests exercise observable filesystem and terminal-state behavior.

## exactEvidenceGaps

- No code-review report, manual QA matrix, or notepad path was supplied for this re-verification; direct artifact inspection and execution were performed instead.
