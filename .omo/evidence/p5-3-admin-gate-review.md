# P5.3 Admin API/UI gate review

## recommendation

APPROVE

## originalIntent

Extend the root admin API and web panel with tenant-safe, authenticated motion/Adobe operational visibility and four real, audited actions. Show plan/card IDs, scene/version/digest, verification findings, backend/capability state, artifact/runtime hashes, Adobe device/command state and remediation; provide backend, verification, capability, command-state and tenant filters; preserve English/Korean and responsive table/detail behavior; never expose secrets, local paths, raw prompts or AEP bytes.

## desiredOutcome

An administrator can inspect every specified motion/Adobe identifier and state, filter the job list, and invoke only valid state transitions. Invalid transitions must not report success. All successful actions must be tenant-authorized, idempotent and audited, with browser proxy parity and usable English/Korean responsive UI.

## userOutcomeReview

Most of the requested surface is present and reproducibly green. The API returns card IDs, scene version/digest, findings, capability and artifact/runtime digests, Adobe device/command state/age and remediation. Filters, tenant scoping, auth, idempotency, production SQL state guards, audit callbacks, proxy routes, bilingual labels and responsive detail wrapping are present. The browser artifacts show the desktop surface, a populated 320px detail without horizontal document overflow, and a successful FAILED→QUEUED retry.

At root SHA `56308f49782dd2822faff38b9b6151d973c813a4`, the prior gap is closed: the API exposes a stable content-addressed `planId` as `plan_${full planDigest}` only when a persisted plan digest exists, the UI renders localized Plan ID labels, and the focused API fixture asserts the exact identifier. The requested user outcome is complete.

## blockers

None.

## checkedArtifacts

- Plan: `/home/singlerr/ref_studio/.omo/plans/motion-graphics-ai-completion-v2.md` (P5.3)
- Executor evidence: `/home/singlerr/ref_studio-motion-complete/.omo/evidence/p5-3-admin-motion-adobe-20260830.md`
- Exact commit: `56308f49782dd2822faff38b9b6151d973c813a4`; `git rev-parse HEAD` matched and `git merge-base --is-ancestor <commit> HEAD` exited 0.
- Commit scope: 17 paths from `git show --name-only`; product inspection was limited to the assigned API/web files and their focused tests/messages, plus shared CSS used by the existing record surface.
- Screenshots inspected at original resolution: `p5-3-admin-desktop.png`, `p5-3-admin-data-320.png`, `p5-3-admin-action-success.png`, and the intentionally failing `p5-3-admin-action-result.png`.
- Prior reproduced full suites remained green: API 39 files/457 tests and web 12 files/97 tests.
- Reverification reproduced focused API tests: 2 files, 30 tests passed.
- Reverification reproduced focused web tests: 2 files, 12 tests passed.
- Reverification reproduced API build, web `tsc --noEmit`, and repository `format:check`: all passed.
- Security/redaction inspection: production read projection selects only typed fields; Adobe queries omit command/result JSON and device keys; no API keys, relay secrets, local paths, raw prompts or AEP bytes were found in returned P5.3 objects.
- Mutation inspection: OPS tenant assignment is checked before idempotent execution; production SQL uses tenant and exact prior-state predicates (`FAILED→QUEUED`, `RUNNING→CANCELLED`, `ENROLLED→REVOKED`); rollback requires a tenant-owned COMPLETED job and an existing predecessor; allowed audit events are persisted through `recordAuditEvent`.
- Proxy inspection: all four browser mutation patterns match API registrations; parity tests passed.
- Localization/responsive inspection: all added labels/actions exist in both `en-US.json` and `ko-KR.json`; existing record-detail CSS uses `overflow-wrap:anywhere`; the populated 320px artifact is readable without horizontal document overflow.
- Direct programming/remove-ai-slops pass: production additions are necessary and mostly reuse existing admin seams. No secret leakage, dead debug output, needless new abstraction, or deletion-only test was found. `admin-components.test.mjs` largely asserts source strings and therefore gives weak implementation-mirroring confidence, while `admin-mutation.test.ts` uses mocked motion actions rather than the production DB adapter; these are notes because direct source inspection plus the live retry artifact support the named behavior. The changed `server.ts` and route page exceed the skill's 250-pure-LOC preference, but that is not a stated P5.3 success criterion and is not a blocker.

## exactEvidenceGaps

- The prior plan-ID evidence gap is resolved at SHA `56308f49782dd2822faff38b9b6151d973c813a4`: `apps/api/src/admin-read.ts:37`, `apps/api/src/server.ts:568`, `apps/api/src/admin-read.test.ts:252,371`, `apps/web/src/app/[locale]/[...slug]/page.tsx:782-783`, and both locale catalogs now carry the identifier end to end.
- No dedicated Korean screenshot was supplied. Both locale catalogs contain the new keys, so this is a non-blocking artifact gap rather than proof of criterion failure.
- The focused mutation test stubs `motionActions`; it does not directly execute the production SQLite adapters for all four transitions. Production predicates were inspected and the browser retry artifact demonstrates one real transition, so this is a non-blocking coverage gap.
- No separate code-review report or manual-QA matrix was provided. The executor evidence, direct review, and focused reverification supply enough evidence for every stated criterion.
