import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashWorkerToken, createWorkerStore } from "./workers.js";
import type { AuthStore } from "./auth.js";
import {
  createCreatorWorkflowStore,
  type CreatorWorkflowStore,
  type Job,
} from "./creator-workflow.js";

const appFixture = (workflow?: CreatorWorkflowStore) => {
  const token = "worker-test-token";
  const workers = createWorkerStore(hashWorkerToken(token));
  const auth: AuthStore = {
    users: [],
    credentials: [],
    memberships: [],
    assignments: [],
    sessions: [],
    apiTokens: [],
    audit: () => undefined,
  };
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "not-a-worker-token",
    workers,
    creatorWorkflow: workflow,
    now: () => 1_000,
  });
  return {
    app,
    workers,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  };
};
const addJob = (workflow: CreatorWorkflowStore, state: Job["state"]): Job => {
  const job: Job = {
    id: `job-${state.toLowerCase()}`,
    tenantId: "ten_a",
    creatorId: "server",
    uploadId: "upl_a",
    state,
    attempt: 1,
    etag: '"etag"',
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    irDigest: "ir",
    evidenceDigest: "evidence",
    approved: state === "QUEUED",
    frameCount: 120,
    artifact: null,
  };
  workflow.jobs.set(job.id, job);
  workflow.attempts.set(job.id, [
    { id: "attempt-a", number: 1, state: "QUEUED", immutable: true },
  ]);
  return job;
};

describe("worker registration API", () => {
  it("Given a valid bearer token, when registering and heartbeating, then stores the worker lifecycle state", async () => {
    const fixture = appFixture();
    const registered = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: { workerId: "worker-a", capabilities: ["compiler"] },
    });
    const heartbeat = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/heartbeat",
      headers: fixture.headers,
      payload: { capabilities: ["compiler", "renderer"] },
    });
    expect(registered.statusCode).toBe(200);
    expect(registered.json()).toEqual({ workerId: "worker-a" });
    expect(heartbeat.json()).toEqual({ workerId: "worker-a" });
    expect(fixture.workers.workers.get("worker-a")).toMatchObject({
      capabilities: ["compiler", "renderer"],
      lastHeartbeat: 1_000,
      status: "ONLINE",
    });
    await fixture.app.close();
  });

  it("Given no bearer token, when registering, then rejects the request without storing a worker", async () => {
    const fixture = appFixture();
    const response = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      payload: { workerId: "worker-a", capabilities: ["compiler"] },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(fixture.workers.workers.size).toBe(0);
    await fixture.app.close();
  });

  it("Given a registered worker, when claiming and completing an unknown job, then returns no job and a safe not-found error", async () => {
    const fixture = appFixture();
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: { workerId: "worker-a", capabilities: ["compiler"] },
    });
    const claim = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: fixture.headers,
      payload: {},
    });
    const complete = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/jobs/job-missing/complete",
      headers: fixture.headers,
      payload: { result: {} },
    });
    expect(claim.json()).toEqual({ job: null });
    expect(complete.statusCode).toBe(404);
    expect(complete.json().error.code).toBe("RESOURCE_NOT_FOUND");
    await fixture.app.close();
  });

  it("Given a preparing workflow job, when claimed and completed, then marks it ready", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "PREPARING");
    const fixture = appFixture(workflow);
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: { workerId: "worker-a", capabilities: ["compiler"] },
    });
    const claim = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: fixture.headers,
      payload: {},
    });
    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: { result: { ok: true } },
    });
    expect(claim.json().job).toMatchObject({
      jobId: job.id,
      attemptId: "attempt-a",
      payload: { phase: "prepare" },
    });
    expect(complete.statusCode).toBe(200);
    expect(workflow.jobs.get(job.id)?.state).toBe("READY");
    await fixture.app.close();
  });

  it("Given a queued render job, when claimed and completed, then publishes a delivery artifact", async () => {
    const workflow = createCreatorWorkflowStore();
    const job = addJob(workflow, "QUEUED");
    const fixture = appFixture(workflow);
    await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: fixture.headers,
      payload: { workerId: "worker-a", capabilities: ["renderer"] },
    });
    const claim = await fixture.app.inject({
      method: "POST",
      url: "/v1/workers/worker-a/claim",
      headers: fixture.headers,
      payload: {},
    });
    const complete = await fixture.app.inject({
      method: "POST",
      url: `/v1/workers/worker-a/jobs/${job.id}/complete`,
      headers: fixture.headers,
      payload: { result: { ok: true } },
    });
    expect(claim.json().job.payload.phase).toBe("render");
    expect(workflow.jobs.get(job.id)?.state).toBe("COMPLETED");
    expect(workflow.jobs.get(job.id)?.artifact).toMatchObject({
      kind: "delivery",
    });
    expect(complete.statusCode).toBe(200);
    await fixture.app.close();
  });
});
