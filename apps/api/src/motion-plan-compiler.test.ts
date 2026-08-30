import { describe, expect, it } from "vitest";
import type {
  BackendCapabilitySnapshotV1,
  MotionPlanV1,
} from "../../../packages/contracts/src/motion.js";
import {
  SceneSpecSchema,
  type SceneSpec,
} from "../../../packages/contracts/src/scene-spec.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import {
  compileMotionPlan,
  MotionPlanCompilerError,
} from "./motion-plan-compiler.js";
import { applySceneOperations } from "./motion-operations.js";

const digest = "a".repeat(64);
const scene: SceneSpec = {
  schema: "scene-spec-v1",
  mode: "REINTERPRET",
  canvas: { width: 1920, height: 1080, fps: 30, frameCount: 90 },
  palette: {
    hero: "#ffffff",
    cool: "#111111",
    warm: "#222222",
    background: "#000000",
  },
  assets: [],
  beats: [
    {
      beatId: "beat",
      startFrame: 0,
      endFrame: 90,
      shot: "type-flash",
      elements: ["first", "second"].map((elementId) => ({
        elementId,
        kind: "shape" as const,
        box: { x: 0, y: 0, width: 100, height: 100 },
        keyframes: [],
        effects: [],
      })),
    },
  ],
};

const plan: MotionPlanV1 = {
  schema: "motion-plan-v1",
  intent: "timed entrance",
  knowledgeCardIds: ["timing-easing"],
  requiredCapabilities: ["keyframes.scale"],
  canvas: scene.canvas,
  keyframeIntents: ["first", "second"].map((elementId) => ({
    elementId,
    anticipationFrames: 12,
    overshootPercent: 8,
    settleFrame: 36,
    staggerFrames: 6,
  })),
  predicateIds: ["scene-spec"],
  reproducibility: {
    knowledgeCardDigest: digest,
    promptDigest: digest,
    modelDigest: digest,
    evidenceDigest: digest,
    capabilitySnapshotDigest: digest,
    planDigest: digest,
    knowledgeCardIds: ["timing-easing"],
    requiredCapabilities: ["keyframes.scale"],
    promptVersion: "v1",
    modelVersion: "v1",
  },
};

const capabilities: BackendCapabilitySnapshotV1 = {
  schema: "backend-capability-snapshot-v1",
  backend: "native",
  capturedAt: "2026-08-30T00:00:00.000Z",
  capabilities: ["keyframes.scale"],
};

const compile = (
  planValue: MotionPlanV1 = plan,
  sceneValue: SceneSpec = scene,
  capabilityValue: BackendCapabilitySnapshotV1 = capabilities,
) =>
  compileMotionPlan({
    plan: planValue,
    scene: sceneValue,
    baseSceneDigest: sha256Hex(sceneValue),
    capabilitySnapshot: capabilityValue,
  });

describe("compileMotionPlan", () => {
  it("compiles exact staggered keyframes when plan targets stable elements", () => {
    // Given the required two-element timing fixture
    // When the semantic plan is compiled
    const result = compile();

    // Then exact keyframe operations and deterministic digests are returned
    expect(result.batches).toHaveLength(1);
    expect(
      result.batches[0]?.operations.map((operation) => operation.value),
    ).toEqual([
      [
        { frame: 0, scale: 1, ease: "easeIn" },
        { frame: 12, scale: 1.08, ease: "easeOut" },
        { frame: 36, scale: 1, ease: "easeInOut" },
      ],
      [
        { frame: 6, scale: 1, ease: "easeIn" },
        { frame: 18, scale: 1.08, ease: "easeOut" },
        { frame: 42, scale: 1, ease: "easeInOut" },
      ],
    ]);
    expect(
      result.batches[0]?.operations.map((operation) => operation.path),
    ).toEqual([
      "/beats/0/elements/0/keyframes",
      "/beats/0/elements/1/keyframes",
    ]);
    expect(result.resultingSceneDigest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("compiles uniform scale intent into both v2 axes", () => {
    const v2 = SceneSpecSchema.parse({
      ...scene,
      schema: "scene-spec-v2",
      beats: scene.beats.map((beat) => ({
        ...beat,
        elements: beat.elements.map((element) => ({
          ...element,
          anchor: { x: 0, y: 0 },
        })),
      })),
    });
    const result = compile(plan, v2);
    const batch = result.batches[0];
    expect(batch?.operations[0]?.value).toEqual([
      { frame: 0, scaleX: 1, scaleY: 1, ease: "easeIn" },
      { frame: 12, scaleX: 1.08, scaleY: 1.08, ease: "easeOut" },
      { frame: 36, scaleX: 1, scaleY: 1, ease: "easeInOut" },
    ]);
    expect(batch).toBeDefined();
    if (batch === undefined) return;
    expect(() => applySceneOperations(v2, batch)).not.toThrow();
  });

  it.each([
    [
      "unknown element",
      {
        ...plan,
        keyframeIntents: [{ ...plan.keyframeIntents[0], elementId: "missing" }],
      },
      scene,
      capabilities,
      "MOTION_PLAN_UNKNOWN_ELEMENT",
    ],
    [
      "unsupported capability",
      {
        ...plan,
        requiredCapabilities: ["camera.3d"],
        reproducibility: {
          ...plan.reproducibility,
          requiredCapabilities: ["camera.3d"],
        },
      },
      scene,
      capabilities,
      "MOTION_PLAN_UNAVAILABLE_CAPABILITY",
    ],
    [
      "out-of-beat frame",
      plan,
      {
        ...scene,
        beats: [{ ...scene.beats[0], endFrame: 40 }],
      },
      capabilities,
      "MOTION_PLAN_KEYFRAME_OUT_OF_BOUNDS",
    ],
    [
      "duplicate scene element",
      plan,
      {
        ...scene,
        beats: [
          {
            ...scene.beats[0],
            elements: [
              scene.beats[0]?.elements[0],
              scene.beats[0]?.elements[0],
            ],
          },
        ],
      },
      capabilities,
      "MOTION_PLAN_DUPLICATE_ELEMENT",
    ],
    [
      "duplicate plan target",
      {
        ...plan,
        keyframeIntents: [plan.keyframeIntents[0], plan.keyframeIntents[0]],
      },
      scene,
      capabilities,
      "MOTION_PLAN_DUPLICATE_TARGET",
    ],
  ] as const)(
    "rejects %s before producing a batch",
    (_name, planValue, sceneValue, capabilityValue, code) => {
      // Given an invalid compilation boundary
      // When compilation is attempted
      const action = () =>
        compile(planValue, SceneSpecSchema.parse(sceneValue), capabilityValue);

      // Then the typed rejection identifies the boundary violation
      expect(action).toThrowError(new MotionPlanCompilerError(code));
    },
  );

  it("rejects malformed and non-finite plan values at the schema boundary", () => {
    // Given unknown and non-finite provider fields
    const malformed = Object.assign({}, plan, { extra: true });
    const nonFinite = {
      ...plan,
      keyframeIntents: [
        {
          ...plan.keyframeIntents[0],
          overshootPercent: Number.POSITIVE_INFINITY,
        },
      ],
    };

    // When and Then compilation parses the boundary before making operations
    expect(() => compile(malformed)).toThrow();
    expect(() => compile(nonFinite)).toThrow();
  });

  it("rejects a stale base digest instead of rebasing", () => {
    // Given a digest from a different scene version
    // When the current scene is compiled against it
    const action = () =>
      compileMotionPlan({
        plan,
        scene,
        baseSceneDigest: "b".repeat(64),
        capabilitySnapshot: capabilities,
      });

    // Then compilation fails closed without a replay batch
    expect(action).toThrowError(
      new MotionPlanCompilerError("MOTION_PLAN_STALE_SCENE"),
    );
  });

  it("splits only at 16 operations and chains the next base digest", () => {
    // Given 17 distinct stable elements and intents
    const elements = Array.from({ length: 17 }, (_, index) => ({
      ...scene.beats[0]?.elements[0],
      elementId: `element-${index}`,
    }));
    const largeScene = SceneSpecSchema.parse({
      ...scene,
      beats: [{ ...scene.beats[0], elements }],
    });
    const largePlan: MotionPlanV1 = {
      ...plan,
      keyframeIntents: elements.map((element) => ({
        elementId: element.elementId,
        anticipationFrames: 1,
        overshootPercent: 8,
        settleFrame: 2,
        staggerFrames: 1,
      })),
    };

    // When the compiler reaches the operation limit
    const result = compile(largePlan, largeScene);

    // Then it creates bounded batches chained to the prior resulting digest
    expect(result.batches.map((batch) => batch.operations.length)).toEqual([
      16, 1,
    ]);
    const firstScene = applySceneOperations(largeScene, result.batches[0]);
    expect(result.batches[1]?.baseSceneDigest).toBe(sha256Hex(firstScene));
    expect(result.resultingSceneDigest).toBe(
      sha256Hex(applySceneOperations(firstScene, result.batches[1])),
    );
  });
});
