# Deployment And Operations

The execution contract is the order of record: explicit migrations, runtime preflight, service startup, health checks, monitoring, and only then pilot traffic. A failed preflight or migration is a kill point; it does not permit a partial deploy.

Run `pnpm deploy:verify` before deployment. It checks the frozen execution contract, Compose isolation, worker startup wiring, and generated OpenAPI. Set `RVS_WORKER_TOKEN` and `RVS_SESSION_INTROSPECT_SECRET` explicitly before root `docker compose` commands; root Compose configuration fails when either is absent and has no development credential fallback. If Docker is available, run `docker compose up -d`, then inspect service health and logs. The pinned QA image may still be unable to hydrate workspace dependencies: Task 43 records that limitation and local security/concurrency equivalents remain authoritative.

Initial admin credentials can be supplied in the root `.env` before `pnpm --filter @rvs/api db:reset` or `pnpm --filter @rvs/api db:verify`: `RVS_INITIAL_ADMIN_EMAIL`, `RVS_INITIAL_ADMIN_PASSWORD`, and optional `RVS_INITIAL_ADMIN_NAME`. The API database lives at `apps/api/data/app.sqlite` unless `DATABASE_PATH` is set.

Set `RVS_EXPECTED_ORIGIN` to the exact browser-facing web origin, including scheme and port, for example `http://192.168.123.100:3100`. Creator and admin sign-in and all browser mutations reject missing or different origins.

Worker compose uses `RVS_API_BASE_URL`; from a Docker worker talking to the same host-published API port, use `http://host.docker.internal:3200`. From a separate worker server, use `http://<api-server-host>:3200`. `RVS_WORKER_TOKEN` must match the API server's token. The standalone worker compose reads the repository root `.env` first and `apps/worker/.env` second.

The supported pilot is a bounded, deterministic four-second selected interval. It admits 24/25/30/50/60fps and 96/100/120/200/240 frames. The explicit capacity boundary is 60fps, 3840x2160 dense OCR, 240 frames. This is not a five-minute or production-scale claim.

Generated OpenAPI is produced with `pnpm contracts:openapi`; do not edit `packages/contracts/generated/openapi.json` directly.

Material generation for the generate track runs as self-hosted services beside the worker on `worker-internal`, started by profile: `--profile video` brings up Wan-Alpha, `--profile model3d` brings up Hi3DGen. The profiles are separate because the two cannot share one GPU: Wan-Alpha at GGUF Q4_K_M is about 10GB of VRAM before its text encoder, and Hi3DGen needs 6-8GB even with staged CPU offload. On a single 12GB card, run one at a time. Both need 32GB of system RAM or more, because offload goes there. Leave `RVS_WAN_ALPHA_BASE_URL` or `RVS_HI3DGEN_BASE_URL` unset and that material kind refuses by name rather than failing obscurely; image material goes through the API and needs no GPU at all.

Two things belong in the serving images rather than this repository. Hi3DGen's released weights are already fp16 and total about 2.65GB, so quantisation buys nothing: peak memory is activation-bound, and the way to fit a small card is staged per-module CPU offload (Stable3DGen issue #55 carries a working script). Hi3DGen also leaks VRAM between generations (issue #42 reports 14.2GB growing to 23.9GB over three runs); the serving image must free outputs and empty the CUDA cache after each request or a long-lived service will exhaust the card. Switching between the two models should be a process restart, not an in-process unload, because PyTorch does not reliably return reserved memory to the operating system.

Wan-Alpha's quantised path is unverified. Its RGBA output needs a DoRA and two custom VAE decoders on top of the Wan2.1-14B base, and no report exists of that combination working over a GGUF-quantised base; the fp8 base is the lower-risk route but does not fit 12GB. Quality loss at Q4 has only been assessed on RGB, never on alpha edges - hair, glow, semi-transparency - which is what the model exists for. Test the matte before relying on it.
