# Clean Handoff

`pnpm handoff:build` creates `dist/reference-video-studio-handoff.zip` from an explicit allowlist of contracts, generated OpenAPI, runtime/dependency manifests, evidence summaries, recovery report, and verification scripts. It also writes a SHA-256 sidecar and manifest.

`pnpm handoff:verify` checks the ZIP inventory, per-file hashes, path traversal, secret/cache/media/database/model exclusions, canonical OpenAPI presence, PASS recovery report, and the truthful four-second/240-frame pilot boundary.

The package contains no credentials, raw media, uploaded files, runtime databases, model weights, generated caches, or private machine paths. Docker QA limitations remain documented as limitations; they are not converted into production claims.
