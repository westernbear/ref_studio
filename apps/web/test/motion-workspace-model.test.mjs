import { fixtureSpec, sha256Hex } from "@rvs/contracts";
import { describe, expect, it } from "vitest";
import {
  clampSplitRatio,
  elementFrameState,
  moveElementOperations,
} from "../src/app/[locale]/scene-review/motion-workspace-model.ts";

const snapshot = {
  schema: "motion-scene-snapshot-v1",
  version: 1,
  sceneEtag: `"${sha256Hex(fixtureSpec)}"`,
  sceneDigest: sha256Hex(fixtureSpec),
  scene: fixtureSpec,
  history: [
    {
      version: 1,
      sceneDigest: sha256Hex(fixtureSpec),
      createdAt: "2026-08-29T00:00:00.000Z",
    },
  ],
  backendCapability: {
    schema: "backend-capability-snapshot-v1",
    backend: "native",
    capturedAt: "2026-08-29T00:00:00.000Z",
    capabilities: ["text", "shape", "x", "y", "uniform-scale", "opacity"],
  },
  verification: {
    schema: "verification-report-v1",
    sceneDigest: sha256Hex(fixtureSpec),
    attempts: 1,
    status: "PASS",
    findings: [],
  },
};

describe("motion workspace model", () => {
  it("clamps the splitter and preserves two percent keyboard steps", () => {
    expect(clampSplitRatio(12)).toBe(30);
    expect(clampSplitRatio(52)).toBe(52);
    expect(clampSplitRatio(91)).toBe(70);
  });

  it("builds the same versioned scene operations for direct canvas movement", () => {
    const element = fixtureSpec.beats[0]?.elements[0];
    expect(element).toBeDefined();
    expect(moveElementOperations(snapshot, 0, 0, 12, -6)).toEqual([
      {
        kind: "set",
        opId: "move-x-v1-b0-e0",
        path: "/beats/0/elements/0/box/x",
        value: element.box.x + 12,
        reason: "canvas direct manipulation",
      },
      {
        kind: "set",
        opId: "move-y-v1-b0-e0",
        path: "/beats/0/elements/0/box/y",
        value: element.box.y - 6,
        reason: "canvas direct manipulation",
      },
    ]);
  });

  it("evaluates the visible keyframe state at the selected frame", () => {
    const element = fixtureSpec.beats[0]?.elements[0];
    expect(element).toBeDefined();
    const frame = element.keyframes[0]?.frame ?? 0;
    expect(elementFrameState(element, frame)).toMatchObject({
      opacity: element.keyframes[0]?.opacity ?? 1,
      scale: element.keyframes[0]?.scale ?? 1,
      x: element.keyframes[0]?.x ?? 0,
      y: element.keyframes[0]?.y ?? 0,
    });
  });
});
