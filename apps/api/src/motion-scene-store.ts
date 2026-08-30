import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  BackendCapabilitySnapshotV1Schema,
  MotionPlanV1Schema,
  MotionSceneSnapshotV1Schema,
  VerificationReportV1Schema,
  type BackendCapabilitySnapshotV1,
  type VerificationReportV1,
} from "../../../packages/contracts/src/motion.js";
import { MOTION_PREDICATE_IDS } from "../../../packages/contracts/src/motion-predicates.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import {
  SceneSpecSchema,
  type SceneSpec,
} from "../../../packages/contracts/src/scene-spec.js";
import type { Job } from "./creator-workflow.js";
import { MotionSceneError, verifyMotionSceneForJob } from "./motion-operations.js";

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const PredicateIdsSchema = z.array(z.enum(MOTION_PREDICATE_IDS)).max(64);
export type MotionSceneVersionRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly jobId: string;
  readonly version: number;
  readonly sceneDigest: string;
  readonly sceneJson: string;
  readonly capabilityJson: string;
  readonly verificationJson: string | null;
  readonly planDigest: string | null;
  readonly predecessorVersion: number | null;
  readonly artifactDigest: string | null;
  readonly predicateIdsJson: string;
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
const selectColumns = `v.id, v.tenant_id AS tenantId, v.job_id AS jobId, v.version, v.scene_digest AS sceneDigest, v.scene_json AS sceneJson, v.capability_json AS capabilityJson, v.verification_json AS verificationJson, v.plan_digest AS planDigest, v.predecessor_version AS predecessorVersion, v.artifact_digest AS artifactDigest, v.predicate_ids_json AS predicateIdsJson, v.created_at AS createdAt`;

const parseRow = (value: unknown): MotionSceneVersionRow | undefined => {
  if (!value) return undefined;
  const row = value as MotionSceneVersionRow;
  DigestSchema.parse(row.sceneDigest);
  SceneSpecSchema.parse(JSON.parse(row.sceneJson));
  BackendCapabilitySnapshotV1Schema.parse(JSON.parse(row.capabilityJson));
  if (row.verificationJson)
    VerificationReportV1Schema.parse(JSON.parse(row.verificationJson));
  if (row.planDigest) DigestSchema.parse(row.planDigest);
  if (row.artifactDigest) DigestSchema.parse(row.artifactDigest);
  if (
    row.predecessorVersion !== null &&
    (!Number.isInteger(row.predecessorVersion) || row.predecessorVersion < 1)
  )
    throw new MotionSceneError("INVALID_SCENE_METADATA", 500);
  PredicateIdsSchema.parse(JSON.parse(row.predicateIdsJson));
  return row;
};

export const findMotionSceneRow = (
  db: Database.Database,
  job: Job,
): MotionSceneVersionRow | undefined =>
  parseRow(
    db
      .prepare(
        `SELECT ${selectColumns} FROM job_motion_scene_heads h JOIN motion_scene_versions v ON v.id=h.version_id AND v.tenant_id=h.tenant_id WHERE h.job_id=? AND h.tenant_id=?`,
      )
      .get(job.id, job.tenantId),
  );
export const motionSceneRowForVersion = (
  db: Database.Database,
  job: Job,
  version: number,
): MotionSceneVersionRow | undefined =>
  parseRow(
    db
      .prepare(
        `SELECT ${selectColumns} FROM motion_scene_versions v WHERE v.job_id=? AND v.tenant_id=? AND v.version=?`,
      )
      .get(job.id, job.tenantId, version),
  );

const metadataFor = (job: Job, artifactDigest?: string | null) => {
  const plan = job.authoredScene?.motionPlan
    ? MotionPlanV1Schema.parse(job.authoredScene.motionPlan)
    : null;
  const planDigest =
    job.authoredScene?.planDigest ?? plan?.reproducibility.planDigest ?? null;
  if (planDigest) DigestSchema.parse(planDigest);
  if (plan && planDigest !== plan.reproducibility.planDigest)
    throw new MotionSceneError("INVALID_SCENE_METADATA", 400);
  if (artifactDigest) DigestSchema.parse(artifactDigest);
  return {
    planDigest,
    artifactDigest: artifactDigest ?? null,
    predicateIds: PredicateIdsSchema.parse(plan?.predicateIds ?? []),
  };
};

type CommitParams<T> = {
  readonly db: Database.Database;
  readonly job: Job;
  readonly scene: SceneSpec;
  readonly verification: VerificationReportV1 | null;
  readonly expectedSceneDigest?: string;
  readonly artifactDigest?: string | null;
  readonly idempotency?: {
    readonly key: string;
    readonly requestDigest: string;
    readonly response: (row: MotionSceneVersionRow) => T;
    readonly parseResponse: (value: unknown) => T;
  };
};
export type MotionSceneCommit<T> = {
  readonly row: MotionSceneVersionRow;
  readonly response: T | null;
  readonly replayed: boolean;
};
export const replayMotionSceneMutation = <T>(
  db: Database.Database,
  job: Job,
  key: string,
  requestDigest: string,
  parseResponse: (value: unknown) => T,
): T | null => {
  DigestSchema.parse(requestDigest);
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
  return parseResponse(JSON.parse(replay.responseJson));
};

export const commitMotionSceneVersion = <T>(
  params: CommitParams<T>,
): MotionSceneCommit<T> =>
  params.db
    .transaction(() => {
      const { db, job } = params;
      if (params.idempotency) {
        DigestSchema.parse(params.idempotency.requestDigest);
        const replay = replayMotionSceneMutation<T>(
          db,
          job,
          params.idempotency.key,
          params.idempotency.requestDigest,
          params.idempotency.parseResponse,
        );
        if (replay)
          return {
            row: currentMotionSceneRow(db, job),
            response: replay,
            replayed: true,
          };
      }
      const current = findMotionSceneRow(db, job);
      if (
        params.expectedSceneDigest &&
        current?.sceneDigest !== params.expectedSceneDigest
      )
        throw new MotionSceneError("VERSION_CONFLICT", 409);
      const scene = SceneSpecSchema.parse(params.scene);
      const verification = params.verification
        ? VerificationReportV1Schema.parse(params.verification)
        : null;
      const nextCapability =
        BackendCapabilitySnapshotV1Schema.parse(capability());
      const metadata = metadataFor(job, params.artifactDigest);
      const row: MotionSceneVersionRow = {
        id: `msv_${randomBytes(12).toString("base64url")}`,
        tenantId: job.tenantId,
        jobId: job.id,
        version: (current?.version ?? 0) + 1,
        sceneDigest: DigestSchema.parse(sha256Hex(scene)),
        sceneJson: JSON.stringify(scene),
        capabilityJson: JSON.stringify(nextCapability),
        verificationJson: verification ? JSON.stringify(verification) : null,
        planDigest: metadata.planDigest,
        predecessorVersion: current?.version ?? null,
        artifactDigest: metadata.artifactDigest,
        predicateIdsJson: JSON.stringify(metadata.predicateIds),
        createdAt: new Date().toISOString(),
      };
      db.prepare(
        `INSERT INTO motion_scene_versions (id,tenant_id,job_id,version,scene_digest,scene_json,capability_json,verification_json,created_at,plan_digest,predecessor_version,artifact_digest,predicate_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        row.id,
        job.tenantId,
        job.id,
        row.version,
        row.sceneDigest,
        row.sceneJson,
        row.capabilityJson,
        row.verificationJson,
        row.createdAt,
        row.planDigest,
        row.predecessorVersion,
        row.artifactDigest,
        row.predicateIdsJson,
      );
      db.prepare(
        `INSERT INTO job_motion_scene_heads(tenant_id,job_id,version_id) VALUES(?,?,?) ON CONFLICT(tenant_id,job_id) DO UPDATE SET version_id=excluded.version_id`,
      ).run(job.tenantId, job.id, row.id);
      const response = params.idempotency
        ? params.idempotency.parseResponse(params.idempotency.response(row))
        : null;
      if (params.idempotency)
        db.prepare(
          "INSERT INTO idempotency_keys(tenant_id,key,request_hash,response_json,created_at) VALUES(?,?,?,?,?)",
        ).run(
          job.tenantId,
          params.idempotency.key,
          params.idempotency.requestDigest,
          JSON.stringify(response),
          row.createdAt,
        );
      return { row, response, replayed: false };
    })
    .immediate();

export const insertMotionSceneVersion = (
  db: Database.Database,
  job: Job,
  scene: SceneSpec,
  verification: VerificationReportV1 | null,
): MotionSceneVersionRow =>
  commitMotionSceneVersion({ db, job, scene, verification }).row;
export const currentMotionSceneRow = (
  db: Database.Database,
  job: Job,
): MotionSceneVersionRow => {
  const row = findMotionSceneRow(db, job);
  if (!row) throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
  return row;
};
export function recordMotionSceneRefinement<T>(
  db: Database.Database,
  job: Job,
  previous: SceneSpec,
  next: SceneSpec,
  idempotency?: {
    readonly key: string;
    readonly requestDigest: string;
    readonly response: T;
    readonly parseResponse: (value: unknown) => T;
  },
): { readonly response: T | null; readonly replayed: boolean } {
  return db
    .transaction(() => {
      if (idempotency) {
        const replay = replayMotionSceneMutation<T>(
          db,
          job,
          idempotency.key,
          idempotency.requestDigest,
          idempotency.parseResponse,
        );
        if (replay) return { response: replay, replayed: true };
      }
      const previousDigest = sha256Hex(previous);
      const current = findMotionSceneRow(db, job);
      if (current && current.sceneDigest !== previousDigest)
        throw new MotionSceneError("VERSION_CONFLICT", 409);
      const verification = verifyMotionSceneForJob(next, job);
      if (verification.status !== "PASS")
        throw new MotionSceneError("SCENE_VERIFICATION_FAILED", 409);
      if (!current)
        insertMotionSceneVersion(
          db,
          job,
          previous,
          verifyMotionSceneForJob(previous, job),
        );
      if (sha256Hex(next) === previousDigest) {
        if (!idempotency) return { response: null, replayed: false };
        const response = idempotency.parseResponse(idempotency.response);
        db.prepare(
          "INSERT INTO idempotency_keys(tenant_id,key,request_hash,response_json,created_at) VALUES(?,?,?,?,?)",
        ).run(
          job.tenantId,
          idempotency.key,
          idempotency.requestDigest,
          JSON.stringify(response),
          new Date().toISOString(),
        );
        return { response, replayed: false };
      }
      const committed = commitMotionSceneVersion({
        db,
        job,
        scene: next,
        verification,
        expectedSceneDigest: previousDigest,
        ...(idempotency
          ? {
              idempotency: {
                key: idempotency.key,
                requestDigest: idempotency.requestDigest,
                response: () => idempotency.response,
                parseResponse: idempotency.parseResponse,
              },
            }
          : {}),
      });
      return { response: committed.response, replayed: committed.replayed };
    })
    .immediate();
}
export const motionSceneSnapshot = (
  db: Database.Database,
  job: Job,
  row: MotionSceneVersionRow,
) => {
  if (row.tenantId !== job.tenantId || row.jobId !== job.id)
    throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
  return MotionSceneSnapshotV1Schema.parse({
    schema: "motion-scene-snapshot-v1",
    version: row.version,
    sceneEtag: `"${row.sceneDigest}"`,
    sceneDigest: row.sceneDigest,
    scene: JSON.parse(row.sceneJson),
    history: db
      .prepare(
        `SELECT version, scene_digest AS sceneDigest, created_at AS createdAt FROM motion_scene_versions WHERE job_id=? AND tenant_id=? ORDER BY version`,
      )
      .all(job.id, job.tenantId),
    backendCapability: BackendCapabilitySnapshotV1Schema.parse(
      JSON.parse(row.capabilityJson),
    ),
    verification: row.verificationJson
      ? VerificationReportV1Schema.parse(JSON.parse(row.verificationJson))
      : null,
    planDigest: row.planDigest,
    predecessorVersion: row.predecessorVersion,
    artifactDigest: row.artifactDigest,
    predicateIds: PredicateIdsSchema.parse(JSON.parse(row.predicateIdsJson)),
    knowledgeCardIds: (() => {
      const parsed = job.authoredScene?.motionPlan
        ? MotionPlanV1Schema.safeParse(job.authoredScene.motionPlan)
        : null;
      return parsed?.success ? parsed.data.knowledgeCardIds : [];
    })(),
  });
};
