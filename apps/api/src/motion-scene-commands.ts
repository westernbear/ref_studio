import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  MotionSceneRenderV1Schema,
  MotionSceneRollbackV1Schema,
  MotionSceneSnapshotV1Schema,
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
import {
  MotionSceneError,
  verifyMotionSceneForJob,
} from "./motion-operations.js";
import {
  emitMotionEvent,
  sampleMotionMetric,
} from "../../../packages/contracts/src/motion-observability.js";
import {
  adobeCatalogForJob,
  currentMotionSceneRow,
  commitMotionSceneVersion,
  motionSceneRowForVersion,
  motionSceneSnapshot,
  replayMotionSceneMutation,
} from "./motion-scene-store.js";

type JobRequest = FastifyRequest<{ Params: { jobId: string } }>;

const etag = (digest: string): string => `"${digest}"`;

const predecessorFor = (job: Job | undefined, digest?: string) =>
  job
    ? {
        safePredecessor: {
          ...(digest ? { sceneDigest: digest } : {}),
          ...(job.artifact?.id ? { artifactId: job.artifact.id } : {}),
        },
      }
    : {};

const fail = (
  reply: FastifyReply,
  error: unknown,
  job?: Job,
  digest?: string,
): void => {
  const failure =
    error instanceof MotionSceneError
      ? error
      : new MotionSceneError("INVALID_REQUEST", 400);
  if (failure.code === "VERSION_CONFLICT")
    sampleMotionMetric("stale_conflicts", 1, { route: "motion-scene-command" });
  reply
    .code(failure.status)
    .send(
      safeEnvelope(
        failure,
        String(reply.getHeader("x-correlation-id")),
        predecessorFor(job, digest),
      ),
    );
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
  job: Job,
  key: string,
  requestDigest: string,
): string | null => {
  const replay = db
    .prepare(
      "SELECT response_json AS responseJson, request_hash AS requestHash FROM idempotency_keys WHERE tenant_id=? AND key=?",
    )
    .get(job.tenantId, key) as
    | { responseJson: string; requestHash: string }
    | undefined;
  if (!replay) return null;
  if (replay.requestHash !== requestDigest)
    throw new MotionSceneError("IDEMPOTENCY_CONFLICT", 409);
  return replay.responseJson;
};

const queue = (
  store: CreatorWorkflowStore,
  job: Job,
  scene: SceneSpec,
  digest: string,
): void => {
  assertQueueable(job);
  job.authoredScene = {
    ...job.authoredScene,
    spec: scene,
    beatSheet: beatSheetFor(scene),
  };
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
  admissionEnabled: boolean,
  adobeMcp = false,
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
        if (!admissionEnabled)
          throw new MotionSceneError("MOTION_AUTHORING_DISABLED", 403);
        const { match, key } = requiredHeaders(request);
        const body = MotionSceneRollbackV1Schema.parse(request.body);
        const scopedKey = `motion-scene-rollback:${job.id}:${key}`;
        const requestDigest = sha256Hex({
          route: `/v1/jobs/${job.id}/motion-scene/rollback`,
          ifMatch: match,
          body,
        });
        const replay = replayMotionSceneMutation(
          db,
          job,
          scopedKey,
          requestDigest,
          (value) => MotionSceneSnapshotV1Schema.parse(value),
        );
        if (replay) {
          reply.send(replay);
          return;
        }
        const current = currentMotionSceneRow(db, job);
        if (match !== etag(current.sceneDigest))
          throw new MotionSceneError("VERSION_CONFLICT", 409);
        const target = motionSceneRowForVersion(db, job, body.version);
        if (!target) throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
        assertQueueable(job);
        const scene = SceneSpecSchema.parse(JSON.parse(target.sceneJson));
        const verification = verifyMotionSceneForJob(scene, job);
        if (verification.status !== "PASS")
          throw new MotionSceneError("SCENE_VERIFICATION_FAILED", 409);
        const committed = commitMotionSceneVersion({
          db,
          job,
          scene,
          verification,
          expectedSceneDigest: current.sceneDigest,
          idempotency: {
            key: scopedKey,
            requestDigest,
            response: (row) => motionSceneSnapshot(db, job, row),
            parseResponse: (value) => MotionSceneSnapshotV1Schema.parse(value),
          },
        });
        const next = committed.row;
        if (committed.replayed) {
          reply.send(committed.response);
          return;
        }
        queue(store, job, scene, next.sceneDigest);
        sampleMotionMetric("rollback_frequency", 1, { jobId: job.id });
        emitMotionEvent(
          "user.action_result",
          String(reply.getHeader("x-correlation-id")),
          {
            action: "rollback",
            status: "ok",
          },
        );
        reply.send(committed.response);
      } catch (error) {
        const failed = store.jobs.get(request.params.jobId);
        fail(reply, error, failed, failed?.sceneSpecDigest ?? undefined);
      }
    },
  );

  app.post(
    "/v1/jobs/:jobId/motion-scene/render",
    async (request: JobRequest, reply) => {
      try {
        const job = owned(request);
        if (!admissionEnabled)
          throw new MotionSceneError("MOTION_AUTHORING_DISABLED", 403);
        const { match, key } = requiredHeaders(request);
        const body = MotionSceneRenderV1Schema.parse(request.body);
        if (body.backend === "adobe") {
          if (!adobeMcp)
            throw new MotionSceneError("MOTION_AUTHORING_DISABLED", 403);
          const catalog = adobeCatalogForJob(db, job);
          const devices = catalog.devices;
          const projects = catalog.projects;
          if (
            !devices.some((device) => device.id === body.deviceId) ||
            !projects.some((project) => project.id === body.projectId)
          )
            throw new MotionSceneError("INVALID_REQUEST", 400);
        }
        job.motionRenderRequest = {
          backend: body.backend,
          ...(body.deviceId ? { deviceId: body.deviceId } : {}),
          ...(body.projectId ? { projectId: body.projectId } : {}),
        };
        const scopedKey = `motion-scene-render:${job.id}:${key}`;
        const requestDigest = sha256Hex({
          route: `/v1/jobs/${job.id}/motion-scene/render`,
          ifMatch: match,
          body,
        });
        const replay = replayFor(db, job, scopedKey, requestDigest);
        if (replay) {
          reply.code(202).send(JSON.parse(replay));
          return;
        }
        const current = currentMotionSceneRow(db, job);
        if (match !== etag(current.sceneDigest))
          throw new MotionSceneError("VERSION_CONFLICT", 409);
        const storedVerification = current.verificationJson
          ? VerificationReportV1Schema.parse(
              JSON.parse(current.verificationJson),
            )
          : null;
        const scene = SceneSpecSchema.parse(JSON.parse(current.sceneJson));
        const verification = verifyMotionSceneForJob(scene, job);
        if (
          storedVerification?.status !== "PASS" ||
          storedVerification.sceneDigest !== current.sceneDigest ||
          verification.status !== "PASS" ||
          verification.sceneDigest !== current.sceneDigest
        )
          throw new MotionSceneError("SCENE_VERIFICATION_FAILED", 409);
        const response = {
          state: "QUEUED" as const,
          sceneDigest: current.sceneDigest,
        };
        db.transaction(() => {
          db.prepare(
            "INSERT INTO idempotency_keys(tenant_id,key,request_hash,response_json,created_at) VALUES(?,?,?,?,?)",
          ).run(
            job.tenantId,
            scopedKey,
            requestDigest,
            JSON.stringify(response),
            new Date().toISOString(),
          );
          queue(store, job, scene, current.sceneDigest);
        }).immediate();
        emitMotionEvent(
          "user.action_result",
          String(reply.getHeader("x-correlation-id")),
          { action: "render", status: "queued", backend: body.backend },
        );
        reply.code(202).send(response);
      } catch (error) {
        const failed = store.jobs.get(request.params.jobId);
        fail(reply, error, failed, failed?.sceneSpecDigest ?? undefined);
      }
    },
  );
}
