import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { hashBearer, type AuthStore } from "./auth.js";
import { updateAiProviderSettings } from "./ai-provider-settings.js";
import { createCreatorWorkflowStore, RUNTIME_DIGEST } from "./creator-workflow.js";
import { openApiDatabase } from "./durable-state.js";
import type { GenerateProposals } from "./refine-prompt.js";
import { createUpload, finalizeUpload, type UploadStore } from "./uploads.js";

const preflight = {
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
} as const;

const fixture = (generate?: GenerateProposals) => {
  const directory = mkdtempSync(join(tmpdir(), "rvs-refine-prompt-"));
  const db = openApiDatabase(join(directory, "app.sqlite"));
  const auth: AuthStore = {
    users: [
      { id: "usr_a", email: "a@invalid" },
      { id: "usr_b", email: "b@invalid" },
    ],
    credentials: [],
    memberships: [
      { userId: "usr_a", tenantId: "ten_a", role: "OWNER" },
      { userId: "usr_b", tenantId: "ten_b", role: "OWNER" },
    ],
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
      {
        id: "tok_b",
        userId: "usr_b",
        tenantId: "ten_b",
        tokenHash: hashBearer("secret-b"),
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
  const workflow = createCreatorWorkflowStore();
  workflow.availablePreflight = preflight;
  const app = buildAuthApp({
    store: auth,
    expectedOrigin: "https://studio.invalid",
    introspectSecret: "secret",
    uploads,
    creatorWorkflow: workflow,
    now: uploads.now,
    db,
    aiSecretKey: "test-secret-key-material",
    ...(generate ? { refinePromptGenerate: generate } : {}),
  });
  return { app, uploads, workflow, db, directory, uploadId: upload.id };
};

const headersFor = (tenant: "ten_a" | "ten_b") => ({
  authorization: `Bearer secret-${tenant === "ten_a" ? "a" : "b"}`,
  "x-tenant-id": tenant,
});

const createJob = async (
  app: ReturnType<typeof buildAuthApp>,
  uploadId: string,
  key: string,
) => {
  const created = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    headers: { ...headersFor("ten_a"), "idempotency-key": key },
    payload: {
      uploadId,
      sourceFps: 30,
      startFrame: 0,
      outputProfile: "vertical-1080p30",
    },
  });
  return created.json().id as string;
};

describe("refine-prompt", () => {
  it("proposes heuristic candidates when no provider is configured", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-1");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/refine-prompt`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "refine-1" },
        payload: { prompt: "make it more dramatic" },
      });
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json();
      expect(body.plannerKind).toBe("heuristic");
      expect(body.proposals.length).toBeGreaterThanOrEqual(2);
      for (const proposal of body.proposals) {
        expect(proposal.startFrame).toBeGreaterThanOrEqual(0);
        expect(proposal.startFrame).toBeLessThanOrEqual(1200 - 30 * 4);
      }
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("rejects a job belonging to a different tenant", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-2");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/refine-prompt`,
        headers: { ...headersFor("ten_b"), "idempotency-key": "refine-2" },
        payload: { prompt: "make it more dramatic" },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("rejects an empty or oversized prompt", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-3");
      const empty = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/refine-prompt`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "refine-3" },
        payload: { prompt: "" },
      });
      expect(empty.statusCode).toBe(400);
      const oversized = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/refine-prompt`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "refine-4" },
        payload: { prompt: "x".repeat(2001) },
      });
      expect(oversized.statusCode).toBe(400);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("clamps model-proposed start frames to the accepted interval and reports plannerKind ai", async () => {
    const fake: GenerateProposals = async () => ({
      object: {
        proposals: [
          { startFrame: -50, rationale: "too early, clamp to 0" },
          { startFrame: 999_999, rationale: "too late, clamp to max" },
        ],
      },
    });
    const state = fixture(fake);
    try {
      updateAiProviderSettings(
        state.db,
        {
          providerKind: "openai",
          model: "gpt-4o",
          apiKey: "sk-test",
          enabled: true,
        },
        "admin",
        1_000,
        "test-secret-key-material",
      );
      const jobId = await createJob(state.app, state.uploadId, "job-5");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/refine-prompt`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "refine-5" },
        payload: { prompt: "make it more dramatic" },
      });
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json();
      expect(body.plannerKind).toBe("ai");
      const max = 1200 - 30 * 4;
      for (const proposal of body.proposals) {
        expect(proposal.startFrame).toBeGreaterThanOrEqual(0);
        expect(proposal.startFrame).toBeLessThanOrEqual(max);
      }
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });
});

describe("prompt-driven job creation", () => {
  it("auto-selects a start frame from creative intent when startFrame is omitted", async () => {
    const state = fixture();
    try {
      const response = await state.app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { ...headersFor("ten_a"), "idempotency-key": "create-1" },
        payload: {
          uploadId: state.uploadId,
          sourceFps: 30,
          outputProfile: "vertical-1080p30",
          prompt: "focus on the dramatic reveal",
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      const body = response.json();
      expect(body.creativePrompt).toBe("focus on the dramatic reveal");
      expect(body.startFrame).toBeGreaterThanOrEqual(0);
      expect(body.startFrame).toBeLessThanOrEqual(1200 - 30 * 4);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("falls back to the heuristic instead of failing job creation when the AI call throws", async () => {
    const failing: GenerateProposals = async () => {
      throw new Error("upstream provider unreachable");
    };
    const state = fixture(failing);
    try {
      updateAiProviderSettings(
        state.db,
        {
          providerKind: "openai",
          model: "gpt-4o",
          apiKey: "sk-test",
          enabled: true,
        },
        "admin",
        1_000,
        "test-secret-key-material",
      );
      const response = await state.app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { ...headersFor("ten_a"), "idempotency-key": "create-fallback" },
        payload: {
          uploadId: state.uploadId,
          sourceFps: 30,
          outputProfile: "vertical-1080p30",
          prompt: "focus on the dramatic reveal",
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      const body = response.json();
      expect(body.startFrame).toBeGreaterThanOrEqual(0);
      expect(body.startFrame).toBeLessThanOrEqual(1200 - 30 * 4);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("defaults to frame 0 when neither startFrame nor prompt is given", async () => {
    const state = fixture();
    try {
      const response = await state.app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { ...headersFor("ten_a"), "idempotency-key": "create-2" },
        payload: {
          uploadId: state.uploadId,
          sourceFps: 30,
          outputProfile: "vertical-1080p30",
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      const body = response.json();
      expect(body.startFrame).toBe(0);
      expect(body.creativePrompt).toBeNull();
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("still honors an explicit startFrame when one is provided", async () => {
    const state = fixture();
    try {
      const response = await state.app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { ...headersFor("ten_a"), "idempotency-key": "create-3" },
        payload: {
          uploadId: state.uploadId,
          sourceFps: 30,
          startFrame: 42,
          outputProfile: "vertical-1080p30",
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json().startFrame).toBe(42);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });
});

describe("job rating", () => {
  it("records a rating without requiring a review screen", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-6");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/rate`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "rate-1" },
        payload: { thumbsUp: true },
      });
      expect(response.statusCode, response.body).toBe(200);
      const row = state.db
        .prepare("SELECT thumbs_up FROM job_ratings WHERE job_id = ?")
        .get(jobId) as { thumbs_up: number } | undefined;
      expect(row?.thumbs_up).toBe(1);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });
});

describe("job feedback", () => {
  it("records LOOKS_GOOD without calling the AI planner", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-7");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/feedback`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "feedback-1" },
        payload: { decision: "LOOKS_GOOD" },
      });
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.proposals).toBeNull();
      const row = state.db
        .prepare(
          "SELECT decision, planner_kind, proposals_json FROM job_feedback WHERE job_id = ?",
        )
        .get(jobId) as {
        decision: string;
        planner_kind: string | null;
        proposals_json: string | null;
      };
      expect(row.decision).toBe("LOOKS_GOOD");
      expect(row.planner_kind).toBeNull();
      expect(row.proposals_json).toBeNull();
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("triggers heuristic refinement for NEEDS_CHANGES when no provider is configured", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-8");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/feedback`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "feedback-2" },
        payload: { decision: "NEEDS_CHANGES", note: "pacing feels off" },
      });
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json();
      expect(body.proposals.plannerKind).toBe("heuristic");
      expect(body.proposals.proposals.length).toBeGreaterThanOrEqual(2);
      const row = state.db
        .prepare(
          "SELECT decision, note, planner_kind, proposals_json FROM job_feedback WHERE job_id = ?",
        )
        .get(jobId) as {
        decision: string;
        note: string;
        planner_kind: string;
        proposals_json: string;
      };
      expect(row.decision).toBe("NEEDS_CHANGES");
      expect(row.note).toBe("pacing feels off");
      expect(row.planner_kind).toBe("heuristic");
      expect(JSON.parse(row.proposals_json).length).toBeGreaterThanOrEqual(2);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("still records REQUEST_CHANGES feedback when the AI planner throws", async () => {
    const failing: GenerateProposals = async () => {
      throw new Error("upstream provider unreachable");
    };
    const state = fixture(failing);
    try {
      updateAiProviderSettings(
        state.db,
        {
          providerKind: "openai",
          model: "gpt-4o",
          apiKey: "sk-test",
          enabled: true,
        },
        "admin",
        1_000,
        "test-secret-key-material",
      );
      const jobId = await createJob(state.app, state.uploadId, "job-9");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/feedback`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "feedback-3" },
        payload: { decision: "REQUEST_CHANGES" },
      });
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.proposals).toBeNull();
      const row = state.db
        .prepare("SELECT decision, planner_kind FROM job_feedback WHERE job_id = ?")
        .get(jobId) as { decision: string; planner_kind: string | null };
      expect(row.decision).toBe("REQUEST_CHANGES");
      expect(row.planner_kind).toBeNull();
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("is append-only: a second feedback call does not alter the first row", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-10");
      await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/feedback`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "feedback-4" },
        payload: { decision: "LOOKS_GOOD" },
      });
      await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/feedback`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "feedback-5" },
        payload: { decision: "NEEDS_CHANGES", note: "second pass" },
      });
      const rows = state.db
        .prepare(
          "SELECT decision FROM job_feedback WHERE job_id = ? ORDER BY created_at",
        )
        .all(jobId) as Array<{ decision: string }>;
      expect(rows.map((row) => row.decision)).toEqual([
        "LOOKS_GOOD",
        "NEEDS_CHANGES",
      ]);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });

  it("rejects an unknown decision value", async () => {
    const state = fixture();
    try {
      const jobId = await createJob(state.app, state.uploadId, "job-11");
      const response = await state.app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/feedback`,
        headers: { ...headersFor("ten_a"), "idempotency-key": "feedback-6" },
        payload: { decision: "MAYBE" },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      state.db.close();
      rmSync(state.directory, { recursive: true, force: true });
    }
  });
});
