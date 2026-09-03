# Reference Video Studio

Open-source motion authoring studio: measure a reference clip, author a
typed scene, verify predicates, and deliver a deterministic MP4 (Native)
or an Adobe After Effects working copy (opt-in MCP).

First-party code is Apache-2.0. The worker **runtime image** still ships
GPL FFmpeg/x264 and GPL-3 matting weights — see [`NOTICE`](NOTICE) and
[`verification/contract/supply-chain.json`](verification/contract/supply-chain.json)
before you redistribute containers.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Creator and admin workspace |
| `apps/api` | HTTP API, SQLite, motion lookup, authoring |
| `apps/worker` | Standalone render/compile daemon (own Compose) |
| `packages/contracts` | Shared schemas |
| `compiler/` | Python evidence compiler |
| `integrations/adobe-bridge` | Local After Effects MCP connector |
| `skills/motion-authoring` | Host-owned `motion.lookup` skill |

## Quick start

```bash
pnpm install
pnpm --filter @rvs/contracts test
pnpm --filter @rvs/api test --run
pnpm --filter @rvs/worker test --run
pnpm --filter @rvs/web test --run
```

Copy [`.env.example`](.env.example) before running the API. Worker setup:
[`apps/worker/README.md`](apps/worker/README.md). Motion and Adobe
runbook: [`docs/MOTION.md`](docs/MOTION.md). Errors: [`docs/errors.md`](docs/errors.md).

## License

Apache License 2.0. Third-party fonts, Adobe-bridge lineage, and GPL
runtime obligations are listed in [`NOTICE`](NOTICE).
