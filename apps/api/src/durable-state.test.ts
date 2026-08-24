import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { verifyPassword, type AuthStore } from "./auth.js";
import { IdempotencyStore } from "./boundary.js";
import {
  createCreatorWorkflowStore,
  RUNTIME_DIGEST,
  type Job,
} from "./creator-workflow.js";
import { createDurableState, openApiDatabase } from "./durable-state.js";
import { createReviewStore } from "./reviews.js";
import {
  createUpload,
  finalizeUpload,
  putChunk,
  type UploadStore,
} from "./uploads.js";
import { createWorkerStore, hashWorkerToken } from "./workers.js";

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

describe("SQLite runtime durability", () => {
  it("reconciles configured admin credentials in an existing database", () => {
    const root = mkdtempSync(join(tmpdir(), "rvs-admin-"));
    const databasePath = join(root, "app.sqlite");
    const previousEmail = process.env.RVS_INITIAL_ADMIN_EMAIL;
    const previousPassword = process.env.RVS_INITIAL_ADMIN_PASSWORD;
    try {
      process.env.RVS_INITIAL_ADMIN_EMAIL = "first@example.test";
      process.env.RVS_INITIAL_ADMIN_PASSWORD = "first-password";
      openApiDatabase(databasePath).close();

      process.env.RVS_INITIAL_ADMIN_EMAIL = "second@example.test";
      process.env.RVS_INITIAL_ADMIN_PASSWORD = "second-password";
      const db = openApiDatabase(databasePath);
      const row = z.object({ email: z.string(), secretHash: z.string() }).parse(
        db
          .prepare(
            `SELECT u.email, c.secret_hash AS secretHash
                 FROM users u
                 JOIN credentials c ON c.user_id = u.id
                WHERE u.id = 'usr_platform'`,
          )
          .get(),
      );
      db.close();

      expect(row.email).toBe("second@example.test");
      expect(verifyPassword("second-password", row.secretHash)).toBe(true);
      expect(verifyPassword("first-password", row.secretHash)).toBe(false);
    } finally {
      if (previousEmail === undefined)
        delete process.env.RVS_INITIAL_ADMIN_EMAIL;
      else process.env.RVS_INITIAL_ADMIN_EMAIL = previousEmail;
      if (previousPassword === undefined)
        delete process.env.RVS_INITIAL_ADMIN_PASSWORD;
      else process.env.RVS_INITIAL_ADMIN_PASSWORD = previousPassword;
      rmSync(root, { recursive: true, force: true });
    }
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
    firstStores.auth.sessions.push({
      id: "session_restart",
      userId: "usr_platform",
      tenantId: "ten_platform",
      expiresAt: Date.now() + 60_000,
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
    expect(secondStores.workers.leases.get(job.id)?.workerId).toBe(
      "worker_restart",
    );
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
