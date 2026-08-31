# P7.2 Graphify closure audit — 2026-08-31

- root SHA at extract: `c206711865db85185b7fd6e89304385645f78f21`
- worker tip (gitlink at extract): `0cb3109` (real-mux test not yet gitlinked)
- adobe tip: `8c4d955`
- corpus: `.omo/evidence/graphify-closure-20260831T023308Z/corpus`
- graph: `.omo/evidence/graphify-closure-20260831T023308Z/corpus/graphify-out/graph.json`
- mode: `--code-only` (no LLM key)
- SQL AST: unavailable (`tree_sitter_sql` missing) — migrations reconciled by direct file inspection
- CSS: four motion styles skipped as unclassified; `tokens.css` flagged sensitive (same class of false positive as 2026-08-30)

## Corpus

| Metric | Value |
| --- | --- |
| Files | 366 (360 code extracted) |
| Nodes | 2854 |
| Edges | 6195 |
| Communities | 137 |
| Extraction | 100% EXTRACTED for classified code AST |

Includes: contracts/src, api/src, api migrations, web/src, worker/src, skills, scripts, adobe-bridge src/scripts/test.

## Required path matrix

| Required path | Graphify (undirected) | Direct production evidence |
| --- | --- | --- |
| `MotionPlanV1` → generator | Schema const not AST-linked to `generateMotionPlan` | `authorScene` calls `generateMotionPlan` which parses `MotionPlanV1Schema` |
| generator → compiler | `generateMotionPlan` ← `author-scene.ts` → `author-scene-motion.ts` → `compileMotionPlan` (3 hops) | `applyMotionPlan` → `compileMotionPlan` |
| lookup → authoring | `lookupMotionKnowledgeForBrief` ← `authorScene` (1 hop) | host lookup before model |
| canary → authoring | `liveProviderMotionLookupCanaryAdapter` ← `authorScene` (1 hop) | production default live tool channel |
| catalog → snapshot | `adobeCatalogForJob` ← `motionSceneSnapshot` (1 hop) | enroll overlay on GET |
| observability | `motionObservabilitySnapshot()` in contracts; imported by `admin-read.ts` | `GET /admin/motion-observability` registered |

## SQL reconcile (direct)

`018`–`024` motion/Adobe migrations remain present under `apps/api/database/migrations/`. Graphify still cannot parse SQL without `tree_sitter_sql`.

## Verdict

**PASS with notes**

- New production edges from `e3cc136` (`liveProviderMotionLookupCanaryAdapter`, `adobeCatalogForJob`) are EXTRACTED call edges into authoring/snapshot.
- `MotionPlanV1` schema-const → consumer remains an extractor limitation, unchanged from 2026-08-30.
- Node/edge count is lower than the Aug-30 corpus (3228/6871) because CSS/verification extras were not copied; the required motion production paths are present.
