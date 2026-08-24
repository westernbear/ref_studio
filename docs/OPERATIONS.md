# Deployment And Operations

The execution contract is the order of record: explicit migrations, runtime preflight, service startup, health checks, monitoring, and only then pilot traffic. A failed preflight or migration is a kill point; it does not permit a partial deploy.

Run `pnpm deploy:verify` before deployment. It checks the frozen execution contract, Compose isolation, and generated OpenAPI. Set `RVS_WORKER_TOKEN` and `RVS_SESSION_INTROSPECT_SECRET` explicitly before any `docker compose` command; root Compose configuration fails when either is absent and has no development credential fallback. If Docker is available, run `docker compose up -d`, then inspect service health and logs. The pinned QA image may still be unable to hydrate workspace dependencies: Task 43 records that limitation and local security/concurrency equivalents remain authoritative.

Initial admin credentials can be supplied in the root `.env` before `pnpm --filter @rvs/api db:reset` or `pnpm --filter @rvs/api db:verify`: `RVS_INITIAL_ADMIN_EMAIL`, `RVS_INITIAL_ADMIN_PASSWORD`, and optional `RVS_INITIAL_ADMIN_NAME`. The API database lives at `apps/api/data/app.sqlite` unless `DATABASE_PATH` is set.

Set `RVS_EXPECTED_ORIGIN` to the exact browser-facing web origin, including scheme and port, for example `http://192.168.123.100:3100`. Creator and admin sign-in and all browser mutations reject missing or different origins.

Worker compose uses `RVS_API_BASE_URL`; from a Docker worker talking to the same host-published API port, use `http://host.docker.internal:3200`. From a separate worker server, use `http://<api-server-host>:3200`. `RVS_WORKER_TOKEN` must match the API server's token.

The supported pilot is a bounded, deterministic four-second selected interval. It admits 24/25/30/50/60fps and 96/100/120/200/240 frames. The explicit capacity boundary is 60fps, 3840x2160 dense OCR, 240 frames. This is not a five-minute or production-scale claim.

Generated OpenAPI is produced with `pnpm contracts:openapi`; do not edit `packages/contracts/generated/openapi.json` directly.
