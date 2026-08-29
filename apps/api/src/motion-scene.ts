import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SceneOperationBatchV1Schema } from "../../../packages/contracts/src/motion.js";
import { SceneSpecSchema } from "../../../packages/contracts/src/scene-spec.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import { assertLegalTransition } from "../../../packages/contracts/src/lifecycle.js";
import { safeEnvelope } from "./boundary.js";
import { beatSheetFor } from "./author-scene.js";
import type { CreatorWorkflowStore, Job } from "./creator-workflow.js";
import {
  applySceneOperations,
  MotionSceneError,
  verifyMotionScene,
} from "./motion-operations.js";
import { registerMotionDeliverables } from "./motion-deliverables.js";
import { registerMotionSceneCommands } from "./motion-scene-commands.js";
import {
  currentMotionSceneRow,
  findMotionSceneRow,
  insertMotionSceneVersion,
  motionSceneSnapshot,
} from "./motion-scene-store.js";

export {
  applySceneOperations,
  keyframesFromMotionIntent,
  verifyAndRepair,
  verifyMotionScene,
} from "./motion-operations.js";

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

export function registerMotionScene(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
  db: Database.Database,
  admissionEnabled: boolean,
): void {
  const jobFor = (
    request: FastifyRequest<{ Params: { jobId: string } }>,
  ): Job => {
    const job = store.jobs.get(request.params.jobId);
    const tenant = request.headers["x-tenant-id"];
    if (!job || job.tenantId !== tenant)
      throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
    return job;
  };
  app.get(
    "/v1/jobs/:jobId/motion-scene",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = jobFor(request);
        let row = findMotionSceneRow(db, job);
        if (!row && admissionEnabled && job.generation && job.authoredScene)
          row = insertMotionSceneVersion(
            db,
            job,
            job.authoredScene.spec,
            verifyMotionScene(job.authoredScene.spec),
          );
        if (!row) throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
        reply.send(motionSceneSnapshot(db, job, row));
      } catch (error) {
        fail(reply, error);
      }
    },
  );
  app.patch(
    "/v1/jobs/:jobId/motion-scene",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = jobFor(request);
        const match = request.headers["if-match"];
        const key = request.headers["idempotency-key"];
        if (
          typeof match !== "string" ||
          typeof key !== "string" ||
          key.length === 0
        )
          throw new MotionSceneError("PRECONDITION_REQUIRED", 428);
        const batch = SceneOperationBatchV1Schema.parse(request.body);
        const scopedKey = `motion-scene:${job.id}:${key}`;
        const replay = db
          .prepare(
            "SELECT response_json AS responseJson, request_hash AS requestHash FROM idempotency_keys WHERE tenant_id=? AND key=?",
          )
          .get(job.tenantId, scopedKey) as
          | { readonly responseJson: string; readonly requestHash: string }
          | undefined;
        const requestDigest = sha256Hex(batch);
        if (replay) {
          if (replay.requestHash !== requestDigest)
            throw new MotionSceneError("IDEMPOTENCY_CONFLICT", 409);
          reply.send(JSON.parse(replay.responseJson));
          return;
        }
        let current = findMotionSceneRow(db, job);
        if (!current) {
          if (!admissionEnabled || !job.authoredScene)
            throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
          const authoredDigest = sha256Hex(job.authoredScene.spec);
          if (
            match !== etag(authoredDigest) ||
            batch.baseSceneDigest !== authoredDigest
          )
            throw new MotionSceneError("VERSION_CONFLICT", 409);
          current = insertMotionSceneVersion(
            db,
            job,
            job.authoredScene.spec,
            null,
          );
        }
        if (!admissionEnabled)
          throw new MotionSceneError("MOTION_AUTHORING_DISABLED", 403);
        if (
          match !== etag(current.sceneDigest) ||
          batch.baseSceneDigest !== current.sceneDigest
        )
          throw new MotionSceneError("VERSION_CONFLICT", 409);
        const scene = SceneSpecSchema.parse(JSON.parse(current.sceneJson));
        const applied = applySceneOperations(scene, batch);
        const verification = verifyMotionScene(applied);
        if (verification.status !== "PASS")
          throw new MotionSceneError("SCENE_VERIFICATION_FAILED", 409);
        const next = insertMotionSceneVersion(db, job, applied, verification);
        job.authoredScene = {
          spec: applied,
          beatSheet: beatSheetFor(applied),
        };
        job.sceneSpecDigest = next.sceneDigest;
        if (job.state === "COMPLETED") {
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
        }
        job.updatedAt = new Date(store.now()).toISOString();
        job.etag = etag(next.sceneDigest);
        const response = motionSceneSnapshot(db, job, next);
        db.prepare(
          "INSERT INTO idempotency_keys(tenant_id,key,request_hash,response_json,created_at) VALUES(?,?,?,?,?)",
        ).run(
          job.tenantId,
          scopedKey,
          requestDigest,
          JSON.stringify(response),
          new Date().toISOString(),
        );
        reply.send(response);
      } catch (error) {
        fail(reply, error);
      }
    },
  );
  registerMotionSceneCommands(app, store, db);
  registerMotionDeliverables(app, store);
}
