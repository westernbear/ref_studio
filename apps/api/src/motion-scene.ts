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
  type SceneOperationBatchV1,
  type SceneSpec,
  type VerificationReportV1,
} from "@rvs/contracts";
import { safeEnvelope } from "./boundary.js";
import type { CreatorWorkflowStore, Job } from "./creator-workflow.js";

const id = (): string => `msv_${randomBytes(12).toString("base64url")}`;
const etag = (digest: string): string => `"${digest}"`;
const pointerSegments = (path: string): readonly string[] =>
  path
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));

const applyAt = (
  current: unknown,
  segments: readonly string[],
  value: unknown,
  unset: boolean,
): unknown => {
  const [head, ...tail] = segments;
  if (head === undefined) return value;
  if (Array.isArray(current)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= current.length)
      throw new MotionSceneError("INVALID_OPERATION", 422);
    if (tail.length === 0 && unset)
      return current.filter((_item, itemIndex) => itemIndex !== index);
    return current.map((item, itemIndex) =>
      itemIndex === index ? applyAt(item, tail, value, unset) : item,
    );
  }
  if (typeof current !== "object" || current === null)
    throw new MotionSceneError("INVALID_OPERATION", 422);
  const entries = Object.entries(current);
  if (tail.length === 0)
    return Object.fromEntries(
      unset
        ? entries.filter(([key]) => key !== head)
        : [...entries.filter(([key]) => key !== head), [head, value]],
    );
  if (!Object.hasOwn(current, head))
    throw new MotionSceneError("INVALID_OPERATION", 422);
  return Object.fromEntries(
    entries.map(([key, child]) => [
      key,
      key === head ? applyAt(child, tail, value, unset) : child,
    ]),
  );
};

export class MotionSceneError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export function applySceneOperations(
  scene: SceneSpec,
  batch: SceneOperationBatchV1,
): SceneSpec {
  let candidate: unknown = scene;
  for (const operation of batch.operations)
    candidate = applyAt(
      candidate,
      pointerSegments(operation.path),
      operation.kind === "set" ? operation.value : undefined,
      operation.kind === "unset",
    );
  const parsed = SceneSpecSchema.safeParse(candidate);
  if (!parsed.success) throw new MotionSceneError("INVALID_SCENE", 422);
  return parsed.data;
}

export function keyframesFromMotionIntent(intent: {
  readonly anticipationFrames: number;
  readonly overshootPercent: number;
  readonly settleFrame: number;
  readonly staggerFrames: number;
  readonly elementIndex: number;
}): SceneSpec["beats"][number]["elements"][number]["keyframes"] {
  const start = intent.elementIndex * intent.staggerFrames;
  return [
    { frame: start, scale: 1, ease: "easeIn" },
    {
      frame: start + intent.anticipationFrames,
      scale: 1 + intent.overshootPercent / 100,
      ease: "easeOut",
    },
    { frame: intent.settleFrame + start, scale: 1, ease: "easeInOut" },
  ];
}

export async function verifyAndRepair(
  initial: SceneSpec,
  verify: (scene: SceneSpec) => Promise<readonly string[]>,
  repair: (scene: SceneSpec, failures: readonly string[]) => Promise<SceneSpec>,
): Promise<{
  readonly scene: SceneSpec;
  readonly report: VerificationReportV1;
}> {
  let candidate = initial;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const failures = await verify(candidate);
    if (failures.length === 0)
      return {
        scene: candidate,
        report: {
          schema: "verification-report-v1",
          sceneDigest: sha256Hex(candidate),
          attempts: attempt,
          status: "PASS",
          findings: [],
        },
      };
    if (attempt < 4) candidate = await repair(candidate, failures);
  }
  return {
    scene: initial,
    report: {
      schema: "verification-report-v1",
      sceneDigest: sha256Hex(initial),
      attempts: 4,
      status: "FAIL",
      findings: [
        { predicate: "scene", passed: false, detail: "verification failed" },
      ],
    },
  };
}

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
  if (existing) return existing;
  if (!job.authoredScene) throw new MotionSceneError("RESOURCE_NOT_FOUND", 404);
  return insertVersion(db, job, job.authoredScene.spec, null);
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
        const current = currentRow(db, job);
        if (
          match !== etag(current.sceneDigest) ||
          batch.baseSceneDigest !== current.sceneDigest
        )
          throw new MotionSceneError("VERSION_CONFLICT", 409);
        const replay = db
          .prepare(
            "SELECT response_json AS responseJson, request_hash AS requestHash FROM idempotency_keys WHERE tenant_id=? AND key=?",
          )
          .get(job.tenantId, key) as
          | { readonly responseJson: string; readonly requestHash: string }
          | undefined;
        const requestDigest = sha256Hex(batch);
        if (replay) {
          if (replay.requestHash !== requestDigest)
            throw new MotionSceneError("IDEMPOTENCY_CONFLICT", 409);
          reply.send(JSON.parse(replay.responseJson));
          return;
        }
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
          key,
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
