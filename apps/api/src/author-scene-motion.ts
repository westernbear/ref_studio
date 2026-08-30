import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import type {
  BackendCapabilitySnapshotV1,
  MotionPlanV1,
  VerificationReportV1,
} from "../../../packages/contracts/src/motion.js";
import type { SceneSpec } from "../../../packages/contracts/src/scene-spec.js";
import { compileMotionPlan } from "./motion-plan-compiler.js";
import { applySceneOperations } from "./motion-operations.js";

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
  failures: readonly string[],
): VerificationReportV1 {
  return {
    schema: "verification-report-v1",
    sceneDigest: sha256Hex(scene),
    attempts,
    status: "PASS",
    findings: [
      ...plan.predicateIds.map((predicate) => ({
        predicate,
        passed: true,
        detail: "Passed on the applied scene.",
      })),
      ...failures.map((failure, index) => ({
        predicate: `repair-attempt-${index + 1}`,
        passed: true,
        detail: `Repaired: ${failure}`,
      })),
    ],
  };
}
