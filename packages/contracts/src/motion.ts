import { z } from "zod";
import { SceneSpecSchema } from "./scene-spec.js";

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const FiniteNumberSchema = z.number().finite();

export const MOTION_PREDICATE_IDS = [
  "scene-spec",
  "native-element-kinds",
] as const;

export const MotionPlanCanvasV1Schema = z
  .object({
    width: FiniteNumberSchema.int().min(1).max(8_192),
    height: FiniteNumberSchema.int().min(1).max(8_192),
    fps: FiniteNumberSchema.int().min(1).max(240),
    frameCount: FiniteNumberSchema.int().min(1).max(216_000),
  })
  .strict();
export type MotionPlanCanvasV1 = z.infer<typeof MotionPlanCanvasV1Schema>;

export const KeyframeIntentV1Schema = z
  .object({
    elementId: z.string().min(1).max(128),
    anticipationFrames: FiniteNumberSchema.int().min(0).max(10_000),
    overshootPercent: FiniteNumberSchema.min(0).max(100),
    settleFrame: FiniteNumberSchema.int().min(0).max(216_000),
    staggerFrames: FiniteNumberSchema.int().min(0).max(10_000),
  })
  .strict();
export type KeyframeIntentV1 = z.infer<typeof KeyframeIntentV1Schema>;

const MotionPlanSemanticObjectV1Schema = z
  .object({
    schema: z.literal("motion-plan-v1"),
    intent: z.string().min(1).max(2_000),
    knowledgeCardIds: z.array(z.string().min(1).max(128)).max(15),
    requiredCapabilities: z.array(z.string().min(1).max(128)).max(64),
    canvas: MotionPlanCanvasV1Schema,
    keyframeIntents: z.array(KeyframeIntentV1Schema).max(64),
    predicateIds: z.array(z.enum(MOTION_PREDICATE_IDS)).max(64),
  })
  .strict();

const refineMotionPlanFrames = (
  value: z.infer<typeof MotionPlanSemanticObjectV1Schema>,
  context: z.RefinementCtx,
): void => {
  for (const intent of value.keyframeIntents) {
    if (intent.settleFrame >= value.canvas.frameCount)
      context.addIssue({
        code: "custom",
        path: ["keyframeIntents"],
        message: "settleFrame must be inside the job canvas",
      });
  }
};

export const MotionPlanSemanticV1Schema =
  MotionPlanSemanticObjectV1Schema.superRefine(refineMotionPlanFrames);
export type MotionPlanSemanticV1 = z.infer<typeof MotionPlanSemanticV1Schema>;

export const MotionPlanV1Schema = MotionPlanSemanticObjectV1Schema.extend({
  reproducibility: z
    .object({
      evidenceDigest: DigestSchema,
      capabilitySnapshotDigest: DigestSchema,
      promptVersion: z.string().min(1).max(128),
      modelVersion: z.string().min(1).max(128),
    })
    .strict(),
}).superRefine(refineMotionPlanFrames);
export type MotionPlanV1 = z.infer<typeof MotionPlanV1Schema>;

const SceneOperationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("set"),
      opId: z.string().min(1).max(128),
      path: z.string().regex(/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/u),
      value: z.json(),
      reason: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unset"),
      opId: z.string().min(1).max(128),
      path: z.string().regex(/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/u),
      reason: z.string().min(1).max(500),
    })
    .strict(),
]);

export const SceneOperationBatchV1Schema = z
  .object({
    schema: z.literal("scene-operation-batch-v1"),
    baseSceneDigest: DigestSchema,
    operations: z.array(SceneOperationSchema).min(1).max(16),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.operations.map((operation) => operation.opId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: "custom", message: "opId must be unique" });
  });
export type SceneOperationBatchV1 = z.infer<typeof SceneOperationBatchV1Schema>;

export const MotionSceneRollbackV1Schema = z
  .object({
    schema: z.literal("motion-scene-rollback-v1"),
    version: z.number().int().positive(),
  })
  .strict();
export type MotionSceneRollbackV1 = z.infer<typeof MotionSceneRollbackV1Schema>;

export const MotionSceneRenderV1Schema = z
  .object({ schema: z.literal("motion-scene-render-v1") })
  .strict();
export type MotionSceneRenderV1 = z.infer<typeof MotionSceneRenderV1Schema>;

export const BackendCapabilitySnapshotV1Schema = z
  .object({
    schema: z.literal("backend-capability-snapshot-v1"),
    backend: z.enum(["native", "adobe"]),
    capturedAt: z.string().datetime(),
    capabilities: z.array(z.string().min(1).max(128)).max(64),
  })
  .strict();
export type BackendCapabilitySnapshotV1 = z.infer<
  typeof BackendCapabilitySnapshotV1Schema
>;

const VerificationFindingSchema = z
  .object({
    predicate: z.string().min(1),
    passed: z.boolean(),
    detail: z.string().min(1),
  })
  .strict();
export const VerificationReportV1Schema = z
  .object({
    schema: z.literal("verification-report-v1"),
    sceneDigest: DigestSchema,
    attempts: z.number().int().min(1).max(4),
    status: z.enum(["PASS", "FAIL"]),
    findings: z.array(VerificationFindingSchema),
  })
  .strict();
export type VerificationReportV1 = z.infer<typeof VerificationReportV1Schema>;

export const MotionSceneSnapshotV1Schema = z
  .object({
    schema: z.literal("motion-scene-snapshot-v1"),
    version: z.number().int().positive(),
    sceneEtag: z.string().min(1),
    sceneDigest: DigestSchema,
    scene: SceneSpecSchema,
    history: z.array(
      z
        .object({
          version: z.number().int().positive(),
          sceneDigest: DigestSchema,
          createdAt: z.string().datetime(),
        })
        .strict(),
    ),
    backendCapability: BackendCapabilitySnapshotV1Schema,
    verification: VerificationReportV1Schema.nullable(),
  })
  .strict();
export type MotionSceneSnapshotV1 = z.infer<typeof MotionSceneSnapshotV1Schema>;

export const MotionDeliverablesV1Schema = z
  .object({
    backend: z.enum(["native", "adobe"]),
    items: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.enum(["mp4", "scene-package", "report"]),
          downloadUrl: z.string().startsWith("/v1/"),
        })
        .strict(),
    ),
  })
  .strict();
export type MotionDeliverablesV1 = z.infer<typeof MotionDeliverablesV1Schema>;
