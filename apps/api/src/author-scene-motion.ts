import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import type {
  BackendCapabilitySnapshotV1,
  MotionPlanV1,
  VerificationReportV1,
} from "../../../packages/contracts/src/motion.js";
import type { SceneSpec } from "../../../packages/contracts/src/scene-spec.js";
import { compileMotionPlan } from "./motion-plan-compiler.js";
import { applySceneOperations } from "./motion-operations.js";
import { verifyMotionScene } from "./motion-predicates.js";

const NATIVE_AUTHORING_CAPABILITIES = [
  "keyframes",
  "easing",
  "position",
  "scale",
  "opacity",
  "text",
  "image",
  "shape",
  "dropShadow",
] as const;

export const nativeAuthoringCapabilities = (
  capturedAt: string,
): BackendCapabilitySnapshotV1 => ({
  schema: "backend-capability-snapshot-v1",
  backend: "native",
  capturedAt,
  capabilities: [...NATIVE_AUTHORING_CAPABILITIES],
});

export function applyMotionPlan(
  plan: MotionPlanV1,
  draft: SceneSpec,
  capabilitySnapshot: BackendCapabilitySnapshotV1,
): SceneSpec {
  const compiled = compileMotionPlan({
    plan,
    scene: draft,
    baseSceneDigest: sha256Hex(draft),
    capabilitySnapshot,
  });
  let applied = draft;
  for (const batch of compiled.batches) {
    if (batch.baseSceneDigest !== sha256Hex(applied))
      throw new Error("MOTION_PLAN_STALE_SCENE");
    applied = applySceneOperations(applied, batch);
  }
  if (sha256Hex(applied) !== compiled.resultingSceneDigest)
    throw new Error("MOTION_PLAN_RESULT_DIGEST_MISMATCH");
  return applied;
}

export function authoringVerificationReport(
  scene: SceneSpec,
  plan: MotionPlanV1,
  attempts: number,
  capabilitySnapshot: BackendCapabilitySnapshotV1,
  resolvableAssetIds: ReadonlySet<string>,
): VerificationReportV1 {
  return verifyMotionScene(scene, {
    requestedPredicateIds: plan.predicateIds,
    context: { capabilitySnapshot, resolvableAssetIds },
    attempts,
  });
}
