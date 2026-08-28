import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { verifyPassword, type AuthStore } from "./auth.js";
import { IdempotencyStore } from "./boundary.js";
import {
  createCreatorWorkflowStore,
  PreparationStageSchema,
  RUNTIME_DIGEST,
  type Job,
} from "./creator-workflow.js";
import { createDurableState, openApiDatabase } from "./durable-state.js";
import { createReviewStore } from "./reviews.js";
import {
  createAttachment,
  createUpload,
  finalizeUpload,
  putChunk,
  type UploadStore,
} from "./uploads.js";
import {
  createWorkerStore,
  hashWorkerToken,
  WorkerPhaseSchema,
} from "./workers.js";

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const preflight = {
  status: "PASS",
  chromiumVersion: "151.0.7922.138",
  renderer: "ANGLE SwiftShader",
  fontReady: true,
  webgl2: true,
  networkPolicy: "external-blocked",
  repeatedFrameByteIdentity: true,
  ffmpeg: true,
  ffprobe: true,
  compilerModels: true,
  runtimeDigest: RUNTIME_DIGEST,
} as const;

const stores = (root: string) => {
  const auth: AuthStore = {
    users: [{ id: "usr_platform", email: "platform@example.invalid" }],
    credentials: [],
    memberships: [
      { userId: "usr_platform", tenantId: "ten_platform", role: "OWNER" },
    ],
    assignments: [],
    sessions: [],
    apiTokens: [],
    audit: () => undefined,
  };
  const uploads: UploadStore = {
    uploads: new Map(),
    cas: new Map(),
    casByTenantDigest: new Map(),
    now: () => 1_000,
    stagingRoot: join(root, "staging"),
    casRoot: join(root, "cas"),
    attachmentRoot: join(root, "brand-attachments"),
  };
  return {
    auth,
    uploads,
    workflow: createCreatorWorkflowStore(() => 1_000),
    reviews: createReviewStore(),
    workers: createWorkerStore(hashWorkerToken("bootstrap")),
    idempotency: new IdempotencyStore(),
  };
};

const baseJob: Job = {
  id: "job_base",
  tenantId: "ten_platform",
  creatorId: "usr_platform",
  uploadId: "upl_base",
  state: "PREPARING",
  attempt: 1,
  etag: '"etag"',
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  irDigest: "ir",
  evidenceDigest: "evidence",
  approved: false,
  startFrame: 0,
  sourceFps: 30,
  frameCount: 120,
  evidence: { state: "MAPPED" },
  candidateEvidence: null,
  candidateEvidenceDigest: null,
  preparationStage: "AWAITING_T1",
  pendingCompilation: null,
  compilation: null,
  previewSpecDigest: null,
  approvedSpecDigest: null,
  eligibleAt: 1_000,
  automaticRetries: 0,
  deletionEpoch: 0,
  restoreEpoch: 0,
  failureCode: null,
  runtimePreflight: preflight,
  progress: null,
  creativePrompt: null,
  artifact: null,
};

describe("SQLite runtime durability", () => {
  // Brand attachments used to live only in an in-memory Map. An API
  // restart between the upload and the assets stage lost every one of them
  // while the job that referenced them survived -- ten minutes of
  // analysis, compilation and preview, then ATTACHMENT_UNRESOLVED.
  it("keeps brand attachments, and their filenames, across a restart", () => {
    const root = mkdtempSync(join(tmpdir(), "rvs-attachment-restart-"));
    const databasePath = join(root, "app.sqlite");
    const bytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    try {
      const firstDb = openApiDatabase(databasePath);
      const firstStores = stores(root);
      const first = createDurableState(
        firstDb,
        firstStores,
        join(root, "artifacts"),
      );
      first.hydrate();
      const created = createAttachment(
        firstStores.uploads,
        "ten_platform",
        bytes,
        "05_ranking.jpg",
      );
      // Written through to disk, not held in memory.
      expect(created.storagePath).toBeTruthy();
      expect(created.bytes.byteLength).toBe(0);
      first.persist();
      firstDb.close();

      const secondDb = openApiDatabase(databasePath);
      const secondStores = stores(root);
      createDurableState(
        secondDb,
        secondStores,
        join(root, "artifacts"),
      ).hydrate();
      const restored = secondStores.uploads.attachments?.get(created.id);
      expect(restored?.fileName).toBe("05_ranking.jpg");
      expect(restored?.contentType).toBe("image/png");
      expect(restored?.sizeBytes).toBe(bytes.byteLength);
      expect(readFileSync(restored?.storagePath ?? "")).toEqual(
        Buffer.from(bytes),
      );
      secondDb.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // A row whose file is gone is not an attachment. Serving zero bytes as a
  // logo is worse than failing the job that wanted it.
  it("drops an attachment whose bytes are missing from disk", () => {
    const root = mkdtempSync(join(tmpdir(), "rvs-attachment-missing-"));
    const databasePath = join(root, "app.sqlite");
    try {
      const firstDb = openApiDatabase(databasePath);
      const firstStores = stores(root);
      const first = createDurableState(
        firstDb,
        firstStores,
        join(root, "artifacts"),
      );
      first.hydrate();
      const created = createAttachment(
        firstStores.uploads,
        "ten_platform",
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "logo.png",
      );
      first.persist();
      firstDb.close();
      rmSync(created.storagePath ?? "", { force: true });

      const secondDb = openApiDatabase(databasePath);
      const secondStores = stores(root);
      createDurableState(
        secondDb,
        secondStores,
        join(root, "artifacts"),
      ).hydrate();
      expect(secondStores.uploads.attachments?.get(created.id)).toBeUndefined();
      secondDb.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reconciles configured admin credentials in an existing database", () => {
    const root = mkdtempSync(join(tmpdir(), "rvs-admin-"));
    const databasePath = join(root, "app.sqlite");
    const previousEmail = process.env["RVS_INITIAL_ADMIN_EMAIL"];
    const previousName = process.env["RVS_INITIAL_ADMIN_NAME"];
    const previousPassword = process.env["RVS_INITIAL_ADMIN_PASSWORD"];
    try {
      process.env["RVS_INITIAL_ADMIN_EMAIL"] = "first@example.test";
      process.env["RVS_INITIAL_ADMIN_NAME"] = "First Admin";
      process.env["RVS_INITIAL_ADMIN_PASSWORD"] = "first-password";
      openApiDatabase(databasePath).close();

      process.env["RVS_INITIAL_ADMIN_EMAIL"] = "second@example.test";
      process.env["RVS_INITIAL_ADMIN_NAME"] = "Second Admin";
      process.env["RVS_INITIAL_ADMIN_PASSWORD"] = "second-password";
      const db = openApiDatabase(databasePath);
      const row = z
        .object({
          email: z.string(),
          displayName: z.string(),
          secretHash: z.string(),
        })
        .parse(
          db
            .prepare(
              `SELECT u.email, u.display_name AS displayName, c.secret_hash AS secretHash
                 FROM users u
                 JOIN credentials c ON c.user_id = u.id
                WHERE u.id = 'usr_platform'`,
            )
            .get(),
        );
      db.close();

      expect(row.email).toBe("second@example.test");
      expect(row.displayName).toBe("Second Admin");
      expect(verifyPassword("second-password", row.secretHash)).toBe(true);
      expect(verifyPassword("first-password", row.secretHash)).toBe(false);
    } finally {
      if (previousEmail === undefined)
        delete process.env["RVS_INITIAL_ADMIN_EMAIL"];
      else process.env["RVS_INITIAL_ADMIN_EMAIL"] = previousEmail;
      if (previousName === undefined)
        delete process.env["RVS_INITIAL_ADMIN_NAME"];
      else process.env["RVS_INITIAL_ADMIN_NAME"] = previousName;
      if (previousPassword === undefined)
        delete process.env["RVS_INITIAL_ADMIN_PASSWORD"];
      else process.env["RVS_INITIAL_ADMIN_PASSWORD"] = previousPassword;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("round-trips an evidence-video lease and re-queues it on expiry", () => {
    // Regression: the lease-row Zod enum was a hand-written duplicate that
    // never gained "evidence-video", so such a lease persisted but threw on
    // hydrate -- an unrecoverable boot crash-loop, since the row is durable.
    const root = mkdtempSync(join(tmpdir(), "rvs-durable-evidence-"));
    const databasePath = join(root, "app.sqlite");
    const first = stores(join(root, "objects"));
    const job: Job = {
      ...baseJob,
      id: "job_evidence_video",
      state: "PREPARING",
      preparationStage: "EVIDENCE_VIDEO_RUNNING",
    };
    first.workflow.jobs.set(job.id, job);
    first.workflow.attempts.set(job.id, [
      { id: "attempt_ev", number: 1, state: "RUNNING", immutable: true },
    ]);
    first.workers.workers.set("worker_ev", {
      id: "worker_ev",
      capabilities: ["renderer"],
      lastHeartbeat: 1_000,
      status: "ONLINE",
      preflight,
    });
    first.workers.sessions.set("worker_ev", {
      workerId: "worker_ev",
      tokenHash: hashWorkerToken("session-token"),
      expiresAt: Date.now() + 60_000,
    });
    first.workers.leases.set(job.id, {
      jobId: job.id,
      attemptId: "attempt_ev",
      workerId: "worker_ev",
      tokenHash: hashWorkerToken("lease-token"),
      phase: "evidence-video",
      deletionEpoch: 0,
      restoreEpoch: 0,
      expiresAt: Date.now() + 30_000,
    });
    const firstDb = openApiDatabase(databasePath);
    createDurableState(
      firstDb,
      first,
      join(root, "objects", "artifacts"),
    ).persist();
    firstDb.close();

    // Boot must survive, and the lease must come back intact.
    const second = stores(join(root, "objects"));
    const secondDb = openApiDatabase(databasePath);
    createDurableState(
      secondDb,
      second,
      join(root, "objects", "artifacts"),
    ).hydrate();
    expect(second.workers.leases.get(job.id)?.phase).toBe("evidence-video");
    secondDb
      .prepare("UPDATE runtime_job_leases SET expires_at=0 WHERE job_id=?")
      .run(job.id);
    secondDb.close();

    // An expired evidence-video lease must return to a *_QUEUED stage, or the
    // job is never claimable again and sits in PREPARING forever.
    const recovered = stores(join(root, "objects"));
    const recoveredDb = openApiDatabase(databasePath);
    createDurableState(
      recoveredDb,
      recovered,
      join(root, "objects", "artifacts"),
    ).hydrate();
    expect(recovered.workers.leases.has(job.id)).toBe(false);
    expect(recovered.workflow.jobs.get(job.id)?.preparationStage).toBe(
      "EVIDENCE_VIDEO_QUEUED",
    );
    recoveredDb.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("restores jobs, uploads, artifacts, sessions, and lease recovery without DB blobs", () => {
    const root = mkdtempSync(join(tmpdir(), "rvs-durable-"));
    const databasePath = join(root, "app.sqlite");
    const firstStores = stores(join(root, "objects"));
    const bytes = Buffer.from([
      0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109,
    ]);
    const upload = createUpload(firstStores.uploads, "ten_platform", {
      fileName: "source.mp4",
      sizeBytes: bytes.byteLength,
    });
    putChunk(
      firstStores.uploads,
      "ten_platform",
      upload.id,
      0,
      bytes,
      `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
      sha256(bytes),
    );
    finalizeUpload(firstStores.uploads, "ten_platform", upload.id, {
      orderedChunkCount: 1,
      declaredSha256: sha256(bytes),
    });
    const job: Job = {
      id: "job_restart",
      tenantId: "ten_platform",
      creatorId: "usr_platform",
      uploadId: upload.id,
      state: "RENDERING",
      attempt: 1,
      etag: '"etag"',
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      irDigest: "ir",
      evidenceDigest: "evidence",
      approved: true,
      startFrame: 0,
      sourceFps: 30,
      frameCount: 120,
      evidence: { state: "MAPPED" },
      candidateEvidence: null,
      candidateEvidenceDigest: null,
      preparationStage: "READY",
      pendingCompilation: null,
      compilation: null,
      previewSpecDigest: null,
      approvedSpecDigest: null,
      eligibleAt: 1_000,
      automaticRetries: 0,
      deletionEpoch: 0,
      restoreEpoch: 0,
      failureCode: null,
      runtimePreflight: preflight,
      progress: {
        phase: "render",
        stage: "frame-capture",
        fraction: 0.5,
        framesProcessed: 60,
        framesTotal: 120,
      },
      artifact: null,
    };
    firstStores.workflow.jobs.set(job.id, job);
    firstStores.workflow.attempts.set(job.id, [
      { id: "attempt_restart", number: 1, state: "RUNNING", immutable: true },
    ]);
    firstStores.workflow.previews.set(job.id, {
      id: "preview_restart",
      jobId: job.id,
      tenantId: job.tenantId,
      kind: "preview",
      filename: "preview.mp4",
      contentType: "video/mp4",
      bytes: Uint8Array.from([1, 2, 3, 4]),
      sha256: sha256(Uint8Array.from([1, 2, 3, 4])),
      sizeBytes: 4,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
      report: null,
    });
    firstStores.workflow.evidenceVideos.set(job.id, {
      id: "evidencevideo_restart",
      jobId: job.id,
      tenantId: job.tenantId,
      kind: "evidence-video",
      filename: "evidence.mp4",
      contentType: "video/mp4",
      bytes: Uint8Array.from([5, 6, 7, 8]),
      sha256: sha256(Uint8Array.from([5, 6, 7, 8])),
      sizeBytes: 4,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
      report: null,
    });
    firstStores.workflow.safetySamples.set(job.id, {
      id: "safetysample_restart",
      jobId: job.id,
      tenantId: job.tenantId,
      kind: "safety-sample",
      filename: "sample.png",
      contentType: "image/png",
      bytes: Uint8Array.from([137, 80, 78, 71]),
      sha256: sha256(Uint8Array.from([137, 80, 78, 71])),
      sizeBytes: 4,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
      report: null,
    });
    firstStores.auth.sessions.push({
      id: "session_restart",
      userId: "usr_platform",
      tenantId: "ten_platform",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      revokedAt: null,
    });
    firstStores.workers.workers.set("worker_restart", {
      id: "worker_restart",
      capabilities: ["renderer"],
      lastHeartbeat: Date.now(),
      status: "ONLINE",
      preflight,
    });
    firstStores.workers.sessions.set("worker_restart", {
      workerId: "worker_restart",
      tokenHash: hashWorkerToken("session-token"),
      expiresAt: Date.now() + 60_000,
    });
    firstStores.workers.leases.set(job.id, {
      jobId: job.id,
      attemptId: "attempt_restart",
      workerId: "worker_restart",
      tokenHash: hashWorkerToken("lease-token"),
      phase: "render",
      deletionEpoch: 0,
      restoreEpoch: 0,
      expiresAt: Date.now() + 30_000,
    });

    const firstDb = openApiDatabase(databasePath);
    const first = createDurableState(
      firstDb,
      firstStores,
      join(root, "objects", "artifacts"),
    );
    first.persist();
    const storedArtifact = firstStores.workflow.previews.get(job.id);
    expect(storedArtifact?.bytes.byteLength).toBe(0);
    expect(existsSync(storedArtifact?.storagePath ?? "")).toBe(true);
    const artifactJson = z
      .object({ value_json: z.string() })
      .parse(
        firstDb
          .prepare(
            "SELECT value_json FROM runtime_artifacts WHERE id='preview_restart'",
          )
          .get(),
      ).value_json;
    expect(artifactJson).not.toContain('"bytes"');
    firstDb.close();

    const secondStores = stores(join(root, "objects"));
    const secondDb = openApiDatabase(databasePath);
    createDurableState(
      secondDb,
      secondStores,
      join(root, "objects", "artifacts"),
    ).hydrate();
    expect(secondStores.uploads.uploads.get(upload.id)).toMatchObject({
      state: "ACCEPTED",
      sourceSha256: sha256(bytes),
    });
    expect(secondStores.workflow.jobs.get(job.id)).toMatchObject({
      state: "RENDERING",
      progress: { fraction: 0.5 },
    });
    expect(secondStores.auth.sessions[0]?.id).toBe("session_restart");
    // createdAt survives the round trip: the snapshot is rewritten on
    // every mutation, and stamping it with the write time would push the
    // absolute session ceiling forward forever.
    expect(secondStores.auth.sessions[0]?.createdAt).toBeGreaterThan(0);
    expect(secondStores.workers.leases.get(job.id)?.workerId).toBe(
      "worker_restart",
    );
    // Regression: these two slots were never persisted, so a restart 404'd
    // the evidence-video download forever and dropped the safety sample,
    // which then fail-closed a perfectly good render.
    expect(secondStores.workflow.evidenceVideos.get(job.id)?.id).toBe(
      "evidencevideo_restart",
    );
    const sample = secondStores.workflow.safetySamples.get(job.id);
    expect(sample?.id).toBe("safetysample_restart");
    // png must not be stored under a .mp4 name.
    expect(sample?.storagePath).toMatch(/\.png$/u);
    expect(existsSync(sample?.storagePath ?? "")).toBe(true);
    secondDb
      .prepare("UPDATE runtime_job_leases SET expires_at=0 WHERE job_id=?")
      .run(job.id);
    secondDb.close();

    const recoveredStores = stores(join(root, "objects"));
    const recoveredDb = openApiDatabase(databasePath);
    createDurableState(
      recoveredDb,
      recoveredStores,
      join(root, "objects", "artifacts"),
    ).hydrate();
    expect(recoveredStores.workers.leases.has(job.id)).toBe(false);
    expect(recoveredStores.workflow.jobs.get(job.id)?.state).toBe("QUEUED");
    expect(recoveredStores.workflow.attempts.get(job.id)?.at(-1)?.state).toBe(
      "QUEUED",
    );
    recoveredDb.close();
    rmSync(root, { recursive: true, force: true });
  });
});

// The schema's CHECK lists and the TypeScript enums drift silently: a new
// preparation stage or worker phase is a one-line Zod edit, the suite stays
// green because nothing here persisted the new value, and production dies
// on `CHECK constraint failed` the first time a real job reaches it. That
// is exactly how AUTHORING_QUEUED, `assets`, `gen-render` and
// GENERATED_ASSET shipped without migration 013. Assert the database
// accepts every value the code can produce.
describe("the schema accepts every value the code can produce", () => {
  const withDb = <T>(run: (db: ReturnType<typeof openApiDatabase>) => T): T => {
    const root = mkdtempSync(join(tmpdir(), "rvs-enums-"));
    const db = openApiDatabase(join(root, "app.sqlite"));
    try {
      return run(db);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  };

  it("accepts every preparation stage", () => {
    withDb((db) => {
      for (const stage of PreparationStageSchema.options) {
        expect(
          () =>
            db
              .prepare(
                "INSERT INTO runtime_jobs (id, tenant_id, state, attempt, updated_at, value_json, preparation_stage) VALUES (?, 'ten_a', 'PREPARING', 1, '2026-01-01T00:00:00.000Z', '{}', ?)",
              )
              .run(`job_${stage}`, stage),
          `preparation_stage ${stage} rejected by the database`,
        ).not.toThrow();
      }
    });
  });

  it("accepts every worker phase", () => {
    withDb((db) => {
      db.prepare(
        "INSERT INTO runtime_jobs (id, tenant_id, state, attempt, updated_at, value_json) VALUES ('job_p', 'ten_a', 'PREPARING', 1, '2026-01-01T00:00:00.000Z', '{}')",
      ).run();
      db.prepare(
        "INSERT INTO runtime_workers (id, status, last_heartbeat, value_json) VALUES ('wrk_a', 'ONLINE', 0, '{}')",
      ).run();
      for (const phase of WorkerPhaseSchema.options) {
        expect(
          () =>
            db
              .prepare(
                "INSERT OR REPLACE INTO runtime_job_leases (job_id, attempt_id, worker_id, token_hash, expires_at, phase) VALUES ('job_p', 'att_a', 'wrk_a', ?, 0, ?)",
              )
              .run("0".repeat(64), phase),
          `phase ${phase} rejected by the database`,
        ).not.toThrow();
      }
    });
  });
});
