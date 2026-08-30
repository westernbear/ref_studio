import assert from "node:assert/strict";
import { fixtureSpec } from "../dist/packages/contracts/src/scene-spec.fixture.js";
import { verifyMotionScene } from "../dist/apps/api/src/motion-predicates.js";
import { verifyAndRepair } from "../dist/apps/api/src/verified-scene-authoring.js";

const context = {
  capabilitySnapshot: {
    schema: "backend-capability-snapshot-v1",
    backend: "native",
    capturedAt: "2026-08-30T00:00:00.000Z",
    capabilities: ["text", "image", "shape"],
  },
  resolvableAssetIds: new Set(fixtureSpec.assets.map(({ assetId }) => assetId)),
};
const report = verifyMotionScene(fixtureSpec, {
  requestedPredicateIds: ["beat-tiling", "frame-hash-deterministic"],
  context: {
    ...context,
    frameHashes: [["a".repeat(64)], ["a".repeat(64)]],
  },
});
assert.deepEqual(
  report.findings.map(({ predicateId }) => predicateId),
  [
    "scene-spec",
    "asset-resolvable",
    "no-external-url",
    "beat-tiling",
    "frame-hash-deterministic",
  ],
);
assert.equal(report.status, "PASS");
assert.throws(
  () =>
    verifyMotionScene(fixtureSpec, {
      requestedPredicateIds: ["shell.exec"],
      context,
    }),
  /UNKNOWN_MOTION_PREDICATE/u,
);

let calls = 0;
const preserved = await verifyAndRepair({
  initialScene: fixtureSpec,
  initialArtifact: "safe.mp4",
  verify: (scene, attempts) => {
    calls += 1;
    return verifyMotionScene(scene, {
      requestedPredicateIds: ["frame-hash-deterministic"],
      context,
      attempts,
    });
  },
  repair: async (scene) => ({
    scene: { ...scene, mode: scene.mode === "SWAP" ? "REINTERPRET" : "SWAP" },
    artifact: "candidate.mp4",
  }),
});
assert.equal(calls, 4);
assert.equal(preserved.scene, fixtureSpec);
assert.equal(preserved.artifact, "safe.mp4");
assert.equal(preserved.report.attempts, 4);
assert.equal(
  preserved.report.findings.find(({ pass }) => !pass).predicateId,
  "frame-hash-deterministic",
);

process.stdout.write(
  JSON.stringify({
    predicates: report.findings.map(({ predicateId }) => predicateId),
    attempts: preserved.report.attempts,
    preservedArtifact: preserved.artifact,
  }) + "\n",
);
