# Reference Video Studio

Motion authoring, Native delivery, and Adobe MCP live in this monorepo.

Developer entry points:

- Motion quick start, Adobe fixture, gates, and observability: [`docs/MOTION.md`](docs/MOTION.md)
- Error catalog: [`docs/errors.md`](docs/errors.md)
- Observability dashboard spec: [`docs/motion-observability-dashboard.json`](docs/motion-observability-dashboard.json)
- Contracts: [`packages/contracts`](packages/contracts)
- API: [`apps/api`](apps/api)
- Web workspace: [`apps/web`](apps/web)
- Worker: [`apps/worker/README.md`](apps/worker/README.md)
- Adobe bridge: [`integrations/adobe-bridge/README.md`](integrations/adobe-bridge/README.md)

```bash
pnpm install
pnpm --filter @rvs/contracts test
pnpm --filter @rvs/api test --run
pnpm --filter @rvs/web test --run
```
