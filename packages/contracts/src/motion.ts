import { z } from "zod";
import { SceneSpecSchema } from "./scene-spec.js";
import { MOTION_PREDICATE_IDS } from "./motion-predicates.js";
export {
  MANDATORY_MOTION_PREDICATE_IDS,
  MOTION_PREDICATES,
  MOTION_PREDICATE_IDS,
} from "./motion-predicates.js";

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const FiniteNumberSchema = z.number().finite();

const LEGACY_MOTION_PREDICATE_IDS = [
  ...MOTION_PREDICATE_IDS,
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
    targetBeat: z
      .object({
        startFrame: FiniteNumberSchema.int().nonnegative().max(215_999),
        endFrame: FiniteNumberSchema.int().min(1).max(216_000),
      })
      .strict()
      .optional(),
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
  for (const [index, intent] of value.keyframeIntents.entries()) {
    const beatStart = intent.targetBeat?.startFrame ?? 0;
    const beatEnd = intent.targetBeat?.endFrame ?? value.canvas.frameCount;
    const startFrame = beatStart + index * intent.staggerFrames;
    const anticipationFrame = startFrame + intent.anticipationFrames;
    const settleFrame = startFrame + intent.settleFrame;
    if (
      beatStart >= beatEnd ||
      beatEnd > value.canvas.frameCount ||
      anticipationFrame > settleFrame ||
      [startFrame, anticipationFrame, settleFrame].some(
        (frame) => frame < beatStart || frame >= beatEnd,
      )
    )
      context.addIssue({
        code: "custom",
        path: ["keyframeIntents", index],
        message:
          "resulting keyframes must be ordered inside canvas and target beat",
      });
  }
};

export const MotionPlanSemanticV1Schema =
  MotionPlanSemanticObjectV1Schema.superRefine(refineMotionPlanFrames);
export type MotionPlanSemanticV1 = z.infer<typeof MotionPlanSemanticV1Schema>;

const ReproducibilityMetadataV1Schema = z
  .object({
    knowledgeCardDigest: DigestSchema,
    promptDigest: DigestSchema,
    modelDigest: DigestSchema,
    evidenceDigest: DigestSchema,
    capabilitySnapshotDigest: DigestSchema,
    planDigest: DigestSchema,
    knowledgeCardIds: z.array(z.string().min(1).max(128)).max(15),
    requiredCapabilities: z.array(z.string().min(1).max(128)).max(64),
    promptVersion: z.string().min(1).max(128),
    modelVersion: z.string().min(1).max(128),
  })
  .strict();

const MotionPlanLedgerV1Schema = MotionPlanSemanticObjectV1Schema.extend({
  reproducibility: ReproducibilityMetadataV1Schema,
}).superRefine((value, context) => {
  refineMotionPlanFrames(value, context);
  if (
    value.knowledgeCardIds.join("\0") !==
      value.reproducibility.knowledgeCardIds.join("\0") ||
    value.requiredCapabilities.join("\0") !==
      value.reproducibility.requiredCapabilities.join("\0")
  )
    context.addIssue({
      code: "custom",
      path: ["reproducibility"],
      message: "reproducibility ledger must match plan card and capability IDs",
    });
});

const LEGACY_DIGEST = "0".repeat(64);
const LegacyMotionPlanV1Schema = z
  .object({
    schema: z.literal("motion-plan-v1"),
    intent: z.string().min(1).max(2_000),
    keyframeIntents: z.array(KeyframeIntentV1Schema).max(64),
    predicates: z.array(z.enum(LEGACY_MOTION_PREDICATE_IDS)).max(64),
  })
  .strict()
  .transform((legacy) => ({
    schema: legacy.schema,
    intent: legacy.intent,
    knowledgeCardIds: [],
    requiredCapabilities: [],
    canvas: { width: 1_920, height: 1_080, fps: 30, frameCount: 450 },
    keyframeIntents: legacy.keyframeIntents,
    predicateIds: legacy.predicates.map((predicate) =>
      predicate === "native-element-kinds"
        ? "element-kind-capability"
        : predicate,
    ),
    reproducibility: {
      knowledgeCardDigest: LEGACY_DIGEST,
      promptDigest: LEGACY_DIGEST,
      modelDigest: LEGACY_DIGEST,
      evidenceDigest: LEGACY_DIGEST,
      capabilitySnapshotDigest: LEGACY_DIGEST,
      planDigest: LEGACY_DIGEST,
      knowledgeCardIds: [],
      requiredCapabilities: [],
      promptVersion: "legacy-v1",
      modelVersion: "legacy-v1",
    },
  }))
  .superRefine(refineMotionPlanFrames);

export const MotionPlanV1Schema = z.union([
  MotionPlanLedgerV1Schema,
  LegacyMotionPlanV1Schema,
]);
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

export const VerificationFindingV1Schema = z
  .object({
    predicateId: z.enum(MOTION_PREDICATE_IDS),
    pass: z.boolean(),
    target: z.string().min(1).max(256),
    observed: z.string().min(1).max(2_000),
    expected: z.string().min(1).max(2_000),
    remediation: z.string().min(1).max(2_000),
  })
  .strict();
const CurrentVerificationReportV1Schema = z
  .object({
    schema: z.literal("verification-report-v1"),
    sceneDigest: DigestSchema,
    attempts: z.number().int().min(1).max(4),
    status: z.enum(["PASS", "FAIL"]),
    findings: z.array(VerificationFindingV1Schema),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.findings.every((finding) => finding.pass) ? "PASS" : "FAIL") !==
      value.status
    )
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "status must match findings",
      });
  });
const LegacyVerificationReportV1Schema = z
  .object({
    schema: z.literal("verification-report-v1"),
    sceneDigest: DigestSchema,
    attempts: z.number().int().min(1).max(4),
    status: z.enum(["PASS", "FAIL"]),
    findings: z.array(
      z
        .object({
          predicate: z.string().min(1),
          passed: z.boolean(),
          detail: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .transform((value) => ({
    ...value,
    status: value.findings.every((finding) => finding.passed)
      ? ("PASS" as const)
      : ("FAIL" as const),
    findings: value.findings.map((finding) => ({
      predicateId:
        finding.predicate === "native-element-kinds"
          ? ("element-kind-capability" as const)
          : ("scene-spec" as const),
      pass: finding.passed,
      target: "legacy-record",
      observed: finding.detail,
      expected: finding.passed ? finding.detail : "legacy predicate pass",
      remediation: finding.passed
        ? "none"
        : "re-run verification with current predicates",
    })),
  }));
export type VerificationReportV1 = z.infer<
  typeof CurrentVerificationReportV1Schema
>;
export const VerificationReportV1Schema: z.ZodType<VerificationReportV1> =
  z.union([
    CurrentVerificationReportV1Schema,
    LegacyVerificationReportV1Schema,
  ]);

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
    planDigest: DigestSchema.nullable(),
    predecessorVersion: z.number().int().positive().nullable(),
    artifactDigest: DigestSchema.nullable(),
    predicateIds: z.array(z.enum(MOTION_PREDICATE_IDS)).max(64),
    knowledgeCardIds: z.array(z.string().min(1).max(128)).max(15),
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
