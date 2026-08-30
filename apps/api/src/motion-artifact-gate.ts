import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";
import {
  BackendCapabilitySnapshotV1Schema,
  VerificationReportV1Schema,
} from "../../../packages/contracts/src/motion.js";
import type {
  CreatorWorkflowStore,
  Job,
  StoredArtifact,
} from "./creator-workflow.js";
import { findMotionSceneRow } from "./motion-scene-store.js";

const bytesFor = (artifact: StoredArtifact): Uint8Array =>
  artifact.storagePath ? readFileSync(artifact.storagePath) : artifact.bytes;

export const validStoredArtifact = (
  artifact: StoredArtifact | undefined,
  job: Job,
): StoredArtifact | null => {
  if (
    !artifact ||
    artifact.jobId !== job.id ||
    artifact.tenantId !== job.tenantId
  )
    return null;
  try {
    const bytes = bytesFor(artifact);
    if (
      bytes.byteLength !== artifact.sizeBytes ||
      createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
    )
      return null;
    return artifact;
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
};

export const currentDeliveryGate = (
  db: Database.Database,
  store: CreatorWorkflowStore,
  job: Job,
) => {
  const row = findMotionSceneRow(db, job);
  if (!row?.verificationJson) return null;
  const verification = VerificationReportV1Schema.parse(
    JSON.parse(row.verificationJson),
  );
  if (
    verification.status !== "PASS" ||
    verification.sceneDigest !== row.sceneDigest
  )
    return null;
  const backend = BackendCapabilitySnapshotV1Schema.parse(
    JSON.parse(row.capabilityJson),
  ).backend;
  const delivery = validStoredArtifact(
    job.artifact ? store.artifacts.get(job.artifact.id) : undefined,
    job,
  );
  if (
    !delivery ||
    (row.artifactDigest && row.artifactDigest !== delivery.sha256)
  )
    return null;
  return {
    backend,
    delivery,
    scenePackage: validStoredArtifact(store.scenePackages.get(job.id), job),
  } as const;
};
