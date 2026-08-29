import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";

const root = resolve(import.meta.dirname, "../..");
const string = (format) =>
  format === undefined ? { type: "string" } : { type: "string", format };
const id = (prefix) => ({
  type: "string",
  pattern: `^${prefix}_[A-Za-z0-9-]+$`,
});
const object = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const schemas = {
  Tenant: object(
    {
      id: id("ten"),
      name: string(),
      kind: { type: "string", enum: ["PLATFORM", "ORGANIZATION"] },
      status: { type: "string", enum: ["ACTIVE", "DELETING", "DELETED"] },
      deletionEpoch: { type: "integer", minimum: 0 },
      createdAt: string("date-time"),
    },
    ["id", "name", "kind", "status", "deletionEpoch", "createdAt"],
  ),
  User: object(
    {
      id: id("usr"),
      email: string("email"),
      displayName: string(),
      createdAt: string("date-time"),
    },
    ["id", "email", "displayName", "createdAt"],
  ),
  Credential: object(
    {
      id: id("cred"),
      userId: id("usr"),
      kind: { type: "string", enum: ["PASSWORD", "SERVICE"] },
      secretHash: string(),
      createdAt: string("date-time"),
      revokedAt: { ...string("date-time"), nullable: true },
    },
    ["id", "userId", "kind", "secretHash", "createdAt", "revokedAt"],
  ),
  Session: object(
    {
      id: id("ses"),
      userId: id("usr"),
      tenantId: id("ten"),
      expiresAt: string("date-time"),
      revokedAt: { ...string("date-time"), nullable: true },
      createdAt: string("date-time"),
    },
    ["id", "userId", "tenantId", "expiresAt", "revokedAt", "createdAt"],
  ),
  ApiToken: object(
    {
      id: id("tok"),
      userId: id("usr"),
      tenantId: id("ten"),
      tokenHash: string(),
      expiresAt: string("date-time"),
      revokedAt: { ...string("date-time"), nullable: true },
      createdAt: string("date-time"),
    },
    [
      "id",
      "userId",
      "tenantId",
      "tokenHash",
      "expiresAt",
      "revokedAt",
      "createdAt",
    ],
  ),
  Membership: object(
    {
      tenantId: id("ten"),
      userId: id("usr"),
      role: {
        type: "string",
        enum: ["OWNER", "ADMIN", "MEMBER", "DESIGNATED_REVIEWER", "VIEWER"],
      },
      createdAt: string("date-time"),
    },
    ["tenantId", "userId", "role", "createdAt"],
  ),
  ReviewerAssignment: object(
    {
      id: id("rev"),
      tenantId: { ...id("ten"), nullable: true },
      reviewerId: id("usr"),
      gate: { type: "string", enum: ["T1", "T2", "T3", "T4", "T5", "T6"] },
      scope: { type: "string", enum: ["TENANT", "PLATFORM", "RELEASE"] },
      createdAt: string("date-time"),
    },
    ["id", "tenantId", "reviewerId", "gate", "scope", "createdAt"],
  ),
  Upload: object(
    {
      id: id("upl"),
      tenantId: id("ten"),
      filename: string(),
      contentType: { type: "string", const: "video/mp4" },
      sizeBytes: { type: "integer", minimum: 0 },
      state: {
        type: "string",
        enum: ["PENDING", "QUARANTINED", "ACCEPTED", "EXPIRED"],
      },
      casObjectId: { ...id("cas"), nullable: true },
      createdAt: string("date-time"),
      expiresAt: string("date-time"),
    },
    [
      "id",
      "tenantId",
      "filename",
      "contentType",
      "sizeBytes",
      "state",
      "casObjectId",
      "createdAt",
      "expiresAt",
    ],
  ),
  CasObject: object(
    {
      id: id("cas"),
      tenantId: id("ten"),
      sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
      contentType: string(),
      sizeBytes: { type: "integer", minimum: 0 },
      purpose: string(),
      retentionUntil: string("date-time"),
    },
    [
      "id",
      "tenantId",
      "sha256",
      "contentType",
      "sizeBytes",
      "purpose",
      "retentionUntil",
    ],
  ),
  Job: object(
    {
      id: id("job"),
      tenantId: id("ten"),
      creatorId: id("usr"),
      uploadId: id("upl"),
      sceneId: id("scn"),
      state: {
        type: "string",
        enum: [
          "QUEUED",
          "PREPARING",
          "RENDERING",
          "COMPLETED",
          "CANCELLED",
          "FAILED",
        ],
      },
      attempt: { type: "integer", minimum: 0 },
      deletionEpoch: { type: "integer", minimum: 0 },
      createdAt: string("date-time"),
    },
    [
      "id",
      "tenantId",
      "creatorId",
      "uploadId",
      "sceneId",
      "state",
      "attempt",
      "deletionEpoch",
      "createdAt",
    ],
  ),
  Attempt: object(
    {
      id: id("att"),
      tenantId: id("ten"),
      jobId: id("job"),
      number: { type: "integer", minimum: 1 },
      state: string(),
      createdAt: string("date-time"),
    },
    ["id", "tenantId", "jobId", "number", "state", "createdAt"],
  ),
  Lease: object(
    {
      id: id("lease"),
      tenantId: id("ten"),
      jobId: id("job"),
      attemptId: id("att"),
      workerId: string(),
      acquiredAt: string("date-time"),
      expiresAt: string("date-time"),
      releasedAt: { ...string("date-time"), nullable: true },
    },
    [
      "id",
      "tenantId",
      "jobId",
      "attemptId",
      "workerId",
      "acquiredAt",
      "expiresAt",
      "releasedAt",
    ],
  ),
  Review: object(
    {
      id: id("rev"),
      tenantId: id("ten"),
      jobId: id("job"),
      gate: string(),
      status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
      createdAt: string("date-time"),
    },
    ["id", "tenantId", "jobId", "gate", "status", "createdAt"],
  ),
  Receipt: object(
    {
      id: id("rcpt"),
      tenantId: id("ten"),
      jobId: id("job"),
      attemptId: id("att"),
      sequence: { type: "integer", minimum: 1 },
      gate: string(),
      decision: string(),
      actorId: id("usr"),
      predecessorId: { ...id("rcpt"), nullable: true },
      artifactCasIds: { type: "array", items: id("cas") },
      createdAt: string("date-time"),
    },
    [
      "id",
      "tenantId",
      "jobId",
      "attemptId",
      "sequence",
      "gate",
      "decision",
      "actorId",
      "predecessorId",
      "artifactCasIds",
      "createdAt",
    ],
  ),
  AuditEvent: object(
    {
      id: id("rcpt"),
      tenantId: { ...id("ten"), nullable: true },
      actorId: id("usr"),
      action: string(),
      targetType: string(),
      targetId: string(),
      decision: string(),
      correlationId: string(),
      createdAt: string("date-time"),
    },
    [
      "id",
      "tenantId",
      "actorId",
      "action",
      "targetType",
      "targetId",
      "decision",
      "correlationId",
      "createdAt",
    ],
  ),
  Quota: object(
    {
      tenantId: id("ten"),
      plan: string(),
      limitSeconds: { type: "integer", minimum: 0 },
      usedSeconds: { type: "integer", minimum: 0 },
      enforcementState: string(),
      supportGrantExpiresAt: { ...string("date-time"), nullable: true },
    },
    [
      "tenantId",
      "plan",
      "limitSeconds",
      "usedSeconds",
      "enforcementState",
      "supportGrantExpiresAt",
    ],
  ),
  IdempotencyKey: object(
    {
      tenantId: id("ten"),
      key: string(),
      requestHash: string(),
      responseJson: string(),
      createdAt: string("date-time"),
    },
    ["tenantId", "key", "requestHash", "responseJson", "createdAt"],
  ),
  Export: object(
    {
      id: id("exp"),
      tenantId: id("ten"),
      requestedBy: id("usr"),
      state: string(),
      createdAt: string("date-time"),
    },
    ["id", "tenantId", "requestedBy", "state", "createdAt"],
  ),
  Artifact: object(
    {
      id: id("art"),
      tenantId: id("ten"),
      exportId: { ...id("exp"), nullable: true },
      casObjectId: id("cas"),
      kind: string(),
      createdAt: string("date-time"),
    },
    ["id", "tenantId", "exportId", "casObjectId", "kind", "createdAt"],
  ),
  AuthoringIRVersion: object(
    {
      id: id("air"),
      tenantId: id("ten"),
      sceneId: id("scn"),
      version: { type: "integer", minimum: 1 },
      ir: { type: "object" },
      createdAt: string("date-time"),
    },
    ["id", "tenantId", "sceneId", "version", "ir", "createdAt"],
  ),
  SceneIRVersion: object(
    {
      id: id("sir"),
      tenantId: id("ten"),
      sceneId: id("scn"),
      version: { type: "integer", minimum: 1 },
      ir: { type: "object" },
      createdAt: string("date-time"),
    },
    ["id", "tenantId", "sceneId", "version", "ir", "createdAt"],
  ),
  BrowserPassSpecVersion: object(
    {
      id: id("bps"),
      tenantId: id("ten"),
      sceneId: id("scn"),
      version: { type: "integer", minimum: 1 },
      spec: { type: "object" },
      createdAt: string("date-time"),
    },
    ["id", "tenantId", "sceneId", "version", "spec", "createdAt"],
  ),
  Evidence: object(
    {
      id: id("evd"),
      tenantId: id("ten"),
      owner: string(),
      label: string(),
      measuredValue: string(),
      confidence: { type: "number", minimum: 0, maximum: 1 },
      source: string(),
    },
    [
      "id",
      "tenantId",
      "owner",
      "label",
      "measuredValue",
      "confidence",
      "source",
    ],
  ),
  SafeErrorEnvelope: object(
    {
      error: {
        type: "object",
        properties: {
          code: string(),
          message: string(),
          correlationId: string(),
          details: { type: "array", items: { type: "object" } },
        },
        required: ["code", "message", "correlationId", "details"],
        additionalProperties: false,
      },
    },
    ["error"],
  ),
  SceneOperationBatchV1: object(
    {
      schema: { type: "string", const: "scene-operation-batch-v1" },
      baseSceneDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
      operations: {
        type: "array",
        minItems: 1,
        maxItems: 16,
        items: { type: "object" },
      },
    },
    ["schema", "baseSceneDigest", "operations"],
  ),
  MotionSceneSnapshotV1: object(
    {
      schema: { type: "string", const: "motion-scene-snapshot-v1" },
      version: { type: "integer", minimum: 1 },
      sceneEtag: string(),
      sceneDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
      scene: { type: "object" },
      history: { type: "array", items: { type: "object" } },
      backendCapability: { type: "object" },
      verification: { type: ["object", "null"] },
    },
    [
      "schema",
      "version",
      "sceneEtag",
      "sceneDigest",
      "scene",
      "history",
      "backendCapability",
      "verification",
    ],
  ),
};
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ content: { "application/json": { schema } } });
const document = {
  openapi: "3.1.0",
  info: { title: "Reference Video Studio API", version: "v1" },
  components: {
    schemas,
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
  },
  paths: {
    "/v1/uploads": {
      post: {
        operationId: "createUpload",
        requestBody: json(ref("Upload")),
        responses: {
          201: { description: "Created", ...json(ref("Upload")) },
          422: {
            description: "Quarantined",
            ...json(ref("SafeErrorEnvelope")),
          },
        },
      },
    },
    "/v1/jobs": {
      post: {
        operationId: "createJob",
        requestBody: json(ref("Job")),
        responses: {
          202: { description: "Queued", ...json(ref("Job")) },
          400: {
            description: "Invalid request",
            ...json(ref("SafeErrorEnvelope")),
          },
        },
      },
    },
    "/v1/jobs/{id}": {
      get: {
        operationId: "getJob",
        responses: {
          200: { description: "Job", ...json(ref("Job")) },
          404: { description: "Not found", ...json(ref("SafeErrorEnvelope")) },
        },
      },
    },
    "/v1/jobs/{id}/motion-scene": {
      get: {
        operationId: "getMotionScene",
        responses: {
          200: {
            description: "Motion scene",
            ...json(ref("MotionSceneSnapshotV1")),
          },
        },
      },
      patch: {
        operationId: "patchMotionScene",
        requestBody: json(ref("SceneOperationBatchV1")),
        responses: {
          200: {
            description: "Motion scene",
            ...json(ref("MotionSceneSnapshotV1")),
          },
          409: {
            description: "Version conflict",
            ...json(ref("SafeErrorEnvelope")),
          },
        },
      },
    },
    "/v1/jobs/{id}/deliverables": {
      get: {
        operationId: "getDeliverables",
        responses: {
          200: { description: "Deliverables", ...json({ type: "object" }) },
        },
      },
    },
    "/v1/reviews": {
      post: {
        operationId: "createReview",
        requestBody: json(ref("Review")),
        responses: {
          201: { description: "Recorded", ...json(ref("Review")) },
          409: {
            description: "Stale approval",
            ...json(ref("SafeErrorEnvelope")),
          },
        },
      },
    },
    "/v1/receipts": {
      get: {
        operationId: "listReceipts",
        responses: {
          200: {
            description: "Receipts",
            ...json({ type: "array", items: ref("Receipt") }),
          },
        },
      },
    },
  },
};
if (
  Object.values(schemas).some(
    (schema) =>
      schema.additionalProperties === true ||
      !Array.isArray(schema.required) ||
      Object.keys(schema.properties).length === 0,
  )
)
  throw new Error("OPENAPI_COMPONENTS_NOT_CONCRETE");
const client = `export type ApiOperation = "createUpload" | "createJob" | "getJob" | "getMotionScene" | "patchMotionScene" | "getDeliverables" | "createReview" | "listReceipts"\nexport const paths = { uploads: "/v1/uploads", jobs: "/v1/jobs", motionScene: "/v1/jobs/{id}/motion-scene", deliverables: "/v1/jobs/{id}/deliverables", reviews: "/v1/reviews", receipts: "/v1/receipts" } as const\n`;
await mkdir(resolve(root, "packages/contracts/generated"), { recursive: true });
await writeFile(
  resolve(root, "packages/contracts/generated/openapi.json"),
  await format(JSON.stringify(document), { parser: "json" }),
);
await writeFile(
  resolve(root, "packages/contracts/generated/client.ts"),
  await format(client, { parser: "typescript" }),
);
await writeFile(
  resolve(root, "apps/api/openapi.json"),
  await format(JSON.stringify(document), { parser: "json" }),
);
process.stdout.write(
  JSON.stringify({
    status: "generated",
    operations: 8,
    schemas: Object.keys(schemas).length,
  }) + "\n",
);
