# P7.2 Graphify closure audit — 2026-08-30

- root SHA: `23f1f8775e1e3b2040526ff01e8fb1893defbb34`
- adobe tip: `d115c98f60b8332d0fbf33f27f8612f3f5af78d5`
- worker tip: `c6845d7f472209e83b15c0619c0dee989b282920`
- corpus: `.omo/evidence/graphify-closure-20260830/corpus`
- graph: `.omo/evidence/graphify-closure-20260830/graphify-out/graph.json`
- mode: `--code-only` (no LLM key; docs/papers skipped)
- SQL AST: unavailable (`tree_sitter_sql` missing) — migrations reconciled by direct file inspection

## Corpus

| Metric | Value |
| --- | --- |
| Files (manifest) | 425 |
| Words (approx) | 382,300 |
| Size | 9.6M after excluding verification media fixtures |
| Exclusions | recorded in `exclude-manifest.txt` (mkv/mp4/png fixtures, node_modules, dist, caches) |

Includes: `packages/contracts/src`, `apps/api/src`, `apps/api/database/migrations`, `apps/web/src`, `apps/worker/src`, `skills`, `scripts`, `verification` (non-fixture), `integrations/adobe-bridge` src/scripts/test.

## Graph

| Metric | Value |
| --- | --- |
| Nodes | 3228 |
| Edges | 6871 |
| Communities | 151 |
| Extraction | 100% EXTRACTED for code AST |

## Required path matrix

| Required path | Graphify (undirected) | Direct production evidence |
| --- | --- | --- |
| `MotionPlanV1` → generator | Schema const not AST-linked to `generateMotionPlan` | `authorScene` calls `generateMotionPlan` (`author-scene.ts`) which parses `MotionPlanV1Schema` |
| generator → compiler | `compileMotionPlan` ← `applyMotionPlan` ← `authorScene` (2 hops) | `author-scene-motion.ts` `applyMotionPlan` → `compileMotionPlan` |
| lookup → authoring | `lookupMotionKnowledgeForBrief` ← `authorScene` (1 hop) | `author-scene.ts` host lookup before model |
| canary → authoring | `modelMotionTools` ← `authorScene` (1 hop) | admitted tools gate `motion.lookup` |
| verifier | `generateVerifiedScene` ← `authorScene`; `verifyAndRepair` on motion-operations | production authoring + scene routes |
| capability ↔ deliverables | both contained in `motion.ts` | admin/server publish deliverables with capability snapshot |
| Adobe installer discovery | `installSignedPanel` ↔ `directPanelEntryPath` via `installer.ts` | P4.7 second rework |

## SQL reconcile (direct)

| Migration | Role |
| --- | --- |
| `018_motion_knowledge.sql` | `motion_cards` / `motion_aliases` |
| `019_motion_scene_versions.sql` | immutable scene versions |
| `020_scene_package_artifacts.sql` | package slots |
| `021_motion_provider_canaries.sql` | `motion_provider_canaries` |
| `022_motion_plan_metadata.sql` | plan metadata |
| `023_adobe_devices_commands.sql` | Adobe devices/commands |
| `024_adobe_device_nonce_scope.sql` | relay nonce scope |

## Verdict

**PASS with notes**

- Production motion plan path is closed through EXTRACTED call edges into `authorScene`, plus direct source inspection for `MotionPlanV1Schema` parse sites.
- Graphify does not always emit edges from Zod schema consts to their consumers; that is an extractor limitation, not a missing production path.
- No newly dangling production symbols found for the required motion/Adobe/UI/admin closure set at SHA `23f1f87`.
- Stale handoff `graphify-corpus` / root `graphify-out` (144-node SaaS handoff graph) is **not** this audit; this audit uses the isolated evidence corpus above.

## Residual

- Independent P4.7 gate APPROVE still pending.
- P4.8 real AE hardware still blocked on Linux.
- Optional: install `graphifyy[sql]` later for AST coverage of migrations (not required once direct SQL reconcile is recorded).
