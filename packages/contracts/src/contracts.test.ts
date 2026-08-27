import { describe, expect, it } from "vitest";
import { assertLegalTransition, JobStates, transitions } from "./lifecycle.js";
import { normalizeError } from "./errors.js";
import { assertSceneOwners, AuthoringIRSchema, SceneIRSchema } from "./ir.js";
import { CoreModelSchemas } from "./models.js";
import { projectJob } from "./projection.js";

describe("canonical lifecycle", () => {
  it.each(
    JobStates.flatMap((from) =>
      transitions[from].map((to) => [from, to] as const),
    ),
  )("allows %s -> %s", (from, to) =>
    expect(() => assertLegalTransition(from, to)).not.toThrow(),
  );
  it.each([
    ["COMPLETED", "RENDERING"],
    ["CANCELLED", "QUEUED"],
    ["FAILED", "PREPARING"],
  ] as const)("rejects %s -> %s", (from, to) =>
    expect(() => assertLegalTransition(from, to)).toThrow(
      "INVALID_JOB_TRANSITION",
    ),
  );
  // A generate-track job's only edit surface is the chat: a creator can ask
  // for a scene patch after the film has already completed, which has to
  // route the job back through the render it already has (see
  // apps/api/src/refine-prompt.ts). COMPLETED is otherwise terminal -- this
  // is the one door back in, and only ever entered by that patch flow.
  it("allows COMPLETED -> QUEUED for a re-render after a scene patch", () =>
    expect(() =>
      assertLegalTransition("COMPLETED", "QUEUED"),
    ).not.toThrow());
});
describe("safe errors", () => {
  it("normalizes unknown errors", () => {
    const result = normalizeError(
      new Error("/private/path stack trace"),
      "cor_test",
    );
    expect(result.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(result)).not.toMatch(/private|stack trace/);
  });
});
describe("IR ownership", () => {
  it("rejects ownerless scene tracks", () => {
    const authoring = AuthoringIRSchema.parse({
      schema: "authoring-ir-v1",
      versionId: "air_1",
      tenantId: "ten_1",
      owners: [],
      editableAssets: [],
    });
    const scene = SceneIRSchema.parse({
      schema: "scene-ir-v1",
      versionId: "sir_1",
      tenantId: "ten_1",
      authoringVersionId: "air_1",
      tracks: [
        {
          trackId: "t",
          owner: "missing",
          geometryRef: "g",
          lifecycle: {},
          effects: [],
        },
      ],
      audio: { sampleRateHz: 48000, channels: 2 },
    });
    expect(() => assertSceneOwners(authoring, scene)).toThrow("OWNER_MISMATCH");
  });
});
describe("core models", () => {
  it("parses every migration-backed model with branded identifiers", () => {
    const tenant = {
      id: "ten_1",
      name: "Studio",
      kind: "ORGANIZATION",
      status: "ACTIVE",
      deletionEpoch: 0,
      createdAt: "2026-08-22T00:00:00Z",
    };
    expect(CoreModelSchemas.TenantSchema.parse(tenant).id).toBe("ten_1");
    expect(Object.keys(CoreModelSchemas)).toHaveLength(23);
    expect(() =>
      CoreModelSchemas.UserSchema.parse({
        id: "wrong",
        email: "x@y.test",
        displayName: "X",
        createdAt: tenant.createdAt,
      }),
    ).toThrow();
  });
  it("keeps creator projection free of admin internals", () => {
    const job = {
      id: "job_1",
      tenantId: "ten_1",
      creatorId: "usr_1",
      uploadId: "upl_1",
      sceneId: "scn_1",
      state: "COMPLETED" as const,
      attempt: 1,
      artifact: null,
      error: null,
      createdAt: "2026-08-22T00:00:00Z",
      updatedAt: "2026-08-22T00:00:00Z",
    };
    const creator = projectJob(job, "CREATOR");
    const admin = projectJob(job, "ADMIN");
    expect(Object.keys(creator).sort()).toEqual([
      "artifact",
      "attempt",
      "createdAt",
      "error",
      "id",
      "sceneId",
      "state",
      "tenantId",
      "updatedAt",
      "uploadId",
    ]);
    expect(admin).toHaveProperty("internal");
    expect(creator).not.toHaveProperty("creatorId");
  });
});
