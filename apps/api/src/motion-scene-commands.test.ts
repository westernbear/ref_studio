import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureSpec } from "@rvs/contracts";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCompletedGeneratedJob,
  createMotionCommandFixture,
  motionCommandHeaders as headers,
} from "./motion-scene-command-fixture.js";
import { insertMotionSceneVersion } from "./motion-scene-store.js";
import { verifyMotionScene } from "./motion-operations.js";

describe("motion scene commands", () => {
  let directory = "";
  let fixture: ReturnType<typeof createMotionCommandFixture>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "rvs-motion-command-"));
    fixture = createMotionCommandFixture(directory, {
      patchSceneGenerate: async () => ({
        object: { spec: fixtureSpec, summary: "Updated the opening title" },
      }),
    });
  });

  afterEach(async () => {
    await fixture.app.close();
    fixture.db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("initializes a generated scene, rolls back immutably, and preserves the prior artifact", async () => {
    const jobId = await createCompletedGeneratedJob(fixture);
    const initial = await fixture.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/motion-scene`,
      headers,
    });
    expect(initial.statusCode, initial.body).toBe(200);
    expect(initial.json().version).toBe(1);

    const changed = await fixture.app.inject({
      method: "PATCH",
      url: `/v1/jobs/${jobId}/motion-scene`,
      headers: {
        ...headers,
        "if-match": initial.json().sceneEtag,
        "idempotency-key": "change-hero",
      },
      payload: {
        schema: "scene-operation-batch-v1",
        baseSceneDigest: initial.json().sceneDigest,
        operations: [
          {
            kind: "set",
            opId: "set-hero",
            path: "/palette/hero",
            value: "#6633ee",
            reason: "direct property edit",
          },
        ],
      },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json().version).toBe(2);
    expect(changed.json().scene.palette.hero).toBe("#6633ee");

    const job = fixture.workflow.jobs.get(jobId);
    expect(job).toBeDefined();
    if (!job) return;
    job.state = "COMPLETED";
    const artifactId = job.artifact?.id;
    const rolledBack = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/motion-scene/rollback`,
      headers: {
        ...headers,
        "if-match": changed.json().sceneEtag,
        "idempotency-key": "rollback-v1",
      },
      payload: { schema: "motion-scene-rollback-v1", version: 1 },
    });
    expect(rolledBack.statusCode, rolledBack.body).toBe(200);
    expect(rolledBack.json().version).toBe(3);
    expect(rolledBack.json().scene.palette.hero).toBe(fixtureSpec.palette.hero);
    expect(job.state).toBe("QUEUED");
    expect(job.artifact?.id).toBe(artifactId);

    const replay = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/motion-scene/rollback`,
      headers: {
        ...headers,
        "if-match": changed.json().sceneEtag,
        "idempotency-key": "rollback-v1",
      },
      payload: { schema: "motion-scene-rollback-v1", version: 1 },
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().version).toBe(3);
  });

  it("requeues the current verified scene and rejects a stale scene ETag", async () => {
    const jobId = await createCompletedGeneratedJob(fixture);
    const scene = await fixture.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/motion-scene`,
      headers,
    });
    const stale = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/motion-scene/render`,
      headers: {
        ...headers,
        "if-match": `"${"0".repeat(64)}"`,
        "idempotency-key": "render-stale",
      },
      payload: { schema: "motion-scene-render-v1" },
    });
    expect(stale.statusCode).toBe(409);

    const job = fixture.workflow.jobs.get(jobId);
    const artifactId = job?.artifact?.id;
    const queued = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/motion-scene/render`,
      headers: {
        ...headers,
        "if-match": scene.json().sceneEtag,
        "idempotency-key": "render-current",
      },
      payload: { schema: "motion-scene-render-v1" },
    });
    expect(queued.statusCode, queued.body).toBe(202);
    expect(queued.json()).toMatchObject({ state: "QUEUED" });
    expect(job?.artifact?.id).toBe(artifactId);
  });

  it("preserves the scene when a command is not queueable or verified", async () => {
    const jobId = await createCompletedGeneratedJob(fixture);
    const scene = await fixture.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/motion-scene`,
      headers,
    });
    const job = fixture.workflow.jobs.get(jobId);
    expect(job).toBeDefined();
    if (!job) return;
    job.state = "QUEUED";
    const rejectedRollback = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/motion-scene/rollback`,
      headers: {
        ...headers,
        "if-match": scene.json().sceneEtag,
        "idempotency-key": "rollback-while-queued",
      },
      payload: { schema: "motion-scene-rollback-v1", version: 1 },
    });
    expect(rejectedRollback.statusCode).toBe(409);
    const unchanged = await fixture.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/motion-scene`,
      headers,
    });
    expect(unchanged.json().version).toBe(1);

    job.state = "COMPLETED";
    insertMotionSceneVersion(fixture.db, job, fixtureSpec, null);
    const rejectedRender = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/motion-scene/render`,
      headers: {
        ...headers,
        "if-match": scene.json().sceneEtag,
        "idempotency-key": "render-unverified",
      },
      payload: { schema: "motion-scene-render-v1" },
    });
    expect(rejectedRender.statusCode).toBe(409);
    expect(job.state).toBe("COMPLETED");
  });

  it("revalidates stored reports before render and rollback admission", async () => {
    const jobId = await createCompletedGeneratedJob(fixture);
    await fixture.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/motion-scene`,
      headers,
    });
    const job = fixture.workflow.jobs.get(jobId);
    expect(job).toBeDefined();
    if (!job) return;
    const firstBeat = fixtureSpec.beats[0]!;
    const videoScene = {
      ...fixtureSpec,
      beats: [
        {
          ...firstBeat,
          elements: [{ ...firstBeat.elements[0]!, kind: "video" as const }],
        },
        ...fixtureSpec.beats.slice(1),
      ],
    };
    const videoDigest = sha256Hex(videoScene);
    const unsafe = insertMotionSceneVersion(fixture.db, job, videoScene, {
      schema: "verification-report-v1",
      sceneDigest: videoDigest,
      attempts: 1,
      status: "PASS",
      findings: [],
    });
    const artifactId = job.artifact?.id;
    const rejectedRender = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/motion-scene/render`,
      headers: {
        ...headers,
        "if-match": `"${videoDigest}"`,
        "idempotency-key": "render-forged-pass",
      },
      payload: { schema: "motion-scene-render-v1" },
    });
    expect(rejectedRender.statusCode).toBe(409);
    expect(job.state).toBe("COMPLETED");
    expect(job.artifact?.id).toBe(artifactId);

    const safe = insertMotionSceneVersion(
      fixture.db,
      job,
      fixtureSpec,
      verifyMotionScene(fixtureSpec),
    );
    const rejectedRollback = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/motion-scene/rollback`,
      headers: {
        ...headers,
        "if-match": `"${safe.sceneDigest}"`,
        "idempotency-key": "rollback-forged-pass",
      },
      payload: { schema: "motion-scene-rollback-v1", version: unsafe.version },
    });
    expect(rejectedRollback.statusCode).toBe(409);
    const current = await fixture.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/motion-scene`,
      headers,
    });
    expect(current.json().version).toBe(safe.version);
    expect(job.artifact?.id).toBe(artifactId);
  });

  it("accepts a connected chat refinement with the current scene ETag", async () => {
    const jobId = await createCompletedGeneratedJob(fixture);
    const scene = await fixture.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/motion-scene`,
      headers,
    });
    const refined = await fixture.app.inject({
      method: "POST",
      url: `/v1/jobs/${jobId}/refine-prompt`,
      headers: {
        ...headers,
        "if-match": scene.json().sceneEtag,
        "idempotency-key": "chat-refine-current",
      },
      payload: { prompt: "Update the opening title", locale: "en-US" },
    });
    expect(refined.statusCode, refined.body).toBe(200);
    expect(refined.json().summary).toBe("Updated the opening title");
  });
});
