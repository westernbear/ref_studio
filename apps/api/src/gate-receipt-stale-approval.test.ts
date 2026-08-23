import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildAuthApp } from "./app.js";
import { hashBearer, type Assignment, type AuthStore } from "./auth.js";
import { createCreatorWorkflowStore } from "./creator-workflow.js";
import { createReviewStore } from "./reviews.js";

const setup = (): {
  readonly app: FastifyInstance;
  readonly reviews: ReturnType<typeof createReviewStore>;
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
  });
  const auth: AuthStore = {
    users: [
      { id: "usr_reviewer", email: "reviewer@invalid" },
      { id: "usr_release", email: "release@invalid" },
      { id: "usr_unassigned", email: "unassigned@invalid" },
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
    ],
    audit: () => undefined,
  };
  const workflow = createCreatorWorkflowStore();
  const job = {
    id: "job_gate",
    tenantId: "ten_a",
    creatorId: "server",
    uploadId: "upl_a",
    state: "QUEUED" as const,
    attempt: 1,
    etag: '"etag"',
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    irDigest: "ir-1",
    evidenceDigest: "ev-1",
    approved: false,
    frameCount: 120,
    artifact: null,
  };
  workflow.jobs.set(job.id, job);
  const reviews = createReviewStore();
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "secret",
    creatorWorkflow: workflow,
    reviews,
    now: () => 1_000,
  });
  return { app, reviews };
};
const body = (
  gate: string,
  predecessorReceiptId: string | null = null,
  evidenceDigest = "ev-1",
  release = false,
) => ({
  ...(release ? {} : { jobId: "job_gate" }),
  attempt: 1,
  gate,
  decision: "APPROVED" as const,
  predecessorReceiptId,
  evidenceDigest,
  irDigest: "ir-1",
  runtimeDigest: "runtime-1",
  releaseBaselineDigest: "release-1",
  reason: `review ${gate}`,
  artifactRefs: [`artifact-${gate}`],
});

describe("designated gate receipts", () => {
  it("progresses T1 through T5 and keeps receipts ordered and immutable", async () => {
    const state = setup();
    let predecessor: string | null = null;
    const inject = state.app.inject.bind(state.app);
    for (const gate of ["T1", "T2", "T3", "T4", "T5"]) {
      const response: { readonly statusCode: number; readonly body: string } =
        await inject({
          method: "POST",
          url: "/v1/reviews",
          headers: { authorization: "Bearer reviewer", "x-tenant-id": "ten_a" },
          payload: body(gate, predecessor),
        });
      expect(response.statusCode).toBe(201);
      predecessor = JSON.parse(response.body).receipt.id;
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
  it("allows release T6 only through release scope", async () => {
    const state = setup();
    let predecessor: string | null = null;
    const inject = state.app.inject.bind(state.app);
    for (const gate of ["T1", "T2", "T3", "T4", "T5"]) {
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
    }
    const response = await state.app.inject({
      method: "POST",
      url: "/v1/release-reviews",
      headers: { authorization: "Bearer release" },
      payload: body("T6", predecessor, "ev-1", true),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().receipt).toMatchObject({
      tenantId: null,
      jobId: null,
      gate: "T6",
      sequence: 6,
      predecessorReceiptId: predecessor,
    });
    const wrongGate = await state.app.inject({
      method: "POST",
      url: "/v1/release-reviews",
      headers: { authorization: "Bearer release" },
      payload: body("T5", predecessor, "ev-1", true),
    });
    expect(wrongGate.json().error.code).toBe("ROLE_NOT_PERMITTED");
    const withHeader = await state.app.inject({
      method: "POST",
      url: "/v1/release-reviews",
      headers: { authorization: "Bearer release", "x-tenant-id": "ten_a" },
      payload: body("T6", predecessor, "ev-1", true),
    });
    expect(withHeader.json().error.code).toBe("TENANT_HEADER_FORBIDDEN");
    await state.app.close();
  });
});
