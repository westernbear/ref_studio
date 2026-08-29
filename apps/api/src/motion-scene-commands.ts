import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  MotionSceneRenderV1Schema,
  MotionSceneRollbackV1Schema,
  VerificationReportV1Schema,
} from "../../../packages/contracts/src/motion.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import {
  SceneSpecSchema,
  type SceneSpec,
} from "../../../packages/contracts/src/scene-spec.js";
import { assertLegalTransition } from "../../../packages/contracts/src/lifecycle.js";
import { beatSheetFor } from "./author-scene.js";
import { safeEnvelope } from "./boundary.js";
import type { CreatorWorkflowStore, Job } from "./creator-workflow.js";
import { MotionSceneError } from "./motion-operations.js";
import {
  currentMotionSceneRow,
  insertMotionSceneVersion,
  motionSceneRowForVersion,
  motionSceneSnapshot,
  passedMotionVerification,
} from "./motion-scene-store.js";

type JobRequest = FastifyRequest<{ Params: { jobId: string } }>;

const etag = (digest: string): string => `"${digest}"`;

const fail = (reply: FastifyReply, error: unknown): void => {
  const failure =
    error instanceof MotionSceneError
      ? error
      : new MotionSceneError("INVALID_REQUEST", 400);
  reply
    .code(failure.status)
    .send(safeEnvelope(failure, String(reply.getHeader("x-correlation-id"))));
};

const requiredHeaders = (
  request: JobRequest,
): Readonly<{ match: string; key: string }> => {
  const match = request.headers["if-match"];
  const key = request.headers["idempotency-key"];
  if (typeof match !== "string" || typeof key !== "string" || key.length === 0)
    throw new MotionSceneError("PRECONDITION_REQUIRED", 428);
  return { match, key };
};

const replayFor = (
  db: Database.Database,
  tenantId: string,
  key: string,
  requestDigest: string,
): string | null => {
  const replay = db
    .prepare(
      "SELECT response_json AS responseJson, request_hash AS requestHash FROM idempotency_keys WHERE tenant_id=? AND key=?",
    )
    .get(tenantId, key) as
    | { readonly responseJson: string; readonly requestHash: string }
    | undefined;
  if (!replay) return null;
  if (replay.requestHash !== requestDigest)
    throw new MotionSceneError("IDEMPOTENCY_CONFLICT", 409);
  return replay.responseJson;
};

const record = (
  db: Database.Database,
  job: Job,
  key: string,
  requestDigest: string,
  response: unknown,
): void => {
  db.prepare(
    "INSERT INTO idempotency_keys(tenant_id,key,request_hash,response_json,created_at) VALUES(?,?,?,?,?)",
  ).run(
    job.tenantId,
    key,
    requestDigest,
    JSON.stringify(response),
    new Date().toISOString(),
  );
};

const queue = (
  store: CreatorWorkflowStore,
  job: Job,
  scene: SceneSpec,
  digest: string,
): void => {
  assertQueueable(job);
  job.authoredScene = { spec: scene, beatSheet: beatSheetFor(scene) };
  job.sceneSpecDigest = digest;
  assertLegalTransition(job.state, "QUEUED");
  job.state = "QUEUED";
  job.progress = {
    phase: "prepare",
    stage: "scene-patch",
    fraction: 0,
    framesProcessed: null,
    framesTotal: null,
  };
  job.eligibleAt = store.now();
  job.updatedAt = new Date(store.now()).toISOString();
  job.etag = etag(digest);
};

const assertQueueable = (job: Job): void => {
  if (job.state !== "COMPLETED")
    throw new MotionSceneError("JOB_NOT_READY_FOR_PATCH", 409);
};

export function registerMotionSceneCommands(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
  db: Database.Database,
): void {
  const owned = (request: JobRequest): Job => {
    const job = store.jobs.get(request.params.jobId);
    if (!job || job.tenantId !== request.headers["x-tenant-id"])
      throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
    return job;
  };

  app.post(
    "/v1/jobs/:jobId/motion-scene/rollback",
    async (request: JobRequest, reply) => {
      try {
        const job = owned(request);
        const { match, key } = requiredHeaders(request);
        const body = MotionSceneRollbackV1Schema.parse(request.body);
        const scopedKey = `motion-scene-rollback:${job.id}:${key}`;
        const requestDigest = sha256Hex(body);
        const replay = replayFor(db, job.tenantId, scopedKey, requestDigest);
        if (replay) {
          reply.send(JSON.parse(replay));
          return;
        }
        const current = currentMotionSceneRow(db, job);
        if (match !== etag(current.sceneDigest))
          throw new MotionSceneError("VERSION_CONFLICT", 409);
        const target = motionSceneRowForVersion(db, job, body.version);
        if (!target) throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
        assertQueueable(job);
        const scene = SceneSpecSchema.parse(JSON.parse(target.sceneJson));
        const next = insertMotionSceneVersion(
          db,
          job,
          scene,
          passedMotionVerification(scene),
        );
        queue(store, job, scene, next.sceneDigest);
        const response = motionSceneSnapshot(db, job, next);
        record(db, job, scopedKey, requestDigest, response);
        reply.send(response);
      } catch (error) {
        fail(reply, error);
      }
    },
  );

  app.post(
    "/v1/jobs/:jobId/motion-scene/render",
    async (request: JobRequest, reply) => {
      try {
        const job = owned(request);
        const { match, key } = requiredHeaders(request);
        const body = MotionSceneRenderV1Schema.parse(request.body);
        const scopedKey = `motion-scene-render:${job.id}:${key}`;
        const requestDigest = sha256Hex(body);
        const replay = replayFor(db, job.tenantId, scopedKey, requestDigest);
        if (replay) {
          reply.code(202).send(JSON.parse(replay));
          return;
        }
        const current = currentMotionSceneRow(db, job);
        if (match !== etag(current.sceneDigest))
          throw new MotionSceneError("VERSION_CONFLICT", 409);
        const verification = current.verificationJson
          ? VerificationReportV1Schema.parse(
              JSON.parse(current.verificationJson),
            )
          : null;
        if (verification?.status !== "PASS")
          throw new MotionSceneError("SCENE_VERIFICATION_FAILED", 409);
        const scene = SceneSpecSchema.parse(JSON.parse(current.sceneJson));
        queue(store, job, scene, current.sceneDigest);
        const response = {
          state: "QUEUED" as const,
          sceneDigest: current.sceneDigest,
        };
        record(db, job, scopedKey, requestDigest, response);
        reply.code(202).send(response);
      } catch (error) {
        fail(reply, error);
      }
    },
  );
}
