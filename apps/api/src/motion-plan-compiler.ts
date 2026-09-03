import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import {
  BackendCapabilitySnapshotV1Schema,
  MotionPlanV1Schema,
  SceneOperationBatchV1Schema,
  type BackendCapabilitySnapshotV1,
  type MotionPlanV1,
  type SceneOperationBatchV1,
} from "../../../packages/contracts/src/motion.js";
import {
  SceneSpecSchema,
  type SceneSpec,
} from "../../../packages/contracts/src/scene-spec.js";
import {
  applySceneOperations,
  keyframesFromMotionIntent,
} from "./motion-operations.js";
import { sameCanvas } from "./motion-plan.js";

export class MotionPlanCompilerError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MotionPlanCompilerError";
  }
}

export type CompileMotionPlanInput = {
  readonly plan: MotionPlanV1;
  readonly scene: SceneSpec;
  readonly baseSceneDigest: string;
  readonly capabilitySnapshot: BackendCapabilitySnapshotV1;
};

export type CompiledMotionPlan = {
  readonly batches: readonly SceneOperationBatchV1[];
  readonly resultingSceneDigest: string;
};

type ElementLocation = {
  readonly beatIndex: number;
  readonly elementIndex: number;
};

const elementLocations = (
  scene: SceneSpec,
): ReadonlyMap<string, ElementLocation> => {
  const locations = new Map<string, ElementLocation>();
  for (const [beatIndex, beat] of scene.beats.entries())
    for (const [elementIndex, element] of beat.elements.entries()) {
      if (locations.has(element.elementId))
        throw new MotionPlanCompilerError("MOTION_PLAN_DUPLICATE_ELEMENT");
      locations.set(element.elementId, { beatIndex, elementIndex });
    }
  return locations;
};

const operationReason = (plan: MotionPlanV1): string =>
  `cards:${plan.knowledgeCardIds.join(",") || "none"};predicates:${plan.predicateIds.join(",") || "none"}`;

export function compileMotionPlan(
  input: CompileMotionPlanInput,
): CompiledMotionPlan {
  const plan = MotionPlanV1Schema.parse(input.plan);
  const scene = SceneSpecSchema.parse(input.scene);
  const capabilitySnapshot = BackendCapabilitySnapshotV1Schema.parse(
    input.capabilitySnapshot,
  );
  if (input.baseSceneDigest !== sha256Hex(scene))
    throw new MotionPlanCompilerError("MOTION_PLAN_STALE_SCENE");
  if (!sameCanvas(plan.canvas, scene.canvas))
    throw new MotionPlanCompilerError("MOTION_PLAN_CANVAS_MISMATCH");

  const capabilities = new Set(capabilitySnapshot.capabilities);
  if (
    plan.requiredCapabilities.some(
      (capability) => !capabilities.has(capability),
    )
  )
    throw new MotionPlanCompilerError("MOTION_PLAN_UNAVAILABLE_CAPABILITY");

  const locations = elementLocations(scene);
  const reason = operationReason(plan);
  const targetIds = plan.keyframeIntents.map((intent) => intent.elementId);
  if (new Set(targetIds).size !== targetIds.length)
    throw new MotionPlanCompilerError("MOTION_PLAN_DUPLICATE_TARGET");
  const operations = plan.keyframeIntents.map((intent, intentIndex) => {
    const location = locations.get(intent.elementId);
    if (location === undefined)
      throw new MotionPlanCompilerError("MOTION_PLAN_UNKNOWN_ELEMENT");
    const offset = intent.targetBeat?.startFrame ?? 0;
    const uniformKeyframes = keyframesFromMotionIntent({
      anticipationFrames: intent.anticipationFrames,
      overshootPercent: intent.overshootPercent,
      settleFrame: intent.settleFrame,
      staggerFrames: intent.staggerFrames,
      elementIndex: intentIndex,
    }).map((keyframe) => ({ ...keyframe, frame: keyframe.frame + offset }));
    const beat = scene.beats[location.beatIndex];
    if (
      beat === undefined ||
      uniformKeyframes.some(
        (keyframe) =>
          !Number.isFinite(keyframe.frame) ||
          !Number.isFinite(keyframe.scale) ||
          keyframe.frame < beat.startFrame ||
          keyframe.frame >= beat.endFrame ||
          keyframe.frame >= scene.canvas.frameCount,
      )
    )
      throw new MotionPlanCompilerError("MOTION_PLAN_KEYFRAME_OUT_OF_BOUNDS");
    const keyframes =
      scene.schema === "scene-spec-v1"
        ? uniformKeyframes
        : uniformKeyframes.map(({ scale, ...keyframe }) => ({
            ...keyframe,
            scaleX: scale,
            scaleY: scale,
          }));
    const path = `/beats/${location.beatIndex}/elements/${location.elementIndex}/keyframes`;
    return {
      kind: "set" as const,
      opId: `motion-${intentIndex}-${sha256Hex({ elementId: intent.elementId, keyframes, path, reason }).slice(0, 24)}`,
      path,
      value: keyframes,
      reason,
    };
  });
  if (operations.length === 0)
    throw new MotionPlanCompilerError("MOTION_PLAN_EMPTY_OPERATIONS");

  const batches: SceneOperationBatchV1[] = [];
  let candidate = scene;
  let baseSceneDigest = input.baseSceneDigest;
  for (let index = 0; index < operations.length; index += 16) {
    const batch = SceneOperationBatchV1Schema.parse({
      schema: "scene-operation-batch-v1",
      baseSceneDigest,
      operations: operations.slice(index, index + 16),
    });
    batches.push(batch);
    candidate = applySceneOperations(candidate, batch);
    baseSceneDigest = sha256Hex(candidate);
  }
  return { batches, resultingSceneDigest: baseSceneDigest };
}
