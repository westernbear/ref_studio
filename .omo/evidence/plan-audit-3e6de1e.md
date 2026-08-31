# Plan implementation audit — motion-graphics-ai-completion-v2 @ `3e6de1e`

- date: 2026-08-31
- branch: `master`
- root: `3e6de1e1d25b726f168f6e8f7d672bd868c850bf`
- worker gitlink: `6efc320f79d2756accce1559fae4cbcad57cda35`
- adobe gitlink: `8c4d955d5cbed750f1458558aca684fa5c2bb4fc`
- prior full audit: `.omo/evidence/plan-audit-resynthesis-20260831-loop3.md` @ `afc9048`
- method: delta audit — `afc9048..HEAD` is 11 files / +216 −16; re-ran the plan's own
  release gate (`scripts/qa/stamp-p7-1.mjs`) and browse harness at HEAD instead of a
  second 8-phase subagent sweep.

## Environment finding (not a code regression)

The shell resolved Node **v25.5.0** (NODE_MODULE_VERSION 141) while `better-sqlite3@12.2.0`
in this tree is built for **Node 24** (ABI 137). Under Node 25 the API suite reported
179 failed / 301 passed — every failure was `bindings` failing to load
`better_sqlite3.node`, not product code. Re-running under `~/.nvm/versions/node/v24.20.0`
gives 321 passed / 1 gated skip. The repo pins no Node version (`engines` absent,
no `.nvmrc`); Node 24 is the version this `node_modules` was installed against.

## Code fix applied

`apps/api/src/motion-plan-generator.ts` — commit `3e6de1e` shipped Prettier-unformatted
code, so gate slice `format` was RED at HEAD. Fixed with `prettier --write`;
whitespace only (3 insertions / 4 deletions, no semantic change). Uncommitted.

## P7.1 automated gate at HEAD

`p7-1-automated-gate-2026-08-31T0842Z` — **14/14 PASS**

| Slice | Status | Slice | Status |
| --- | --- | --- | --- |
| `format` | PASS | `contracts` | PASS |
| `typecheck` | PASS | `api` | PASS |
| `openapi` | PASS | `web-unit` | PASS |
| `assert-evidence` | PASS | `worker` | PASS |
| `assets` | PASS | `adobe-check` | PASS |
| `recovery` | PASS | `adobe-test` | PASS |
| `handoff` | PASS | | |
| `security` | PASS | | |

- OpenAPI canonical SHA `43f0e4ec3ba7d8013744ae472a67fd6ef7440ecbd8d2ba8c21ea2135c16c5479`,
  identical across contracts and api mirrors — **P0.4 holds** despite the
  `packages/contracts/src/motion.ts` change in the delta.
- `assert-evidence` was RED on the first run (`STALE_EVIDENCE`): `.omo/evidence/index.jsonl`
  still carried the `afc9048`-era `implementationCommit`. Closed with the existing
  `scripts/qa/refresh-current-evidence.mjs` (2 rows re-stamped to `3e6de1e`), then PASS.
  This is structural: any new commit re-stales it until the refresh is re-run.

Suite totals under Node 24: contracts 5/5 · api 321 passed + 1 gated skip ·
web unit 110/110 · worker 320 passed + 1 gated skip · adobe-bridge 64/64 (1655 assertions).

## Delta commits mapped to plan tasks

| Change | Task | Verdict |
| --- | --- | --- |
| `motion-plan-generator.ts` +77 (admit Codex extras) | P1.3 plan compiler | **PASS** — 2 new tests: injected scene draft ignored; extra nested keys + unknown predicate ids still yield a valid stored plan |
| `workers.ts` +48 (accept snapshot digest) | P3 worker complete contract | **PASS** — 2 new tests: preflight and preview reports both accept the worker snapshot digest |
| `motion-canary.ts` (timeout 5s → 30s) | P1.2 provider canary | **PASS** — live tool-channel default unchanged; only the round-trip budget was raised because Codex gpt-5.5 misses 5s, which was storing FAIL and dropping `motion.lookup` |
| `contracts/src/motion.ts` | P0.4 / P2 contracts | **PASS** — `contracts:openapi:check` verified, SHA unchanged |
| `job-create-reasons.ts` + `messages/{en-US,ko-KR}.json` | P5 named refusal reasons | **PASS** — `motionAuthoringDisabled` present in both locales; `job-create-reasons.test.mjs` 3/3 |
| `apps/worker` gitlink ×2 | P7.4 gitlink hygiene | **PASS** — `git submodule status` clean, gitlinks not copied trees |

## P7.3 browse QA at HEAD

`motion-complete-browse-20260831T084501Z` — 12 viewports (EN/KO matrix), `pass: true`,
`GSTACK_CHROMIUM_NO_SANDBOX=1`, existing `scripts/qa/run-browse-motion-workspace.sh`.
Keyboard: desktop `End` → `ariaValueNow=70`; mobile 320 px `ArrowRight` → editor selected.

## Verdict

Every plan task is implemented and verified at `3e6de1e`, with one standing exception:

- **P4.8 — BLOCKED.** Real After Effects readback needs AE hardware, which this Linux
  host does not have. Not closeable here; no fixture is presented as hardware evidence.

P7.5 (push/merge) is **closed** — PR #5 merged as `67dceff`.

## Open / caveats

1. Node version is unpinned. The gate is green only under Node 24; Node 25 breaks the
   native sqlite binding. Adding `.nvmrc` or `engines.node` would make this deterministic.
2. The Prettier fix and the refreshed `.omo/evidence/index.jsonl` are uncommitted. Committing
   them advances HEAD, which re-stales `assert-evidence` until the refresh is re-run.
3. The plan's §7 command list names a bare `pnpm media:verify`, but that script requires a
   `<fixture-output>` argument and is a per-fixture tool, not a gate slice. It is absent from
   the 14-slice gate by design; the plan text is imprecise, not the code.
