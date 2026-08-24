import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildAuthApp } from "./app.js";
import { hashBearer, type Assignment, type AuthStore } from "./auth.js";
import {
  createCreatorWorkflowStore,
  RELEASE_BASELINE_DIGEST,
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
} => {
  const assignments: Assignment[] = ["T1", "T2", "T3", "T4", "T5"].map(
    (gate) => ({
      reviewerId: "usr_reviewer",
      tenantId: "ten_a",
      gate,
      scope: "TENANT",
    }),
  );
  assignments.push({
    reviewerId: "usr_release",
    tenantId: null,
    gate: "T6",
    scope: "RELEASE",
    releaseId: "release-1",
  });
  assignments.push({
    reviewerId: "usr_assigned_owner",
    tenantId: "ten_a",
    gate: "T1",
    scope: "TENANT",
  });
  const auth: AuthStore = {
    users: [
      { id: "usr_reviewer", email: "reviewer@invalid" },
      { id: "usr_release", email: "release@invalid" },
      { id: "usr_unassigned", email: "unassigned@invalid" },
      { id: "usr_assigned_owner", email: "owner@invalid" },
    ],
    credentials: [],
    memberships: [
      {
        userId: "usr_reviewer",
        tenantId: "ten_a",
        role: "DESIGNATED_REVIEWER",
      },
      { userId: "usr_release", tenantId: "ten_a", role: "DESIGNATED_REVIEWER" },
      { userId: "usr_unassigned", tenantId: "ten_a", role: "OWNER" },
      { userId: "usr_assigned_owner", tenantId: "ten_a", role: "OWNER" },
    ],
    assignments,
    sessions: [],
    apiTokens: [
      {
        id: "tok_r",
        userId: "usr_reviewer",
        tenantId: "ten_a",
        tokenHash: hashBearer("reviewer"),
        expiresAt: 9_000,
        revokedAt: null,
      },
      {
        id: "tok_release",
        userId: "usr_release",
        tenantId: "ten_a",
        tokenHash: hashBearer("release"),
        expiresAt: 9_000,
        revokedAt: null,
      },
      {
        id: "tok_u",
        userId: "usr_unassigned",
        tenantId: "ten_a",
        tokenHash: hashBearer("unassigned"),
        expiresAt: 9_000,
        revokedAt: null,
      },
      {
        id: "tok_owner",
        userId: "usr_assigned_owner",
        tenantId: "ten_a",
        tokenHash: hashBearer("assigned-owner"),
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
    creatorId: "server",
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
  return { app, reviews, workflow };
};
const advanceAfterGate = (
  state: ReturnType<typeof setup>,
  gate: string,
): void => {
  const job = state.workflow.jobs.get("job_gate");
  if (!job) throw new Error("test job missing");
  if (gate === "T1") {
    job.evidence = {
      state: "MAPPED",
      sceneInput: { owners: [], tracks: [], needsChoice: [] },
    };
    job.pendingCompilation = compilation;
    job.preparationStage = "AWAITING_T2";
  } else if (gate === "T3") {
    job.previewSpecDigest = compilation.browserPassSpec.digest;
    job.preparationStage = "AWAITING_T4";
  }
};
const stageT5 = (state: ReturnType<typeof setup>): void => {
  const job = state.workflow.jobs.get("job_gate");
  if (!job) throw new Error("test job missing");
  job.state = "AWAITING_T5";
  state.workflow.stagedArtifacts.set(job.id, {
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
};
const body = (
  gate: string,
  predecessorReceiptId: string | null = null,
  evidenceDigest = "ev-1",
  release = false,
) => ({
  releaseId: "release-1",
  ...(release ? {} : { jobId: "job_gate" }),
  attempt: 1,
  gate,
  decision: "APPROVED" as const,
  predecessorReceiptId,
  evidenceDigest,
  irDigest: "ir-1",
  runtimeDigest: RUNTIME_DIGEST,
  releaseBaselineDigest: RELEASE_BASELINE_DIGEST,
  reason: `review ${gate}`,
  artifactRefs: [`artifact-${gate}`, "preview-gate"],
});

describe("designated gate receipts", () => {
  it("progresses T1 through T5 and keeps receipts ordered and immutable", async () => {
    const state = setup();
    let predecessor: string | null = null;
    const inject = state.app.inject.bind(state.app);
    for (const gate of ["T1", "T2", "T3", "T4", "T5"]) {
      if (gate === "T5") stageT5(state);
      const response: { readonly statusCode: number; readonly body: string } =
        await inject({
          method: "POST",
          url: "/v1/reviews",
          headers: { authorization: "Bearer reviewer", "x-tenant-id": "ten_a" },
          payload: body(gate, predecessor),
        });
      expect(response.statusCode).toBe(201);
      predecessor = JSON.parse(response.body).receipt.id;
      advanceAfterGate(state, gate);
    }
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
    const published = state.workflow.jobs.get("job_gate")?.artifact;
    expect(published).toMatchObject({ id: "artifact-T5" });
    expect(state.workflow.artifacts.get("artifact-T5")).toBeDefined();
    const delivery = await state.app.inject({
      method: "GET",
      url: "/v1/jobs/job_gate/delivery-download",
      headers: { authorization: "Bearer reviewer", "x-tenant-id": "ten_a" },
    });
    const report = await state.app.inject({
      method: "GET",
      url: "/v1/jobs/job_gate/report-download",
      headers: { authorization: "Bearer reviewer", "x-tenant-id": "ten_a" },
    });
    expect(state.workflow.jobs.get("job_gate")?.state).toBe("COMPLETED");
    expect(delivery.statusCode).toBe(200);
    expect(delivery.rawPayload).toEqual(Buffer.from([1, 2, 3]));
    expect(report.json()).toEqual({ status: "PASS" });
    await state.app.close();
  });
  it("rejects skipped predecessors, duplicate decisions, and changed evidence as stale", async () => {
    const state = setup();
    const headers = {
      authorization: "Bearer reviewer",
      "x-tenant-id": "ten_a",
    };
    const skipped = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
      payload: body("T2"),
    });
    expect(skipped.json().error.code).toBe("INVALID_REQUEST");
    const first = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
      payload: body("T1"),
    });
    const duplicate = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
      payload: body("T1"),
    });
    expect(duplicate.json().error.code).toBe("INVALID_REQUEST");
    const stale = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
      payload: body("T1", null, "ev-2"),
    });
    expect(first.statusCode).toBe(201);
    expect(stale.json().error.code).toBe("STALE_APPROVAL_UNSAFE");
    await state.app.close();
  });
  it("denies an unassigned tenant member and preserves correction links and immutable history", async () => {
    const state = setup();
    const denied = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers: { authorization: "Bearer unassigned", "x-tenant-id": "ten_a" },
      payload: body("T1"),
    });
    expect(denied.json().error.code).toBe("ROLE_NOT_PERMITTED");
    const assignedOwner = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers: {
        authorization: "Bearer assigned-owner",
        "x-tenant-id": "ten_a",
      },
      payload: body("T1"),
    });
    expect(assignedOwner.json().error.code).toBe("ROLE_NOT_PERMITTED");
    const headers = {
      authorization: "Bearer reviewer",
      "x-tenant-id": "ten_a",
    };
    const rejected = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
      payload: { ...body("T1"), decision: "REJECTED" },
    });
    const original = rejected.json().receipt;
    const corrected = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
      payload: { ...body("T1"), correctionOf: original.id },
    });
    expect(corrected.statusCode).toBe(201);
    expect(corrected.json().receipt.correctionOf).toBe(original.id);
    expect(state.reviews.receipts[0]).toMatchObject({
      id: original.id,
      decision: "REJECTED",
    });
    const mutation = await state.app.inject({
      method: "DELETE",
      url: "/v1/reviews",
      headers,
    });
    expect(mutation.statusCode).toBe(404);
    await state.app.close();
  });
  it("starts a new receipt chain for every retry attempt", async () => {
    const state = setup();
    const headers = {
      authorization: "Bearer reviewer",
      "x-tenant-id": "ten_a",
    };
    const first = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
      payload: body("T1"),
    });
    const job = state.workflow.jobs.get("job_gate");
    if (!job) throw new Error("test job missing");
    job.attempt = 2;
    job.state = "PREPARING";
    job.preparationStage = "AWAITING_T1";

    const oldPredecessor = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
      payload: {
        ...body("T2", first.json().receipt.id),
        attempt: 2,
      },
    });
    const newT1 = await state.app.inject({
      method: "POST",
      url: "/v1/reviews",
      headers,
      payload: { ...body("T1"), attempt: 2 },
    });

    expect(oldPredecessor.json().error.code).toBe("INVALID_REQUEST");
    expect(newT1.statusCode).toBe(201);
    expect(newT1.json().receipt.attempt).toBe(2);
    await state.app.close();
  });
  it("allows release T6 only through release scope", async () => {
    const state = setup();
    let predecessor: string | null = null;
    const inject = state.app.inject.bind(state.app);
    for (const gate of ["T1", "T2", "T3", "T4", "T5"]) {
      if (gate === "T5") stageT5(state);
      const response: {
        readonly statusCode: number;
        readonly body: string;
        readonly json: () => { readonly receipt: { readonly id: string } };
      } = await inject({
        method: "POST",
        url: "/v1/reviews",
        headers: { authorization: "Bearer reviewer", "x-tenant-id": "ten_a" },
        payload: body(gate, predecessor),
      });
      predecessor = response.json().receipt.id;
      advanceAfterGate(state, gate);
    }
    const t5ReceiptId = predecessor;
    if (!t5ReceiptId) throw new Error("T5 receipt missing");
    state.workflow.releaseManifests.set("release-1", {
      releaseId: "release-1",
      baselineDigest: RELEASE_BASELINE_DIGEST,
      evidenceDigest: "ev-1",
      irDigest: "ir-1",
      runtimeDigest: RUNTIME_DIGEST,
      t5ReceiptIds: [t5ReceiptId],
      recoveryReportArtifactId: "recovery-report",
      fixedFrameArtifactIds: ["fixed-frame-0", "fixed-frame-119"],
      verifiedAt: "2026-01-01T00:00:00.000Z",
    });
    const releaseBody = {
      ...body("T6", RELEASE_BASELINE_DIGEST, "ev-1", true),
      artifactRefs: [
        t5ReceiptId,
        "recovery-report",
        "fixed-frame-0",
        "fixed-frame-119",
      ],
    };
    const response = await state.app.inject({
      method: "POST",
      url: "/v1/release-reviews",
      headers: { authorization: "Bearer release" },
      payload: releaseBody,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().receipt).toMatchObject({
      tenantId: null,
      jobId: null,
      gate: "T6",
      sequence: 6,
      predecessorReceiptId: RELEASE_BASELINE_DIGEST,
    });
    const wrongGate = await state.app.inject({
      method: "POST",
      url: "/v1/release-reviews",
      headers: { authorization: "Bearer release" },
      payload: { ...releaseBody, gate: "T5" },
    });
    expect(wrongGate.json().error.code).toBe("ROLE_NOT_PERMITTED");
    const withHeader = await state.app.inject({
      method: "POST",
      url: "/v1/release-reviews",
      headers: { authorization: "Bearer release", "x-tenant-id": "ten_a" },
      payload: releaseBody,
    });
    expect(withHeader.json().error.code).toBe("TENANT_HEADER_FORBIDDEN");
    await state.app.close();
  });
});
