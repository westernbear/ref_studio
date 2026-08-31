# P7.1 automated gate

- date: 2026-08-31T02:35:22.672Z
- root: `c206711865db85185b7fd6e89304385645f78f21`
- worker: `0cb31092874cbdb8ce05ad369d1faab3fc32c119`
- adobe: `8c4d955d5cbed750f1458558aca684fa5c2bb4fc`
- dir: `/home/singlerr/ref_studio-motion-complete/.omo/evidence/p7-1-automated-gate-2026-08-31T0233Z`

| Slice | Status | Elapsed |
| --- | --- | --- |
| `format` | FAIL | 23s |
| `typecheck` | PASS | 14s |
| `openapi` | PASS | 1s |
| `assert-evidence` | FAIL | 0s |
| `assets` | PASS | 1s |
| `recovery` | PASS | 1s |
| `handoff` | PASS | 1s |
| `security` | PASS | 29s |
| `contracts` | PASS | 2s |
| `api` | PASS | 25s |
| `web-unit` | PASS | 3s |
| `worker` | PASS | 18s |
| `adobe-check` | PASS | 8s |
| `adobe-test` | PASS | 8s |

**Verdict:** PARTIAL — failing slices recorded below.

## FAIL format

```
Checking formatting...
[ELIFECYCLE] Command failed with exit code 1.
$ prettier --check --ignore-unknown --no-error-on-unmatched-pattern '*.*' 'apps/*/*.*' 'apps/*/{compiler,database,scripts,src,test}/**/*' 'compiler/**/*' 'dist/**/*' 'docs/**/*' 'examples/**/*' 'packages/**/*' 'runtime/**/*' 'scripts/**/*' 'tests/**/*' 'verification/**/*'
[warn] scripts/qa/stamp-p7-1.mjs
[warn] Code style issues found in the above file. Run Prettier with --write to fix.

```

## FAIL assert-evidence

```
file:///home/singlerr/ref_studio-motion-complete/scripts/qa/assert-evidence.mjs:9
  throw new Error(code);
        ^

Error: STALE_EVIDENCE
    at fail (file:///home/singlerr/ref_studio-motion-complete/scripts/qa/assert-evidence.mjs:9:9)
    at validateProvenance (file:///home/singlerr/ref_studio-motion-complete/scripts/qa/assert-evidence.mjs:55:5)
    at validateTask (file:///home/singlerr/ref_studio-motion-complete/scripts/qa/assert-evidence.mjs:84:3)
    at async file:///home/singlerr/ref_studio-motion-complete/scripts/qa/assert-evidence.mjs:127:5

Node.js v24.5.0

```

