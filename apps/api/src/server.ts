import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  BackendCapabilitySnapshotV1Schema,
  VerificationReportV1Schema,
} from "../../../packages/contracts/src/motion.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import { SceneSpecSchema } from "../../../packages/contracts/src/scene-spec.js";
import { setMotionObservabilitySink } from "../../../packages/contracts/src/motion-observability.js";
import { IdempotencyStore } from "./boundary.js";
import type {
  AdminAudit,
  AdminBilling,
  AdminJob,
  AdminQuarantine,
  AdminReadStore,
  AdminReceipt,
  AdminTenant,
} from "./admin-read.js";
import {
  createAdminMutationStore,
  quarantineVersion,
} from "./admin-mutation.js";
import type { AiProviderSettingsPublic } from "./ai-provider-settings.js";
import {
  getAiProviderSettings,
  getAiProviderSettingsWithSecret,
  updateAiProviderSettings,
} from "./ai-provider-settings.js";
import type { MaterialProviderSettingsPublic } from "./material-provider-settings.js";
import {
  getMaterialProviderSettings,
  getMaterialProviderSettingsWithSecret,
  updateMaterialProviderSettings,
} from "./material-provider-settings.js";
import { buildAuthApp } from "./app.js";
import type { AuthStore } from "./auth.js";
import {
  createCreatorWorkflowStore,
  type CreatorWorkflowStore,
} from "./creator-workflow.js";
import { inspectUploadedMedia } from "./media-validation.js";
import { beatSheetFor } from "./author-scene.js";
import { listMotionToolCanaries } from "./motion-canary.js";
import {
  loadFeatureFlagSnapshot,
  type FeatureFlagSnapshot,
} from "./feature-flags.js";
import { createDurableState, openApiDatabase } from "./durable-state.js";
import { createReviewStore, type ReviewStore } from "./reviews.js";
import type { UploadStore } from "./uploads.js";
import {
  createWorkerStore,
  hashWorkerToken,
  type WorkerStore,
} from "./workers.js";

const APP_PATH_MARKER = `${path.sep}apps${path.sep}api${path.sep}`;
const ServerEnv = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_200),
  DATABASE_PATH: z.string().min(1).optional(),
  RVS_EXPECTED_ORIGIN: z.string().url().default("http://localhost:3100"),
  RVS_SESSION_INTROSPECT_SECRET: z.string().min(1),
  RVS_WORKER_TOKEN: z.string().min(1),
  RVS_ADMIN_SESSION_TIMEOUT_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
});
const UserRows = z.array(z.object({ id: z.string(), email: z.string() }));
const CredentialRows = z.array(
  z.object({
    user_id: z.string(),
    secret_hash: z.string(),
    kind: z.literal("PASSWORD").or(z.literal("SERVICE")),
    revoked_at: z.string().nullable(),
  }),
);
const MembershipRows = z.array(
  z.object({ user_id: z.string(), tenant_id: z.string(), role: z.string() }),
);
const AssignmentRows = z.array(
  z.object({
    reviewer_id: z.string(),
    tenant_id: z.string().nullable(),
    gate: z.string(),
    scope: z.literal("TENANT").or(z.literal("RELEASE")),
    release_id: z.string().nullable(),
  }),
);
const ApiTokenRows = z.array(
  z.object({
    id: z.string(),
    user_id: z.string(),
    tenant_id: z.string(),
    token_hash: z.string(),
    expires_at: z.string(),
    revoked_at: z.string().nullable(),
  }),
);
const AdminTenantRows = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    plan: z.string(),
    used: z.number(),
    limit: z.number(),
    createdAt: z.string(),
  }),
);
const AdminJobRows = z.array(
  z.object({
    id: z.string(),
    tenantId: z.string(),
    state: z.string(),
    attempt: z.number(),
    creatorId: z.string(),
    createdAt: z.string(),
  }),
);
const AdminMotionSceneRow = z.object({
  version: z.number().int().positive(),
  sceneDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  capabilityJson: z.string(),
  verificationJson: z.string().nullable(),
  planDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
});
const AdminReceiptRows = z.array(
  z.object({
    id: z.string(),
    tenantId: z.string(),
    jobId: z.string(),
    gate: z.string(),
    decision: z.string(),
    actorId: z.string(),
    predecessorId: z.string().nullable(),
    createdAt: z.string(),
  }),
);
const AdminAuditRows = z.array(
  z.object({
    id: z.string(),
    tenantId: z.string().nullable(),
    jobId: z.string().nullable(),
    actorId: z.string(),
    eventType: z.string(),
    authorization: z.string(),
    correlationId: z.string(),
    outcome: z.string(),
    createdAt: z.string(),
  }),
);
const AdminQuarantineRows = z.array(
  z.object({
    id: z.string(),
    tenantId: z.string(),
    state: z.string(),
    declaredType: z.string(),
    magicBytes: z.string(),
    containerParse: z.string(),
    reason: z.string(),
    createdAt: z.string(),
  }),
);
const AdminBillingRows = z.array(
  z.object({
    tenantId: z.string(),
    plan: z.string(),
    billingStatus: z.string(),
    used: z.number(),
    limit: z.number(),
    resetAt: z.string(),
    renewalAt: z.string(),
  }),
);

export type ApiServerConfig = Readonly<{
  host: string;
  port: number;
  databasePath: string;
  expectedOrigin: string;
  introspectSecret: string;
  workerToken: string;
  adminSessionTimeoutMinutes: number;
  featureFlags: FeatureFlagSnapshot;
}>;

export class ApiServerConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`API_SERVER_CONFIG_INVALID: ${issues.join(", ")}`);
    this.name = "ApiServerConfigError";
    this.issues = issues;
  }
}

export const defaultApiDatabasePath = (): string => {
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const markerIndex = directory.indexOf(APP_PATH_MARKER);
  return markerIndex === -1
    ? path.resolve("apps/api/data/app.sqlite")
    : path.join(
        directory.slice(0, markerIndex + APP_PATH_MARKER.length),
        "data/app.sqlite",
      );
};

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiServerConfig {
  const parsed = ServerEnv.safeParse(env);
  if (!parsed.success)
    throw new ApiServerConfigError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  return {
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    databasePath: parsed.data.DATABASE_PATH ?? defaultApiDatabasePath(),
    expectedOrigin: parsed.data.RVS_EXPECTED_ORIGIN,
    introspectSecret: parsed.data.RVS_SESSION_INTROSPECT_SECRET,
    workerToken: parsed.data.RVS_WORKER_TOKEN,
    adminSessionTimeoutMinutes: parsed.data.RVS_ADMIN_SESSION_TIMEOUT_MINUTES,
    featureFlags: loadFeatureFlagSnapshot(env),
  };
}

const timestamp = (value: string | null): number | null =>
  value === null ? null : Date.parse(value);

export function loadAuthStore(
  databasePath: string = defaultApiDatabasePath(),
): AuthStore {
  const db = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return {
      users: UserRows.parse(db.prepare("SELECT id, email FROM users").all()),
      credentials: CredentialRows.parse(
        db
          .prepare(
            "SELECT user_id, secret_hash, kind, revoked_at FROM credentials",
          )
          .all(),
      ).map((row) => ({
        userId: row.user_id,
        secretHash: row.secret_hash,
        kind: row.kind,
        revokedAt: row.revoked_at,
      })),
      memberships: MembershipRows.parse(
        db
          .prepare("SELECT user_id, tenant_id, role FROM tenant_memberships")
          .all(),
      ).map((row) => ({
        userId: row.user_id,
        tenantId: row.tenant_id,
        role: row.role,
      })),
      assignments: AssignmentRows.parse(
        db
          .prepare(
            "SELECT reviewer_id, tenant_id, gate, scope, release_id FROM reviewer_assignments",
          )
          .all(),
      ).map((row) => ({
        reviewerId: row.reviewer_id,
        tenantId: row.tenant_id,
        gate: row.gate,
        scope: row.scope,
        releaseId: row.release_id,
      })),
      sessions: [],
      apiTokens: ApiTokenRows.parse(
        db
          .prepare(
            "SELECT id, user_id, tenant_id, token_hash, expires_at, revoked_at FROM api_tokens",
          )
          .all(),
      ).map((row) => ({
        id: row.id,
        userId: row.user_id,
        tenantId: row.tenant_id,
        tokenHash: row.token_hash,
        expiresAt: Date.parse(row.expires_at),
        revokedAt: timestamp(row.revoked_at),
      })),
      audit: () => undefined,
    };
  } finally {
    db.close();
  }
}

const newest = <T extends { readonly createdAt: string }>(
  items: readonly T[],
): readonly T[] =>
  [...items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

export function loadAdminReadStore(
  databasePath: string,
  workflow: CreatorWorkflowStore,
  uploads: UploadStore,
  reviews: ReviewStore,
  workers: WorkerStore,
  writableDb: Database.Database,
  aiSecretKey: string,
): AdminReadStore {
  const db = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const tenants = AdminTenantRows.parse(
      db
        .prepare(
          `SELECT t.id,
                  t.name,
                  t.status,
                  COALESCE(q.plan, 'UNMETERED') AS plan,
                  COALESCE(q.used_seconds, 0) AS used,
                  COALESCE(q.limit_seconds, 0) AS "limit",
                  t.created_at AS createdAt
             FROM tenants t
             LEFT JOIN tenant_quotas q ON q.tenant_id = t.id
            ORDER BY t.created_at DESC, t.id`,
        )
        .all(),
    );
    const jobs = AdminJobRows.parse(
      db
        .prepare(
          `SELECT id,
                  tenant_id AS tenantId,
                  state,
                  attempt,
                  creator_id AS creatorId,
                  created_at AS createdAt
             FROM jobs
            ORDER BY created_at DESC`,
        )
        .all(),
    );
    const receipts = AdminReceiptRows.parse(
      db
        .prepare(
          `SELECT id,
                  tenant_id AS tenantId,
                  job_id AS jobId,
                  gate,
                  decision,
                  actor_id AS actorId,
                  predecessor_id AS predecessorId,
                  created_at AS createdAt
             FROM receipts
            ORDER BY created_at DESC`,
        )
        .all(),
    );
    const audit = AdminAuditRows.parse(
      db
        .prepare(
          `SELECT id,
                  tenant_id AS tenantId,
                  CASE WHEN target_type = 'JOB' THEN target_id END AS jobId,
                  actor_id AS actorId,
                  action AS eventType,
                  decision AS authorization,
                  correlation_id AS correlationId,
                  decision AS outcome,
                  created_at AS createdAt
             FROM audit_events
            ORDER BY created_at DESC`,
        )
        .all(),
    );
    const quarantine = AdminQuarantineRows.parse(
      db
        .prepare(
          `SELECT id,
                  tenant_id AS tenantId,
                  state,
                  content_type AS declaredType,
                  'stored' AS magicBytes,
                  'stored' AS containerParse,
                  state AS reason,
                  created_at AS createdAt
             FROM uploads
            WHERE state = 'QUARANTINED'
            ORDER BY created_at DESC`,
        )
        .all(),
    );
    const billing = AdminBillingRows.parse(
      db
        .prepare(
          `SELECT tenant_id AS tenantId,
                  plan,
                  enforcement_state AS billingStatus,
                  used_seconds AS used,
                  limit_seconds AS "limit",
                  COALESCE(support_grant_expires_at, 'not scheduled') AS resetAt,
                  COALESCE(support_grant_expires_at, 'not scheduled') AS renewalAt
             FROM tenant_quotas
            ORDER BY tenant_id`,
        )
        .all(),
    );
    const motionSceneStatement = writableDb.prepare(
      `SELECT v.version,
              v.scene_digest AS sceneDigest,
              v.capability_json AS capabilityJson,
              v.verification_json AS verificationJson,
              v.plan_digest AS planDigest
         FROM job_motion_scene_heads h
         JOIN motion_scene_versions v
           ON v.id = h.version_id AND v.tenant_id = h.tenant_id
        WHERE h.job_id = ? AND h.tenant_id = ?`,
    );
    return {
      workers,
      get tenants(): readonly AdminTenant[] {
        return tenants;
      },
      get jobs(): readonly AdminJob[] {
        return newest([
          ...jobs,
          ...[...workflow.jobs.values()].map((job) => ({
            id: job.id,
            tenantId: job.tenantId,
            state: job.state,
            attempt: job.attempt,
            creatorId: job.creatorId,
            createdAt: job.createdAt,
            etag: job.etag,
          })),
        ]);
      },
      get receipts(): readonly AdminReceipt[] {
        return newest([
          ...receipts,
          ...reviews.receipts
            .filter(
              (receipt) => receipt.jobId !== null && receipt.tenantId !== null,
            )
            .map((receipt) => ({
              id: receipt.id,
              tenantId: receipt.tenantId ?? "",
              jobId: receipt.jobId ?? "",
              gate: receipt.gate,
              decision: receipt.decision,
              actorId: receipt.actorId,
              predecessorId: receipt.predecessorReceiptId,
              createdAt: receipt.createdAt,
            })),
        ]);
      },
      get audit(): AdminAudit[] {
        return newest(
          audit.map(({ jobId, ...item }) =>
            jobId === null ? item : { ...item, jobId },
          ),
        ) as AdminAudit[];
      },
      get quarantine(): readonly AdminQuarantine[] {
        return newest([
          ...quarantine,
          ...[...uploads.uploads.values()]
            .filter((upload) => upload.state === "QUARANTINED")
            .map((upload) => ({
              id: upload.id,
              tenantId: upload.tenantId,
              state: upload.state,
              declaredType: upload.contentType,
              magicBytes: "runtime",
              containerParse: "runtime",
              reason: "VIDEO_TYPE_INVALID",
              createdAt: upload.createdAt,
              version: quarantineVersion(upload.id, upload.state),
              retentionUntil: upload.expiresAt,
            })),
        ]);
      },
      motionForJob: (job) => {
        const row = AdminMotionSceneRow.optional().parse(
          motionSceneStatement.get(job.id, job.tenantId),
        );
        if (!row) return null;
        const backend = BackendCapabilitySnapshotV1Schema.parse(
          JSON.parse(row.capabilityJson),
        );
        const verification = row.verificationJson
          ? VerificationReportV1Schema.parse(JSON.parse(row.verificationJson))
          : null;
        const deliverables: Array<"mp4" | "scene-package" | "report"> = [];
        const liveJob = workflow.jobs.get(job.id);
        if (liveJob?.artifact)
          deliverables.push(
            liveJob.artifact.kind === "report" ? "report" : "mp4",
          );
        if (workflow.scenePackages.has(job.id))
          deliverables.push("scene-package");
        const adobeCommand = z
          .object({
            id: z.string(),
            deviceId: z.string(),
            status: z.enum([
              "QUEUED",
              "RUNNING",
              "SUCCEEDED",
              "FAILED",
              "CANCELLED",
            ]),
            createdAtMs: z.number().int().nonnegative(),
          })
          .optional()
          .parse(
            writableDb
              .prepare(
                `SELECT id, device_id AS deviceId, status, created_at_ms AS createdAtMs
                   FROM adobe_commands
                  WHERE tenant_id=? AND job_id=?
                  ORDER BY created_at_ms DESC, id DESC LIMIT 1`,
              )
              .get(job.tenantId, job.id),
          );
        const adobeDevice = adobeCommand
          ? z
              .object({
                id: z.string(),
                status: z.enum(["ENROLLED", "REVOKED"]),
              })
              .nullable()
              .parse(
                writableDb
                  .prepare(
                    "SELECT id,status FROM adobe_devices WHERE tenant_id=? AND id=?",
                  )
                  .get(job.tenantId, adobeCommand.deviceId) ?? null,
              )
          : null;
        const renderHash = workflow.artifacts.get(job.id)?.sha256 ?? null;
        const packageHash = workflow.scenePackages.get(job.id)?.sha256 ?? null;
        return {
          backend: backend.backend,
          planId: row.planDigest ? `plan_${row.planDigest}` : null,
          planDigest: row.planDigest,
          knowledgeCardIds:
            liveJob?.authoredScene?.motionPlan?.knowledgeCardIds ?? [],
          version: row.version,
          sceneDigest: row.sceneDigest,
          verificationStatus: verification?.status ?? "PENDING",
          verificationAttempts: verification?.attempts ?? 0,
          passedFindings:
            verification?.findings.filter((finding) => finding.pass).length ??
            0,
          totalFindings: verification?.findings.length ?? 0,
          predicateFindings:
            verification?.findings.map((finding) => ({
              predicateId: finding.predicateId,
              pass: finding.pass,
              remediation: finding.remediation,
            })) ?? [],
          capabilities: backend.capabilities,
          capabilitySnapshotDigest: sha256Hex(backend),
          deliverables,
          renderHash,
          packageHash,
          workerRuntime: liveJob?.runtimePreflight?.runtimeDigest ?? null,
          adobeDevice,
          adobeCommand: adobeCommand
            ? {
                id: adobeCommand.id,
                status: adobeCommand.status,
                ageMs: Math.max(0, Date.now() - adobeCommand.createdAtMs),
              }
            : null,
          failureRemediation:
            adobeCommand?.status === "FAILED"
              ? "retry the failed Adobe command after checking the enrolled device"
              : verification?.status === "FAIL"
                ? "repair predicate failures before rerendering"
                : null,
        };
      },
      motionCanaries: () => listMotionToolCanaries(writableDb),
      get billing(): readonly AdminBilling[] {
        return billing;
      },
      // Reads through the server's live writable db (not the boot-time
      // snapshot `db` above) so admin-panel edits are visible immediately,
      // matching the fix for the getter-freeze bug documented on `jobs`.
      get aiProviderSettings(): AiProviderSettingsPublic {
        return getAiProviderSettings(writableDb);
      },
      get materialProviderSettings(): MaterialProviderSettingsPublic {
        return getMaterialProviderSettings(writableDb);
      },
      // Functions rather than getters: these decrypt a provider key, and
      // that should happen only when a model listing is actually asked
      // for, not on every touch of the admin read store.
      aiProviderSettingsWithSecret: () =>
        getAiProviderSettingsWithSecret(writableDb, aiSecretKey),
      materialProviderSettingsWithSecret: () =>
        getMaterialProviderSettingsWithSecret(writableDb, aiSecretKey),
      // A codex credential that refreshed while listing models. No audit
      // event: a token rotating on schedule is not an operator changing a
      // setting, and a log full of them hides the changes that are.
      persistCodexAuth: (target, auth) => {
        const patch = { apiKey: JSON.stringify(auth) };
        const actor = "system:codex-refresh";
        if (target === "ai")
          updateAiProviderSettings(
            writableDb,
            patch,
            actor,
            Date.now(),
            aiSecretKey,
          );
        else
          updateMaterialProviderSettings(
            writableDb,
            patch,
            actor,
            Date.now(),
            aiSecretKey,
          );
      },
    };
  } finally {
    db.close();
  }
}

export function createApiServer(config: ApiServerConfig) {
  setMotionObservabilitySink({
    emit(record) {
      console.info(JSON.stringify({ channel: "motion.event", ...record }));
    },
    sample(metric) {
      console.info(JSON.stringify({ channel: "motion.metric", ...metric }));
    },
  });
  const db = openApiDatabase(config.databasePath);
  const dataRoot = path.join(path.dirname(config.databasePath), "objects");
  const artifactRoot = path.join(dataRoot, "artifacts");
  const attachmentsRoot = path.join(dataRoot, "attachments");
  const uploads: UploadStore = {
    uploads: new Map(),
    cas: new Map(),
    casByTenantDigest: new Map(),
    now: Date.now,
    stagingRoot: path.join(dataRoot, "staging"),
    casRoot: path.join(dataRoot, "cas"),
    attachmentRoot: path.join(dataRoot, "brand-attachments"),
  };
  const creatorWorkflow = createCreatorWorkflowStore();
  const reviews = createReviewStore();
  const adminMutations = createAdminMutationStore();
  const auth = loadAuthStore(config.databasePath);
  const workers = createWorkerStore(hashWorkerToken(config.workerToken));
  const idempotency = new IdempotencyStore();
  const durable = createDurableState(
    db,
    {
      auth,
      uploads,
      workflow: creatorWorkflow,
      reviews,
      workers,
      idempotency,
    },
    artifactRoot,
  );
  durable.hydrate();
  // NOTE: do not spread the result of loadAdminReadStore() — it returns
  // getter properties (live views over `workflow`/`uploads`), and `{...obj}`
  // evaluates each getter once and freezes the result as a static value.
  // Pass `workers` straight into the function so it's a plain property on
  // the same object, not merged in afterward.
  const adminReads = loadAdminReadStore(
    config.databasePath,
    creatorWorkflow,
    uploads,
    reviews,
    workers,
    db,
    config.introspectSecret,
  );
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: config.expectedOrigin,
    introspectSecret: config.introspectSecret,
    adminSessionTimeoutMs: config.adminSessionTimeoutMinutes * 60 * 1000,
    uploads,
    idempotency,
    validateUpload: async (upload) => {
      try {
        return await inspectUploadedMedia(upload);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "api.upload.validation.failed",
            uploadId: upload.id,
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
            errorStack: error instanceof Error ? error.stack : undefined,
          }),
        );
        throw error;
      }
    },
    creatorWorkflow,
    adminReads,
    adminMutations: {
      ...adminMutations,
      workers,
      workflow: creatorWorkflow,
      uploads,
      reviews,
      db,
      aiSecretKey: config.introspectSecret,
      recordAuditEvent: (event) => {
        db.prepare(
          `INSERT INTO audit_events
            (id,tenant_id,actor_id,action,target_type,target_id,decision,correlation_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        ).run(
          event.id,
          event.tenantId,
          event.actorId,
          event.action,
          event.targetType,
          event.targetId,
          event.outcome,
          event.correlationId,
          event.createdAt,
        );
      },
      motionActions: {
        retryCommand: (tenantId, commandId) => {
          const changed = db
            .prepare(
              "UPDATE adobe_commands SET status='QUEUED',result_json=NULL,updated_at_ms=? WHERE tenant_id=? AND id=? AND status='FAILED'",
            )
            .run(Date.now(), tenantId, commandId).changes;
          if (changed !== 1) throw new Error("ADOBE_COMMAND_NOT_RETRYABLE");
          return { commandId, status: "QUEUED" };
        },
        cancelCommand: (tenantId, commandId) => {
          const changed = db
            .prepare(
              "UPDATE adobe_commands SET status='CANCELLED',updated_at_ms=? WHERE tenant_id=? AND id=? AND status='RUNNING'",
            )
            .run(Date.now(), tenantId, commandId).changes;
          if (changed !== 1) throw new Error("ADOBE_COMMAND_NOT_CANCELLABLE");
          return { commandId, status: "CANCELLED" };
        },
        disableAdmission: (tenantId, deviceId) => {
          const changed = db.transaction(() => {
            const count = db
              .prepare(
                "UPDATE adobe_devices SET status='REVOKED' WHERE tenant_id=? AND id=? AND status='ENROLLED'",
              )
              .run(tenantId, deviceId).changes;
            if (count === 1)
              db.prepare(
                "UPDATE adobe_device_keys SET revoked_at_ms=? WHERE tenant_id=? AND device_id=? AND revoked_at_ms IS NULL",
              ).run(Date.now(), tenantId, deviceId);
            return count;
          })();
          if (changed !== 1) throw new Error("ADOBE_DEVICE_NOT_ENROLLED");
          return { deviceId, status: "REVOKED", admissionEnabled: false };
        },
        requestRollback: (tenantId, jobId) => {
          const job = creatorWorkflow.jobs.get(jobId);
          if (!job || job.tenantId !== tenantId)
            throw new Error("RESOURCE_NOT_FOUND");
          if (job.state !== "COMPLETED")
            throw new Error("MOTION_ROLLBACK_NOT_READY");
          const result = db.transaction(() => {
            const head = z
              .object({ version: z.number().int().positive() })
              .parse(
                db
                  .prepare(
                    "SELECT v.version FROM job_motion_scene_heads h JOIN motion_scene_versions v ON v.id=h.version_id AND v.tenant_id=h.tenant_id WHERE h.tenant_id=? AND h.job_id=?",
                  )
                  .get(tenantId, jobId),
              );
            const target = z
              .object({
                sceneJson: z.string(),
                sceneDigest: z.string(),
                capabilityJson: z.string(),
                verificationJson: z.string().nullable(),
                planDigest: z.string().nullable(),
                artifactDigest: z.string().nullable(),
                predicateIdsJson: z.string(),
              })
              .parse(
                db
                  .prepare(
                    `SELECT scene_json AS sceneJson,scene_digest AS sceneDigest,capability_json AS capabilityJson,
                          verification_json AS verificationJson,plan_digest AS planDigest,artifact_digest AS artifactDigest,
                          predicate_ids_json AS predicateIdsJson
                     FROM motion_scene_versions WHERE tenant_id=? AND job_id=? AND version=?`,
                  )
                  .get(tenantId, jobId, head.version - 1),
              );
            const nextVersion = head.version + 1;
            const versionId = `msv_${randomUUID()}`;
            db.prepare(
              `INSERT INTO motion_scene_versions
                (id,tenant_id,job_id,version,scene_digest,scene_json,capability_json,verification_json,created_at,plan_digest,predecessor_version,artifact_digest,predicate_ids_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            ).run(
              versionId,
              tenantId,
              jobId,
              nextVersion,
              target.sceneDigest,
              target.sceneJson,
              target.capabilityJson,
              target.verificationJson,
              new Date().toISOString(),
              target.planDigest,
              head.version,
              target.artifactDigest,
              target.predicateIdsJson,
            );
            db.prepare(
              "UPDATE job_motion_scene_heads SET version_id=? WHERE tenant_id=? AND job_id=?",
            ).run(versionId, tenantId, jobId);
            return { ...target, version: nextVersion };
          })();
          const scene = SceneSpecSchema.parse(JSON.parse(result.sceneJson));
          job.authoredScene = {
            ...job.authoredScene,
            spec: scene,
            beatSheet: beatSheetFor(scene),
          };
          job.sceneSpecDigest = result.sceneDigest;
          job.state = "QUEUED";
          job.progress = {
            phase: "prepare",
            stage: "admin-rollback",
            fraction: 0,
            framesProcessed: null,
            framesTotal: null,
          };
          job.updatedAt = new Date().toISOString();
          job.etag = `"${result.sceneDigest}"`;
          return {
            jobId,
            status: "QUEUED",
            version: result.version,
            sceneDigest: result.sceneDigest,
          };
        },
      },
    },
    reviews,
    workers,
    artifactRoot,
    persist: durable.persist,
    db,
    aiSecretKey: config.introspectSecret,
    attachmentsRoot,
    featureFlags: config.featureFlags,
  });
  app.addHook("onClose", async () => db.close());
  app.get("/health", async () => ({ ok: true }));
  return app;
}

export async function startApiServer(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = loadServerConfig(env);
  const app = createApiServer(config);
  await app.listen({ host: config.host, port: config.port });
  console.info(
    JSON.stringify({
      event: "api.feature-flags.started",
      ...config.featureFlags,
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await startApiServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "api server failed");
    process.exitCode = 1;
  }
}
