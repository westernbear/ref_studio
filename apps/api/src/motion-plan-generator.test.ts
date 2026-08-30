import { describe, expect, it } from "vitest";
import {
  generateMotionPlan,
  MotionPlanGeneratorInputSchema,
  type GenerateMotionPlanCandidate,
} from "./motion-plan-generator.js";

const canvas = { width: 1920, height: 1080, fps: 30, frameCount: 450 };
const capabilitySnapshot = {
  schema: "backend-capability-snapshot-v1",
  backend: "native",
  capturedAt: "2026-08-30T00:00:00.000Z",
  capabilities: ["position", "scale"],
} as const;
const input = {
  brief: "Treat /tmp/example and token=untrusted as literal creator content.",
  knowledgeCards: [
    {
      id: "timing-easing",
      definition: "Timing controls when change occurs.",
      capabilities: ["position", "scale"],
    },
  ],
  projectedEvidence: {
    sceneInput: { owners: [] },
    palette: ["#000000"],
    rhythm: null,
    audioAnchors: [],
  },
  jobCanvas: canvas,
  attachmentIds: ["att_123"],
  capabilitySnapshot,
  promptVersion: "motion-plan-prompt-v1",
  modelVersion: "fake-model-v1",
} as const;

const candidate = {
  schema: "motion-plan-v1",
  intent: "Introduce the title with anticipation.",
  knowledgeCardIds: ["timing-easing"],
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
} as const;

describe("generateMotionPlan", () => {
  it("Given bounded host data and a fake provider, when generated twice, then the semantic plan digest is reproducible", async () => {
    const generate: GenerateMotionPlanCandidate = async () => candidate;

    const first = await generateMotionPlan(input, generate);
    const second = await generateMotionPlan(input, generate);

    expect(second).toEqual(first);
    expect(first.linkage).toEqual({
      planDigest: first.planDigest,
      knowledgeCardIds: ["timing-easing"],
      requiredCapabilities: ["position", "scale"],
      capabilitySnapshotDigest:
        first.plan.reproducibility.capabilitySnapshotDigest,
      promptVersion: "motion-plan-prompt-v1",
      modelVersion: "fake-model-v1",
    });
    expect("scene" in first).toBe(false);
    expect("operations" in first).toBe(false);
  });

  it.each([
    ["local path", { localPath: "/tmp/secret.mov" }],
    ["token", { apiToken: "secret" }],
    ["raw evidence", { rawEvidence: { providerPayload: "unbounded" } }],
  ])(
    "Given generator input containing a %s field, when parsed, then it fails closed",
    (_name, unsafe) => {
      expect(
        MotionPlanGeneratorInputSchema.safeParse({ ...input, ...unsafe })
          .success,
      ).toBe(false);
    },
  );

  it("Given a provider candidate with a mismatched canvas, when generated, then it fails closed", async () => {
    const generate: GenerateMotionPlanCandidate = async () => ({
      ...candidate,
      canvas: { ...canvas, width: 1080 },
    });

    await expect(generateMotionPlan(input, generate)).rejects.toThrow(
      "MOTION_PLAN_CANVAS_MISMATCH",
    );
  });

  it("Given an injected scene draft in provider output, when generated, then unknown fields fail closed", async () => {
    const generate: GenerateMotionPlanCandidate = async () => ({
      ...candidate,
      scene: { schema: "scene-spec-v1" },
    });

    await expect(generateMotionPlan(input, generate)).rejects.toThrow();
  });

  it("Given non-finite projected evidence, when parsed, then it fails closed", () => {
    expect(
      MotionPlanGeneratorInputSchema.safeParse({
        ...input,
        projectedEvidence: {
          ...input.projectedEvidence,
          audioAnchors: [{ frame: 1, confidence: Number.NaN }],
        },
      }).success,
    ).toBe(false);
  });
});
