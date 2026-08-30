import { describe, expect, it } from "vitest";
import { MotionPlanV1Schema, SceneOperationBatchV1Schema } from "./motion.js";

const canvas = { width: 1920, height: 1080, fps: 30, frameCount: 450 };
const validPlan = {
  schema: "motion-plan-v1",
  intent: "Introduce the title with anticipation and a short settle.",
  knowledgeCardIds: ["timing-anticipation"],
  requiredCapabilities: ["position", "scale"],
  canvas,
  keyframeIntents: [
    {
      elementId: "title",
      anticipationFrames: 3,
      overshootPercent: 8,
      settleFrame: 18,
      staggerFrames: 2,
    },
  ],
  predicateIds: ["scene-spec", "native-element-kinds"],
  reproducibility: {
    evidenceDigest: "a".repeat(64),
    capabilitySnapshotDigest: "b".repeat(64),
    promptVersion: "motion-plan-prompt-v1",
    modelVersion: "fake-model-v1",
  },
} as const;

describe("MotionPlanV1", () => {
  it("Given a complete semantic plan, when parsed, then it is accepted", () => {
    expect(MotionPlanV1Schema.safeParse(validPlan).success).toBe(true);
  });

  it.each([
    ["unknown predicate", { predicateIds: ["shell.exec"] }],
    ["unknown field", { extra: true }],
    [
      "NaN",
      {
        keyframeIntents: [
          { ...validPlan.keyframeIntents[0], overshootPercent: Number.NaN },
        ],
      },
    ],
    [
      "Infinity",
      {
        keyframeIntents: [
          {
            ...validPlan.keyframeIntents[0],
            settleFrame: Number.POSITIVE_INFINITY,
          },
        ],
      },
    ],
    [
      "too many cards",
      {
        knowledgeCardIds: Array.from(
          { length: 16 },
          (_, index) => `card-${index}`,
        ),
      },
    ],
    [
      "too many predicates",
      { predicateIds: Array.from({ length: 65 }, () => "scene-spec") },
    ],
  ])("Given %s, when parsed, then the plan fails closed", (_name, patch) => {
    expect(
      MotionPlanV1Schema.safeParse({ ...validPlan, ...patch }).success,
    ).toBe(false);
  });
});

describe("SceneOperationBatchV1", () => {
  it("rejects unknown fields and duplicate operation ids", () => {
    const base = "a".repeat(64);
    expect(
      SceneOperationBatchV1Schema.safeParse({
        schema: "scene-operation-batch-v1",
        baseSceneDigest: base,
        operations: [
          { kind: "unset", opId: "same", path: "/beats/0", reason: "one" },
          { kind: "unset", opId: "same", path: "/beats/1", reason: "two" },
        ],
      }).success,
    ).toBe(false);
    expect(
      SceneOperationBatchV1Schema.safeParse({
        schema: "scene-operation-batch-v1",
        baseSceneDigest: base,
        operations: [
          { kind: "unset", opId: "one", path: "/beats/0", reason: "one" },
        ],
        extra: true,
      }).success,
    ).toBe(false);
  });
});
