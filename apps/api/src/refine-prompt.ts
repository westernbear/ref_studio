import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { generateObject, type LanguageModel } from "ai";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { aiModelFromSettings } from "./ai-model-from-settings.js";
import { IdempotencyStore, requestHash, safeEnvelope } from "./boundary.js";
import type { CreatorWorkflowStore, Job } from "./creator-workflow.js";
import { patchScene, type GeneratePatch } from "./patch-scene.js";
import type { UploadStore } from "./uploads.js";
import { assertLegalTransition } from "../../../packages/contracts/src/lifecycle.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import type { SceneOperationBatchV1 } from "../../../packages/contracts/src/motion.js";
import type { SceneSpec } from "../../../packages/contracts/src/scene-spec.js";
import { applySceneOperations } from "./motion-scene.js";
import {
  recordMotionSceneRefinement,
  replayMotionSceneMutation,
} from "./motion-scene-store.js";

const id = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString("base64url")}`;
const header = (request: FastifyRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
};
const fail = (reply: FastifyReply, code: string, status = 400): void => {
  reply
    .code(status)
    .send(
      safeEnvelope(
        new Error(code),
        String(reply.getHeader("x-correlation-id")),
      ),
    );
};
const statusFor = (code: string): number =>
  code === "RESOURCE_NOT_FOUND"
    ? 404
    : code === "AUTHENTICATION_REQUIRED"
      ? 401
      : code === "PRECONDITION_REQUIRED"
        ? 428
        : code === "VERSION_CONFLICT"
          ? 409
          : code === "JOB_NOT_READY_FOR_PATCH"
            ? 409
            : code === "SCENE_VERIFICATION_FAILED"
              ? 409
              : 400;

export type RefineProposal = {
  readonly startFrame: number;
  readonly rationale: string;
  // Set only by the heuristic planner, whose rationales are fixed strings the
  // client can translate. AI rationales are free text and stay in `rationale`.
  readonly rationaleKey?: "keptUnchanged" | "shiftedEarlier" | "shiftedLater";
};
export type RefineResponse = {
  readonly plannerKind: "ai" | "heuristic";
  readonly proposals: readonly RefineProposal[];
};

// The generate track's chat response: a scene patch rather than a
// start-frame proposal. Deliberately a different shape from RefineResponse
// (no "plannerKind"/"proposals" fields) -- a restore-track job's response
// must stay byte-for-byte what it always has been, so this never merges
// into the same type.
export type ScenePatchChatResponse = {
  readonly changedBeatIds: readonly string[];
  readonly beatSheet: readonly {
    readonly beatId: string;
    readonly shot: string;
    readonly words: string;
  }[];
  readonly summary: string;
};
const ScenePatchChatResponseSchema = z
  .object({
    changedBeatIds: z.array(z.string()),
    beatSheet: z.array(
      z
        .object({ beatId: z.string(), shot: z.string(), words: z.string() })
        .strict(),
    ),
    summary: z.string(),
  })
  .strict();

// REQUEST_CHANGES did the same thing as NEEDS_CHANGES -- the only branch below
// is against LOOKS_GOOD -- so the review screen offered a third choice that
// changed nothing and left the reader working out a distinction that did not
// exist. It no longer sends it. Still accepted here so a client that has not
// reloaded during a deploy is not answered with a validation error.
const FeedbackDecisionSchema = z.enum([
  "LOOKS_GOOD",
  "NEEDS_CHANGES",
  "REQUEST_CHANGES",
]);
export type FeedbackDecision = z.infer<typeof FeedbackDecisionSchema>;

const DEFAULT_FEEDBACK_PROMPT: Readonly<Record<FeedbackDecision, string>> = {
  LOOKS_GOOD: "",
  NEEDS_CHANGES: "Creator marked this preview as needing changes.",
  REQUEST_CHANGES: "Creator marked this preview as needing changes.",
};

const ProposalsSchema = z.object({
  proposals: z
    .array(
      z.object({
        startFrame: z.number().int(),
        rationale: z.string().min(1).max(500),
      }),
    )
    .min(2)
    .max(3),
});

// A narrow view of `generateObject` -- just what this route needs -- so
// tests can inject a fake without satisfying the SDK's full generic
// overload signature (mirrors the injectable-dependencies pattern used by
// apps/worker/src/worker-job-handler.ts).
export type GenerateProposals = (options: {
  readonly model: LanguageModel;
  readonly schema: typeof ProposalsSchema;
  readonly prompt: string;
}) => Promise<{
  readonly object: { readonly proposals: readonly RefineProposal[] };
}>;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

// Rationales are shown to the creator verbatim, so the model has to answer in
// the language they are reading. Heuristic rationales are translated
// client-side via rationaleKey; AI text can only be steered here.
// Allow-listed rather than interpolated raw: this value reaches the prompt,
// so an arbitrary client string would be an injection point.
const SUPPORTED_LOCALES = ["en-US", "ko-KR"] as const;
const localeOf = (value: unknown): string | undefined =>
  typeof value === "string" &&
  (SUPPORTED_LOCALES as readonly string[]).includes(value)
    ? value
    : undefined;
const localeInstruction = (locale: string | undefined): string =>
  locale ? `\nWrite every rationale in ${locale}.` : "";

// Without a configured/enabled provider, propose the current window plus one
// candidate shifted earlier and one shifted later, evenly spaced within the
// accepted interval -- mirrors the design spec's documented behavior of
// falling back to a heuristic planner when no AI provider key is available.
function heuristicProposals(
  current: number,
  min: number,
  max: number,
): readonly RefineProposal[] {
  const span = Math.max(1, max - min);
  return [
    {
      startFrame: clamp(current, min, max),
      rationale: "Heuristic: kept the current window unchanged.",
      rationaleKey: "keptUnchanged",
    },
    {
      startFrame: clamp(min + span * 0.25, min, max),
      rationale: "Heuristic: shifted earlier within the accepted interval.",
      rationaleKey: "shiftedEarlier",
    },
    {
      startFrame: clamp(min + span * 0.75, min, max),
      rationale: "Heuristic: shifted later within the accepted interval.",
      rationaleKey: "shiftedLater",
    },
  ];
}

// Runs the same provider-settings -> model -> generateObject path used by
// the refine-prompt chat, shared with the /feedback route below. Falls back
// to the heuristic planner when no provider is configured; unlike
// /refine-prompt itself, callers of this helper are expected to decide
// their own AI-failure handling (the /feedback route wraps it in try/catch
// so an unreachable provider never blocks recording the feedback).
async function planProposals(params: {
  readonly prompt: string;
  readonly current: number;
  readonly min: number;
  readonly max: number;
  readonly db: Database.Database;
  readonly aiSecretKey: string;
  readonly generate: GenerateProposals;
  readonly locale?: string | undefined;
}): Promise<RefineResponse> {
  const model = aiModelFromSettings(params.db, params.aiSecretKey);
  if (!model)
    return {
      plannerKind: "heuristic",
      proposals: heuristicProposals(params.current, params.min, params.max),
    };
  const generated = await params.generate({
    model,
    schema: ProposalsSchema,
    prompt: `You select which 4-second window of an existing reference video best matches a creator's described intent. You cannot generate new video content -- you only choose a start frame within the accepted range.\nCurrent start frame: ${params.current}.\nValid start frame range: ${params.min} to ${params.max} (inclusive).\nCreator's request: ${params.prompt}\nPropose 2 or 3 candidate start frames with a short rationale for each.${localeInstruction(params.locale)}`,
  });
  return {
    plannerKind: "ai",
    proposals: generated.object.proposals.map((proposal) => ({
      startFrame: clamp(proposal.startFrame, params.min, params.max),
      rationale: proposal.rationale,
    })),
  };
}

export type InitialFrameSelection = {
  readonly startFrame: number;
  readonly plannerKind: "ai" | "heuristic" | "none";
};

// Used at job-creation time when the creator describes intent instead of
// picking a start frame manually. Reuses the same AI provider settings and
// proposal schema as the post-creation refine-prompt chat -- just keeps the
// first of the 2-3 returned candidates. No prompt at all skips planning
// entirely and starts at frame 0, matching the old manual input's default.
export async function selectInitialStartFrame(params: {
  readonly prompt: string | null;
  readonly min: number;
  readonly max: number;
  readonly db: Database.Database;
  readonly aiSecretKey: string;
  readonly generate?: GenerateProposals;
}): Promise<InitialFrameSelection> {
  if (!params.prompt)
    return {
      startFrame: clamp(0, params.min, params.max),
      plannerKind: "none",
    };
  const model = aiModelFromSettings(params.db, params.aiSecretKey);
  if (!model)
    return {
      startFrame: clamp(
        params.min + (params.max - params.min) / 2,
        params.min,
        params.max,
      ),
      plannerKind: "heuristic",
    };
  // A misconfigured or unreachable AI provider must never block job
  // creation over what is meant to be a best-effort enhancement -- fall
  // back to the same heuristic used when no provider is configured at all.
  try {
    const generate = params.generate ?? generateObject;
    const generated = await generate({
      model,
      schema: ProposalsSchema,
      prompt: `You select which 4-second window of an existing reference video best matches a creator's described intent. You cannot generate new video content -- you only choose a start frame within the accepted range.\nValid start frame range: ${params.min} to ${params.max} (inclusive).\nCreator's request: ${params.prompt}\nPropose 2 or 3 candidate start frames with a short rationale for each; the first one should be your best single recommendation.`,
    });
    const best = generated.object.proposals[0];
    return {
      startFrame: clamp(best?.startFrame ?? 0, params.min, params.max),
      plannerKind: "ai",
    };
  } catch {
    return {
      startFrame: clamp(
        params.min + (params.max - params.min) / 2,
        params.min,
        params.max,
      ),
      plannerKind: "heuristic",
    };
  }
}

// A patch is only accepted from COMPLETED: the job's authored scene and its
// render are otherwise mid-flight (PREPARING/QUEUED/RENDERING/ASSEMBLING/
// AWAITING_T5, or one of the generate track's own AUTHORING_*/ASSETS_*
// stages), and a worker may hold an active lease against exactly the
// job.authoredScene/sceneSpecDigest fields a patch would overwrite.
// Requiring COMPLETED avoids racing that lease entirely -- see this task's
// report for why this was the narrower, safer scope rather than allowing a
// patch to interrupt an in-flight render.
function assertPatchable(job: Job): void {
  if (
    job.state !== "COMPLETED" ||
    !job.authoredScene?.motionPlan ||
    !job.authoredScene.planDigest ||
    !job.sceneSpecDigest
  )
    throw new Error("JOB_NOT_READY_FOR_PATCH");
}

const refinementOperations = (
  previous: SceneSpec,
  next: SceneSpec,
): SceneOperationBatchV1["operations"] => {
  if (
    JSON.stringify(previous.canvas) !== JSON.stringify(next.canvas) ||
    previous.mode !== next.mode ||
    JSON.stringify(previous.assets) !== JSON.stringify(next.assets) ||
    previous.beats.length !== next.beats.length
  )
    throw new Error("INVALID_OPERATION");
  const operations: SceneOperationBatchV1["operations"][number][] = [];
  for (const color of ["hero", "cool", "warm", "background"] as const)
    if (previous.palette[color] !== next.palette[color])
      operations.push({
        kind: "set",
        opId: `refine-palette-${color}`,
        path: `/palette/${color}`,
        value: next.palette[color],
        reason: "generated refine",
      });
  for (const [beatIndex, beat] of previous.beats.entries()) {
    const nextBeat = next.beats[beatIndex];
    if (
      !nextBeat ||
      beat.beatId !== nextBeat.beatId ||
      beat.startFrame !== nextBeat.startFrame ||
      beat.endFrame !== nextBeat.endFrame ||
      beat.shot !== nextBeat.shot ||
      beat.elements.length !== nextBeat.elements.length
    )
      throw new Error("INVALID_OPERATION");
    for (const [elementIndex, element] of beat.elements.entries()) {
      const nextElement = nextBeat.elements[elementIndex];
      if (!nextElement) throw new Error("INVALID_OPERATION");
      const {
        content: previousContent,
        box: previousBox,
        keyframes: previousKeyframes,
        effects: previousEffects,
        ...previousImmutable
      } = element;
      const {
        content: nextContent,
        box: nextBox,
        keyframes: nextKeyframes,
        effects: nextEffects,
        ...nextImmutable
      } = nextElement;
      if (
        JSON.stringify(previousImmutable) !== JSON.stringify(nextImmutable) ||
        previousBox.width !== nextBox.width ||
        previousBox.height !== nextBox.height
      )
        throw new Error("INVALID_OPERATION");
      for (const axis of ["x", "y"] as const)
        if (previousBox[axis] !== nextBox[axis])
          operations.push({
            kind: "set",
            opId: `refine-${beatIndex}-${elementIndex}-box-${axis}`,
            path: `/beats/${beatIndex}/elements/${elementIndex}/box/${axis}`,
            value: nextBox[axis],
            reason: "generated refine",
          });
      for (const [field, previousValue, nextValue] of [
        ["content", previousContent, nextContent],
        ["keyframes", previousKeyframes, nextKeyframes],
        ["effects", previousEffects, nextEffects],
      ] as const)
        if (JSON.stringify(previousValue) !== JSON.stringify(nextValue))
          operations.push({
            kind: "set",
            opId: `refine-${beatIndex}-${elementIndex}-${field}`,
            path: `/beats/${beatIndex}/elements/${elementIndex}/${field}`,
            value: z.json().parse(nextValue),
            reason: "generated refine",
          });
    }
  }
  if (operations.length > 16) throw new Error("INVALID_OPERATION");
  return operations;
};

// Runs a scene patch for the generate track's chat and re-queues the job
// for the same gen-render phase it already has (Task: re-render after a
// patch). Fail-closed, same as authorScene()/patchScene() themselves: any
// failure here throws before job.authoredScene is ever touched, so a failed
// patch never silently keeps stale state and never stores a broken scene.
async function applyScenePatch(params: {
  readonly store: CreatorWorkflowStore;
  readonly job: Job;
  readonly feedback: string;
  readonly db: Database.Database;
  readonly aiSecretKey: string;
  readonly generate: GeneratePatch | undefined;
  readonly idempotencyKey: string;
  readonly requestDigest: string;
}): Promise<ScenePatchChatResponse> {
  const { store, job } = params;
  assertPatchable(job);
  const previous = job.authoredScene?.spec;
  if (!previous) throw new Error("JOB_NOT_READY_FOR_PATCH");
  const patched = await patchScene({
    previous,
    feedback: params.feedback,
    evidence: job.evidence,
    attachmentIds: job.generation?.attachmentIds ?? [],
    db: params.db,
    aiSecretKey: params.aiSecretKey,
    ...(params.generate ? { generate: params.generate } : {}),
  });
  // Only reachable once patchScene has already resolved successfully --
  // nothing above this line mutates the job, so a throw anywhere in
  // patchScene (AI failure, schema failure, validateSceneSpec failure)
  // leaves job.authoredScene exactly as it was.
  const operations = refinementOperations(previous, patched.spec);
  const normalized =
    operations.length === 0
      ? previous
      : applySceneOperations(previous, {
          schema: "scene-operation-batch-v1",
          baseSceneDigest: sha256Hex(previous),
          operations,
        });
  const response: ScenePatchChatResponse = {
    changedBeatIds: patched.changedBeatIds,
    beatSheet: patched.beatSheet,
    summary: patched.summary,
  };
  const persisted = recordMotionSceneRefinement(
    params.db,
    job,
    previous,
    normalized,
    {
      key: `refine-prompt:${job.id}:${params.idempotencyKey}`,
      requestDigest: params.requestDigest,
      response,
      parseResponse: (value) => ScenePatchChatResponseSchema.parse(value),
    },
  );
  if (persisted.replayed && persisted.response) return persisted.response;
  job.authoredScene = {
    ...job.authoredScene,
    spec: normalized,
    beatSheet: patched.beatSheet,
  };
  job.sceneSpecDigest = sha256Hex(normalized);
  // Kept on the job record (not only in this request's response) so a
  // future partial-rerender optimisation has something to act on -- see the
  // `ponytail:` comment at apps/worker/src/worker-job-handler.ts's
  // gen-render call.
  job.lastPatchChangedBeatIds = patched.changedBeatIds;
  job.automaticRetries = 0;
  job.failureCode = null;
  // The creator has just asked for a change -- the delivered artifact this
  // job used to point at is no longer the film this scene describes, and
  // the progress the UI reads has to say a new render is starting, not
  // repeat the finished render's own final progress record.
  job.progress = {
    phase: "prepare",
    stage: "scene-patch",
    fraction: 0,
    framesProcessed: null,
    framesTotal: null,
  };
  const now = store.now();
  job.eligibleAt = now;
  assertLegalTransition(job.state, "QUEUED");
  job.state = "QUEUED";
  job.updatedAt = new Date(now).toISOString();
  job.etag = `"${createHash("sha256").update(job.updatedAt).digest("hex")}"`;
  return response;
}

export function registerRefinePrompt(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
  uploads: UploadStore,
  db: Database.Database,
  aiSecretKey: string,
  generate: GenerateProposals = generateObject as unknown as GenerateProposals,
  patchGenerate?: GeneratePatch,
): void {
  const tenant = (request: FastifyRequest): string =>
    header(request, "x-tenant-id") ?? "";
  const idempotency = new IdempotencyStore();
  app.post(
    "/v1/jobs/:jobId/refine-prompt",
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
        Body: { prompt?: string; locale?: string };
      }>,
      reply,
    ) => {
      try {
        const key = header(request, "idempotency-key");
        const match = header(request, "if-match");
        if (!key || !match) throw new Error("PRECONDITION_REQUIRED");
        const refineRequestDigest = requestHash({
          route: `/v1/jobs/${request.params.jobId}/refine-prompt`,
          body: request.body ?? {},
          ifMatch: match,
        });
        const replay = await idempotency.executeAsync(
          "refine-prompt",
          key,
          refineRequestDigest,
          tenant(request),
          async () => {
            const job = store.jobs.get(request.params.jobId);
            if (!job || job.tenantId !== tenant(request))
              throw new Error("RESOURCE_NOT_FOUND");
            const prompt = request.body?.prompt;
            if (!prompt || prompt.length < 1 || prompt.length > 2000)
              throw new Error("INVALID_REQUEST");
            // Routing (Task 2): a generate-track job (job.generation set)
            // has no start frame to shift -- its only edit surface is the
            // authored scene itself, so the chat asks for a scene patch
            // instead. A restore-track job (no job.generation) takes
            // exactly the path it always has, below, completely unchanged.
            if (job.generation) {
              const durableReplay = replayMotionSceneMutation(
                db,
                job,
                `refine-prompt:${job.id}:${key}`,
                refineRequestDigest,
                (value) => ScenePatchChatResponseSchema.parse(value),
              );
              if (durableReplay) return [200, durableReplay];
              if (match !== `"${job.sceneSpecDigest}"`)
                throw new Error("VERSION_CONFLICT");
              const response = await applyScenePatch({
                store,
                job,
                feedback: prompt,
                db,
                aiSecretKey,
                generate: patchGenerate,
                idempotencyKey: key,
                requestDigest: refineRequestDigest,
              });
              return [200, response];
            }
            if (match !== job.etag) throw new Error("VERSION_CONFLICT");
            const upload = uploads.uploads.get(job.uploadId);
            if (!upload || upload.tenantId !== job.tenantId || !upload.media)
              throw new Error("RESOURCE_NOT_FOUND");
            const windowFrames = job.sourceFps * 4;
            const min = 0;
            const max = Math.max(0, upload.media.frameCount - windowFrames);
            const response = await planProposals({
              prompt,
              current: job.startFrame,
              min,
              max,
              db,
              aiSecretKey,
              generate,
              locale: localeOf(request.body?.locale),
            });
            return [200, response];
          },
        );
        reply.code(replay.response[0]).send(replay.response[1]);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
        fail(reply, code, statusFor(code));
      }
    },
  );
  app.post(
    "/v1/jobs/:jobId/rate",
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
        Body: { thumbsUp?: boolean };
      }>,
      reply,
    ) => {
      try {
        const key = header(request, "idempotency-key");
        if (!key) throw new Error("INVALID_REQUEST");
        const principal = (
          request as FastifyRequest & {
            authenticatedPrincipal?: { userId: string };
          }
        ).authenticatedPrincipal;
        const replay = await idempotency.executeAsync(
          "job-rate",
          key,
          requestHash(request.body ?? {}),
          tenant(request),
          async () => {
            const job = store.jobs.get(request.params.jobId);
            if (!job || job.tenantId !== tenant(request))
              throw new Error("RESOURCE_NOT_FOUND");
            if (typeof request.body?.thumbsUp !== "boolean")
              throw new Error("INVALID_REQUEST");
            if (!principal) throw new Error("AUTHENTICATION_REQUIRED");
            db.prepare(
              `INSERT INTO job_ratings (id, job_id, tenant_id, creator_id, thumbs_up, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(
              id("rating"),
              job.id,
              job.tenantId,
              principal.userId,
              request.body.thumbsUp ? 1 : 0,
              new Date(store.now()).toISOString(),
            );
            return [200, { ok: true }];
          },
        );
        reply.code(replay.response[0]).send(replay.response[1]);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
        fail(reply, code, statusFor(code));
      }
    },
  );
  app.post(
    "/v1/jobs/:jobId/feedback",
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
        Body: { decision?: string; note?: string; locale?: string };
      }>,
      reply,
    ) => {
      try {
        const key = header(request, "idempotency-key");
        if (!key) throw new Error("INVALID_REQUEST");
        const principal = (
          request as FastifyRequest & {
            authenticatedPrincipal?: { userId: string };
          }
        ).authenticatedPrincipal;
        const replay = await idempotency.executeAsync(
          "job-feedback",
          key,
          requestHash(request.body ?? {}),
          tenant(request),
          async () => {
            const job = store.jobs.get(request.params.jobId);
            if (!job || job.tenantId !== tenant(request))
              throw new Error("RESOURCE_NOT_FOUND");
            if (!principal) throw new Error("AUTHENTICATION_REQUIRED");
            const parsedDecision = FeedbackDecisionSchema.safeParse(
              request.body?.decision,
            );
            if (!parsedDecision.success) throw new Error("INVALID_REQUEST");
            const decision = parsedDecision.data;
            const note = request.body?.note;
            if (note !== undefined && (note.length < 1 || note.length > 2000))
              throw new Error("INVALID_REQUEST");
            let planned: RefineResponse | null = null;
            if (decision !== "LOOKS_GOOD") {
              const upload = uploads.uploads.get(job.uploadId);
              // An AI failure here must never block recording the feedback
              // itself -- the decision is the durable fact, the refinement
              // is a best-effort enhancement on top of it.
              try {
                if (upload?.media) {
                  const windowFrames = job.sourceFps * 4;
                  const min = 0;
                  const max = Math.max(
                    0,
                    upload.media.frameCount - windowFrames,
                  );
                  planned = await planProposals({
                    prompt: note || DEFAULT_FEEDBACK_PROMPT[decision],
                    current: job.startFrame,
                    min,
                    max,
                    db,
                    aiSecretKey,
                    generate,
                    locale: localeOf(request.body?.locale),
                  });
                }
              } catch {
                planned = null;
              }
            }
            db.prepare(
              `INSERT INTO job_feedback (id, job_id, tenant_id, creator_id, decision, note, planner_kind, proposals_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              id("feedback"),
              job.id,
              job.tenantId,
              principal.userId,
              decision,
              note ?? null,
              planned?.plannerKind ?? null,
              planned ? JSON.stringify(planned.proposals) : null,
              new Date(store.now()).toISOString(),
            );
            return [200, { ok: true, proposals: planned }];
          },
        );
        reply.code(replay.response[0]).send(replay.response[1]);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
        fail(reply, code, statusFor(code));
      }
    },
  );
}
