import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  BackendCapabilitySnapshotV1Schema,
  MotionSceneSnapshotV1Schema,
  SceneOperationBatchV1Schema,
  SceneSpecSchema,
  VerificationReportV1Schema,
  sha256Hex,
  type BackendCapabilitySnapshotV1,
  type SceneSpec,
  type VerificationReportV1,
} from "@rvs/contracts";
import { safeEnvelope } from "./boundary.js";
import type { CreatorWorkflowStore, Job } from "./creator-workflow.js";
import { applySceneOperations, MotionSceneError } from "./motion-operations.js";

export {
  applySceneOperations,
  keyframesFromMotionIntent,
  verifyAndRepair,
} from "./motion-operations.js";

const id = (): string => `msv_${randomBytes(12).toString("base64url")}`;
const etag = (digest: string): string => `"${digest}"`;
type VersionRow = {
  readonly id: string;
  readonly version: number;
  readonly sceneDigest: string;
  readonly sceneJson: string;
  readonly capabilityJson: string;
  readonly verificationJson: string | null;
  readonly createdAt: string;
};

const capability = (): BackendCapabilitySnapshotV1 => ({
  schema: "backend-capability-snapshot-v1",
  backend: "native",
  capturedAt: new Date().toISOString(),
  capabilities: [
    "text",
    "image",
    "shape",
    "x",
    "y",
    "uniform-scale",
    "opacity",
    "drop-shadow",
  ],
});
const rowFor = (db: Database.Database, job: Job): VersionRow | undefined =>
  db
    .prepare(
      `SELECT v.id, v.version, v.scene_digest AS sceneDigest, v.scene_json AS sceneJson,
              v.capability_json AS capabilityJson, v.verification_json AS verificationJson,
              v.created_at AS createdAt
         FROM job_motion_scene_heads h JOIN motion_scene_versions v ON v.id=h.version_id AND v.tenant_id=h.tenant_id
        WHERE h.job_id=? AND h.tenant_id=?`,
    )
    .get(job.id, job.tenantId) as VersionRow | undefined;

const insertVersion = (
  db: Database.Database,
  job: Job,
  scene: SceneSpec,
  verification: VerificationReportV1 | null,
): VersionRow => {
  const previous = rowFor(db, job);
  const version = (previous?.version ?? 0) + 1;
  const sceneDigest = sha256Hex(scene);
  const createdAt = new Date().toISOString();
  const versionId = id();
  const nextCapability = capability();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO motion_scene_versions
       (id,tenant_id,job_id,version,scene_digest,scene_json,capability_json,verification_json,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      versionId,
      job.tenantId,
      job.id,
      version,
      sceneDigest,
      JSON.stringify(scene),
      JSON.stringify(nextCapability),
      verification ? JSON.stringify(verification) : null,
      createdAt,
    );
    db.prepare(
      `INSERT INTO job_motion_scene_heads(tenant_id,job_id,version_id) VALUES(?,?,?)
       ON CONFLICT(tenant_id,job_id) DO UPDATE SET version_id=excluded.version_id`,
    ).run(job.tenantId, job.id, versionId);
  }).immediate();
  return {
    id: versionId,
    version,
    sceneDigest,
    sceneJson: JSON.stringify(scene),
    capabilityJson: JSON.stringify(nextCapability),
    verificationJson: verification ? JSON.stringify(verification) : null,
    createdAt,
  };
};

const currentRow = (db: Database.Database, job: Job): VersionRow => {
  const existing = rowFor(db, job);
  if (!existing) throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
  return existing;
};

const snapshot = (db: Database.Database, job: Job, row: VersionRow) => {
  const history = db
    .prepare(
      `SELECT version, scene_digest AS sceneDigest, created_at AS createdAt
         FROM motion_scene_versions WHERE job_id=? AND tenant_id=? ORDER BY version`,
    )
    .all(job.id, job.tenantId);
  return MotionSceneSnapshotV1Schema.parse({
    schema: "motion-scene-snapshot-v1",
    version: row.version,
    sceneEtag: etag(row.sceneDigest),
    sceneDigest: row.sceneDigest,
    scene: JSON.parse(row.sceneJson),
    history,
    backendCapability: BackendCapabilitySnapshotV1Schema.parse(
      JSON.parse(row.capabilityJson),
    ),
    verification: row.verificationJson
      ? VerificationReportV1Schema.parse(JSON.parse(row.verificationJson))
      : null,
  });
};

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
        reply.send(snapshot(db, job, currentRow(db, job)));
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
        let current = rowFor(db, job);
        if (!current) {
          if (!admissionEnabled || !job.authoredScene)
            throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
          const authoredDigest = sha256Hex(job.authoredScene.spec);
          if (
            match !== etag(authoredDigest) ||
            batch.baseSceneDigest !== authoredDigest
          )
            throw new MotionSceneError("VERSION_CONFLICT", 409);
          current = insertVersion(db, job, job.authoredScene.spec, null);
        }
        if (!admissionEnabled)
          throw new MotionSceneError("MOTION_AUTHORING_DISABLED", 403);
        if (
          match !== etag(current.sceneDigest) ||
          batch.baseSceneDigest !== current.sceneDigest
        )
          throw new MotionSceneError("VERSION_CONFLICT", 409);
        const scene = SceneSpecSchema.parse(JSON.parse(current.sceneJson));
        const next = insertVersion(
          db,
          job,
          applySceneOperations(scene, batch),
          null,
        );
        const response = snapshot(db, job, next);
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
  app.get(
    "/v1/jobs/:jobId/deliverables",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = jobFor(request);
        reply.send({
          backend: "native",
          items: job.artifact ? [{ id: job.artifact.id, kind: "mp4" }] : [],
        });
      } catch (error) {
        fail(reply, error);
      }
    },
  );
}
