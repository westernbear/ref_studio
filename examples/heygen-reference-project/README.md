# HeyGen Handoff Reference Project

This example records a real worker run against `heygen_handoff.zip`.

The immutable SaaS pilot contract takes precedence over the archive's creative brief: it accepts one ordinary MP4 source and compiles one exact four-second interval. The archive requests a broader 26–28 second composition, but only `reference_style_youmotion.mp4` is admitted as source material. The prompt, still images, logo, and other creative assets remain references; they are not extra compiler inputs and do not expand the pilot boundary.

The selected interval is `[0, 120)` at 30 fps. The worker normalized all 120 source frames, ran the pinned vision compiler, generated evidence and SceneIR, executed the design's 11 ordered DOM/WebGL2 passes for every frame in Chrome for Testing 151.0.7922.138 with SwiftShader and external networking blocked, then assembled and probed a four-second H.264/AAC delivery.

`project.json` fixes pilot `pilot_heygen_reference_4s_v1` under release scope `release_heygen_reference_v1`. `result.json` records completed technical worker output only. Its immutable evidence has `sceneInput.gate=PENDING` and unresolved choice `choice_foreground_subject_ownership`, so it establishes no T1–T5 approval; T6 was not run. SaaS approval requires separate, predecessor-bound immutable receipts and is never inferred from worker output. The full local evidence bundle, logs, preview, and delivery are written to `output/` and intentionally excluded from Git because they contain generated media and per-frame evidence.

Run `node verification/blackbox/verify-heygen-pilot-scope.mjs` to verify the precedence, interval, identifiers, and gate statuses against the local archive brief.

After building the worker image, set each provenance value from the exact commits, image, archive, and source being exercised. Then run the real pipeline without starting a local worker daemon:

```sh
docker run --rm --network none --shm-size=2g \
  -e RVS_WORKER_DIST=/app/dist \
  -e RVS_ROOT_SHA="${RVS_ROOT_SHA:?set exact root commit}" \
  -e RVS_WORKER_SHA="${RVS_WORKER_SHA:?set exact worker commit}" \
  -e RVS_WORKER_IMAGE_ID="${RVS_WORKER_IMAGE_ID:?set exact Docker image ID}" \
  -e RVS_WORKER_IMAGE_DIGEST="${RVS_WORKER_IMAGE_DIGEST:?set exact Docker image digest}" \
  -e RVS_INPUT_ZIP_SHA256="${RVS_INPUT_ZIP_SHA256:?set exact input archive SHA-256}" \
  -e RVS_SOURCE_SHA256="${RVS_SOURCE_SHA256:?set exact source MP4 SHA-256}" \
  -v "$PWD/examples/heygen-reference-project/output:/output" \
  -v "$PWD/verification/blackbox/run-worker-pipeline.mjs:/runner.mjs:ro" \
  reference-video-studio-worker:1.0.0 \
  node /runner.mjs /output/reference_style_youmotion.mp4 /output
```

The runner emits `TECHNICAL_PIPELINE_COMPLETED` with `gateAuthoritative:false` only after technical preview and render completion. If analysis returns any unresolved `needsChoice`, it preserves `evidence.json`, exits with `UNRESOLVED_CHOICE_SKIPPED`, and does not preview or render. Neither outcome records or implies a T1–T6 decision.

The user-provided source archive also remains outside Git. Reproduction requires a local `heygen_handoff.zip` whose selected member matches the SHA-256 in `project.json`; the worker rejects any other bytes before processing.
