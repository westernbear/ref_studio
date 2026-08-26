import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { generateObject, type LanguageModel } from "ai";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getAiProviderSettingsWithSecret } from "./ai-provider-settings.js";
import { createAiModel } from "./ai-provider.js";
import { IdempotencyStore, requestHash, safeEnvelope } from "./boundary.js";
import type { CreatorWorkflowStore } from "./creator-workflow.js";
import type { UploadStore } from "./uploads.js";

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
      : 400;

export type RefineProposal = {
  readonly startFrame: number;
  readonly rationale: string;
};
export type RefineResponse = {
  readonly plannerKind: "ai" | "heuristic";
  readonly proposals: readonly RefineProposal[];
};

const FeedbackDecisionSchema = z.enum([
  "LOOKS_GOOD",
  "NEEDS_CHANGES",
  "REQUEST_CHANGES",
]);
export type FeedbackDecision = z.infer<typeof FeedbackDecisionSchema>;

const DEFAULT_FEEDBACK_PROMPT: Readonly<Record<FeedbackDecision, string>> = {
  LOOKS_GOOD: "",
  NEEDS_CHANGES: "Creator marked this preview as needing changes.",
  REQUEST_CHANGES: "Creator requested changes to this preview.",
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
    },
    {
      startFrame: clamp(min + span * 0.25, min, max),
      rationale: "Heuristic: shifted earlier within the accepted interval.",
    },
    {
      startFrame: clamp(min + span * 0.75, min, max),
      rationale: "Heuristic: shifted later within the accepted interval.",
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
}): Promise<RefineResponse> {
  const settings = getAiProviderSettingsWithSecret(
    params.db,
    params.aiSecretKey,
  );
  if (!settings.enabled || !settings.apiKey)
    return {
      plannerKind: "heuristic",
      proposals: heuristicProposals(params.current, params.min, params.max),
    };
  const model = createAiModel({
    providerKind: settings.providerKind,
    model: settings.model,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
  });
  const generated = await params.generate({
    model,
    schema: ProposalsSchema,
    prompt: `You select which 4-second window of an existing reference video best matches a creator's described intent. You cannot generate new video content -- you only choose a start frame within the accepted range.\nCurrent start frame: ${params.current}.\nValid start frame range: ${params.min} to ${params.max} (inclusive).\nCreator's request: ${params.prompt}\nPropose 2 or 3 candidate start frames with a short rationale for each.`,
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
    return { startFrame: clamp(0, params.min, params.max), plannerKind: "none" };
  const settings = getAiProviderSettingsWithSecret(params.db, params.aiSecretKey);
  if (!settings.enabled || !settings.apiKey)
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
    const model = createAiModel({
      providerKind: settings.providerKind,
      model: settings.model,
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
    });
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

export function registerRefinePrompt(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
  uploads: UploadStore,
  db: Database.Database,
  aiSecretKey: string,
  generate: GenerateProposals = generateObject as unknown as GenerateProposals,
): void {
  const tenant = (request: FastifyRequest): string =>
    header(request, "x-tenant-id") ?? "";
  const idempotency = new IdempotencyStore();
  app.post(
    "/v1/jobs/:jobId/refine-prompt",
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
        Body: { prompt?: string };
      }>,
      reply,
    ) => {
      try {
        const key = header(request, "idempotency-key");
        if (!key) throw new Error("INVALID_REQUEST");
        const replay = await idempotency.executeAsync(
          "refine-prompt",
          key,
          requestHash(request.body ?? {}),
          tenant(request),
          async () => {
            const job = store.jobs.get(request.params.jobId);
            if (!job || job.tenantId !== tenant(request))
              throw new Error("RESOURCE_NOT_FOUND");
            const upload = uploads.uploads.get(job.uploadId);
            if (!upload || upload.tenantId !== job.tenantId || !upload.media)
              throw new Error("RESOURCE_NOT_FOUND");
            const prompt = request.body?.prompt;
            if (!prompt || prompt.length < 1 || prompt.length > 2000)
              throw new Error("INVALID_REQUEST");
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
        Body: { decision?: string; note?: string };
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
            return [
              200,
              { ok: true, proposals: planned },
            ];
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
