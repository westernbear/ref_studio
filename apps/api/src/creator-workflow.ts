import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  assertLegalTransition,
  type JobState,
} from "../../../packages/contracts/src/lifecycle.js";
import {
  GenerationConfigSchema,
  type GenerationConfig,
} from "../../../packages/contracts/src/generation.js";
import { requestHeader } from "./admin-auth.js";
import { getAiProviderSettings } from "./ai-provider-settings.js";
import { getMaterialProviderSettings } from "./material-provider-settings.js";
import { currentDeliveryGate } from "./motion-artifact-gate.js";
import type { AuthoredScene } from "./author-scene.js";
import { IdempotencyStore, requestHash, safeEnvelope } from "./boundary.js";
import type { Principal } from "./auth.js";
import { selectInitialStartFrame } from "./refine-prompt.js";
import type { FeatureFlagSnapshot } from "./feature-flags.js";
import type { Gate, ReviewReceipt, ReviewStore } from "./reviews.js";
import {
  ownedAttachment,
  UploadFailure,
  uploadSourcePath,
  type UploadStore,
} from "./uploads.js";
import type { WorkerStore } from "./workers.js";

export const PreparationStageSchema = z.enum([
  "AWAITING_T1",
  "ANALYSIS_QUEUED",
  "ANALYSIS_RUNNING",
  "COMPILATION_QUEUED",
  "COMPILATION_RUNNING",
  "AWAITING_T2",
  "AWAITING_T3",
  "EVIDENCE_VIDEO_QUEUED",
  "EVIDENCE_VIDEO_RUNNING",
  "PREVIEW_QUEUED",
  "PREVIEW_RUNNING",
  "AWAITING_T4",
  // Only entered when job.generation is set (a scene the AI should author
  // from the measured evidence + creator's brief) -- a restore-only job
  // skips straight from AWAITING_T4 to READY, exactly as before.
  "AUTHORING_QUEUED",
  "AUTHORING_RUNNING",
  // Material generation. An authored scene names assets; the ones it
  // actually draws have to be backed by real bytes, stored where the
  // renderer can read them, before there is anything to render. Also
  // generate-track only -- a restore job never enters these.
  "ASSETS_QUEUED",
  "ASSETS_RUNNING",
  // Both tracks end here, and mean the same thing: the job's render is
  // cleared to run. A generate-track job reaches it from ASSETS_RUNNING
  // instead of from AWAITING_T4, and its render is the `gen-render` worker
  // phase rather than `render`.
  "READY",
]);
export type PreparationStage = z.infer<typeof PreparationStageSchema>;
const VersionedIr = z
  .object({
    versionId: z.string().min(1),
    digest: z.string().regex(/^[a-f0-9]{64}$/u),
    parentDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
  })
  .passthrough();
export const CompilationSchema = z
  .object({
    authoring: VersionedIr,
    scene: VersionedIr,
    browserPassSpec: VersionedIr,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.scene.parentDigest !== value.authoring.digest ||
      value.browserPassSpec.parentDigest !== value.scene.digest
    )
      context.addIssue({
        code: "custom",
        message: "IR parent digests must form one immutable chain",
      });
  });
export type Compilation = z.infer<typeof CompilationSchema>;
export type ReleaseManifest = Readonly<{
  releaseId: string;
  baselineDigest: string;
  evidenceDigest: string;
  irDigest: string;
  runtimeDigest: string;
  t5ReceiptIds: readonly string[];
  recoveryReportArtifactId: string;
  fixedFrameArtifactIds: readonly string[];
  verifiedAt: string;
}>;
export type Job = {
  id: string;
  tenantId: string;
  creatorId: string;
  uploadId: string;
  state: JobState;
  attempt: number;
  etag: string;
  createdAt: string;
  updatedAt: string;
  irDigest: string;
  evidenceDigest: string;
  approved: boolean;
  startFrame: number;
  sourceFps: number;
  frameCount: number;
  creativePrompt: string | null;
  evidence: Record<string, unknown> | null;
  candidateEvidence: Record<string, unknown> | null;
  candidateEvidenceDigest: string | null;
  preparationStage: PreparationStage;
  pendingCompilation: Compilation | null;
  compilation: Compilation | null;
  previewSpecDigest: string | null;
  approvedSpecDigest: string | null;
  eligibleAt: number;
  automaticRetries: number;
  deletionEpoch: number;
  restoreEpoch: number;
  failureCode: string | null;
  // What actually went wrong, in the failing subsystem's own words, for
  // the creator to read. failureCode alone says a stage failed; it does
  // not distinguish an unconfigured provider from a model name that does
  // not exist, and the creator was shown neither -- only "this job has
  // ended". Bounded and stripped of newlines where it is set, because it
  // is vendor text going onto a page.
  failureReason: string | null;
  runtimePreflight: RuntimePreflightEvidence | null;
  readonly generation?: GenerationConfig;
  authoredScene: AuthoredScene | null;
  sceneSpecDigest: string | null;
  // Set by a chat-driven scene patch (apps/api/src/refine-prompt.ts) to the
  // beats diffChangedBeatIds found actually different -- deterministic,
  // never the model's own claim. Kept on the job record, not only in that
  // request's response, so a future partial-rerender optimisation (see the
  // `ponytail:` comment at apps/worker/src/worker-job-handler.ts's
  // gen-render call) has something to act on without re-deriving it. Null
  // until the first patch; a restore-track job never sets it.
  lastPatchChangedBeatIds: readonly string[] | null;
  motionRenderRequest?: {
    readonly backend: "native" | "adobe";
    readonly deviceId?: string;
    readonly projectId?: string;
  };
  adobeCatalog?: {
    readonly devices: readonly {
      readonly id: string;
      readonly label: string;
    }[];
    readonly projects: readonly {
      readonly id: string;
      readonly label: string;
    }[];
  };
  progress: {
    phase: "prepare" | "render";
    stage: string;
    fraction: number;
    framesProcessed: number | null;
    framesTotal: number | null;
  } | null;
  artifact: {
    id: string;
    kind: "delivery" | "generated-delivery" | "report";
    expiresAt: string;
  } | null;
};
export type RuntimePreflightEvidence = Readonly<{
  status: "PASS";
  chromiumVersion: "151.0.7922.138";
  renderer: string;
  fontReady: true;
  webgl2: true;
  networkPolicy: "external-blocked";
  repeatedFrameByteIdentity: true;
  ffmpeg: true;
  ffprobe: true;
  tar?: true | undefined;
  compilerModels: true;
  runtimeDigest: string;
}>;
// Every content type an artifact can carry. Videos and the safety-sample
// png were the whole set until generated assets arrived; a resolved asset
// is whatever the brand attachment or the provider produced, which is the
// same allowlist uploads.ts admits for attachments.
export type ArtifactContentType =
  | "video/mp4"
  | "application/x-tar"
  | "image/png"
  | "image/jpeg"
  | "image/svg+xml"
  | "font/otf"
  | "font/ttf"
  | "font/woff2";
export const ARTIFACT_CONTENT_TYPES: Readonly<
  Record<ArtifactContentType, string>
> = {
  "video/mp4": "mp4",
  "application/x-tar": "tar",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "font/otf": "otf",
  "font/ttf": "ttf",
  "font/woff2": "woff2",
};
export const isArtifactContentType = (
  value: string,
): value is ArtifactContentType => Object.hasOwn(ARTIFACT_CONTENT_TYPES, value);

// A scene asset id is chosen by the scene's author (an AI), so it is
// untrusted: it becomes both a map key and a filename stem. Restricting it
// here is what stops "../x" from either colliding with another job's key or
// escaping the tenant's artifact directory.
export const SAFE_ASSET_ID = /^[A-Za-z0-9._-]{1,64}$/u;

export type StoredArtifact = {
  readonly id: string;
  readonly jobId: string;
  readonly tenantId: string;
  readonly kind:
    | "preview"
    | "preview-labeled"
    | "delivery"
    | "evidence-video"
    | "safety-sample"
    // One resolved asset of a generated scene -- an uploaded brand
    // attachment, or material a provider produced. Stored per (job, asset),
    // not per job: see generatedAssetKey below.
    | "generated-asset"
    // The generate track's finished film. Deliberately a different kind
    // from "delivery" so a generated video is never mistaken for a restored
    // one, even though both are staged and published the same way.
    | "generated-delivery"
    | "scene-package";
  readonly filename: string;
  readonly contentType: ArtifactContentType;
  readonly bytes: Uint8Array;
  readonly storagePath?: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  report: Record<string, unknown> | null;
};
type Attempt = {
  id: string;
  number: number;
  state: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  immutable: true;
};
export type CreatorWorkflowStore = {
  readonly jobs: Map<string, Job>;
  readonly attempts: Map<string, Attempt[]>;
  readonly stagedArtifacts: Map<string, StoredArtifact>;
  readonly stagedScenePackages: Map<string, StoredArtifact>;
  readonly previews: Map<string, StoredArtifact>;
  readonly previewsLabeled: Map<string, StoredArtifact>;
  readonly evidenceVideos: Map<string, StoredArtifact>;
  readonly safetySamples: Map<string, StoredArtifact>;
  // Keyed by generatedAssetKey(jobId, assetId) -- one job has as many
  // entries here as its scene has assets needing bytes, unlike every other
  // map above, which holds at most one artifact per job.
  readonly generatedAssets: Map<string, StoredArtifact>;
  readonly artifacts: Map<string, StoredArtifact>;
  readonly scenePackages: Map<string, StoredArtifact>;
  readonly releaseManifests: Map<string, ReleaseManifest>;
  readonly idempotency: IdempotencyStore;
  readonly now: () => number;
  availablePreflight: RuntimePreflightEvidence | null;
};
export const createCreatorWorkflowStore = (
  now: () => number = Date.now,
): CreatorWorkflowStore => ({
  jobs: new Map(),
  attempts: new Map(),
  stagedArtifacts: new Map(),
  stagedScenePackages: new Map(),
  previews: new Map(),
  previewsLabeled: new Map(),
  evidenceVideos: new Map(),
  safetySamples: new Map(),
  generatedAssets: new Map(),
  artifacts: new Map(),
  scenePackages: new Map(),
  releaseManifests: new Map(),
  idempotency: new IdempotencyStore(),
  now,
  availablePreflight: null,
});

// One job's resolved assets live in a single flat map, keyed by job and
// asset, so durable-state.ts persists them through the same generic slot
// mechanism as every other artifact map. Job ids are base64url and carry no
// "/", and SAFE_ASSET_ID forbids one, so this key cannot be ambiguous.
export const generatedAssetKey = (jobId: string, assetId: string): string =>
  `${jobId}/${assetId}`;
export const generatedAssetsForJob = (
  store: CreatorWorkflowStore,
  jobId: string,
): readonly (readonly [string, StoredArtifact])[] =>
  [...store.generatedAssets].filter(([key]) =>
    key.startsWith(`${jobId}/`),
  ) as readonly (readonly [string, StoredArtifact])[];
export const clearGeneratedAssets = (
  store: CreatorWorkflowStore,
  jobId: string,
): void => {
  for (const [key] of generatedAssetsForJob(store, jobId))
    store.generatedAssets.delete(key);
};

const id = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString("base64url")}`;
const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const RUNTIME_DIGEST = digest({
  browser: "151.0.7922.138",
  renderer: "WebGL2",
  angle: "SwiftShader",
  network: "external-blocked",
});
export const RELEASE_BASELINE_DIGEST = digest({
  profile: "vertical-1080p30",
  width: 1080,
  height: 1920,
  durationSeconds: 4,
});
const ChoiceRecord = z
  .object({
    choiceId: z.string().regex(/^choice_[A-Za-z0-9_-]{8,64}$/u),
  })
  .passthrough();
const EvidenceSceneInput = z
  .object({
    owners: z.array(
      z
        .object({
          ownerId: z.string(),
          kind: z.string(),
          editable: z.boolean(),
          confidence: z.number().min(0).max(1),
        })
        .passthrough(),
    ),
    tracks: z.array(
      z
        .object({
          trackId: z.string(),
          owner: z.string(),
          geometryRef: z.string(),
          lifecycle: z.record(z.string(), z.unknown()),
          effects: z.array(z.string()),
        })
        .passthrough(),
    ),
    needsChoice: z.array(ChoiceRecord).optional(),
  })
  .passthrough();
const Confidence = z.number().min(0).max(1);
const EvidenceFrame = z
  .object({
    index: z.number().int().nonnegative(),
    timeMs: z.number().int().nonnegative(),
    nativeSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    confidence: Confidence,
  })
  .passthrough();
const ConfidentFrame = z
  .object({ frame: z.number().int().nonnegative(), confidence: Confidence })
  .passthrough();
export const EvidenceBundleSchema = z
  .object({
    schemaVersion: z.literal("rvs-reference-evidence-v1"),
    state: z.enum(["MAPPED", "NEEDS_CHOICE"]),
    source: z
      .object({
        jobId: z.string().min(1),
        attemptId: z.string().min(1),
        normalizedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict(),
    observed: z
      .object({
        // Where the analysed content sits inside the normalized frame. Every
        // sceneInput geometry is render-canvas coordinates derived from this
        // window, so drawing them back onto the reference video requires it.
        contentWindow: z
          .object({
            x: z.number().int().nonnegative(),
            y: z.number().int().nonnegative(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .strict()
          .optional(),
        temporalVolume: z
          .object({
            profile: z.string().min(1),
            fps: z.union([
              z.literal(24),
              z.literal(25),
              z.literal(30),
              z.literal(50),
              z.literal(60),
            ]),
            frameCount: z.number().int().min(96).max(240),
            intervalMs: z.tuple([z.literal(0), z.literal(4_000)]),
            frames: z.array(EvidenceFrame).min(96).max(240),
          })
          .strict(),
        ocr: z.object({ candidates: z.array(ConfidentFrame) }).passthrough(),
        uiSurfaces: z.array(ConfidentFrame),
        matting: z.object({ frames: z.array(ConfidentFrame) }).passthrough(),
        depth: z
          .object({
            medianNormalized: z.array(z.number().min(0).max(1).nullable()),
            ownerSamples: z.array(z.record(z.string(), z.unknown())),
          })
          .passthrough(),
        camera: z.object({ frames: z.array(ConfidentFrame) }).passthrough(),
        tracking: z.array(
          z
            .object({
              ownerId: z.string().min(1),
              samples: z.array(
                z
                  .object({
                    frame: z.number().int().nonnegative(),
                    timeMs: z.number().int().nonnegative(),
                    boundsPx: z.tuple([
                      z.number().finite(),
                      z.number().finite(),
                      z.number().positive(),
                      z.number().positive(),
                    ]),
                    centroidPx: z.tuple([
                      z.number().finite(),
                      z.number().finite(),
                    ]),
                    velocityPxPerMs: z.tuple([
                      z.number().finite(),
                      z.number().finite(),
                    ]),
                    confidence: Confidence,
                  })
                  .passthrough(),
              ),
            })
            .strict(),
        ),
        effects: z.array(
          z
            .object({
              lowerLightRgb16x9: z
                .array(z.number().min(0).max(1))
                .length(16 * 9 * 3),
              confidence: Confidence,
              formulas: z.record(z.string(), z.string().min(1)),
            })
            .passthrough(),
        ),
        rhythm: z.record(z.string(), z.unknown()),
        audio: z
          .object({
            sampleRateHz: z.literal(48_000),
            channels: z.literal(2),
            anchors: z.array(ConfidentFrame),
          })
          .strict(),
        palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/iu)).min(1),
      })
      .strict(),
    mappings: z
      .object({
        textOwnerCount: z.number().int().nonnegative(),
        uiOwnerCount: z.number().int().nonnegative(),
        residualOwner: z.string().min(1),
      })
      .strict(),
    needsChoice: z.array(ChoiceRecord).max(1),
    sceneInput: EvidenceSceneInput,
  })
  .strict()
  .superRefine((value, context) => {
    const count = value.observed.temporalVolume.frameCount;
    const perFrame = [
      value.observed.temporalVolume.frames,
      value.observed.matting.frames,
      value.observed.depth.medianNormalized,
      value.observed.camera.frames,
      value.observed.effects,
    ];
    if (perFrame.some((items) => items.length !== count))
      context.addIssue({
        code: "custom",
        message: "every temporal measurement must cover the selected interval",
      });
    if (
      value.observed.temporalVolume.frames.some(
        (frame, index) =>
          frame.index !== index ||
          frame.timeMs !==
            Math.floor((index * 1_000) / value.observed.temporalVolume.fps),
      )
    )
      context.addIssue({
        code: "custom",
        message: "temporal frame sequence is invalid",
      });
    if (
      (value.state === "MAPPED" && value.needsChoice.length !== 0) ||
      (value.state === "NEEDS_CHOICE" && value.needsChoice.length !== 1) ||
      (value.sceneInput.needsChoice?.length ?? 0) !== value.needsChoice.length
    )
      context.addIssue({
        code: "custom",
        message: "choice state is inconsistent",
      });
    const owners = new Set(
      value.sceneInput.owners.map((owner) => owner.ownerId),
    );
    if (
      owners.size !== value.sceneInput.owners.length ||
      value.sceneInput.tracks.some((track) => !owners.has(track.owner))
    )
      context.addIssue({
        code: "custom",
        message: "owner topology is invalid",
      });
  });
const AuthoringPatch = z
  .object({
    ops: z
      .array(
        z
          .object({
            op: z.literal("replace"),
            path: z.string().startsWith("/").max(300),
            value: z.unknown(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    reason: z.string().min(1).max(500),
  })
  .strict();
const GeometryEdit = z
  .object({
    x: z.number().finite().min(0).max(1080),
    y: z.number().finite().min(0).max(1920),
    width: z.number().finite().positive().max(1080),
    height: z.number().finite().positive().max(1920),
  })
  .strict()
  .refine((value) => value.x + value.width <= 1080, "geometry exceeds width")
  .refine((value) => value.y + value.height <= 1920, "geometry exceeds height");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const reviewEvidence = (job: Job): Record<string, unknown> | null =>
  job.candidateEvidence ?? job.evidence;
const ChoiceResolveRequest = z
  .object({
    choiceId: z.string().regex(/^choice_[A-Za-z0-9_-]{8,64}$/u),
    polygonOrOwner: z.union([
      z.object({ ownerId: z.string().min(1).max(100) }).strict(),
      z
        .object({
          polygon: z
            .array(
              z
                .object({
                  x: z.number().min(0).max(1080),
                  y: z.number().min(0).max(1920),
                })
                .strict(),
            )
            .min(3)
            .max(64),
        })
        .strict(),
    ]),
    reason: z.string().min(1).max(500),
  })
  .strict();
const jobSceneInput = (job: Job): z.infer<typeof EvidenceSceneInput> => {
  const parsed = z
    .object({ sceneInput: EvidenceSceneInput })
    .safeParse(reviewEvidence(job));
  if (!parsed.success) throw new Error("ARTIFACT_UNAVAILABLE");
  return parsed.data.sceneInput;
};
export const hasUnresolvedChoices = (job: Job): boolean => {
  const evidence = reviewEvidence(job);
  if (!evidence) return true;
  const parsed = z
    .object({ sceneInput: EvidenceSceneInput })
    .safeParse(evidence);
  return (
    !parsed.success || (parsed.data.sceneInput.needsChoice?.length ?? 0) > 0
  );
};
const projection = (
  store: CreatorWorkflowStore,
  job: Job,
  reviews?: ReviewStore,
): Record<string, unknown> => ({
  id: job.id,
  tenantId: job.tenantId,
  uploadId: job.uploadId,
  state: job.state,
  attempt: job.attempt,
  etag: job.etag,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  startFrame: job.startFrame,
  sourceFps: job.sourceFps,
  frameCount: job.frameCount,
  creativePrompt: job.creativePrompt,
  preparationStage: job.preparationStage,
  failureCode: job.failureCode,
  // Only ever alongside its code. Ten places clear failureCode on the way
  // back to healthy; gating here means none of them can leave a stale
  // reason behind to be shown against a job that has since recovered.
  failureReason: job.failureCode ? job.failureReason : null,
  automaticRetries: job.automaticRetries,
  artifact: job.artifact,
  progress: job.progress,
  runtimePreflight: job.runtimePreflight,
  ...(job.generation ? { generation: job.generation } : {}),
  beatSheet: job.authoredScene?.beatSheet ?? null,
  planDigest: job.authoredScene?.planDigest ?? null,
  lastPatchChangedBeatIds: job.lastPatchChangedBeatIds,
  evidenceDigest: job.evidenceDigest,
  irDigest: job.irDigest,
  reviewArtifactId: store.stagedArtifacts.get(job.id)?.id ?? null,
  previewArtifactId: store.previews.get(job.id)?.id ?? null,
  previewLabeledArtifactId: store.previewsLabeled.get(job.id)?.id ?? null,
  evidenceVideoArtifactId: store.evidenceVideos.get(job.id)?.id ?? null,
  authoringVersionId: job.compilation?.authoring.versionId ?? null,
  browserPassSpecDigest: job.compilation?.browserPassSpec.digest ?? null,
  runtimeDigest: job.runtimePreflight?.runtimeDigest ?? RUNTIME_DIGEST,
  releaseBaselineDigest: RELEASE_BASELINE_DIGEST,
  approvedGates: [
    ...new Set(
      (reviews?.receipts ?? [])
        .filter(
          (receipt) =>
            receipt.jobId === job.id &&
            receipt.attempt === job.attempt &&
            receipt.decision === "APPROVED",
        )
        .map((receipt) => receipt.gate),
    ),
  ],
});
export function autoApproveT1(
  reviews: ReviewStore | undefined,
  job: Job,
  actorId: string,
  now: number,
): string | null {
  if (
    !reviews ||
    job.state !== "PREPARING" ||
    job.preparationStage !== "AWAITING_T1" ||
    !job.runtimePreflight
  )
    return null;
  const existing = reviews.receipts.find(
    (receipt) =>
      receipt.jobId === job.id &&
      receipt.attempt === job.attempt &&
      receipt.gate === "T1",
  );
  if (existing) {
    if (existing.decision === "APPROVED") {
      job.preparationStage = "ANALYSIS_QUEUED";
      job.eligibleAt = now;
    }
    return existing.id;
  }
  const snapshot = {
    evidenceDigest: job.evidenceDigest,
    irDigest: job.irDigest,
    runtimeDigest: job.runtimePreflight.runtimeDigest,
    releaseBaselineDigest: RELEASE_BASELINE_DIGEST,
  };
  reviews.current.set(`${job.id}:T1:${job.attempt}`, snapshot);
  const receipt: ReviewReceipt = {
    id: id("rcpt"),
    releaseId: null,
    jobId: job.id,
    tenantId: job.tenantId,
    attempt: job.attempt,
    gate: "T1",
    decision: "APPROVED",
    actorId,
    predecessorReceiptId: null,
    ...snapshot,
    reason: "Initial source gate auto-approved during job creation.",
    artifactRefs: [],
    correctionOf: null,
    sequence: ++reviews.sequence.value,
    createdAt: new Date(now).toISOString(),
  };
  reviews.receipts.push(receipt);
  job.preparationStage = "ANALYSIS_QUEUED";
  job.eligibleAt = now;
  job.failureCode = null;
  job.updatedAt = receipt.createdAt;
  job.etag = `\"${id("etag")}\"`;
  return receipt.id;
}
// Shared by autoApproveT2T3/T4/T5: writes one automatic (system-actor) receipt,
// mirroring autoApproveT1's receipt shape without a human decision round-trip.
const writeAutoReceipt = (
  reviews: ReviewStore,
  job: Job,
  gate: Gate,
  actorId: string,
  now: number,
  artifactRefs: readonly string[],
  predecessorReceiptId: string | null = null,
): ReviewReceipt => {
  const snapshot = {
    evidenceDigest: job.evidenceDigest,
    irDigest: job.irDigest,
    runtimeDigest: job.runtimePreflight?.runtimeDigest ?? RUNTIME_DIGEST,
    releaseBaselineDigest: RELEASE_BASELINE_DIGEST,
  };
  reviews.current.set(`${job.id}:${gate}:${job.attempt}`, snapshot);
  const receipt: ReviewReceipt = {
    id: id("rcpt"),
    releaseId: null,
    jobId: job.id,
    tenantId: job.tenantId,
    attempt: job.attempt,
    gate,
    decision: "APPROVED",
    actorId,
    predecessorReceiptId,
    ...snapshot,
    reason: "Automatic verification passed.",
    artifactRefs: [...artifactRefs],
    correctionOf: null,
    sequence: ++reviews.sequence.value,
    createdAt: new Date(now).toISOString(),
  };
  reviews.receipts.push(receipt);
  return receipt;
};
const findApprovedReceiptId = (
  reviews: ReviewStore,
  job: Job,
  gate: Gate,
): string | null =>
  reviews.receipts.find(
    (receipt) =>
      receipt.jobId === job.id &&
      receipt.attempt === job.attempt &&
      receipt.gate === gate &&
      receipt.decision === "APPROVED",
  )?.id ?? null;
// Shared by the /v1/jobs/:jobId/choices route and autoResolveChoice below,
// so a manual override and the automatic path apply identical evidence
// mutations. Throws CHOICE_NOT_CURRENT on any state mismatch.
function applyChoiceResolution(
  job: Job,
  resolution: {
    readonly choiceId: string;
    readonly polygonOrOwner:
      | { readonly ownerId: string }
      | { readonly polygon: readonly { x: number; y: number }[] };
    readonly reason: string;
  },
  now: number,
): void {
  const sceneInput = jobSceneInput(job);
  const choices = sceneInput.needsChoice ?? [];
  if (choices.length !== 1 || choices[0]?.choiceId !== resolution.choiceId)
    throw new Error("CHOICE_NOT_CURRENT");
  const resolvedOwner =
    "ownerId" in resolution.polygonOrOwner
      ? resolution.polygonOrOwner.ownerId
      : null;
  if (
    resolvedOwner &&
    !sceneInput.owners.some((owner) => owner.ownerId === resolvedOwner)
  )
    throw new Error("CHOICE_NOT_CURRENT");
  if (
    job.state !== "PREPARING" ||
    job.preparationStage !== "AWAITING_T2" ||
    !job.evidence
  )
    throw new Error("CHOICE_NOT_CURRENT");
  const nextEvidence = structuredClone(job.evidence);
  const rawSceneInput = nextEvidence["sceneInput"];
  if (!isRecord(rawSceneInput)) throw new Error("CHOICE_NOT_CURRENT");
  const resolvedAt = new Date(now).toISOString();
  nextEvidence["state"] = "MAPPED";
  nextEvidence["needsChoice"] = [];
  rawSceneInput["needsChoice"] = [];
  if ("polygon" in resolution.polygonOrOwner) {
    const points = resolution.polygonOrOwner.polygon;
    const x = Math.min(...points.map((point) => point.x));
    const y = Math.min(...points.map((point) => point.y));
    const width = Math.max(1, Math.max(...points.map((point) => point.x)) - x);
    const height = Math.max(1, Math.max(...points.map((point) => point.y)) - y);
    const ownerId = "foreground-subject";
    const owners = rawSceneInput["owners"];
    const assets = rawSceneInput["editableAssets"];
    const geometry = rawSceneInput["geometry"];
    const tracks = rawSceneInput["tracks"];
    const passes = rawSceneInput["passes"];
    if (
      !Array.isArray(owners) ||
      !Array.isArray(assets) ||
      !isRecord(geometry) ||
      !Array.isArray(tracks) ||
      !Array.isArray(passes) ||
      owners.some((owner) => isRecord(owner) && owner["ownerId"] === ownerId)
    )
      throw new Error("CHOICE_NOT_CURRENT");
    owners.push({
      ownerId,
      kind: "foreground-subject",
      editable: true,
      assetRef: "asset-foreground-subject",
      confidence: 1,
    });
    assets.push({
      assetId: "asset-foreground-subject",
      kind: "manual-matte",
      editable: true,
      owner: ownerId,
    });
    geometry[ownerId] = {
      boundsPerFrame: Array.from({ length: job.frameCount }, (_, frame) => ({
        frame,
        x,
        y,
        width,
        height,
      })),
      fixedWidth: true,
      fixedX: true,
    };
    tracks.push({
      trackId: "track-foreground-subject",
      owner: ownerId,
      lifecycle: {
        enter: { start: 0 },
        stable: { start: 0, end: job.frameCount - 1 },
        exit: { start: job.frameCount },
      },
      geometryRef: ownerId,
      effects: [],
    });
    const finalIndex = passes.findIndex(
      (pass) => isRecord(pass) && pass["passId"] === "final-composite",
    );
    passes.splice(finalIndex < 0 ? passes.length : finalIndex, 0, {
      passId: "foreground-subject-dom",
      owner: ownerId,
      kind: "DOM/SVG",
      shader: null,
      reads: ["manual choice polygon"],
      writes: "semantic-ui-layer",
    });
  }
  nextEvidence["choiceResolutions"] = [
    ...(Array.isArray(nextEvidence["choiceResolutions"])
      ? nextEvidence["choiceResolutions"]
      : []),
    { ...resolution, resolvedAt },
  ];
  job.evidence = nextEvidence;
  job.evidenceDigest = digest(nextEvidence);
  job.irDigest = digest({
    evidenceDigest: job.evidenceDigest,
    choice: resolution,
  });
  job.approved = false;
  job.candidateEvidence = null;
  job.candidateEvidenceDigest = null;
  job.pendingCompilation = null;
  job.compilation = null;
  job.previewSpecDigest = null;
  job.approvedSpecDigest = null;
  job.preparationStage = "COMPILATION_QUEUED";
  job.eligibleAt = now;
  job.progress = null;
  job.failureCode = null;
  job.updatedAt = resolvedAt;
  job.etag = `\"${digest({ jobId: job.id, resolvedAt })}\"`;
}
// Automatically resolves a pending T2 foreground-subject choice instead of
// waiting on a human pick: prefers the first candidate owner the compiler
// already detected, falling back to a centered default region only when no
// owner candidates exist at all. Re-queues compilation exactly like a
// manual resolution would, so the next compile pass picks up the choice.
function autoResolveChoice(job: Job, now: number): void {
  const parsed = z
    .object({ sceneInput: EvidenceSceneInput })
    .safeParse(reviewEvidence(job));
  if (!parsed.success) return;
  const sceneInput = parsed.data.sceneInput;
  const choices = sceneInput.needsChoice ?? [];
  const choice = choices[0];
  if (choices.length !== 1 || !choice) return;
  const firstOwner = sceneInput.owners[0];
  applyChoiceResolution(
    job,
    {
      choiceId: choice.choiceId,
      polygonOrOwner: firstOwner
        ? { ownerId: firstOwner.ownerId }
        : {
            polygon: [
              { x: 270, y: 480 },
              { x: 810, y: 480 },
              { x: 810, y: 1440 },
              { x: 270, y: 1440 },
            ],
          },
      reason: "Automatic: resolved without human review.",
    },
    now,
  );
}
// T2 and T3 previously required two separate human clicks over the same
// compiled artifact; since nothing new is produced between them, both are
// auto-approved in one step once compilation succeeds and no choice is
// pending (mirrors the old decide() T2/T3 branches, minus the HTTP round-trip).
// An unresolved foreground-subject choice is auto-resolved first (see
// autoResolveChoice) instead of waiting on ChoiceResolver's human input.
export function autoApproveT2T3(
  reviews: ReviewStore | undefined,
  job: Job,
  actorId: string,
  now: number,
): void {
  if (
    !reviews ||
    job.preparationStage !== "AWAITING_T2" ||
    !job.pendingCompilation
  )
    return;
  if (hasUnresolvedChoices(job)) {
    autoResolveChoice(job, now);
    return;
  }
  const t1 = findApprovedReceiptId(reviews, job, "T1");
  const t2 = writeAutoReceipt(reviews, job, "T2", actorId, now, [], t1);
  if (job.candidateEvidence) {
    job.evidence = job.candidateEvidence;
    job.candidateEvidence = null;
    job.candidateEvidenceDigest = null;
  }
  job.compilation = job.pendingCompilation;
  job.pendingCompilation = null;
  writeAutoReceipt(
    reviews,
    job,
    "T3",
    actorId,
    now,
    [job.compilation.authoring.versionId],
    t2.id,
  );
  job.preparationStage = "EVIDENCE_VIDEO_QUEUED";
  job.eligibleAt = now;
  job.progress = null;
  job.failureCode = null;
  job.updatedAt = new Date(now).toISOString();
  job.etag = `\"${id("etag")}\"`;
}
// The evidence-video step has no reviewer gate (see task A: gates were
// replaced with plain automatic stages) -- it just waits for the worker's
// artifact to land before advancing to the existing preview stage.
export function autoApproveEvidenceVideo(
  workflow: CreatorWorkflowStore,
  job: Job,
  now: number,
): void {
  if (
    (job.state !== "PREPARING" && job.state !== "STALE_APPROVAL") ||
    job.preparationStage !== "EVIDENCE_VIDEO_RUNNING"
  )
    return;
  if (!workflow.evidenceVideos.get(job.id)) return;
  job.preparationStage = "PREVIEW_QUEUED";
  job.eligibleAt = now;
  job.progress = null;
  job.failureCode = null;
  job.updatedAt = new Date(now).toISOString();
  job.etag = `\"${id("etag")}\"`;
}
export function autoApproveT4(
  reviews: ReviewStore | undefined,
  workflow: CreatorWorkflowStore,
  job: Job,
  actorId: string,
  now: number,
): void {
  if (
    !reviews ||
    (job.state !== "PREPARING" && job.state !== "STALE_APPROVAL") ||
    job.preparationStage !== "AWAITING_T4" ||
    !job.compilation ||
    job.previewSpecDigest !== job.compilation.browserPassSpec.digest
  )
    return;
  const preview = workflow.previews.get(job.id);
  if (!preview) return;
  writeAutoReceipt(
    reviews,
    job,
    "T4",
    actorId,
    now,
    [preview.id],
    findApprovedReceiptId(reviews, job, "T3"),
  );
  // A job that asked for a generated scene (job.generation is set) is not
  // done yet -- the AI still has to author a SceneSpec from this approved
  // evidence plus the creator's brief before there is anything to deliver.
  // Route it to AUTHORING_QUEUED instead of READY. A restore-only job (no
  // job.generation) has nothing left to author, so it takes the exact path
  // it always has -- straight to READY, unchanged.
  if (job.generation) {
    job.preparationStage = "AUTHORING_QUEUED";
    job.eligibleAt = now;
    job.failureCode = null;
    job.updatedAt = new Date(now).toISOString();
    job.etag = `\"${id("etag")}\"`;
    return;
  }
  assertLegalTransition(job.state, "READY");
  job.state = "READY";
  job.preparationStage = "READY";
  job.approvedSpecDigest = job.compilation.browserPassSpec.digest;
  const attempt = workflow.attempts.get(job.id)?.at(-1);
  if (attempt) attempt.state = "COMPLETED";
  job.failureCode = null;
  job.updatedAt = new Date(now).toISOString();
  job.etag = `\"${id("etag")}\"`;
}
export function autoApproveT5(
  reviews: ReviewStore | undefined,
  workflow: CreatorWorkflowStore,
  job: Job,
  actorId: string,
  now: number,
): void {
  if (!reviews || job.state !== "AWAITING_T5") return;
  const staged = workflow.stagedArtifacts.get(job.id);
  if (!staged) return;
  writeAutoReceipt(
    reviews,
    job,
    "T5",
    actorId,
    now,
    [staged.id],
    findApprovedReceiptId(reviews, job, "T4"),
  );
  if (!publishStagedArtifact(workflow, job)) return;
  job.approved = true;
  const attempt = workflow.attempts.get(job.id)?.at(-1);
  if (attempt) attempt.state = "COMPLETED";
  job.failureCode = null;
}
const fail = (
  reply: FastifyReply,
  code: string,
  status = 400,
  predecessor?: {
    sceneVersion?: number;
    sceneDigest?: string;
    artifactId?: string;
  },
): void => {
  reply.code(status).send(
    safeEnvelope(new Error(code), String(reply.getHeader("x-correlation-id")), {
      ...(predecessor?.sceneDigest ||
      predecessor?.sceneVersion !== undefined ||
      predecessor?.artifactId
        ? {
            safePredecessor: {
              ...(predecessor.sceneVersion !== undefined
                ? { sceneVersion: predecessor.sceneVersion }
                : {}),
              ...(predecessor.sceneDigest
                ? { sceneDigest: predecessor.sceneDigest }
                : {}),
              ...(predecessor.artifactId
                ? { artifactId: predecessor.artifactId }
                : {}),
            },
          }
        : {}),
    }),
  );
};
const artifactBody = (artifact: StoredArtifact) =>
  artifact.storagePath
    ? createReadStream(artifact.storagePath)
    : Buffer.from(artifact.bytes);
const command = (
  store: CreatorWorkflowStore,
  request: FastifyRequest,
  tenantId: string,
  scope: string,
  action: () => readonly [number, Record<string, unknown>],
): readonly [number, SafeRecord] => {
  const key = requestHeader(request, "idempotency-key");
  if (!key) throw new Error("INVALID_REQUEST");
  const replay = store.idempotency.execute(
    scope,
    key,
    requestHash(request.body ?? {}),
    tenantId,
    action,
  );
  return replay.response;
};
type SafeRecord = Record<string, unknown>;
const owned = (
  store: CreatorWorkflowStore,
  idValue: string,
  tenantId: string,
): Job => {
  const job = store.jobs.get(idValue);
  if (!job || job.tenantId !== tenantId) throw new Error("RESOURCE_NOT_FOUND");
  return job;
};
const edit = (job: Job, request: FastifyRequest): void => {
  const match = requestHeader(request, "if-match");
  if (!match || match !== job.etag) throw new Error("VERSION_CONFLICT");
};
export const transitionJob = (
  job: Job,
  next: JobState,
  now = Date.now,
): void => {
  assertLegalTransition(job.state, next);
  job.state = next;
  job.updatedAt = new Date(now()).toISOString();
  job.etag = `\"${digest(job.updatedAt)}\"`;
};
// Shared by the creator-facing /v1/jobs/:jobId/cancel route and admin's job
// cancel mutation, so both operate on the same live job with identical rules.
export function cancelJob(
  store: CreatorWorkflowStore,
  workers: WorkerStore | undefined,
  job: Job,
  now: () => number,
  transitionNow: () => number = store.now,
): void {
  const lease = workers?.leases.get(job.id);
  const activelyLeased = lease !== undefined && lease.expiresAt > now();
  transitionJob(job, "CANCEL_REQUESTED", transitionNow);
  if (!activelyLeased) {
    workers?.leases.delete(job.id);
    transitionJob(job, "CANCELLED", transitionNow);
    const attempt = lease
      ? store.attempts.get(job.id)?.find((item) => item.id === lease.attemptId)
      : store.attempts.get(job.id)?.at(-1);
    if (attempt) attempt.state = "CANCELLED";
  }
}
// Shared by the creator-facing /v1/jobs/:jobId/retry route and admin's job
// retry mutation. Throws JOB_NOT_RETRYABLE if the job isn't FAILED/CANCELLED.
export function retryJob(
  store: CreatorWorkflowStore,
  reviews: ReviewStore | undefined,
  job: Job,
): void {
  if (!["FAILED", "CANCELLED"].includes(job.state))
    throw new Error("JOB_NOT_RETRYABLE");
  job.attempt += 1;
  job.state = "PREPARING";
  job.approved = false;
  job.evidence = null;
  job.candidateEvidence = null;
  job.candidateEvidenceDigest = null;
  job.preparationStage = "AWAITING_T1";
  job.pendingCompilation = null;
  job.compilation = null;
  job.previewSpecDigest = null;
  job.approvedSpecDigest = null;
  job.eligibleAt = store.now();
  job.automaticRetries = 0;
  job.failureCode = null;
  job.runtimePreflight = store.availablePreflight;
  job.progress = null;
  job.artifact = null;
  job.lastPatchChangedBeatIds = null;
  store.previews.delete(job.id);
  store.stagedArtifacts.delete(job.id);
  store.stagedScenePackages.delete(job.id);
  // Leaving these behind lets a retry reuse the previous attempt's
  // evidence video and, worse, its safety sample.
  store.previewsLabeled.delete(job.id);
  store.evidenceVideos.delete(job.id);
  store.safetySamples.delete(job.id);
  clearGeneratedAssets(store, job.id);
  job.evidenceDigest = digest({ upload: job.uploadId, attempt: job.attempt });
  job.irDigest = digest({
    upload: job.uploadId,
    attempt: job.attempt,
    ir: true,
  });
  job.updatedAt = new Date(store.now()).toISOString();
  job.etag = `\"${digest(job.id + job.attempt)}\"`;
  const attempt: Attempt = {
    id: id("attempt"),
    number: job.attempt,
    state: "QUEUED",
    immutable: true,
  };
  store.attempts.get(job.id)?.push(attempt);
  autoApproveT1(reviews, job, job.creatorId, store.now());
}

export const publishStagedArtifact = (
  store: CreatorWorkflowStore,
  job: Job,
): boolean => {
  const artifact = store.stagedArtifacts.get(job.id);
  const scenePackage = store.stagedScenePackages.get(job.id);
  if (
    !artifact ||
    (artifact.kind !== "delivery" && artifact.kind !== "generated-delivery") ||
    (artifact.kind === "generated-delivery" &&
      job.runtimePreflight?.tar === true &&
      !scenePackage) ||
    job.state !== "AWAITING_T5"
  )
    return false;
  assertLegalTransition(job.state, "COMPLETED");
  store.stagedArtifacts.delete(job.id);
  store.artifacts.set(artifact.id, artifact);
  if (scenePackage) {
    store.stagedScenePackages.delete(job.id);
    store.scenePackages.set(job.id, scenePackage);
  }
  job.artifact = {
    id: artifact.id,
    kind: artifact.kind,
    expiresAt: artifact.expiresAt,
  };
  job.state = "COMPLETED";
  job.updatedAt = new Date(store.now()).toISOString();
  job.etag = `"${digest(job.updatedAt)}"`;
  return true;
};

const currentT4Approval = (reviews: ReviewStore | undefined, job: Job) =>
  reviews?.receipts.findLast(
    (receipt) =>
      receipt.jobId === job.id &&
      receipt.attempt === job.attempt &&
      receipt.gate === "T4" &&
      receipt.decision === "APPROVED" &&
      receipt.evidenceDigest === job.evidenceDigest &&
      receipt.irDigest === job.irDigest &&
      receipt.runtimeDigest === job.runtimePreflight?.runtimeDigest &&
      receipt.releaseBaselineDigest === RELEASE_BASELINE_DIGEST,
  ) ?? null;

export function registerCreatorWorkflow(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
  uploads: UploadStore,
  reviews?: ReviewStore,
  workers?: WorkerStore,
  now: () => number = store.now,
  aiFrameSelection?: {
    readonly db: Database.Database;
    readonly aiSecretKey: string;
    readonly generate?: Parameters<
      typeof selectInitialStartFrame
    >[0]["generate"];
  },
  featureFlags: FeatureFlagSnapshot = {
    verifiedMotionAuthoring: false,
    nativeSceneV2: false,
    adobeMcp: false,
  },
): void {
  const tenant = (request: FastifyRequest): string =>
    requestHeader(request, "x-tenant-id") ?? "";
  app.post(
    "/v1/jobs",
    async (
      request: FastifyRequest<{
        Body: {
          uploadId: string;
          startFrame?: number;
          sourceFps?: number;
          outputProfile?: string;
          prompt?: string;
          generation?: unknown;
        };
      }>,
      reply,
    ) => {
      try {
        const generationParsed =
          request.body.generation === undefined
            ? undefined
            : GenerationConfigSchema.safeParse(request.body.generation);
        if (generationParsed && !generationParsed.success) {
          fail(reply, "INVALID_REQUEST");
          return;
        }
        const generation = generationParsed?.success
          ? generationParsed.data
          : undefined;
        if (generation) {
          if (!featureFlags.verifiedMotionAuthoring) {
            fail(reply, "MOTION_AUTHORING_DISABLED", 403);
            return;
          }
          // The generate track cannot finish without an AI provider: the
          // authoring stage calls one, and authorScene fails closed when
          // there is none. Checking here rather than only there turns a
          // ten-minute wait -- analysis, compilation, evidence video and
          // preview all run first -- into an immediate, nameable refusal.
          // Skipped when aiFrameSelection is absent (tests construct the
          // app without a database); authoring still fails closed there.
          if (aiFrameSelection) {
            const ai = getAiProviderSettings(aiFrameSelection.db);
            if (!ai.enabled || !ai.hasApiKey) {
              fail(reply, "AI_PROVIDER_NOT_CONFIGURED");
              return;
            }
            // And a material provider, for the same reason one stage
            // later. Which assets a scene needs is the model's decision,
            // not the creator's, so "this brief might not need generated
            // material" is not a promise anyone can make at this point --
            // a generate-track job without a material provider is a job
            // that fails somewhere between authoring and the render.
            const material = getMaterialProviderSettings(aiFrameSelection.db);
            if (!material.enabled || !material.hasApiKey) {
              fail(reply, "MATERIAL_PROVIDER_NOT_CONFIGURED");
              return;
            }
          }
          const requestTenant = tenant(request);
          for (const attachmentId of generation.attachmentIds) {
            try {
              ownedAttachment(uploads, requestTenant, attachmentId);
            } catch (error) {
              if (error instanceof UploadFailure) {
                fail(reply, "INVALID_REQUEST");
                return;
              }
              throw error;
            }
          }
        }
        // Frame selection can call out to an AI provider, so it runs before
        // the synchronous command()/idempotency block below rather than
        // inside it -- command()'s action callback is not async.
        let resolvedStart = Number(request.body.startFrame);
        const prompt =
          typeof request.body.prompt === "string"
            ? request.body.prompt.slice(0, 2000) || null
            : null;
        if (!Number.isInteger(resolvedStart) && aiFrameSelection) {
          const upload = uploads.uploads.get(request.body.uploadId);
          if (upload?.media) {
            const windowFrames = upload.media.fps * 4;
            const selection = await selectInitialStartFrame({
              prompt,
              min: 0,
              max: Math.max(0, upload.media.frameCount - windowFrames),
              db: aiFrameSelection.db,
              aiSecretKey: aiFrameSelection.aiSecretKey,
              ...(aiFrameSelection.generate
                ? { generate: aiFrameSelection.generate }
                : {}),
            });
            resolvedStart = selection.startFrame;
          }
        }
        const response = command(
          store,
          request,
          tenant(request),
          "job-create",
          () => {
            const upload = uploads.uploads.get(request.body.uploadId);
            if (!upload || upload.tenantId !== tenant(request))
              throw new Error("RESOURCE_NOT_FOUND");
            if (upload.state !== "ACCEPTED")
              throw new Error("UPLOAD_QUARANTINED");
            const principal = (
              request as FastifyRequest & {
                authenticatedPrincipal?: Principal;
              }
            ).authenticatedPrincipal;
            if (!principal) throw new Error("AUTHENTICATION_REQUIRED");
            const requestedFps = Number(request.body.sourceFps);
            const start = resolvedStart;
            const fps = upload.media?.fps;
            const frames = upload.media?.frameCount;
            if (
              fps === undefined ||
              frames === undefined ||
              requestedFps !== fps ||
              request.body.outputProfile !== "vertical-1080p30" ||
              !Number.isInteger(start) ||
              start < 0 ||
              start + fps * 4 > frames
            )
              throw new Error("INTERVAL_INVALID");
            const job: Job = {
              id: id("job"),
              tenantId: tenant(request),
              creatorId: principal.userId,
              uploadId: upload.id,
              state: "PREPARING",
              attempt: 1,
              etag: `\"${digest(upload.id)}\"`,
              createdAt: new Date(store.now()).toISOString(),
              updatedAt: new Date(store.now()).toISOString(),
              irDigest: digest({ upload: upload.id }),
              evidenceDigest: digest({ upload: upload.id, evidence: true }),
              approved: false,
              startFrame: start,
              sourceFps: fps,
              frameCount: fps * 4,
              creativePrompt: prompt,
              evidence: null,
              candidateEvidence: null,
              candidateEvidenceDigest: null,
              preparationStage: "AWAITING_T1",
              pendingCompilation: null,
              compilation: null,
              previewSpecDigest: null,
              approvedSpecDigest: null,
              eligibleAt: store.now(),
              automaticRetries: 0,
              deletionEpoch: 0,
              restoreEpoch: 0,
              failureCode: null,
              failureReason: null,
              runtimePreflight: store.availablePreflight,
              ...(generation ? { generation } : {}),
              authoredScene: null,
              sceneSpecDigest: null,
              lastPatchChangedBeatIds: null,
              progress: null,
              artifact: null,
            };
            const attempt: Attempt = {
              id: id("attempt"),
              number: 1,
              state: "QUEUED",
              immutable: true,
            };
            store.jobs.set(job.id, job);
            store.attempts.set(job.id, [attempt]);
            autoApproveT1(reviews, job, principal.userId, store.now());
            return [201, projection(store, job, reviews)];
          },
        );
        reply.code(response[0]).send(response[1]);
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          error instanceof Error && error.message === "RESOURCE_NOT_FOUND"
            ? 404
            : 400,
        );
      }
    },
  );
  app.get(
    "/v1/jobs",
    async (
      request: FastifyRequest<{
        Querystring: {
          limit?: number;
          after?: string;
          q?: string;
          state?: string;
        };
      }>,
      reply,
    ) => {
      const limit = Number(request.query.limit ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        fail(reply, "INVALID_REQUEST");
        return;
      }
      const start = Number(request.query.after ?? 0);
      if (
        !Number.isInteger(start) ||
        start < 0 ||
        String(start) !== String(request.query.after ?? 0)
      ) {
        fail(reply, "CURSOR_INVALID");
        return;
      }
      const query = request.query.q?.toLocaleLowerCase();
      const jobs = [...store.jobs.values()].filter(
        (job) =>
          job.tenantId === tenant(request) &&
          (!request.query.state || job.state === request.query.state) &&
          (!query ||
            [job.id, job.state, job.uploadId].some((value) =>
              value.toLocaleLowerCase().includes(query),
            )),
      );
      const items = jobs
        .slice(start, start + limit)
        .map((job) => projection(store, job, reviews));
      const hasNextPage = start + items.length < jobs.length;
      reply.send({
        items,
        nextCursor: hasNextPage ? String(start + items.length) : null,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: start > 0,
        },
      });
    },
  );
  app.get(
    "/v1/jobs/:jobId",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        reply.send(
          projection(
            store,
            owned(store, request.params.jobId, tenant(request)),
            reviews,
          ),
        );
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/attempts",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        owned(store, request.params.jobId, tenant(request));
        reply.send({
          items: store.attempts.get(request.params.jobId) ?? [],
          pageInfo: { hasNextPage: false, hasPreviousPage: false },
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.post(
    "/v1/jobs/:jobId/cancel",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const result = command(
          store,
          request,
          tenant(request),
          "job-cancel",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            cancelJob(store, workers, job, now, store.now);
            return [202, { state: job.state }];
          },
        );
        reply.code(result[0]).send(result[1]);
      } catch (error) {
        const failed = store.jobs.get(request.params.jobId);
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          409,
          failed
            ? {
                ...(failed.sceneSpecDigest
                  ? { sceneDigest: failed.sceneSpecDigest }
                  : {}),
                ...(failed.artifact?.id
                  ? { artifactId: failed.artifact.id }
                  : {}),
              }
            : undefined,
        );
      }
    },
  );
  app.post(
    "/v1/jobs/:jobId/retry",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const result = command(
          store,
          request,
          tenant(request),
          "job-retry",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            retryJob(store, reviews, job);
            return [201, projection(store, job, reviews)];
          },
        );
        reply.code(result[0]).send(result[1]);
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          409,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/source-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const upload = uploads.uploads.get(job.uploadId);
        if (
          !upload ||
          upload.tenantId !== job.tenantId ||
          upload.state !== "ACCEPTED"
        )
          throw new Error("ARTIFACT_UNAVAILABLE");
        const sourcePath = uploadSourcePath(upload);
        const memorySource = sourcePath ? null : Buffer.concat(upload.chunks);
        return reply
          .header("content-type", upload.contentType)
          .header("content-length", upload.actualBytes)
          .header("content-disposition", 'inline; filename="reference.mp4"')
          .send(
            sourcePath
              ? createReadStream(sourcePath)
              : (memorySource ?? Buffer.alloc(0)),
          );
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/preview-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const preview = store.previews.get(job.id);
        if (!preview || preview.kind !== "preview")
          throw new Error("ARTIFACT_UNAVAILABLE");
        return reply
          .header("content-type", preview.contentType)
          .header("content-length", preview.sizeBytes)
          .header(
            "content-disposition",
            `inline; filename="${preview.filename}"`,
          )
          .send(artifactBody(preview));
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/preview-labeled-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const labeled = store.previewsLabeled.get(job.id);
        if (!labeled || labeled.kind !== "preview-labeled")
          throw new Error("ARTIFACT_UNAVAILABLE");
        return reply
          .header("content-type", labeled.contentType)
          .header("content-length", labeled.sizeBytes)
          .header(
            "content-disposition",
            `inline; filename="${labeled.filename}"`,
          )
          .send(artifactBody(labeled));
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/evidence-video-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const evidenceVideo = store.evidenceVideos.get(job.id);
        if (!evidenceVideo || evidenceVideo.kind !== "evidence-video")
          throw new Error("ARTIFACT_UNAVAILABLE");
        return reply
          .header("content-type", evidenceVideo.contentType)
          .header("content-length", evidenceVideo.sizeBytes)
          .header(
            "content-disposition",
            `inline; filename="${evidenceVideo.filename}"`,
          )
          .send(artifactBody(evidenceVideo));
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/evidence",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const evidence = reviewEvidence(job);
        if (!evidence) throw new Error("ARTIFACT_UNAVAILABLE");
        reply.send({ ...evidence, digest: job.evidenceDigest });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/authoring-ir",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        reply.header("etag", job.etag).send({
          digest: job.compilation?.authoring.digest ?? job.irDigest,
          versionId: job.compilation?.authoring.versionId ?? null,
          candidateDigest: job.pendingCompilation?.authoring.digest ?? null,
          preparationStage: job.preparationStage,
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.patch(
    "/v1/jobs/:jobId/authoring-ir",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const result = command(
          store,
          request,
          tenant(request),
          "ir-edit",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            if (
              !job.evidence ||
              !job.compilation ||
              (job.state !== "READY" && job.state !== "STALE_APPROVAL")
            )
              throw new Error("JOB_NOT_READY");
            const patch = AuthoringPatch.parse(request.body);
            const candidate = structuredClone(job.evidence);
            const sceneInput = candidate["sceneInput"];
            if (!isRecord(sceneInput)) throw new Error("EDIT_COMPILE_FAILED");
            for (const operation of patch.ops) {
              const segments = operation.path
                .slice(1)
                .split("/")
                .map((part) =>
                  part.replaceAll("~1", "/").replaceAll("~0", "~"),
                );
              const [group, ownerId, effectName] = segments;
              if (group === "copy" && ownerId && segments.length === 2) {
                const value = z.string().max(500).parse(operation.value);
                const owners = sceneInput["owners"];
                const owner = Array.isArray(owners)
                  ? owners.find(
                      (item) => isRecord(item) && item["ownerId"] === ownerId,
                    )
                  : undefined;
                if (!isRecord(owner)) throw new Error("INVALID_REQUEST");
                owner["content"] = value;
              } else if (
                group === "geometry" &&
                ownerId &&
                segments.length === 2
              ) {
                const value = GeometryEdit.parse(operation.value);
                const geometry = sceneInput["geometry"];
                const ownerGeometry = isRecord(geometry)
                  ? geometry[ownerId]
                  : undefined;
                if (!isRecord(ownerGeometry))
                  throw new Error("INVALID_REQUEST");
                const bounds = ownerGeometry["boundsPerFrame"];
                if (!Array.isArray(bounds) || bounds.length === 0)
                  throw new Error("INVALID_REQUEST");
                ownerGeometry["boundsPerFrame"] = bounds.map((sample) => ({
                  frame:
                    isRecord(sample) && Number.isInteger(sample["frame"])
                      ? sample["frame"]
                      : 0,
                  ...value,
                }));
              } else if (group === "passOrder" && segments.length === 1) {
                const value = z.array(z.string().min(1)).parse(operation.value);
                const passes = sceneInput["passes"];
                if (!Array.isArray(passes)) throw new Error("INVALID_REQUEST");
                const byId = new Map(
                  passes.flatMap((item) =>
                    isRecord(item) && typeof item["passId"] === "string"
                      ? [[item["passId"], item] as const]
                      : [],
                  ),
                );
                if (
                  value.length !== byId.size ||
                  new Set(value).size !== value.length ||
                  value.some((passId) => !byId.has(passId))
                )
                  throw new Error("INVALID_REQUEST");
                sceneInput["passes"] = value.map((passId) => byId.get(passId));
              } else if (
                group === "effects" &&
                ownerId &&
                effectName &&
                segments.length === 3
              ) {
                const value = z.number().finite().parse(operation.value);
                const effects = sceneInput["effects"];
                const ownerEffects = isRecord(effects)
                  ? effects[ownerId]
                  : undefined;
                const effect = isRecord(ownerEffects)
                  ? ownerEffects[effectName]
                  : undefined;
                const samples = isRecord(effect)
                  ? effect["samples"]
                  : undefined;
                const measured = Array.isArray(samples)
                  ? samples.flatMap((sample) =>
                      isRecord(sample) && typeof sample["value"] === "number"
                        ? [sample["value"]]
                        : [],
                    )
                  : [];
                if (
                  !isRecord(effect) ||
                  !Array.isArray(samples) ||
                  measured.length === 0 ||
                  value < Math.min(...measured) ||
                  value > Math.max(...measured)
                )
                  throw new Error("INVALID_REQUEST");
                effect["samples"] = samples.map((sample) => ({
                  ...(isRecord(sample) ? sample : {}),
                  value,
                }));
              } else if (
                group === "assets" &&
                ownerId &&
                segments.length === 2
              ) {
                const assetId = z
                  .string()
                  .min(1)
                  .max(200)
                  .parse(operation.value);
                const assets = sceneInput["editableAssets"];
                const owners = sceneInput["owners"];
                const validAsset =
                  Array.isArray(assets) &&
                  assets.some(
                    (asset) =>
                      isRecord(asset) &&
                      asset["assetId"] === assetId &&
                      asset["owner"] === ownerId,
                  );
                const owner = Array.isArray(owners)
                  ? owners.find(
                      (item) => isRecord(item) && item["ownerId"] === ownerId,
                    )
                  : undefined;
                if (!validAsset || !isRecord(owner))
                  throw new Error("INVALID_REQUEST");
                owner["assetRef"] = assetId;
              } else {
                throw new Error("INVALID_REQUEST");
              }
            }
            const candidateDigest = digest(candidate);
            job.candidateEvidence = candidate;
            job.candidateEvidenceDigest = candidateDigest;
            job.evidenceDigest = candidateDigest;
            job.irDigest = digest({ candidateDigest, pending: true });
            job.pendingCompilation = null;
            job.previewSpecDigest = null;
            job.approvedSpecDigest = null;
            job.approved = false;
            job.preparationStage = "COMPILATION_QUEUED";
            job.eligibleAt = store.now();
            job.progress = null;
            job.failureCode = null;
            if (job.state === "READY")
              transitionJob(job, "STALE_APPROVAL", store.now);
            else {
              job.updatedAt = new Date(store.now()).toISOString();
              job.etag = `\"${digest(job.updatedAt)}\"`;
            }
            return [
              202,
              {
                state: "PREPARING",
                preparationStage: job.preparationStage,
                evidenceDigest: candidateDigest,
                etag: job.etag,
              },
            ];
          },
        );
        reply.code(result[0]).send(result[1]);
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          409,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/preview",
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
        Querystring: { frame?: number };
      }>,
      reply,
    ) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const frame = Number(request.query.frame ?? 0);
        if (!Number.isInteger(frame) || frame < 0 || frame >= job.frameCount)
          throw new Error("FRAME_OUT_OF_RANGE");
        const preview = store.previews.get(job.id);
        if (!preview) throw new Error("ARTIFACT_UNAVAILABLE");
        reply.send({
          frame,
          artifactId: preview.id,
          url: `/v1/jobs/${encodeURIComponent(job.id)}/preview-download`,
          sha256: preview.sha256,
          irDigest: job.irDigest,
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/topology",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const sceneInput = jobSceneInput(job);
        reply.send({
          version: 1,
          digest: digest({
            owners: sceneInput.owners,
            tracks: sceneInput.tracks,
          }),
          owners: sceneInput.owners,
          tracks: sceneInput.tracks,
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/choices",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const choices = jobSceneInput(job).needsChoice ?? [];
        reply.send({
          version: 1,
          digest: digest(choices),
          choices,
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.post(
    "/v1/jobs/:jobId/choices",
    async (
      request: FastifyRequest<{ Params: { jobId: string }; Body: unknown }>,
      reply,
    ) => {
      try {
        const result = command(
          store,
          request,
          tenant(request),
          "evidence-choice",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            const body = ChoiceResolveRequest.parse(request.body);
            const sceneInput = jobSceneInput(job);
            const choices = sceneInput.needsChoice ?? [];
            if (choices.length !== 1 || choices[0]?.choiceId !== body.choiceId)
              throw new Error("CHOICE_NOT_CURRENT");
            const resolvedOwner =
              "ownerId" in body.polygonOrOwner
                ? body.polygonOrOwner.ownerId
                : null;
            if (
              resolvedOwner &&
              !sceneInput.owners.some(
                (owner) => owner.ownerId === resolvedOwner,
              )
            )
              throw new Error("CHOICE_NOT_CURRENT");
            if (
              job.state !== "PREPARING" ||
              job.preparationStage !== "AWAITING_T2" ||
              !job.evidence
            )
              throw new Error("CHOICE_NOT_CURRENT");
            const nextEvidence = structuredClone(job.evidence);
            const rawSceneInput = nextEvidence["sceneInput"];
            if (!isRecord(rawSceneInput)) throw new Error("CHOICE_NOT_CURRENT");
            const resolvedAt = new Date(store.now()).toISOString();
            nextEvidence["state"] = "MAPPED";
            nextEvidence["needsChoice"] = [];
            rawSceneInput["needsChoice"] = [];
            if ("polygon" in body.polygonOrOwner) {
              const points = body.polygonOrOwner.polygon;
              const x = Math.min(...points.map((point) => point.x));
              const y = Math.min(...points.map((point) => point.y));
              const width = Math.max(
                1,
                Math.max(...points.map((point) => point.x)) - x,
              );
              const height = Math.max(
                1,
                Math.max(...points.map((point) => point.y)) - y,
              );
              const ownerId = "foreground-subject";
              const owners = rawSceneInput["owners"];
              const assets = rawSceneInput["editableAssets"];
              const geometry = rawSceneInput["geometry"];
              const tracks = rawSceneInput["tracks"];
              const passes = rawSceneInput["passes"];
              if (
                !Array.isArray(owners) ||
                !Array.isArray(assets) ||
                !isRecord(geometry) ||
                !Array.isArray(tracks) ||
                !Array.isArray(passes) ||
                owners.some(
                  (owner) => isRecord(owner) && owner["ownerId"] === ownerId,
                )
              )
                throw new Error("CHOICE_NOT_CURRENT");
              owners.push({
                ownerId,
                kind: "foreground-subject",
                editable: true,
                assetRef: "asset-foreground-subject",
                confidence: 1,
              });
              assets.push({
                assetId: "asset-foreground-subject",
                kind: "manual-matte",
                editable: true,
                owner: ownerId,
              });
              geometry[ownerId] = {
                boundsPerFrame: Array.from(
                  { length: job.frameCount },
                  (_, frame) => ({
                    frame,
                    x,
                    y,
                    width,
                    height,
                  }),
                ),
                fixedWidth: true,
                fixedX: true,
              };
              tracks.push({
                trackId: "track-foreground-subject",
                owner: ownerId,
                lifecycle: {
                  enter: { start: 0 },
                  stable: { start: 0, end: job.frameCount - 1 },
                  exit: { start: job.frameCount },
                },
                geometryRef: ownerId,
                effects: [],
              });
              const finalIndex = passes.findIndex(
                (pass) =>
                  isRecord(pass) && pass["passId"] === "final-composite",
              );
              passes.splice(finalIndex < 0 ? passes.length : finalIndex, 0, {
                passId: "foreground-subject-dom",
                owner: ownerId,
                kind: "DOM/SVG",
                shader: null,
                reads: ["manual choice polygon"],
                writes: "semantic-ui-layer",
              });
            }
            nextEvidence["choiceResolutions"] = [
              ...(Array.isArray(nextEvidence["choiceResolutions"])
                ? nextEvidence["choiceResolutions"]
                : []),
              { ...body, resolvedAt },
            ];
            job.evidence = nextEvidence;
            job.evidenceDigest = digest(nextEvidence);
            job.irDigest = digest({
              evidenceDigest: job.evidenceDigest,
              choice: body,
            });
            job.approved = false;
            job.candidateEvidence = null;
            job.candidateEvidenceDigest = null;
            job.pendingCompilation = null;
            job.compilation = null;
            job.previewSpecDigest = null;
            job.approvedSpecDigest = null;
            job.preparationStage = "COMPILATION_QUEUED";
            job.eligibleAt = store.now();
            job.progress = null;
            job.failureCode = null;
            job.updatedAt = resolvedAt;
            job.etag = `\"${digest({ jobId: job.id, resolvedAt })}\"`;
            return [
              201,
              {
                evidenceDigest: job.evidenceDigest,
                irDigest: job.irDigest,
              },
            ];
          },
        );
        reply.code(result[0]).send(result[1]);
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          409,
        );
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/render",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const unresolved = hasUnresolvedChoices(job);
        reply.send({
          eligible:
            !unresolved &&
            job.state === "READY" &&
            currentT4Approval(reviews, job) !== null,
          reason: unresolved
            ? "UNRESOLVED_CHOICE_SKIPPED"
            : job.state !== "READY"
              ? "JOB_NOT_READY"
              : currentT4Approval(reviews, job)
                ? null
                : "T4_APPROVAL_REQUIRED",
        });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
  app.post(
    "/v1/jobs/:jobId/render",
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
        Body: Record<string, never>;
      }>,
      reply,
    ) => {
      try {
        const result = command(
          store,
          request,
          tenant(request),
          "render-launch",
          () => {
            const job = owned(store, request.params.jobId, tenant(request));
            edit(job, request);
            if (job.state !== "READY") throw new Error("JOB_NOT_READY");
            // No role gate here. Whoever owns the job and has taken it through
            // review is the person who queues it; the list this used to check
            // was OWNER and ADMIN, which left the platform's own super admin
            // -- the only account there is -- unable to launch a render at
            // all. Tenancy still scopes the job (`owned` above), and the state,
            // choice and approval checks below still hold.
            if (hasUnresolvedChoices(job))
              throw new Error("UNRESOLVED_CHOICE_SKIPPED");
            if (!currentT4Approval(reviews, job))
              throw new Error("APPROVAL_REQUIRED");
            job.approved = true;
            transitionJob(job, "QUEUED", store.now);
            return [
              202,
              {
                state: "QUEUED",
                attemptId: store.attempts.get(job.id)?.at(-1)?.id,
              },
            ];
          },
        );
        reply.code(result[0]).send(result[1]);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
        fail(reply, code, code === "ROLE_NOT_PERMITTED" ? 403 : 409);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/delivery-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const artifact = job.artifact
          ? store.artifacts.get(job.artifact.id)
          : undefined;
        const gated =
          job.generation && aiFrameSelection
            ? currentDeliveryGate(aiFrameSelection.db, store, job)
            : null;
        if (
          job.state !== "COMPLETED" ||
          !artifact ||
          (job.generation && gated?.delivery.id !== artifact.id)
        )
          throw new Error("ARTIFACT_UNAVAILABLE");
        return reply
          .header("content-type", artifact.contentType)
          .header(
            "content-disposition",
            `attachment; filename="${artifact.filename}"`,
          )
          .send(artifactBody(artifact));
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
  app.get(
    "/v1/jobs/:jobId/report-download",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = owned(store, request.params.jobId, tenant(request));
        const artifact = job.artifact
          ? store.artifacts.get(job.artifact.id)
          : undefined;
        const gated =
          job.generation && aiFrameSelection
            ? currentDeliveryGate(aiFrameSelection.db, store, job)
            : null;
        if (
          job.state !== "COMPLETED" ||
          !artifact?.report ||
          (job.generation &&
            (gated?.backend !== "adobe" || gated.delivery.id !== artifact.id))
        )
          throw new Error("ARTIFACT_UNAVAILABLE");
        reply
          .header("content-type", "application/json; charset=utf-8")
          .header(
            "content-disposition",
            `attachment; filename="${job.id}-render-report.json"`,
          )
          .send(artifact.report);
      } catch {
        fail(reply, "ARTIFACT_UNAVAILABLE", 404);
      }
    },
  );
}
