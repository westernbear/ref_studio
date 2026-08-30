import {
  MotionDeliverablesV1Schema,
  MotionSceneSnapshotV1Schema,
  type MotionDeliverablesV1,
  type MotionSceneSnapshotV1,
  type SceneOperationBatchV1,
} from "@rvs/contracts/motion";
import { z } from "zod";
import { requestId } from "../../../lib/upload-client";

const PatchResponseSchema = z.strictObject({
  changedBeatIds: z.array(z.string()),
  beatSheet: z.array(
    z.strictObject({
      beatId: z.string(),
      shot: z.string(),
      words: z.string(),
    }),
  ),
  summary: z.string(),
});

const RenderResponseSchema = z.strictObject({
  state: z.literal("QUEUED"),
  sceneDigest: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type RefineResult = z.infer<typeof PatchResponseSchema>;

export class MotionWorkspaceApiError extends Error {
  constructor(
    readonly code: string,
    readonly remediation?: string,
    readonly causeCategory?: string,
    readonly docsUrl?: string,
  ) {
    super(code);
  }
}

const errorPayload = (
  body: unknown,
  status: number,
): {
  code: string;
  remediation?: string;
  causeCategory?: string;
  docsUrl?: string;
} => {
  const parsed = z
    .looseObject({
      error: z.looseObject({
        code: z.string(),
        remediation: z.string().optional(),
        causeCategory: z.string().optional(),
        docsUrl: z.string().optional(),
      }),
    })
    .safeParse(body);
  if (!parsed.success) return { code: `HTTP_${status}` };
  return {
    code: parsed.data.error.code,
    ...(parsed.data.error.remediation
      ? { remediation: parsed.data.error.remediation }
      : {}),
    ...(parsed.data.error.causeCategory
      ? { causeCategory: parsed.data.error.causeCategory }
      : {}),
    ...(parsed.data.error.docsUrl
      ? { docsUrl: parsed.data.error.docsUrl }
      : {}),
  };
};

const json = async (response: Response): Promise<unknown> =>
  response.json().catch(() => null);

const checked = async <T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> => {
  const body = await json(response);
  if (!response.ok) {
    const payload = errorPayload(body, response.status);
    throw new MotionWorkspaceApiError(
      payload.code,
      payload.remediation,
      payload.causeCategory,
      payload.docsUrl,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new MotionWorkspaceApiError("INVALID_RESPONSE");
  return parsed.data;
};

const sceneUrl = (jobId: string): string =>
  `/api/v1/jobs/${encodeURIComponent(jobId)}/motion-scene`;

export const getMotionScene = async (
  jobId: string,
): Promise<MotionSceneSnapshotV1> =>
  checked(
    await fetch(sceneUrl(jobId), { credentials: "include", cache: "no-store" }),
    MotionSceneSnapshotV1Schema,
  );

export const getMotionDeliverables = async (
  jobId: string,
): Promise<MotionDeliverablesV1> =>
  checked(
    await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/deliverables`, {
      credentials: "include",
      cache: "no-store",
    }),
    MotionDeliverablesV1Schema,
  );

export const patchMotionScene = async (
  jobId: string,
  snapshot: MotionSceneSnapshotV1,
  operations: SceneOperationBatchV1["operations"],
): Promise<MotionSceneSnapshotV1> =>
  checked(
    await fetch(sceneUrl(jobId), {
      method: "PATCH",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "if-match": snapshot.sceneEtag,
        "idempotency-key": requestId(),
      },
      body: JSON.stringify({
        schema: "scene-operation-batch-v1",
        baseSceneDigest: snapshot.sceneDigest,
        operations,
      }),
    }),
    MotionSceneSnapshotV1Schema,
  );

export const refineMotionScene = async (
  jobId: string,
  snapshot: MotionSceneSnapshotV1,
  prompt: string,
  locale: string,
): Promise<RefineResult> =>
  checked(
    await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/refine-prompt`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "if-match": snapshot.sceneEtag,
        "idempotency-key": requestId(),
      },
      body: JSON.stringify({ prompt, locale }),
    }),
    PatchResponseSchema,
  );

export const rollbackMotionScene = async (
  jobId: string,
  snapshot: MotionSceneSnapshotV1,
  version: number,
): Promise<MotionSceneSnapshotV1> =>
  checked(
    await fetch(`${sceneUrl(jobId)}/rollback`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "if-match": snapshot.sceneEtag,
        "idempotency-key": requestId(),
      },
      body: JSON.stringify({ schema: "motion-scene-rollback-v1", version }),
    }),
    MotionSceneSnapshotV1Schema,
  );

export const renderMotionScene = async (
  jobId: string,
  snapshot: MotionSceneSnapshotV1,
): Promise<void> => {
  await checked(
    await fetch(`${sceneUrl(jobId)}/render`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "if-match": snapshot.sceneEtag,
        "idempotency-key": requestId(),
      },
      body: JSON.stringify({ schema: "motion-scene-render-v1" }),
    }),
    RenderResponseSchema,
  );
};

export const proxiedDownloadUrl = (url: string): string =>
  url.startsWith("/v1/") ? `/api${url}` : url;
