# P7.1 automated verification gate — HEAD stamp

- date: 2026-08-30T12:55:18Z
- root: `9259691fb9e190f93a752562a506337b50a677ea` (pre-evidence-commit; see commit that includes this report)
- adobe: `d115c98f60b8332d0fbf33f27f8612f3f5af78d5`
- worker: `c6845d7f472209e83b15c0619c0dee989b282920`

## Suite results

| Slice | Result |
| --- | --- |
| `pnpm contracts:openapi:check` | verified (`692e8d6aa453…`) |
| `@rvs/contracts test` | 113 pass / 9 files |
| `@rvs/api test --run` | 458 pass / 39 files |
| `@rvs/worker test --run` | 318 pass / 2 skipped / 36 files (+1 skipped file before hydrate link) |
| `@rvs/web test --run` | 108 pass / 14 files |
| adobe `bun run check` + `bun test` | 64 pass / 11 files |
| `generated-video-delivery` (900-frame metadata assemble) | 1 pass |
| `gen-render-delivery.determinism` (real Chrome) | **3 pass** after linking `runtime/hydrated` |

## Determinism notes

Initial full-suite run skipped Chromium because `runtime/hydrated` was absent in the worktree. Linked from the main checkout’s hydrated chrome-for-testing + Wanted Sans, then re-ran:

- identical frames/metadata/packages across independent processes under CPU load (~11.3s)
- 16:9 1920×1080 path (~2.2s)

Logs: `openapi.log`, `contracts.log`, `api.log`, `worker.log`, `web.log`, `adobe.log`, `determinism-900.log`, `determinism-900-rerun.log`.

## Still out of host scope

- Real After Effects fixture (P4.8)
- gstack `$browse` binary (`NEEDS_SETUP`); Playwright no-sandbox matrix already recorded under P7.3
