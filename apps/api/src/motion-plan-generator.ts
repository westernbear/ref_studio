import { z } from "zod";
import {
  BackendCapabilitySnapshotV1Schema,
  MOTION_PREDICATE_IDS,
  MotionPlanCanvasV1Schema,
  MotionPlanSemanticObjectV1Schema,
  type MotionPlanSemanticV1,
} from "../../../packages/contracts/src/motion.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import { motionPlanDigest, normalizeMotionPlan } from "./motion-plan.js";

const FiniteNumberSchema = z.number().finite();
const ProjectedOwnerSchema = z
  .object({
    ownerId: z.string().min(1).max(128),
    kind: z.string().min(1).max(64),
    editable: z.boolean(),
    geometry: z
      .object({
        minX: FiniteNumberSchema,
        minY: FiniteNumberSchema,
        maxX: FiniteNumberSchema,
        maxY: FiniteNumberSchema,
        sampleCount: FiniteNumberSchema.int().min(1).max(216_000),
      })
      .strict()
      .nullable(),
  })
  .strict();

const ProjectedEvidenceSchema = z
  .object({
    sceneInput: z
      .object({ owners: z.array(ProjectedOwnerSchema).max(256) })
      .strict(),
    palette: z.array(z.string().max(64)).max(64),
    rhythm: z.record(z.string(), z.json()).nullable(),
    audioAnchors: z
      .array(
        z
          .object({
            frame: FiniteNumberSchema.int().nonnegative().max(216_000),
            confidence: FiniteNumberSchema.min(0).max(1),
          })
          .strict(),
      )
      .max(256),
  })
  .strict()
  .refine(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16_384,
    "EVIDENCE_PROJECTION_TOO_LARGE",
  );

export const MotionPlanGeneratorInputSchema = z
  .object({
    brief: z.string().min(1).max(4_000),
    knowledgeCards: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            definition: z.string().min(1).max(2_000),
            capabilities: z.array(z.string().min(1).max(128)).max(64),
          })
          .strict(),
      )
      .min(1)
      .max(15),
    projectedEvidence: ProjectedEvidenceSchema,
    jobCanvas: MotionPlanCanvasV1Schema,
    attachmentIds: z
      .array(
        z
          .string()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9_-]+$/u),
      )
      .max(20),
    capabilitySnapshot: BackendCapabilitySnapshotV1Schema,
    promptVersion: z.string().min(1).max(128),
    modelVersion: z.string().min(1).max(128),
  })
  .strict();
export type MotionPlanGeneratorInput = z.infer<
  typeof MotionPlanGeneratorInputSchema
>;

export type MotionPlanProviderRequest = Readonly<MotionPlanGeneratorInput>;
// What generateObject is asked to produce. Nested objects are not .strict()
// and predicate ids are plain strings: Codex json_schema is sent with
// strict:false, so extra keys and unknown predicate names are normal, and
// a Zod .strict()/.enum() schema is what turned those into
// AI_NoObjectGeneratedError. Host parse below keeps the stored plan tight.
export const MotionPlanGenerateSchema = z.object({
  schema: z.literal("motion-plan-v1"),
  intent: z.string().min(1).max(2_000),
  knowledgeCardIds: z.array(z.string().min(1).max(128)).max(15),
  requiredCapabilities: z.array(z.string().min(1).max(128)).max(64),
  canvas: z.object({
    width: z.number().finite(),
    height: z.number().finite(),
    fps: z.number().finite(),
    frameCount: z.number().finite(),
  }),
  keyframeIntents: z
    .array(
      z.object({
        elementId: z.string().min(1).max(128),
        anticipationFrames: z.number().finite(),
        overshootPercent: z.number().finite(),
        settleFrame: z.number().finite(),
        staggerFrames: z.number().finite(),
        targetBeat: z
          .object({
            startFrame: z.number().finite(),
            endFrame: z.number().finite(),
          })
          .optional(),
      }),
    )
    .max(64),
  predicateIds: z.array(z.string().min(1).max(128)).max(64),
});
export type GenerateMotionPlanCandidate = (
  request: MotionPlanProviderRequest,
  schema: typeof MotionPlanGenerateSchema,
) => Promise<unknown>;

export const redactMotionPlanBrief = (brief: string): string =>
  brief
    .replace(
      /\b(?:raw[_-]?provider[_-]?payload|providerPayload)\b\s*[:=]\s*[^\r\n]*/giu,
      "[REDACTED_PROVIDER_PAYLOAD]",
    )
    .replace(
      /\b(?:authorization\s*:\s*)?bearer\s+[A-Za-z0-9._~+/-]+=*/giu,
      "[REDACTED_SECRET]",
    )
    .replace(
      /\b(?:api[_-]?key|access[_-]?token|token)\s*[:=]\s*["']?[^\s,;"']+/giu,
      "[REDACTED_SECRET]",
    )
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[A-Za-z0-9_-]{8,})\b/gu,
      "[REDACTED_SECRET]",
    )
    .replace(/\\\\[^\\\s]+\\[^\s,;]+/gu, "[REDACTED_PATH]")
    .replace(/\b[A-Za-z]:\\(?:[^\\\s,;]+\\)*[^\\\s,;]+/gu, "[REDACTED_PATH]")
    .replace(
      /(?:file:\/\/)?\/(?:home|Users|tmp|var|private|etc|root|opt|srv|mnt|Volumes)\/[^\s,;]+/gu,
      "[REDACTED_PATH]",
    )
    .replace(
      /(^|[\s"'(])(?:(?:\.{1,2}|[A-Za-z0-9._-]+)\/)+(?:[A-Za-z0-9._-]+\.[A-Za-z0-9]{1,10})(?=$|[\s,;:!?)"'])/gu,
      "$1[REDACTED_PATH]",
    );

export async function generateMotionPlan(
  input: unknown,
  generate: GenerateMotionPlanCandidate,
) {
  const parsed = MotionPlanGeneratorInputSchema.parse(input);
  const providerRequest = {
    ...parsed,
    brief: redactMotionPlanBrief(parsed.brief),
  };
  const generated = MotionPlanGenerateSchema.parse(
    await generate(providerRequest, MotionPlanGenerateSchema),
  );
  const knownPredicates = new Set<string>(MOTION_PREDICATE_IDS);
  const candidate: MotionPlanSemanticV1 =
    MotionPlanSemanticObjectV1Schema.parse({
      schema: "motion-plan-v1",
      intent: generated.intent,
      knowledgeCardIds: generated.knowledgeCardIds,
      requiredCapabilities: generated.requiredCapabilities,
      canvas: {
        width: Math.round(generated.canvas.width),
        height: Math.round(generated.canvas.height),
        fps: Math.round(generated.canvas.fps),
        frameCount: Math.round(generated.canvas.frameCount),
      },
      keyframeIntents: generated.keyframeIntents.map((intent) => ({
        elementId: intent.elementId,
        anticipationFrames: Math.round(intent.anticipationFrames),
        overshootPercent: intent.overshootPercent,
        settleFrame: Math.round(intent.settleFrame),
        staggerFrames: Math.round(intent.staggerFrames),
        ...(intent.targetBeat
          ? {
              targetBeat: {
                startFrame: Math.round(intent.targetBeat.startFrame),
                endFrame: Math.round(intent.targetBeat.endFrame),
              },
            }
          : {}),
      })),
      predicateIds: generated.predicateIds.filter((id) =>
        knownPredicates.has(id),
      ),
    });
  const plan = normalizeMotionPlan(candidate, {
    jobCanvas: parsed.jobCanvas,
    knowledgeCardIds: parsed.knowledgeCards.map((card) => card.id),
    capabilitySnapshot: parsed.capabilitySnapshot,
    knowledgeCardDigest: sha256Hex(parsed.knowledgeCards),
    promptDigest: sha256Hex({
      brief: providerRequest.brief,
      promptVersion: parsed.promptVersion,
    }),
    modelDigest: sha256Hex({ modelVersion: parsed.modelVersion }),
    evidenceDigest: sha256Hex(parsed.projectedEvidence),
    promptVersion: parsed.promptVersion,
    modelVersion: parsed.modelVersion,
  });
  const planDigest = motionPlanDigest(plan);
  return {
    plan,
    planDigest,
    linkage: {
      planDigest,
      knowledgeCardIds: plan.knowledgeCardIds,
      requiredCapabilities: plan.requiredCapabilities,
      knowledgeCardDigest: plan.reproducibility.knowledgeCardDigest,
      promptDigest: plan.reproducibility.promptDigest,
      modelDigest: plan.reproducibility.modelDigest,
      evidenceDigest: plan.reproducibility.evidenceDigest,
      capabilitySnapshotDigest: plan.reproducibility.capabilitySnapshotDigest,
      promptVersion: plan.reproducibility.promptVersion,
      modelVersion: plan.reproducibility.modelVersion,
    },
  } as const;
}
