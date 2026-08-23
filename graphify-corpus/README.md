# Reference Video Studio — Final Handoff

## Authority

- Trial 1 authority is compiler v1.9. Its T1, T2, T3, T4, T5, and T6 gates are `APPROVED`.
- Trial 2 authority is compiler v1.13. Its T1, T2, T3, T4, T5, and T6 gates are `APPROVED`.
- Trial 1 compiler v1.8 is preserved as `rejected-history`; it is not downstream authority.
- WebGL2/browser remains the incumbent renderer. The approved evidence is semantic DOM/SVG plus owner-bound WebGL2.
- The authority ledger is copied as `authority-ledger.json`.

## Status

- Trial 1: `PASSED`, T1–T6 `APPROVED`.
- Trial 2: `PASSED`, T1–T6 `APPROVED`.
- This package is the worker recovery point for the completed handoff.
- The canonical recovery artifact is `recovery-report.json`; no markdown recovery report exists.

## Included evidence

- `plan.md`: execution plan and acceptance gates.
- `authority-ledger.json`: current receipt authority and rejected history.
- `reference-interpretation-contract.json`: measurable, fail-closed reference contract.
- `editable-scene-contract.json`: AuthoringIR, SceneIR, and BrowserPassSpec contract.
- `renderer-bakeoff-report.json`: renderer bake-off and incumbent decision.
- `pilot-evidence.json`: pilot media and frame-contract evidence.
- `reference-fixtures-manifest.json`: synthetic, adversarial, ablation, and frame fixtures.
- `workflow.md`: ingest-to-delivery, retry, cancellation, stale-approval, and retention workflow.
- `provenance.md`: source paths and provenance policy.
- `stale-history.md`: rejected and superseded history that must not become authority.
- `commands.md`: recovery and QA commands.

## Isolation and safety

The restored editable checkpoint directory is `restored`, directly inside this package. The validator checks that it remains package-contained, that traversal segments are absent, and that common AWS credential/private-key patterns are absent. Provenance may identify source artifacts, but hashes are not validation gates.
