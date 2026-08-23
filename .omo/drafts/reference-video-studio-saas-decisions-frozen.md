# Reference Video Studio SaaS — Frozen Product Decisions

- Outcome: implement all 9 Stitch screens and all 151 inventoried controls as real, tested behavior.
- Components: C1 web-ui; C2 api-persistence; C3 ingest-boundary; C4 reference-compiler; C5 scene-render; C6 gates-receipts-audit.
- Pipeline: full CPU vision measurement over every frame of one exact four-second selected interval; no stand-in, diffusion authority, contact sheet, or sampled-frame claim.
- Runtime: Node 24, Python 3.12.14 CPU, pnpm 11.20.0, uv 0.11.8, FFmpeg 8.0.1, Chrome for Testing 151.0.7922.138 with SwiftShader/WebGL2. No silent substitution.
- Supply policy: exact direct pins only; a pinned-tool bootstrap may mechanically resolve and hash the full transitive closure before product source. No newest/range/alternative selection. Unavailable pins fail closed.
- Media: admitted MP4 policy and exact probe/normalization argv come from media-contract-v2; only the selected interval is normalized; output is exactly 120 frames, 1080x1920@30, four seconds, H.264/AAC 48kHz stereo.
- Capacity: test 24/25/30/50/60fps and 96/100/120/200/240 source frames; 60fps 4K dense OCR is the early mandatory stop case; one active worker, <=12GiB RSS, <=30m compile, <=15m render+assembly.
- Authority: upload sessions and job attempts are separate; only designated reviewers advance T1–T6; stale invalidation is transitive; T5 alone promotes staged artifacts and completes a job; T6 is release-scoped.
- Auth: browser session+CSRF and direct bearer calls derive principals server-side; BFF service scope is session:introspect only; membership, tenant status, and authorization/deletion/restore epochs are checked on every boundary.
- Persistence: one local SQLite WAL database, one authoritative queue, BEGIN IMMEDIATE claims, lease tokens and DB time, serialized receipts, append-only audit/IR/receipt history, no NFS or horizontal workers.
- Rendering: immutable AuthoringIR→SceneIR→BrowserPassSpec versions; semantic DOM/SVG plus owner-bound WebGL2; pure frame-indexed capture; no wall-clock/random/network/runtime downloads.
- Publication/recovery: file fsync→digest→same-filesystem rename→parent fsync→fenced DB commit; restore only into an isolated root and require release-scoped T6.
- Verification: tests-after plus per-task happy/failure QA; frozen black-box contracts, 151-control Playwright coverage, 9-screen visual/WCAG checks, canonical hash-linked evidence index, all-FPS final admission checks, and F1–F4 unanimous approval.
- Product boundary: metadata-only billing; no card/payment flow, password-reset backend, email/SMS, native mobile app, scale-out, or production-quality claim beyond the proven four-second pilot.
- User-requested planning constraints applied: graphify, ponytail ultra, and caveman spirit; caveman skill was unavailable, so its simplicity principle was applied manually.
