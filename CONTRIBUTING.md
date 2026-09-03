# Contributing

## Setup

```bash
pnpm install
pnpm --filter @rvs/contracts test
pnpm --filter @rvs/api test --run
pnpm --filter @rvs/worker test --run
pnpm --filter @rvs/web test --run
```

Motion, Adobe, and worker runbooks: [`docs/MOTION.md`](docs/MOTION.md).
Error catalog: [`docs/errors.md`](docs/errors.md).

## Rules

- Keep `apps/worker` standalone. It vendors a few modules from
  `packages/contracts`. If you change those files, copy the bodies into
  `apps/worker/src/contracts/` and keep the vendor header. The drift test
  in `apps/api/src/worker-contracts-vendoring.test.ts` fails otherwise.
- Do not rewrite applied SQL migrations. Add a new numbered file and
  register it in `apps/api/database/db.mjs`.
- Do not add embeddings, a vector index, or a second skill per motion
  domain. `motion.lookup` is host-owned SQLite (exact alias + FTS5).
- Secrets stay out of git. Copy `.env.example`.

## License

Contributions are accepted under Apache-2.0 (see `LICENSE`).
