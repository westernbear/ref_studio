# Audit-gap remediation round 3 — 2026-08-31

Closes closable PARTIAL items from `.omo/evidence/plan-audit-resynthesis-20260831.md` at tip `6e3a784`.

| Item | Change |
| --- | --- |
| P1.2 | Production/admin canary default is `liveProviderMotionLookupCanaryAdapter` (`generateObject` + `toolChoice: motion.lookup`). Host SQL runs only inside the tool execute. Tests inject `generateCanary` / `generateLiveCanary`. |
| P2.4 | Flag matrix now covers native render, adobe render (`adobeMcp=false` → 403), refine, rollback, and PATCH. |
| P5.2 | `adobeCatalogForJob` reads `adobe_devices` ENROLLED rows; snapshot overlays `ENROLLED`/`READY`; UI no longer requires `backend === "adobe"`. Job working-copy project is `job:<id>`. |
| P6.2 | Cancel and worker `/cancelled` invalid-state envelopes carry `safePredecessor` when a scene digest/artifact exists. |
| P6.3 | `GET /admin/motion-observability` is registered. Snapshot includes histogram rollups for `tthw_ms` and `adobe_queue_age_ms`. OpenAPI documents the route. |
| P6.1 | Contract test asserts worker ffmpeg and Adobe spool literals match `RESOURCE_BUDGETS`. |

Unchanged blockers: P4.8 (no After Effects), P0.2 real 900-frame mux, P7.3 `$browse`, P7.5 unpushed until asked.
