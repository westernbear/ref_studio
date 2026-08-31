# Audit-gap remediation round 2 — 2026-08-31

Closes remaining PARTIAL items from `.omo/evidence/plan-audit-resynthesis-20260830.md` that can be implemented without After Effects.

## Closed

| Finding | Fix |
| --- | --- |
| P1.2 host adapter default | `providerMotionLookupCanaryAdapter` is the production seam; author-scene + admin POST use it; cold-start / FAIL / expired TTL tests |
| P2.1 route predicate test | PATCH with `beat-tiling` on a gapped scene → `SCENE_VERIFICATION_FAILED` |
| P2.2 concurrent PATCH | uniqueness test under `Promise.all` |
| P2.4 flag matrix | 8 combos on GET/PATCH/render/refine |
| P5.1 knowledge cards | Snapshot `knowledgeCards` with titles; UI shows EN/KO titles |
| P5.2 Adobe picker | Render body `backend`/`deviceId`/`projectId`; device/project selects when `adobeReady` |
| P6.1 ffmpeg budget | Worker mux stats output vs `maxFfmpegOutputBytes` |
| P6.2 predecessor | render/rollback/refine failures carry `safePredecessor` + `artifactId` |
| P6.3 catalog / dashboards | Remaining events/metrics emitted; `GET /admin/motion-observability`; `docs/motion-observability-dashboard.json` |
| P6.4 docs | Root + package READMEs; migration walkthrough; offline gate matrix |

## Still host-blocked

- **P4.8** real After Effects QA
- gstack `$browse` `NEEDS_SETUP` (Playwright substitute remains)
