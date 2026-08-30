# Audit-gap remediation — 2026-08-30

Root tip before this commit: `e099523` (post-merge). Fixes address independent plan-audit findings.

## Closed gaps

| Finding | Fix |
| --- | --- |
| P1.2 canary not executed on prod | `ensureFreshMotionToolCanary` + host adapter; wired in `author-scene.ts`; admin `POST /admin/motion-provider-canaries/run` + web proxy allowlist |
| P2.1 route verify hardcoded one predicate | `verifyMotionSceneForJob` unions plan `predicateIds` with `element-kind-capability` on PATCH/rollback/render/refine paths |
| P6.3 observability unused | `setMotionObservabilitySink` in `createApiServer`; emit/sample from author-scene, applySceneOperations, VERSION_CONFLICT, admin canary |
| P6.1 budget literals | API relay/artifact limits use `RESOURCE_BUDGETS`; adobe/worker comments lockstep |
| P6.2 UI/docsUrl | `MotionWorkspaceApiError` carries `causeCategory`/`docsUrl`; chat appends docsUrl; VERSION_CONFLICT returns `safePredecessor` |
| P5.1 knowledge cards | Snapshot adds `knowledgeCardIds`; UI renders IDs |
| P5.2 Adobe select | Enabled when `adobeReady`; locked note otherwise |
| P6.4 docs | MOTION.md observability/canary sections; errors.md catalog pointer |

## Still host-blocked

- **P4.8** real After Effects QA (no AE binary)
- P4.7 independent gate review launched separately

## Gates

- contracts 113, api 458, web 108, adobe 64 (plus adobe tip `8c4d955` comment commit)
