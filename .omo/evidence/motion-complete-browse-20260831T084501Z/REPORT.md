# P7.3 live browse no-sandbox QA

- date: 2026-08-31T08:45:41.309Z
- root SHA: `3e6de1e1d25b726f168f6e8f7d672bd868c850bf`
- worker: `6efc320f79d2756accce1559fae4cbcad57cda35`
- adobe: `8c4d955d5cbed750f1458558aca684fa5c2bb4fc`
- method: Playwright Chromium chromium with `--no-sandbox` (gstack `$browse` still NEEDS_SETUP)
- fixture API: `http://127.0.0.1:3199` (`apps/web/test/motion-workspace-browser-server.mjs`)
- production Next: `http://127.0.0.1:3101` with `RVS_INTERNAL_API_URL`, `RVS_EXPECTED_ORIGIN=http://127.0.0.1:3101`, `RVS_INSECURE_COOKIES=true`
- session: cookie `rvs_session=motion-browser-session`
- job: `job_Kko8F7oq5JeLsQMv`

## Matrix

EN/KO x 1440 / 1280 / 768 / 390 / 375 / 320:

| Check | Result |
| --- | --- |
| `.motion-workspace` count | 1 on all 12 viewports |
| `documentElement.scrollWidth <= innerWidth` | true on all 12 |
| Console errors | none |
| Desktop keyboard `End` on separator (EN 1280) | `aria-valuenow=70` |
| Mobile keyboard `ArrowRight` Chat->Editor (KO 320) | `aria-selected=true` |

Artifacts: `en-US-*.png`, `ko-KR-*.png`, keyboard smokes, `matrix.json`, `SHA256SUMS`.

## Verdict

**PASS**

- Adobe UI remains capability-locked (P4.8 hardware gate).
