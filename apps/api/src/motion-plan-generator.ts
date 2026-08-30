import { z } from "zod";
import {
  BackendCapabilitySnapshotV1Schema,
  MotionPlanCanvasV1Schema,
  MotionPlanSemanticV1Schema,
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
export type GenerateMotionPlanCandidate = (
  request: MotionPlanProviderRequest,
  schema: typeof MotionPlanSemanticV1Schema,
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
  const candidate: MotionPlanSemanticV1 = MotionPlanSemanticV1Schema.parse(
    await generate(providerRequest, MotionPlanSemanticV1Schema),
  );
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
