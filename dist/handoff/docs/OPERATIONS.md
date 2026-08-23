# Deployment And Operations

The execution contract is the order of record: explicit migrations, runtime preflight, service startup, health checks, monitoring, and only then pilot traffic. A failed preflight or migration is a kill point; it does not permit a partial deploy.

Run `pnpm deploy:verify` before deployment. It checks the frozen execution contract, Compose isolation, and generated OpenAPI. If Docker is available, run `docker compose up -d`, then inspect service health and logs. The pinned QA image may still be unable to hydrate workspace dependencies: Task 43 records that limitation and local security/concurrency equivalents remain authoritative.

The supported pilot is a bounded, deterministic four-second selected interval. It admits 24/25/30/50/60fps and 96/100/120/200/240 frames. The explicit capacity boundary is 60fps, 3840x2160 dense OCR, 240 frames. This is not a five-minute or production-scale claim.

Generated OpenAPI is produced with `pnpm contracts:openapi`; do not edit `packages/contracts/generated/openapi.json` directly.
