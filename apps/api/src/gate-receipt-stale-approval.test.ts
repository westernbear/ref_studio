import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import {
  autoApproveT1,
  autoApproveT2T3,
  autoApproveT4,
  autoApproveT5,
  createCreatorWorkflowStore,
  RUNTIME_DIGEST,
  type Job,
} from "./creator-workflow.js";
import { createReviewStore } from "./reviews.js";

const compilation = {
  authoring: {
    versionId: "artifact-T3",
    digest: "authoring-ir",
    parentDigest: null,
  },
  scene: {
    versionId: "scene-ir",
    digest: "scene-ir",
    parentDigest: "authoring-ir",
  },
  browserPassSpec: {
    versionId: "browser-pass-spec",
    digest: "ir-1",
    parentDigest: "scene-ir",
  },
} as const;

const setup = (): {
  readonly app: FastifyInstance;
  readonly reviews: ReturnType<typeof createReviewStore>;
  readonly workflow: ReturnType<typeof createCreatorWorkflowStore>;
  readonly job: Job;
} => {
  const auth: AuthStore = {
    users: [{ id: "usr_owner", email: "owner@invalid" }],
    credentials: [],
    memberships: [{ userId: "usr_owner", tenantId: "ten_a", role: "OWNER" }],
    assignments: [],
    sessions: [],
    apiTokens: [
      {
        id: "tok_owner",
        userId: "usr_owner",
        tenantId: "ten_a",
        tokenHash: hashBearer("owner"),
        expiresAt: 9_000,
        revokedAt: null,
      },
    ],
    audit: () => undefined,
  };
  const workflow = createCreatorWorkflowStore();
  const job: Job = {
    id: "job_gate",
    tenantId: "ten_a",
    creatorId: "usr_owner",
    uploadId: "upl_a",
    state: "PREPARING" as const,
    attempt: 1,
    etag: '"etag"',
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    irDigest: "ir-1",
    evidenceDigest: "ev-1",
    approved: false,
    startFrame: 0,
    sourceFps: 30,
    frameCount: 120,
    evidence: null,
    candidateEvidence: null,
    candidateEvidenceDigest: null,
    preparationStage: "AWAITING_T1",
    pendingCompilation: null,
    compilation: null,
    previewSpecDigest: null,
    approvedSpecDigest: null,
    eligibleAt: 0,
    automaticRetries: 0,
    deletionEpoch: 0,
    restoreEpoch: 0,
    failureCode: null,
    runtimePreflight: {
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
    },
    progress: null,
    artifact: null,
  };
  workflow.jobs.set(job.id, job);
  workflow.attempts.set(job.id, [
    { id: "attempt-1", number: 1, state: "QUEUED", immutable: true },
  ]);
  workflow.previews.set(job.id, {
    id: "preview-gate",
    jobId: job.id,
    tenantId: job.tenantId,
    kind: "preview",
    filename: `${job.id}-preview.mp4`,
    contentType: "video/mp4",
    bytes: Uint8Array.from([4, 5, 6]),
    sha256: "b".repeat(64),
    sizeBytes: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    report: null,
  });
  const reviews = createReviewStore();
  const uploads = {
    uploads: new Map(),
    cas: new Map(),
    casByTenantDigest: new Map(),
    now: () => 1_000,
  };
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "secret",
    creatorWorkflow: workflow,
    uploads,
    reviews,
    now: () => 1_000,
  });
  return { app, reviews, workflow, job };
};
// Drives the job through T1 -> T5 the way workers.ts's finish handler does:
// mutate the job to the state a successful worker phase would leave it in,
// then call the matching autoApprove* function (no HTTP review call exists).
const driveToCompletion = (state: ReturnType<typeof setup>): void => {
  const { job, reviews, workflow } = state;
  autoApproveT1(reviews, job, job.creatorId, 1_000);
  job.evidence = {
    state: "MAPPED",
    sceneInput: { owners: [], tracks: [], needsChoice: [] },
  };
  job.pendingCompilation = compilation;
  job.preparationStage = "AWAITING_T2";
  autoApproveT2T3(reviews, job, job.creatorId, 1_000);
  job.previewSpecDigest = compilation.browserPassSpec.digest;
  job.preparationStage = "AWAITING_T4";
  autoApproveT4(reviews, workflow, job, job.creatorId, 1_000);
  job.state = "AWAITING_T5";
  workflow.stagedArtifacts.set(job.id, {
    id: "artifact-T5",
    jobId: job.id,
    tenantId: job.tenantId,
    kind: "delivery",
    filename: `${job.id}-delivery.mp4`,
    contentType: "video/mp4",
    bytes: Uint8Array.from([1, 2, 3]),
    sha256: "a".repeat(64),
    sizeBytes: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    report: { status: "PASS" },
  });
  autoApproveT5(reviews, workflow, job, job.creatorId, 1_000);
};

describe("automatic gate receipts", () => {
  it("progresses T1 through T5 with no human review call and keeps receipts ordered and chained", async () => {
    const state = setup();
    driveToCompletion(state);
    expect(state.reviews.receipts.map((receipt) => receipt.gate)).toEqual([
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
    ]);
    expect(state.reviews.receipts.map((receipt) => receipt.sequence)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(state.reviews.receipts.map((receipt) => receipt.decision)).toEqual([
      "APPROVED",
      "APPROVED",
      "APPROVED",
      "APPROVED",
      "APPROVED",
    ]);
    // Each receipt's predecessor points at the prior gate's receipt id.
    for (let index = 1; index < state.reviews.receipts.length; index += 1) {
      expect(state.reviews.receipts[index]?.predecessorReceiptId).toBe(
        state.reviews.receipts[index - 1]?.id,
      );
    }
    const published = state.workflow.jobs.get("job_gate")?.artifact;
    expect(published).toMatchObject({ id: "artifact-T5" });
    expect(state.workflow.artifacts.get("artifact-T5")).toBeDefined();
    const delivery = await state.app.inject({
      method: "GET",
      url: "/v1/jobs/job_gate/delivery-download",
      headers: { authorization: "Bearer owner", "x-tenant-id": "ten_a" },
    });
    const report = await state.app.inject({
      method: "GET",
      url: "/v1/jobs/job_gate/report-download",
      headers: { authorization: "Bearer owner", "x-tenant-id": "ten_a" },
    });
    expect(state.workflow.jobs.get("job_gate")?.state).toBe("COMPLETED");
    expect(delivery.statusCode).toBe(200);
    expect(delivery.rawPayload).toEqual(Buffer.from([1, 2, 3]));
    expect(report.json()).toEqual({ status: "PASS" });
    await state.app.close();
  });
  it("collapses T2 and T3 into a single automatic step once compilation succeeds", () => {
    const state = setup();
    autoApproveT1(state.reviews, state.job, state.job.creatorId, 1_000);
    state.job.evidence = {
      state: "MAPPED",
      sceneInput: { owners: [], tracks: [], needsChoice: [] },
    };
    state.job.pendingCompilation = compilation;
    state.job.preparationStage = "AWAITING_T2";
    autoApproveT2T3(state.reviews, state.job, state.job.creatorId, 1_000);
    expect(state.reviews.receipts.map((receipt) => receipt.gate)).toEqual([
      "T1",
      "T2",
      "T3",
    ]);
    expect(state.job.compilation).toMatchObject({
      authoring: { versionId: "artifact-T3" },
    });
    expect(state.job.pendingCompilation).toBeNull();
    expect(state.job.preparationStage).toBe("PREVIEW_QUEUED");
  });
  it("does not auto-approve T2/T3 while a choice is unresolved", () => {
    const state = setup();
    autoApproveT1(state.reviews, state.job, state.job.creatorId, 1_000);
    state.job.evidence = {
      state: "NEEDS_CHOICE",
      needsChoice: [{ choiceId: "choice_font_family", options: ["Inter"] }],
      sceneInput: {
        owners: [],
        tracks: [],
        needsChoice: [{ choiceId: "choice_font_family", options: ["Inter"] }],
      },
    };
    state.job.pendingCompilation = compilation;
    state.job.preparationStage = "AWAITING_T2";
    autoApproveT2T3(state.reviews, state.job, state.job.creatorId, 1_000);
    expect(
      state.reviews.receipts.map((receipt) => receipt.gate),
    ).toEqual(["T1"]);
    expect(state.job.preparationStage).toBe("AWAITING_T2");
    expect(state.job.compilation).toBeNull();
  });
  it("does not auto-approve T4 when the preview is stale relative to the current compilation", () => {
    const state = setup();
    state.job.compilation = compilation;
    state.job.previewSpecDigest = "stale-digest";
    state.job.preparationStage = "AWAITING_T4";
    autoApproveT4(
      state.reviews,
      state.workflow,
      state.job,
      state.job.creatorId,
      1_000,
    );
    expect(state.reviews.receipts).toHaveLength(0);
    expect(state.job.state).toBe("PREPARING");
  });
  it("is a no-op on terminal jobs (COMPLETED, CANCELLED, FAILED)", () => {
    for (const terminalState of ["COMPLETED", "CANCELLED", "FAILED"] as const) {
      const state = setup();
      state.job.state = terminalState;
      state.job.preparationStage = "AWAITING_T4";
      state.job.compilation = compilation;
      state.job.previewSpecDigest = compilation.browserPassSpec.digest;
      autoApproveT4(
        state.reviews,
        state.workflow,
        state.job,
        state.job.creatorId,
        1_000,
      );
      expect(state.reviews.receipts).toHaveLength(0);
      expect(state.job.state).toBe(terminalState);
    }
  });
  it("starts a fresh, independently-chained receipt sequence for a new attempt", () => {
    const state = setup();
    autoApproveT1(state.reviews, state.job, state.job.creatorId, 1_000);
    const firstAttemptT1 = state.reviews.receipts[0];
    expect(firstAttemptT1?.attempt).toBe(1);
    state.job.attempt = 2;
    state.job.state = "PREPARING";
    state.job.preparationStage = "AWAITING_T1";
    autoApproveT1(state.reviews, state.job, state.job.creatorId, 2_000);
    const secondAttemptT1 = state.reviews.receipts.find(
      (receipt) => receipt.attempt === 2 && receipt.gate === "T1",
    );
    expect(secondAttemptT1).toBeDefined();
    expect(secondAttemptT1?.predecessorReceiptId).toBeNull();
    expect(secondAttemptT1?.id).not.toBe(firstAttemptT1?.id);
  });
});
