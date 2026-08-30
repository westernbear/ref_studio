import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";

const root = resolve(import.meta.dirname, "../..");
const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`OPENAPI_OPTION_VALUE_REQUIRED:${name}`);
  return resolve(root, value);
};
const check = process.argv.includes("--check");
const contractMirror =
  option("--contracts-mirror") ??
  resolve(root, "packages/contracts/generated/openapi.json");
const apiMirror =
  option("--api-mirror") ?? resolve(root, "apps/api/openapi.json");
if (process.argv.includes("--help")) {
  process.stdout.write(
    "Usage: node scripts/contracts/openapi.mjs [--check] [--contracts-mirror <path>] [--api-mirror <path>]\n",
  );
  process.exit(0);
}
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
          causeCategory: string(),
          remediation: string(),
          docsUrl: string(),
          correlationId: string(),
          details: { type: "array", items: { type: "object" } },
          safePredecessor: {
            type: "object",
            properties: {
              sceneVersion: { type: "integer", minimum: 0 },
              sceneDigest: string(),
              artifactId: string(),
            },
            additionalProperties: false,
          },
        },
        required: [
          "code",
          "message",
          "causeCategory",
          "remediation",
          "docsUrl",
          "correlationId",
          "details",
        ],
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
        items: {
          oneOf: [
            object(
              {
                kind: { type: "string", const: "set" },
                opId: string(),
                path: string(),
                value: {},
                reason: string(),
              },
              ["kind", "opId", "path", "value", "reason"],
            ),
            object(
              {
                kind: { type: "string", const: "unset" },
                opId: string(),
                path: string(),
                reason: string(),
              },
              ["kind", "opId", "path", "reason"],
            ),
          ],
        },
      },
    },
    ["schema", "baseSceneDigest", "operations"],
  ),
  MotionSceneRollbackV1: object(
    {
      schema: { type: "string", const: "motion-scene-rollback-v1" },
      version: { type: "integer", minimum: 1 },
    },
    ["schema", "version"],
  ),
  MotionSceneRenderV1: object(
    { schema: { type: "string", const: "motion-scene-render-v1" } },
    ["schema"],
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
      planDigest: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
      predecessorVersion: { type: ["integer", "null"], minimum: 1 },
      artifactDigest: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
      predicateIds: { type: "array", items: string() },
      knowledgeCardIds: { type: "array", items: string(), maxItems: 15 },
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
      "planDigest",
      "predecessorVersion",
      "artifactDigest",
      "predicateIds",
      "knowledgeCardIds",
    ],
  ),
  DeliverablesV1: object(
    {
      backend: { type: "string", enum: ["native", "adobe"] },
      items: {
        type: "array",
        items: object(
          {
            id: string(),
            kind: {
              type: "string",
              enum: ["mp4", "scene-package", "report"],
            },
            downloadUrl: string(),
          },
          ["id", "kind", "downloadUrl"],
        ),
      },
    },
    ["backend", "items"],
  ),
  FeatureFlagSnapshot: object(
    {
      verifiedMotionAuthoring: { type: "boolean" },
      nativeSceneV2: { type: "boolean" },
      adobeMcp: { type: "boolean" },
    },
    ["verifiedMotionAuthoring", "nativeSceneV2", "adobeMcp"],
  ),
  AdobeDeviceEnrollmentV1: object(
    {
      version: { type: "integer", const: 1 },
      deviceId: string(),
      keyId: string(),
      secret: { type: "string", pattern: "^[a-f0-9]{64}$" },
      expiresAtMs: { type: "integer", minimum: 1 },
    },
    ["version", "deviceId", "keyId", "secret", "expiresAtMs"],
  ),
  AdobeRelayRequestV1: object(
    {
      version: { type: "integer", const: 1 },
      command: object(
        {
          version: { type: "integer", const: 1 },
          commandId: string(),
          nonce: string(),
          sceneDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
          deviceId: string(),
          jobId: string(),
          projectHandle: { type: "string", const: "project:working-copy" },
          tool: string(),
          args: { type: "object" },
        },
        [
          "version",
          "commandId",
          "nonce",
          "sceneDigest",
          "deviceId",
          "jobId",
          "projectHandle",
          "tool",
          "args",
        ],
      ),
    },
    ["version", "command"],
  ),
  AdobeCommandStatusV1: object(
    {
      version: { type: "integer", const: 1 },
      commandId: string(),
      deviceId: string(),
      jobId: string(),
      status: {
        type: "string",
        enum: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
      },
      result: { type: ["object", "null"] },
    },
    ["version", "commandId", "deviceId", "jobId", "status", "result"],
  ),
};
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ content: { "application/json": { schema } } });
const jobIdParameter = {
  name: "id",
  in: "path",
  required: true,
  schema: string(),
};
const mutationHeaders = [
  { name: "If-Match", in: "header", required: true, schema: string() },
  { name: "Idempotency-Key", in: "header", required: true, schema: string() },
];
const adobeRelayHeaders = [
  "X-RVS-Key-Id",
  "X-RVS-Timestamp-Ms",
  "X-RVS-Request-Id",
  "X-RVS-Nonce",
  "X-RVS-Body-Hash",
  "X-RVS-Signature",
].map((name) => ({ name, in: "header", required: true, schema: string() }));
const safeErrors = Object.fromEntries(
  [400, 404, 409, 422, 428].map((status) => [
    status,
    { description: "Request rejected", ...json(ref("SafeErrorEnvelope")) },
  ]),
);
const document = {
  openapi: "3.1.0",
  info: { title: "Reference Video Studio API", version: "v1" },
  components: {
    schemas,
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
  },
  paths: {
    "/v1/adobe/devices": {
      get: {
        operationId: "listAdobeDevices",
        responses: {
          200: { description: "Enrolled devices", ...json({ type: "object" }) },
          403: { description: "Forbidden", ...json(ref("SafeErrorEnvelope")) },
        },
      },
    },
    "/v1/adobe/devices/{deviceId}/enroll": {
      post: {
        operationId: "enrollAdobeDevice",
        parameters: [
          {
            name: "deviceId",
            in: "path",
            required: true,
            schema: string(),
          },
        ],
        requestBody: json(
          object({ name: string(), deviceId: string() }, ["name"]),
        ),
        responses: {
          201: {
            description: "Enrolled",
            ...json(ref("AdobeDeviceEnrollmentV1")),
          },
          403: { description: "Forbidden", ...json(ref("SafeErrorEnvelope")) },
        },
      },
    },
    "/v1/adobe/relay": {
      post: {
        operationId: "relayAdobeCommand",
        parameters: adobeRelayHeaders,
        requestBody: json(ref("AdobeRelayRequestV1")),
        responses: {
          202: { description: "Queued", ...json(ref("AdobeCommandStatusV1")) },
          403: { description: "Rejected", ...json(ref("SafeErrorEnvelope")) },
        },
      },
    },
    "/v1/adobe/commands/{commandId}": {
      get: {
        operationId: "getAdobeCommand",
        responses: {
          200: {
            description: "Command metadata",
            ...json(ref("AdobeCommandStatusV1")),
          },
          404: { description: "Not found", ...json(ref("SafeErrorEnvelope")) },
        },
      },
    },
    "/admin/feature-flags": {
      get: {
        operationId: "getFeatureFlags",
        responses: {
          200: {
            description: "Immutable startup feature flag snapshot",
            ...json(ref("FeatureFlagSnapshot")),
          },
          403: { description: "Forbidden", ...json(ref("SafeErrorEnvelope")) },
        },
      },
    },
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
      parameters: [jobIdParameter],
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
        parameters: mutationHeaders,
        requestBody: json(ref("SceneOperationBatchV1")),
        responses: {
          200: {
            description: "Motion scene",
            ...json(ref("MotionSceneSnapshotV1")),
          },
          ...safeErrors,
        },
      },
    },
    "/v1/jobs/{id}/deliverables": {
      parameters: [jobIdParameter],
      get: {
        operationId: "getDeliverables",
        responses: {
          200: {
            description: "Deliverables",
            ...json(ref("DeliverablesV1")),
          },
        },
      },
    },
    "/v1/jobs/{id}/motion-scene/rollback": {
      parameters: [jobIdParameter],
      post: {
        operationId: "rollbackMotionScene",
        parameters: mutationHeaders,
        requestBody: json(ref("MotionSceneRollbackV1")),
        responses: {
          200: {
            description: "New version restored from history",
            ...json(ref("MotionSceneSnapshotV1")),
          },
          ...safeErrors,
        },
      },
    },
    "/v1/jobs/{id}/motion-scene/render": {
      parameters: [jobIdParameter],
      post: {
        operationId: "renderMotionScene",
        parameters: mutationHeaders,
        requestBody: json(ref("MotionSceneRenderV1")),
        responses: {
          202: { description: "Queued", ...json({ type: "object" }) },
          ...safeErrors,
        },
      },
    },
    "/v1/jobs/{id}/scene-package-download": {
      parameters: [jobIdParameter],
      get: {
        operationId: "downloadScenePackage",
        responses: {
          200: {
            description: "Offline native scene package",
            content: {
              "application/x-tar": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          404: { description: "Not found", ...json(ref("SafeErrorEnvelope")) },
        },
      },
    },
    "/v1/jobs/{id}/refine-prompt": {
      parameters: [jobIdParameter],
      post: {
        operationId: "refinePrompt",
        parameters: mutationHeaders,
        requestBody: json(
          object({ prompt: string(), locale: string() }, ["prompt"]),
        ),
        responses: {
          200: { description: "Refined", ...json({ type: "object" }) },
          ...safeErrors,
        },
      },
    },
    "/v1/jobs/{id}/delivery-download": {
      parameters: [jobIdParameter],
      get: {
        operationId: "downloadDelivery",
        responses: {
          200: {
            description: "MP4",
            content: {
              "video/mp4": { schema: { type: "string", format: "binary" } },
            },
          },
          404: { description: "Not found", ...json(ref("SafeErrorEnvelope")) },
        },
      },
    },
    "/v1/jobs/{id}/report-download": {
      parameters: [jobIdParameter],
      get: {
        operationId: "downloadReport",
        responses: {
          200: {
            description: "Verification report",
            ...json({ type: "object" }),
          },
          404: { description: "Not found", ...json(ref("SafeErrorEnvelope")) },
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
const client = `import type { MotionSceneRenderV1, MotionSceneRollbackV1, MotionSceneSnapshotV1, SceneOperationBatchV1 } from "../src/motion.js"\nexport type FeatureFlagSnapshot = Readonly<{ verifiedMotionAuthoring: boolean; nativeSceneV2: boolean; adobeMcp: boolean }>\nexport type MotionMutationHeaders = Readonly<{ "If-Match": string; "Idempotency-Key": string }>\nexport type MotionApiRequests = Readonly<{ patchMotionScene: { headers: MotionMutationHeaders; body: SceneOperationBatchV1 }; rollbackMotionScene: { headers: MotionMutationHeaders; body: MotionSceneRollbackV1 }; renderMotionScene: { headers: MotionMutationHeaders; body: MotionSceneRenderV1 }; refinePrompt: { headers: MotionMutationHeaders; body: Readonly<{ prompt: string; locale?: string }> } }>\nexport type MotionApiResponses = Readonly<{ getMotionScene: MotionSceneSnapshotV1; patchMotionScene: MotionSceneSnapshotV1; rollbackMotionScene: MotionSceneSnapshotV1; getFeatureFlags: FeatureFlagSnapshot }>\nexport type ApiOperation = "createUpload" | "createJob" | "getJob" | "getMotionScene" | "patchMotionScene" | "rollbackMotionScene" | "renderMotionScene" | "getDeliverables" | "downloadScenePackage" | "downloadDelivery" | "downloadReport" | "refinePrompt" | "createReview" | "listReceipts" | "getFeatureFlags" | "listAdobeDevices" | "enrollAdobeDevice" | "relayAdobeCommand" | "getAdobeCommand"\nexport const paths = { uploads: "/v1/uploads", jobs: "/v1/jobs", motionScene: "/v1/jobs/{id}/motion-scene", motionSceneRollback: "/v1/jobs/{id}/motion-scene/rollback", motionSceneRender: "/v1/jobs/{id}/motion-scene/render", refinePrompt: "/v1/jobs/{id}/refine-prompt", deliverables: "/v1/jobs/{id}/deliverables", delivery: "/v1/jobs/{id}/delivery-download", report: "/v1/jobs/{id}/report-download", scenePackage: "/v1/jobs/{id}/scene-package-download", reviews: "/v1/reviews", receipts: "/v1/receipts", featureFlags: "/admin/feature-flags", adobeDevices: "/v1/adobe/devices", adobeEnroll: "/v1/adobe/devices/{deviceId}/enroll", adobeRelay: "/v1/adobe/relay", adobeCommand: "/v1/adobe/commands/{commandId}" } as const\n`;
const openApi = await format(JSON.stringify(document), { parser: "json" });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (check) {
  const canonical = Buffer.from(openApi);
  const mirrors = await Promise.all(
    [contractMirror, apiMirror].map(async (path) => ({
      path,
      bytes: await readFile(path),
    })),
  );
  const mismatches = mirrors.filter(({ bytes }) => !bytes.equals(canonical));
  if (mismatches.length > 0) {
    process.stderr.write(
      `OPENAPI_MIRROR_MISMATCH ${mismatches.map(({ path }) => path).join(" ")}\n`,
    );
    process.exitCode = 1;
  }
  process.stdout.write(
    `${JSON.stringify({
      status: mismatches.length === 0 ? "verified" : "mismatch",
      canonicalSha256: hash(canonical),
      contractsMirrorSha256: hash(mirrors[0].bytes),
      apiMirrorSha256: hash(mirrors[1].bytes),
    })}\n`,
  );
} else {
  await mkdir(resolve(root, "packages/contracts/generated"), {
    recursive: true,
  });
  await writeFile(contractMirror, openApi);
  await writeFile(apiMirror, openApi);
  await writeFile(
    resolve(root, "packages/contracts/generated/client.ts"),
    await format(client, { parser: "typescript" }),
  );
  process.stdout.write(
    JSON.stringify({
      status: "generated",
      operations: 19,
      schemas: Object.keys(schemas).length,
    }) + "\n",
  );
}
