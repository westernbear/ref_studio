import { z } from "zod";
import { SceneSpecSchema } from "./scene-spec.js";

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const KeyframeIntentSchema = z
  .object({
    elementId: z.string().min(1),
    anticipationFrames: z.number().int().nonnegative(),
    overshootPercent: z.number().min(0).max(100),
    settleFrame: z.number().int().nonnegative(),
    staggerFrames: z.number().int().nonnegative(),
  })
  .strict();

export const MotionPlanV1Schema = z
  .object({
    schema: z.literal("motion-plan-v1"),
    intent: z.string().min(1).max(2_000),
    keyframeIntents: z.array(KeyframeIntentSchema).max(64),
    predicates: z.array(z.string().min(1)).max(64),
  })
  .strict();
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
    capabilities: z.array(z.string().min(1)),
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
