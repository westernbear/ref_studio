# HeyGen Handoff Reference Project

This example records a real worker run against `heygen_handoff.zip`.

The SaaS pilot accepts one ordinary MP4 source and compiles one exact four-second interval. The archive's `reference_style_youmotion.mp4` is therefore the admitted source. The prompt, still images, logo, and other creative assets in the archive remain creative-brief references; they are not extra compiler inputs and do not expand the approved four-second product boundary.

The selected interval is `[0, 120)` at 30 fps. The worker normalized all 120 source frames, ran the pinned vision compiler, generated evidence and SceneIR, executed the design's 11 ordered DOM/WebGL2 passes for every frame in Chrome for Testing 151.0.7922.138 with SwiftShader and external networking blocked, then assembled and probed a four-second H.264/AAC delivery.

`project.json` fixes the input contract. `result.json` records the compact verification receipt. The full local evidence bundle, logs, preview, and delivery are written to `output/` and intentionally excluded from Git because they contain generated media and per-frame evidence.
