import { join } from "node:path";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import { fixtureSpec } from "../../../packages/contracts/src/scene-spec.fixture.js";
import { buildAuthApp } from "./app.js";
import { updateAiProviderSettings } from "./ai-provider-settings.js";
import { hashBearer, type AuthStore } from "./auth.js";
import {
  createCreatorWorkflowStore,
  RUNTIME_DIGEST,
} from "./creator-workflow.js";
import { openApiDatabase } from "./durable-state.js";
import type { GeneratePatch } from "./patch-scene.js";
import { createUpload, finalizeUpload, type UploadStore } from "./uploads.js";

export const motionCommandHeaders = {
  authorization: "Bearer secret-a",
  "x-tenant-id": "ten_a",
};

export function createMotionCommandFixture(
  directory: string,
  options: Readonly<{
    expectedOrigin?: string;
    patchSceneGenerate?: GeneratePatch;
  }> = {},
) {
  const db = openApiDatabase(join(directory, "app.sqlite"));
  if (options.patchSceneGenerate)
    updateAiProviderSettings(
      db,
      {
        providerKind: "google",
        model: "gemini-3-flash-preview",
        apiKey: "fixture-provider-key",
        enabled: true,
      },
      "usr_platform",
      1_000,
      "test-secret-key-material",
    );
  const auth: AuthStore = {
    users: [{ id: "usr_a", email: "a@invalid" }],
    credentials: [],
    memberships: [{ userId: "usr_a", tenantId: "ten_a", role: "OWNER" }],
    assignments: [],
    sessions: [],
    apiTokens: [
      {
        id: "tok_a",
        userId: "usr_a",
        tenantId: "ten_a",
        tokenHash: hashBearer("secret-a"),
        expiresAt: 9_000,
        revokedAt: null,
      },
    ],
    audit: () => undefined,
  };
  const uploads: UploadStore = {
    uploads: new Map(),
    cas: new Map(),
    casByTenantDigest: new Map(),
    now: () => 1_000,
  };
  const upload = createUpload(uploads, "ten_a", {
    fileName: "reference.mp4",
    sizeBytes: 12,
  });
  upload.chunks.push(
    Uint8Array.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]),
  );
  upload.actualBytes = 12;
  finalizeUpload(uploads, "ten_a", upload.id);
  upload.media = { fps: 30, frameCount: 1200, durationSeconds: 40 };
  const workflow = createCreatorWorkflowStore(uploads.now);
  workflow.availablePreflight = {
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
  };
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: options.expectedOrigin ?? "https://studio.invalid",
    introspectSecret: "secret",
    uploads,
    creatorWorkflow: workflow,
    now: uploads.now,
    db,
    aiSecretKey: "test-secret-key-material",
    verifiedMotionAuthoring: true,
    nativeSceneV2: true,
    ...(options.patchSceneGenerate
      ? { patchSceneGenerate: options.patchSceneGenerate }
      : {}),
  });
  return { app, auth, db, workflow, uploadId: upload.id };
}

export async function createCompletedGeneratedJob(
  fixture: ReturnType<typeof createMotionCommandFixture>,
): Promise<string> {
  const created = await fixture.app.inject({
    method: "POST",
    url: "/v1/jobs",
    headers: { ...motionCommandHeaders, "idempotency-key": "create-generated" },
    payload: {
      uploadId: fixture.uploadId,
      sourceFps: 30,
      startFrame: 0,
      outputProfile: "vertical-1080p30",
    },
  });
  if (created.statusCode !== 201)
    throw new Error(`fixture job creation failed: ${created.body}`);
  const jobId = created.json().id as string;
  const job = fixture.workflow.jobs.get(jobId);
  if (!job) throw new Error("fixture job missing");
  if (
    !Reflect.set(job, "generation", {
      brief: "Motion workspace command fixture",
      durationSec: 20,
      aspect: "9:16",
      attachmentIds: ["att_1"],
    })
  )
    throw new Error("fixture generation setup failed");
  job.authoredScene = {
    spec: fixtureSpec,
    beatSheet: fixtureSpec.beats.map((beat) => ({
      beatId: beat.beatId,
      shot: beat.shot,
      words: "",
    })),
    motionPlan: {
      schema: "motion-plan-v1",
      intent: "fixture",
      knowledgeCardIds: [],
      requiredCapabilities: [],
      canvas: { width: 1920, height: 1080, fps: 30, frameCount: 450 },
      keyframeIntents: [],
      predicateIds: ["scene-spec"],
      reproducibility: {
        knowledgeCardDigest: "0".repeat(64),
        promptDigest: "0".repeat(64),
        modelDigest: "0".repeat(64),
        evidenceDigest: "0".repeat(64),
        capabilitySnapshotDigest: "0".repeat(64),
        planDigest: "0".repeat(64),
        knowledgeCardIds: [],
        requiredCapabilities: [],
        promptVersion: "fixture-v1",
        modelVersion: "fixture-v1",
      },
    },
    planDigest: "0".repeat(64),
  };
  job.sceneSpecDigest = sha256Hex(fixtureSpec);
  job.preparationStage = "READY";
  job.approved = true;
  job.state = "COMPLETED";
  job.artifact = {
    id: "artifact-safe",
    kind: "generated-delivery",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  fixture.db.exec(
    `INSERT OR IGNORE INTO tenants VALUES ('ten_a','A','ORGANIZATION','ACTIVE',0,'2026-01-01T00:00:00Z');
     INSERT OR IGNORE INTO users VALUES ('usr_a','motion@example.test','A','2026-01-01T00:00:00Z');
     INSERT OR IGNORE INTO tenant_memberships VALUES ('ten_a','usr_a','OWNER','2026-01-01T00:00:00Z');
     INSERT OR IGNORE INTO uploads VALUES ('upl_motion','ten_a','x.mp4','video/mp4',1,'ACCEPTED',NULL,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z');`,
  );
  fixture.db
    .prepare(
      "INSERT INTO jobs(id,tenant_id,creator_id,upload_id,scene_id,state,attempt,deletion_epoch,created_at) VALUES(?,?,?,?,?,'QUEUED',0,0,?)",
    )
    .run(
      jobId,
      "ten_a",
      "usr_a",
      "upl_motion",
      `scene-${jobId}`,
      "2026-01-01T00:00:00Z",
    );
  return jobId;
}
