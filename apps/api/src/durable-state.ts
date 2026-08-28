import type Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadSeedEnv, migrate, openDatabase, seed } from "../database/db.mjs";
import type { AuthStore, Session } from "./auth.js";
import type { IdempotencyRecord, IdempotencyStore } from "./boundary.js";
import { ARTIFACT_CONTENT_TYPES } from "./creator-workflow.js";
import type {
  CreatorWorkflowStore,
  Job,
  PreparationStage,
  ReleaseManifest,
  StoredArtifact,
} from "./creator-workflow.js";
import type { ReviewReceipt, ReviewStore } from "./reviews.js";
import type {
  AttachmentRecord,
  CasRecord,
  UploadRecord,
  UploadStore,
} from "./uploads.js";
import { WorkerPhaseSchema } from "./workers.js";
import type {
  ClaimedJob,
  Worker,
  WorkerPhase,
  WorkerSession,
  WorkerStore,
} from "./workers.js";

type RuntimeStores = Readonly<{
  auth: AuthStore;
  uploads: UploadStore;
  workflow: CreatorWorkflowStore;
  reviews: ReviewStore;
  workers: WorkerStore;
  idempotency: IdempotencyStore;
}>;
type AttemptList =
  CreatorWorkflowStore["attempts"] extends Map<string, infer T> ? T : never;
type Attempt = AttemptList[number];
type ReviewSnapshot =
  ReviewStore["current"] extends Map<string, infer T> ? T : never;
type UploadMetadata = Omit<
  UploadRecord,
  "chunks" | "chunkHashes" | "chunkSizes"
>;
type ArtifactMetadata = Omit<StoredArtifact, "bytes">;

const JsonRows = z.array(z.object({ id: z.string(), valueJson: z.string() }));
const ChunkRows = z.array(
  z.object({
    uploadId: z.string(),
    index: z.number().int().nonnegative(),
    sizeBytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
);
const AttachmentRows = z.array(
  z.object({
    id: z.string(),
    tenantId: z.string(),
    fileName: z.string(),
    contentType: z.enum([
      "image/png",
      "image/jpeg",
      "image/svg+xml",
      "font/ttf",
      "font/otf",
      "font/woff2",
      "video/mp4",
    ]),
    sizeBytes: z.number().int().nonnegative(),
    storagePath: z.string(),
    createdAt: z.string(),
  }),
);
const ArtifactSlotSchema = z.enum([
  "STAGED",
  "PREVIEW",
  "PUBLISHED",
  "PREVIEW_LABELED",
  "EVIDENCE_VIDEO",
  "SAFETY_SAMPLE",
  "GENERATED_ASSET",
]);
type ArtifactSlot = z.infer<typeof ArtifactSlotSchema>;
// One mapping for persist, hydrate, and clear. Splitting it is what left
// evidenceVideos/safetySamples unsaved: they were added to the store but
// only three of the four call sites knew about them.
const artifactSlots = (
  workflow: CreatorWorkflowStore,
): Readonly<Record<ArtifactSlot, Map<string, StoredArtifact>>> => ({
  STAGED: workflow.stagedArtifacts,
  PREVIEW: workflow.previews,
  PUBLISHED: workflow.artifacts,
  PREVIEW_LABELED: workflow.previewsLabeled,
  EVIDENCE_VIDEO: workflow.evidenceVideos,
  SAFETY_SAMPLE: workflow.safetySamples,
  // Keyed by job *and* asset, unlike every other slot -- see
  // generatedAssetKey in creator-workflow.ts. The mechanism does not care:
  // it round-trips whatever map key it is given.
  GENERATED_ASSET: workflow.generatedAssets,
});
const ArtifactRows = z.array(
  z.object({
    slot: ArtifactSlotSchema,
    mapKey: z.string(),
    storagePath: z.string(),
    valueJson: z.string(),
  }),
);
const WorkerSessionRows = z.array(
  z.object({
    workerId: z.string(),
    tokenHash: z.string().regex(/^[a-f0-9]{64}$/u),
    expiresAt: z.number().int(),
  }),
);
const LeaseRows = z.array(
  z.object({
    jobId: z.string(),
    attemptId: z.string(),
    workerId: z.string(),
    tokenHash: z.string().regex(/^[a-f0-9]{64}$/u),
    phase: WorkerPhaseSchema,
    deletionEpoch: z.number().int().nonnegative(),
    restoreEpoch: z.number().int().nonnegative(),
    expiresAt: z.number().int(),
  }),
);
const SessionRows = z.array(
  z.object({
    id: z.string(),
    userId: z.string(),
    tenantId: z.string(),
    expiresAt: z.string(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
  }),
);
const IdempotencyRows = z.array(
  z.object({
    storeName: z.enum(["HTTP", "WORKFLOW"]),
    identity: z.string(),
    valueJson: z.string(),
  }),
);

const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const hydrateJob = (value: string): Job => {
  const stored = parseJson<Partial<Job> & Pick<Job, "id">>(value);
  if (
    typeof stored.tenantId !== "string" ||
    typeof stored.creatorId !== "string" ||
    typeof stored.uploadId !== "string" ||
    typeof stored.state !== "string" ||
    typeof stored.attempt !== "number" ||
    typeof stored.etag !== "string" ||
    typeof stored.createdAt !== "string" ||
    typeof stored.updatedAt !== "string" ||
    typeof stored.irDigest !== "string" ||
    typeof stored.evidenceDigest !== "string" ||
    typeof stored.approved !== "boolean" ||
    typeof stored.startFrame !== "number" ||
    typeof stored.sourceFps !== "number" ||
    typeof stored.frameCount !== "number"
  )
    throw new Error("RUNTIME_JOB_CORRUPT");
  return {
    ...stored,
    evidence: stored.evidence ?? null,
    candidateEvidence: stored.candidateEvidence ?? null,
    candidateEvidenceDigest: stored.candidateEvidenceDigest ?? null,
    preparationStage:
      stored.preparationStage ??
      (stored.state === "PREPARING" ? "AWAITING_T1" : "READY"),
    pendingCompilation: stored.pendingCompilation ?? null,
    compilation: stored.compilation ?? null,
    previewSpecDigest: stored.previewSpecDigest ?? null,
    approvedSpecDigest: stored.approvedSpecDigest ?? null,
    eligibleAt: stored.eligibleAt ?? Date.parse(stored.updatedAt),
    automaticRetries: stored.automaticRetries ?? 0,
    deletionEpoch: stored.deletionEpoch ?? 0,
    restoreEpoch: stored.restoreEpoch ?? 0,
    failureCode: stored.failureCode ?? null,
    runtimePreflight: stored.runtimePreflight ?? null,
    progress: stored.progress ?? null,
    artifact: stored.artifact ?? null,
  } as Job;
};
const segment = (value: string): string => encodeURIComponent(value);
export function openApiDatabase(databasePath: string): Database.Database {
  const db = openDatabase(databasePath);
  migrate(db);
  seed(db, loadSeedEnv());
  return db;
}

const writeArtifact = (
  root: string,
  artifact: StoredArtifact,
): StoredArtifact => {
  if (
    artifact.storagePath &&
    existsSync(artifact.storagePath) &&
    statSync(artifact.storagePath).size === artifact.sizeBytes
  )
    return artifact;
  if (artifact.bytes.byteLength !== artifact.sizeBytes)
    throw new Error("ARTIFACT_STORAGE_INCOMPLETE");
  const directory = path.join(root, segment(artifact.tenantId));
  // Extension follows the content type -- safety samples are png, resolved
  // scene assets are whatever the attachment or provider produced, and
  // everything else is mp4.
  const extension = ARTIFACT_CONTENT_TYPES[artifact.contentType] ?? "mp4";
  const storagePath = path.join(
    directory,
    `${segment(artifact.id)}.${extension}`,
  );
  const temporary = `${storagePath}.tmp`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(temporary, artifact.bytes, { mode: 0o600, flush: true });
  renameSync(temporary, storagePath);
  return { ...artifact, bytes: new Uint8Array(), storagePath };
};

// Which stage an interrupted lease returns to. `render` has no preparation
// stage (the job state alone re-queues it), hence null. Keyed by WorkerPhase
// so adding a phase without deciding its recovery is a type error.
const RECOVERED_STAGE: Readonly<Record<WorkerPhase, PreparationStage | null>> =
  {
    analyze: "ANALYSIS_QUEUED",
    compile: "COMPILATION_QUEUED",
    "evidence-video": "EVIDENCE_VIDEO_QUEUED",
    preview: "PREVIEW_QUEUED",
    assets: "ASSETS_QUEUED",
    render: null,
    // Like `render`: the job state alone (QUEUED) re-queues it, so there is
    // no preparation stage to return to.
    "gen-render": null,
  };

const recoverLease = (
  stores: RuntimeStores,
  jobId: string,
  timestamp: number,
): void => {
  const lease = stores.workers.leases.get(jobId);
  if (!lease) return;
  stores.workers.leases.delete(jobId);
  const attempt = stores.workflow.attempts
    .get(jobId)
    ?.find((item) => item.id === lease.attemptId);
  if (attempt?.state === "RUNNING") attempt.state = "QUEUED";
  const job = stores.workflow.jobs.get(jobId);
  if (job?.state === "RENDERING") job.state = "QUEUED";
  const requeued = RECOVERED_STAGE[lease.phase];
  if (job && requeued) job.preparationStage = requeued;
  if (job) {
    job.updatedAt = new Date(timestamp).toISOString();
    job.eligibleAt = timestamp;
  }
};

export function createDurableState(
  db: Database.Database,
  stores: RuntimeStores,
  artifactRoot: string,
): Readonly<{ hydrate: () => void; persist: () => void }> {
  const clearRuntime = (): void => {
    for (const table of [
      "runtime_job_leases",
      "runtime_release_manifests",
      "worker_sessions",
      "runtime_workers",
      "runtime_artifacts",
      "runtime_job_attempts",
      "runtime_jobs",
      "runtime_review_current",
      "runtime_upload_chunks",
      "runtime_uploads",
      "runtime_attachments",
      "runtime_cas_objects",
      "runtime_idempotency",
      "sessions",
    ])
      db.exec(`DELETE FROM ${table}`);
  };

  const persistTransaction = db.transaction(() => {
    clearRuntime();
    const insertSession = db.prepare(
      "INSERT INTO sessions(id,user_id,tenant_id,expires_at,revoked_at,created_at) VALUES(?,?,?,?,?,?)",
    );
    for (const session of stores.auth.sessions)
      insertSession.run(
        session.id,
        session.userId,
        session.tenantId,
        new Date(session.expiresAt).toISOString(),
        session.revokedAt === null
          ? null
          : new Date(session.revokedAt).toISOString(),
        // The session's own createdAt, not the moment of this snapshot:
        // the snapshot is rewritten on every mutation, so stamping "now"
        // here would push the absolute expiry ceiling forward forever and
        // turn it back into no ceiling at all.
        new Date(session.createdAt).toISOString(),
      );

    const insertUpload = db.prepare(
      "INSERT INTO runtime_uploads(id,tenant_id,state,expires_at,value_json) VALUES(?,?,?,?,?)",
    );
    const insertChunk = db.prepare(
      "INSERT INTO runtime_upload_chunks(upload_id,chunk_index,size_bytes,sha256) VALUES(?,?,?,?)",
    );
    for (const upload of stores.uploads.uploads.values()) {
      const { chunks: _chunks, chunkHashes, chunkSizes, ...metadata } = upload;
      insertUpload.run(
        upload.id,
        upload.tenantId,
        upload.state,
        upload.expiresAt,
        JSON.stringify(metadata),
      );
      for (const [index, sha256] of chunkHashes.entries()) {
        const sizeBytes = chunkSizes[index];
        if (!sizeBytes) throw new Error("UPLOAD_CHUNK_METADATA_MISSING");
        insertChunk.run(upload.id, index, sizeBytes, sha256);
      }
    }
    const insertCas = db.prepare(
      "INSERT INTO runtime_cas_objects(id,tenant_id,sha256,storage_path,value_json) VALUES(?,?,?,?,?)",
    );
    for (const item of stores.uploads.cas.values()) {
      const storagePath = path.join(
        stores.uploads.casRoot ?? "",
        segment(item.tenantId),
        item.sha256,
      );
      insertCas.run(
        item.id,
        item.tenantId,
        item.sha256,
        storagePath,
        JSON.stringify(item),
      );
    }

    // Metadata only -- the bytes were written to disk by createAttachment,
    // so this snapshot stays cheap to rewrite on every mutation. An
    // attachment with no storagePath belongs to a store built without an
    // attachmentRoot (test fixtures); there is nothing durable to record.
    const insertAttachment = db.prepare(
      "INSERT INTO runtime_attachments(id,tenant_id,filename,content_type,size_bytes,storage_path,created_at) VALUES(?,?,?,?,?,?,?)",
    );
    for (const attachment of stores.uploads.attachments?.values() ?? [])
      if (attachment.storagePath)
        insertAttachment.run(
          attachment.id,
          attachment.tenantId,
          attachment.fileName,
          attachment.contentType,
          attachment.sizeBytes,
          attachment.storagePath,
          attachment.createdAt,
        );

    const insertJob = db.prepare(
      "INSERT INTO runtime_jobs(id,tenant_id,state,attempt,updated_at,value_json,preparation_stage,eligible_at,automatic_retries,deletion_epoch,restore_epoch) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    );
    const insertAttempt = db.prepare(
      "INSERT INTO runtime_job_attempts(job_id,id,number,state,value_json) VALUES(?,?,?,?,?)",
    );
    for (const job of stores.workflow.jobs.values()) {
      insertJob.run(
        job.id,
        job.tenantId,
        job.state,
        job.attempt,
        job.updatedAt,
        JSON.stringify(job),
        job.preparationStage,
        job.eligibleAt,
        job.automaticRetries,
        job.deletionEpoch,
        job.restoreEpoch,
      );
      for (const attempt of stores.workflow.attempts.get(job.id) ?? [])
        insertAttempt.run(
          job.id,
          attempt.id,
          attempt.number,
          attempt.state,
          JSON.stringify(attempt),
        );
    }
    const insertArtifact = db.prepare(
      "INSERT INTO runtime_artifacts(slot,map_key,id,job_id,tenant_id,storage_path,value_json) VALUES(?,?,?,?,?,?,?)",
    );
    for (const [slot, map] of Object.entries(artifactSlots(stores.workflow)))
      for (const [mapKey, artifact] of map) {
        const { bytes: _bytes, ...metadata } = artifact;
        if (!artifact.storagePath)
          throw new Error("ARTIFACT_STORAGE_PATH_MISSING");
        insertArtifact.run(
          slot,
          mapKey,
          artifact.id,
          artifact.jobId,
          artifact.tenantId,
          artifact.storagePath,
          JSON.stringify(metadata),
        );
      }

    const insertReceipt = db.prepare(
      "INSERT INTO runtime_review_receipts(id,release_id,tenant_id,job_id,gate,attempt,sequence,value_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    );
    const storedReceipt = db.prepare(
      "SELECT value_json AS valueJson FROM runtime_review_receipts WHERE id=?",
    );
    for (const receipt of stores.reviews.receipts) {
      const valueJson = JSON.stringify(receipt);
      const inserted = insertReceipt.run(
        receipt.id,
        receipt.releaseId,
        receipt.tenantId,
        receipt.jobId,
        receipt.gate,
        receipt.attempt,
        receipt.sequence,
        valueJson,
      );
      if (
        inserted.changes === 0 &&
        z.object({ valueJson: z.string() }).parse(storedReceipt.get(receipt.id))
          .valueJson !== valueJson
      )
        throw new Error("RECEIPT_IMMUTABLE");
    }
    const insertCurrent = db.prepare(
      "INSERT INTO runtime_review_current(scope_key,value_json) VALUES(?,?)",
    );
    for (const [key, value] of stores.reviews.current)
      insertCurrent.run(key, JSON.stringify(value));

    const insertReleaseManifest = db.prepare(
      "INSERT INTO runtime_release_manifests(release_id,value_json) VALUES(?,?)",
    );
    for (const [releaseId, manifest] of stores.workflow.releaseManifests)
      insertReleaseManifest.run(releaseId, JSON.stringify(manifest));

    const insertWorker = db.prepare(
      "INSERT INTO runtime_workers(id,status,last_heartbeat,value_json) VALUES(?,?,?,?)",
    );
    for (const worker of stores.workers.workers.values())
      insertWorker.run(
        worker.id,
        worker.status,
        worker.lastHeartbeat,
        JSON.stringify(worker),
      );
    const insertWorkerSession = db.prepare(
      "INSERT INTO worker_sessions(worker_id,token_hash,expires_at) VALUES(?,?,?)",
    );
    for (const session of stores.workers.sessions.values())
      insertWorkerSession.run(
        session.workerId,
        session.tokenHash,
        session.expiresAt,
      );
    const insertLease = db.prepare(
      "INSERT INTO runtime_job_leases(job_id,attempt_id,worker_id,token_hash,expires_at,phase,deletion_epoch,restore_epoch) VALUES(?,?,?,?,?,?,?,?)",
    );
    for (const lease of stores.workers.leases.values())
      insertLease.run(
        lease.jobId,
        lease.attemptId,
        lease.workerId,
        lease.tokenHash,
        lease.expiresAt,
        lease.phase,
        lease.deletionEpoch,
        lease.restoreEpoch,
      );

    const insertIdempotency = db.prepare(
      "INSERT INTO runtime_idempotency(store_name,identity,value_json) VALUES(?,?,?)",
    );
    for (const [storeName, idempotency] of [
      ["HTTP", stores.idempotency],
      ["WORKFLOW", stores.workflow.idempotency],
    ] as const)
      for (const [identity, value] of idempotency.snapshot())
        insertIdempotency.run(storeName, identity, JSON.stringify(value));
  });

  const persist = (): void => {
    for (const map of Object.values(artifactSlots(stores.workflow)))
      for (const [key, artifact] of map)
        map.set(key, writeArtifact(artifactRoot, artifact));
    persistTransaction.immediate();
    for (const upload of stores.uploads.uploads.values())
      if (upload.state === "ACCEPTED" && upload.stagingPath && upload.casPath)
        rmSync(path.dirname(upload.stagingPath), {
          force: true,
          recursive: true,
        });
  };

  const hydrate = (): void => {
    stores.auth.sessions.splice(0, stores.auth.sessions.length);
    stores.uploads.uploads.clear();
    stores.uploads.cas.clear();
    stores.uploads.casByTenantDigest.clear();
    stores.workflow.jobs.clear();
    stores.workflow.attempts.clear();
    for (const map of Object.values(artifactSlots(stores.workflow)))
      map.clear();
    stores.workflow.releaseManifests.clear();
    stores.reviews.receipts.splice(0, stores.reviews.receipts.length);
    stores.reviews.current.clear();
    stores.workers.workers.clear();
    stores.workers.sessions.clear();
    stores.workers.leases.clear();

    const sessions = SessionRows.parse(
      db
        .prepare(
          "SELECT id,user_id AS userId,tenant_id AS tenantId,expires_at AS expiresAt,revoked_at AS revokedAt,created_at AS createdAt FROM sessions",
        )
        .all(),
    );
    stores.auth.sessions.push(
      ...sessions.map(
        (session): Session => ({
          id: session.id,
          userId: session.userId,
          tenantId: session.tenantId,
          expiresAt: Date.parse(session.expiresAt),
          createdAt: Date.parse(session.createdAt),
          revokedAt:
            session.revokedAt === null ? null : Date.parse(session.revokedAt),
        }),
      ),
    );

    const chunks = ChunkRows.parse(
      db
        .prepare(
          "SELECT upload_id AS uploadId,chunk_index AS 'index',size_bytes AS sizeBytes,sha256 FROM runtime_upload_chunks ORDER BY upload_id,chunk_index",
        )
        .all(),
    );
    for (const row of JsonRows.parse(
      db
        .prepare(
          "SELECT id,value_json AS valueJson FROM runtime_uploads ORDER BY id",
        )
        .all(),
    )) {
      const metadata = parseJson<UploadMetadata>(row.valueJson);
      const uploadChunks = chunks.filter((chunk) => chunk.uploadId === row.id);
      const upload: UploadRecord = {
        ...metadata,
        chunks: uploadChunks.map(() => new Uint8Array()),
        chunkHashes: uploadChunks.map((chunk) => chunk.sha256),
        chunkSizes: uploadChunks.map((chunk) => chunk.sizeBytes),
      };
      if (upload.state === "VALIDATING")
        upload.state =
          upload.stagingPath && existsSync(upload.stagingPath)
            ? "PENDING"
            : "QUARANTINED";
      stores.uploads.uploads.set(row.id, upload);
    }
    for (const row of JsonRows.parse(
      db
        .prepare(
          "SELECT id,value_json AS valueJson FROM runtime_cas_objects ORDER BY id",
        )
        .all(),
    )) {
      const item = parseJson<CasRecord>(row.valueJson);
      stores.uploads.cas.set(item.id, item);
      stores.uploads.casByTenantDigest.set(
        `${item.tenantId}:${item.sha256}`,
        item.id,
      );
    }
    const attachments =
      stores.uploads.attachments ?? new Map<string, AttachmentRecord>();
    stores.uploads.attachments = attachments;
    for (const row of AttachmentRows.parse(
      db
        .prepare(
          "SELECT id,tenant_id AS tenantId,filename AS fileName,content_type AS contentType,size_bytes AS sizeBytes,storage_path AS storagePath,created_at AS createdAt FROM runtime_attachments ORDER BY id",
        )
        .all(),
    )) {
      // A row whose file is gone is not an attachment any more. Dropping
      // it here makes the job that references it fail with
      // ATTACHMENT_UNRESOLVED, which is the honest answer -- better than
      // serving zero bytes as if they were a logo.
      if (!existsSync(row.storagePath)) continue;
      attachments.set(row.id, { ...row, bytes: new Uint8Array() });
    }

    for (const row of JsonRows.parse(
      db
        .prepare(
          "SELECT id,value_json AS valueJson FROM runtime_jobs ORDER BY updated_at,id",
        )
        .all(),
    ))
      stores.workflow.jobs.set(row.id, hydrateJob(row.valueJson));
    for (const row of z
      .array(
        z.object({
          jobId: z.string(),
          valueJson: z.string(),
        }),
      )
      .parse(
        db
          .prepare(
            "SELECT job_id AS jobId,value_json AS valueJson FROM runtime_job_attempts ORDER BY job_id,number",
          )
          .all(),
      )) {
      const attempts = stores.workflow.attempts.get(row.jobId) ?? [];
      attempts.push(parseJson<Attempt>(row.valueJson));
      stores.workflow.attempts.set(row.jobId, attempts);
    }
    for (const row of ArtifactRows.parse(
      db
        .prepare(
          "SELECT slot,map_key AS mapKey,storage_path AS storagePath,value_json AS valueJson FROM runtime_artifacts ORDER BY slot,map_key",
        )
        .all(),
    )) {
      const artifact: StoredArtifact = {
        ...parseJson<ArtifactMetadata>(row.valueJson),
        bytes: new Uint8Array(),
        storagePath: row.storagePath,
      };
      artifactSlots(stores.workflow)[row.slot].set(row.mapKey, artifact);
    }

    for (const row of JsonRows.parse(
      db
        .prepare(
          "SELECT id,value_json AS valueJson FROM runtime_review_receipts ORDER BY sequence",
        )
        .all(),
    ))
      stores.reviews.receipts.push(parseJson<ReviewReceipt>(row.valueJson));
    stores.reviews.sequence.value =
      stores.reviews.receipts.at(-1)?.sequence ?? 0;
    for (const row of z
      .array(z.object({ scopeKey: z.string(), valueJson: z.string() }))
      .parse(
        db
          .prepare(
            "SELECT scope_key AS scopeKey,value_json AS valueJson FROM runtime_review_current",
          )
          .all(),
      ))
      stores.reviews.current.set(
        row.scopeKey,
        parseJson<ReviewSnapshot>(row.valueJson),
      );

    for (const row of z
      .array(z.object({ releaseId: z.string(), valueJson: z.string() }))
      .parse(
        db
          .prepare(
            "SELECT release_id AS releaseId,value_json AS valueJson FROM runtime_release_manifests ORDER BY release_id",
          )
          .all(),
      ))
      stores.workflow.releaseManifests.set(
        row.releaseId,
        parseJson<ReleaseManifest>(row.valueJson),
      );

    for (const row of JsonRows.parse(
      db
        .prepare(
          "SELECT id,value_json AS valueJson FROM runtime_workers ORDER BY id",
        )
        .all(),
    ))
      stores.workers.workers.set(row.id, parseJson<Worker>(row.valueJson));
    for (const row of WorkerSessionRows.parse(
      db
        .prepare(
          "SELECT worker_id AS workerId,token_hash AS tokenHash,expires_at AS expiresAt FROM worker_sessions",
        )
        .all(),
    ))
      stores.workers.sessions.set(row.workerId, row);
    for (const row of LeaseRows.parse(
      db
        .prepare(
          "SELECT job_id AS jobId,attempt_id AS attemptId,worker_id AS workerId,token_hash AS tokenHash,expires_at AS expiresAt,phase,deletion_epoch AS deletionEpoch,restore_epoch AS restoreEpoch FROM runtime_job_leases",
        )
        .all(),
    ))
      stores.workers.leases.set(row.jobId, row);

    const idempotency = IdempotencyRows.parse(
      db
        .prepare(
          "SELECT store_name AS storeName,identity,value_json AS valueJson FROM runtime_idempotency",
        )
        .all(),
    );
    stores.idempotency.hydrate(
      idempotency
        .filter((row) => row.storeName === "HTTP")
        .map((row) => [
          row.identity,
          parseJson<IdempotencyRecord>(row.valueJson),
        ]),
    );
    stores.workflow.idempotency.hydrate(
      idempotency
        .filter((row) => row.storeName === "WORKFLOW")
        .map((row) => [
          row.identity,
          parseJson<IdempotencyRecord>(row.valueJson),
        ]),
    );

    const timestamp = Date.now();
    for (const [workerId, session] of stores.workers.sessions)
      if (session.expiresAt <= timestamp) {
        stores.workers.sessions.delete(workerId);
        const worker = stores.workers.workers.get(workerId);
        if (worker) worker.status = "OFFLINE";
      }
    stores.workflow.availablePreflight =
      [...stores.workers.workers.values()]
        .filter((item) => item.status === "ONLINE")
        .sort((left, right) => right.lastHeartbeat - left.lastHeartbeat)[0]
        ?.preflight ?? null;
    for (const [jobId, lease] of stores.workers.leases)
      if (
        lease.expiresAt <= timestamp ||
        !stores.workers.sessions.has(lease.workerId) ||
        stores.workflow.jobs.get(jobId)?.deletionEpoch !==
          lease.deletionEpoch ||
        stores.workflow.jobs.get(jobId)?.restoreEpoch !== lease.restoreEpoch
      )
        recoverLease(stores, jobId, timestamp);
    persist();
  };

  return { hydrate, persist };
}
