import {
  MotionPlanV1Schema,
  type BackendCapabilitySnapshotV1,
  type MotionPlanCanvasV1,
  type MotionPlanSemanticV1,
  type MotionPlanV1,
} from "../../../packages/contracts/src/motion.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";

export class MotionPlanError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MotionPlanError";
  }
}

export type MotionPlanNormalizationContext = {
  readonly jobCanvas: MotionPlanCanvasV1;
  readonly knowledgeCardIds: readonly string[];
  readonly capabilitySnapshot: BackendCapabilitySnapshotV1;
  readonly knowledgeCardDigest: string;
  readonly promptDigest: string;
  readonly modelDigest: string;
  readonly evidenceDigest: string;
  readonly promptVersion: string;
  readonly modelVersion: string;
};

const sameCanvas = (
  left: MotionPlanCanvasV1,
  right: MotionPlanCanvasV1,
): boolean =>
  left.width === right.width &&
  left.height === right.height &&
  left.fps === right.fps &&
  left.frameCount === right.frameCount;

export function normalizeMotionPlan(
  candidate: MotionPlanSemanticV1,
  context: MotionPlanNormalizationContext,
): MotionPlanV1 {
  if (!sameCanvas(candidate.canvas, context.jobCanvas))
    throw new MotionPlanError("MOTION_PLAN_CANVAS_MISMATCH");

  const availableCards = new Set(context.knowledgeCardIds);
  if (candidate.knowledgeCardIds.some((id) => !availableCards.has(id)))
    throw new MotionPlanError("MOTION_PLAN_UNKNOWN_KNOWLEDGE_CARD");

  const availableCapabilities = new Set(
    context.capabilitySnapshot.capabilities,
  );
  if (
    candidate.requiredCapabilities.some(
      (capability) => !availableCapabilities.has(capability),
    )
  )
    throw new MotionPlanError("MOTION_PLAN_UNAVAILABLE_CAPABILITY");

  const draft = MotionPlanV1Schema.parse({
    ...candidate,
    reproducibility: {
      knowledgeCardDigest: context.knowledgeCardDigest,
      promptDigest: context.promptDigest,
      modelDigest: context.modelDigest,
      evidenceDigest: context.evidenceDigest,
      capabilitySnapshotDigest: sha256Hex(context.capabilitySnapshot),
      planDigest: "0".repeat(64),
      knowledgeCardIds: candidate.knowledgeCardIds,
      requiredCapabilities: candidate.requiredCapabilities,
      promptVersion: context.promptVersion,
      modelVersion: context.modelVersion,
    },
  });
  return MotionPlanV1Schema.parse({
    ...draft,
    reproducibility: {
      ...draft.reproducibility,
      planDigest: motionPlanDigest(draft),
    },
  });
}

export function validateMotionPlanForJob(
  value: unknown,
  jobCanvas: MotionPlanCanvasV1,
): MotionPlanV1 {
  const plan = MotionPlanV1Schema.parse(value);
  if (!sameCanvas(plan.canvas, jobCanvas))
    throw new MotionPlanError("MOTION_PLAN_CANVAS_MISMATCH");
  if (
    plan.reproducibility.promptVersion !== "legacy-v1" &&
    plan.reproducibility.planDigest !== motionPlanDigest(plan)
  )
    throw new MotionPlanError("MOTION_PLAN_DIGEST_MISMATCH");
  return plan;
}

export const motionPlanDigest = (plan: MotionPlanV1): string => {
  const { planDigest: ignoredPlanDigest, ...reproducibility } =
    plan.reproducibility;
  void ignoredPlanDigest;
  return sha256Hex({ ...plan, reproducibility });
};
