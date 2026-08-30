import { describe, expect, it } from "vitest";
import { fixtureSpec } from "@rvs/contracts";
import {
  applySceneOperations,
  keyframesFromMotionIntent,
  verifyAndRepair,
  verifyMotionScene,
} from "./motion-scene.js";

describe("motion scene authoring", () => {
  it("applies a validated set operation without mutating the previous scene", () => {
    const previous = fixtureSpec;
    const next = applySceneOperations(previous, {
      schema: "scene-operation-batch-v1",
      baseSceneDigest: "a".repeat(64),
      operations: [
        {
          kind: "set",
          opId: "set-opacity",
          path: "/beats/0/elements/0/keyframes/0/opacity",
          value: 0.5,
          reason: "fade in",
        },
      ],
    });
    expect(next.beats[0]?.elements[0]?.keyframes[0]?.opacity).toBe(0.5);
    expect(previous.beats[0]?.elements[0]?.keyframes[0]?.opacity).not.toBe(0.5);
  });

  it("creates exact anticipation overshoot settle and stagger keyframes", () => {
    const first = keyframesFromMotionIntent({
      anticipationFrames: 12,
      overshootPercent: 8,
      settleFrame: 36,
      staggerFrames: 6,
      elementIndex: 0,
    });
    const second = keyframesFromMotionIntent({
      anticipationFrames: 12,
      overshootPercent: 8,
      settleFrame: 36,
      staggerFrames: 6,
      elementIndex: 1,
    });
    expect(first.map(({ frame, scale }) => ({ frame, scale }))).toEqual([
      { frame: 0, scale: 1 },
      { frame: 12, scale: 1.08 },
      { frame: 36, scale: 1 },
    ]);
    expect(second[0]?.frame).toBe(6);
  });

  it("rejects immutable and escaped pointer paths before applying a mixed batch", () => {
    for (const path of [
      "/schema",
      "/canvas/width",
      "/assets/0/provenance",
      "/beats/00/elements/0/content",
      "/beats/0/elements/0/~1schema",
      "/beats/0/elements/0/elementId",
    ])
      expect(() =>
        applySceneOperations(fixtureSpec, {
          schema: "scene-operation-batch-v1",
          baseSceneDigest: "a".repeat(64),
          operations: [
            {
              kind: "set",
              opId: "allowed-first",
              path: "/palette/hero",
              value: "#6633ee",
              reason: "must remain atomic",
            },
            {
              kind: "set",
              opId: `denied-${path}`,
              path,
              value: "mutated",
              reason: "boundary probe",
            },
          ],
        }),
      ).toThrow("INVALID_OPERATION");
    expect(fixtureSpec.palette.hero).not.toBe("#6633ee");
  });

  it("stops after four failed verification attempts and preserves the safe scene", async () => {
    let verificationCalls = 0;
    const result = await verifyAndRepair(
      fixtureSpec,
      async () => {
        verificationCalls += 1;
        return ["never passes"];
      },
      async (scene) => ({
        ...scene,
        mode: scene.mode === "SWAP" ? "REINTERPRET" : "SWAP",
      }),
    );
    expect(verificationCalls).toBe(4);
    expect(result.scene).toBe(fixtureSpec);
    expect(result.report.status).toBe("FAIL");
  });

  it("evaluates Native capability predicates instead of minting a pass", () => {
    const valid = verifyMotionScene(fixtureSpec);
    expect(valid.status).toBe("PASS");
    expect(valid.findings.length).toBeGreaterThan(0);
    expect(valid.findings.every((finding) => finding.pass)).toBe(true);

    const firstBeat = fixtureSpec.beats[0]!;
    const firstElement = firstBeat.elements[0]!;
    const videoScene = {
      ...fixtureSpec,
      beats: [
        {
          ...firstBeat,
          elements: [{ ...firstElement, kind: "video" as const }],
        },
        ...fixtureSpec.beats.slice(1),
      ],
    };
    const unsupported = verifyMotionScene(videoScene);
    expect(unsupported.status).toBe("FAIL");
    expect(
      unsupported.findings.find(
        (finding) => finding.predicateId === "element-kind-capability",
      ),
    ).toMatchObject({
      predicateId: "element-kind-capability",
      pass: false,
      observed: "video",
    });
  });
});
