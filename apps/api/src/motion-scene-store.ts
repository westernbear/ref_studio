import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import {
  BackendCapabilitySnapshotV1Schema,
  MotionSceneSnapshotV1Schema,
  VerificationReportV1Schema,
  type BackendCapabilitySnapshotV1,
  type VerificationReportV1,
} from "../../../packages/contracts/src/motion.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import type { SceneSpec } from "../../../packages/contracts/src/scene-spec.js";
import type { Job } from "./creator-workflow.js";
import { MotionSceneError } from "./motion-operations.js";

export type MotionSceneVersionRow = {
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

export const findMotionSceneRow = (
  db: Database.Database,
  job: Job,
): MotionSceneVersionRow | undefined =>
  db
    .prepare(
      `SELECT v.id, v.version, v.scene_digest AS sceneDigest, v.scene_json AS sceneJson,
              v.capability_json AS capabilityJson, v.verification_json AS verificationJson,
              v.created_at AS createdAt
         FROM job_motion_scene_heads h JOIN motion_scene_versions v ON v.id=h.version_id AND v.tenant_id=h.tenant_id
        WHERE h.job_id=? AND h.tenant_id=?`,
    )
    .get(job.id, job.tenantId) as MotionSceneVersionRow | undefined;

export const insertMotionSceneVersion = (
  db: Database.Database,
  job: Job,
  scene: SceneSpec,
  verification: VerificationReportV1 | null,
): MotionSceneVersionRow => {
  const version = (findMotionSceneRow(db, job)?.version ?? 0) + 1;
  const sceneDigest = sha256Hex(scene);
  const createdAt = new Date().toISOString();
  const versionId = `msv_${randomBytes(12).toString("base64url")}`;
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

export const currentMotionSceneRow = (
  db: Database.Database,
  job: Job,
): MotionSceneVersionRow => {
  const row = findMotionSceneRow(db, job);
  if (!row) throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
  return row;
};

export const passedMotionVerification = (
  scene: SceneSpec,
): VerificationReportV1 => ({
  schema: "verification-report-v1",
  sceneDigest: sha256Hex(scene),
  attempts: 1,
  status: "PASS",
  findings: [],
});

export function recordMotionSceneRefinement(
  db: Database.Database,
  job: Job,
  previous: SceneSpec,
  next: SceneSpec,
): void {
  const previousDigest = sha256Hex(previous);
  const current = findMotionSceneRow(db, job);
  if (current && current.sceneDigest !== previousDigest)
    throw new MotionSceneError("VERSION_CONFLICT", 409);
  if (!current) insertMotionSceneVersion(db, job, previous, null);
  insertMotionSceneVersion(db, job, next, passedMotionVerification(next));
}

export const motionSceneSnapshot = (
  db: Database.Database,
  job: Job,
  row: MotionSceneVersionRow,
) =>
  MotionSceneSnapshotV1Schema.parse({
    schema: "motion-scene-snapshot-v1",
    version: row.version,
    sceneEtag: `"${row.sceneDigest}"`,
    sceneDigest: row.sceneDigest,
    scene: JSON.parse(row.sceneJson),
    history: db
      .prepare(
        `SELECT version, scene_digest AS sceneDigest, created_at AS createdAt
           FROM motion_scene_versions WHERE job_id=? AND tenant_id=? ORDER BY version`,
      )
      .all(job.id, job.tenantId),
    backendCapability: BackendCapabilitySnapshotV1Schema.parse(
      JSON.parse(row.capabilityJson),
    ),
    verification: row.verificationJson
      ? VerificationReportV1Schema.parse(JSON.parse(row.verificationJson))
      : null,
  });
