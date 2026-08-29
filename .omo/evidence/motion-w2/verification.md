# Motion W2 verification

- Contracts: `pnpm --filter @rvs/contracts test` -> 6 files, 79 tests passed. Scenario: strict motion schemas reject duplicate `opId` and unknown fields. Artifact: `packages/contracts/src/motion.test.ts`.
- API: `pnpm --filter @rvs/api test --run src/motion-scene.test.ts src/refine-prompt.test.ts` -> 2 files, 24 tests passed. Scenario: actual GET/PATCH injection observes initial version, stale ETag `409`, and successful version 2; generated refine uses the shared operation applier. Artifact: `apps/api/src/refine-prompt.test.ts`.
- Motion semantics: the same API test invocation proves 12-frame anticipation, 8% overshoot (`1.08`), frame 36 settle, and 6-frame second-element stagger. Artifact: `apps/api/src/motion-scene.test.ts`.
- Repair bound: the motion unit scenario observes exactly four verifier calls and object identity preservation of the safe scene on failure. Artifact: `apps/api/src/motion-scene.test.ts`.
- Database: `node apps/api/database/test.mjs` -> exit 0 with `integrity=ok`; mutation and deletion of an inserted motion scene version both raise `MOTION_SCENE_VERSION_IMMUTABLE`. Artifact: `apps/api/database/test.mjs`.
- Typecheck: `pnpm --filter @rvs/contracts build && pnpm --filter @rvs/api build` -> exit 0.
- Formatting: `pnpm format:check` -> exit 0.
- Generated contract: `node scripts/contracts/openapi.mjs` -> `status=generated`, 8 operations, 26 schemas. Artifacts: `packages/contracts/generated/openapi.json`, `apps/api/openapi.json`, and `packages/contracts/generated/client.ts`.
