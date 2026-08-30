# P7.3 live browse no-sandbox QA

- date: 2026-08-30T12:40:00Z
- root SHA: `ae038a468d7c5fcc15f25c6181dc3ceaad850ca0`
- adobe: `d115c98f60b8332d0fbf33f27f8612f3f5af78d5`
- worker: `c6845d7f472209e83b15c0619c0dee989b282920`
- method: Playwright Chromium with `--no-sandbox` (gstack browse still `NEEDS_SETUP`)
- fixture API: `http://127.0.0.1:3199` (`motion-workspace-browser-server.mjs`)
- production Next: `http://127.0.0.1:3101` with `RVS_INTERNAL_API_URL`, `RVS_EXPECTED_ORIGIN=http://127.0.0.1:3101`, `RVS_INSECURE_COOKIES=true`
- session: cookie `rvs_session=motion-browser-session`
- job: `job_0J_i_zbYQvtrmdn2`

## Matrix

EN/KO × 1440 / 1280 / 768 / 390 / 375 / 320:

| Check | Result |
| --- | --- |
| `.motion-workspace` count | 1 on all 12 viewports |
| `documentElement.scrollWidth <= innerWidth` | true on all 12 |
| Console errors | none |
| Desktop keyboard `End` on separator (EN 1280) | `aria-valuenow=70` |
| Mobile keyboard `ArrowRight` Chat→Editor (KO 320) | `aria-selected=true` |

Artifacts: `en-US-*.png`, `ko-KR-*.png`, keyboard smokes, `matrix.json`, `SHA256SUMS`.

## Visual inspection

- EN 1280: split workspace with chat metadata, native-renderer lock note for Adobe, canvas v1 frame 0, timeline beats.
- KO 320: Korean chrome and chat tab strip legible; no horizontal document overflow; Adobe lock copy localized.

## Notes

- Adobe UI remains capability-locked (P4.8 hardware gate).
- Admin surface not re-browsed in this matrix (creator workspace focus); P5.3 admin artifacts remain the prior admin evidence.
