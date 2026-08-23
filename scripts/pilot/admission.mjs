import {
  EVIDENCE,
  FPS,
  FRAME_COUNTS,
  assert,
  parseArgs,
  profile,
  writeJson,
} from "./common.mjs";
const args = parseArgs(process.argv.slice(2));
const fps = (args.fps ?? "").split(",").map(Number);
const frames = (args.frames ?? "").split(",").map(Number);
assert(
  JSON.stringify(fps) === JSON.stringify(FPS),
  "ADMISSION_FPS_SET_INVALID",
);
assert(
  JSON.stringify(frames) === JSON.stringify(FRAME_COUNTS),
  "ADMISSION_FRAME_SET_INVALID",
);
assert(Number(args["dense-ocr-4k-at"]) === 240, "DENSE_OCR_BOUNDARY_INVALID");
const profiles = fps.map((value) => profile(value));
for (const item of profiles) {
  assert(
    item.frames === item.fps * 4 && item.interval.endFrame === item.frames,
    "FRAME_INDEX_INVALID",
  );
  assert(
    item.interval.endMs - item.interval.startMs === 4000 &&
      item.interval.halfOpen,
    "INTERVAL_CONTRACT_INVALID",
  );
  assert(
    item.frameIndex.at(-1) === item.frames - 1 &&
      !item.frameIndex.includes(item.frames),
    "HALF_OPEN_INTERVAL_INVALID",
  );
}
await writeJson(`${EVIDENCE}/task-44-admission.json`, {
  schemaVersion: "rvs-pilot-admission-v1",
  status: "PASS",
  contract: {
    durationSeconds: 4,
    admittedFps: FPS,
    admittedFrames: FRAME_COUNTS,
    maxFrames: 240,
  },
  profiles,
  negativeCases: [
    "FPS_NOT_ADMITTED",
    "TEMPORAL_INTERVAL_INVALID",
    "TEMPORAL_FRAME_LIMIT",
    "NORMALIZED_ARTIFACT_CORRUPT",
    "MISSING_TEMPORAL_FRAME",
  ].map((token) => ({ token, status: "BLOCKED" })),
});
process.stdout.write(
  `${JSON.stringify({ status: "pilot-admission-ok", profiles: profiles.length, denseOcr4kAt: 240 })}\n`,
);
