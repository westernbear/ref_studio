import { fixtureSpec, sha256Hex } from "@rvs/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MotionWorkspaceApiError,
  patchMotionScene,
} from "../src/app/[locale]/scene-review/motion-workspace-api.ts";

const digest = sha256Hex(fixtureSpec);
const snapshot = {
  schema: "motion-scene-snapshot-v1",
  version: 1,
  sceneEtag: `"${digest}"`,
  sceneDigest: digest,
  scene: fixtureSpec,
  history: [
    { version: 1, sceneDigest: digest, createdAt: "2026-08-29T00:00:00.000Z" },
  ],
  backendCapability: {
    schema: "backend-capability-snapshot-v1",
    backend: "native",
    capturedAt: "2026-08-29T00:00:00.000Z",
    capabilities: ["text", "shape", "x", "y"],
  },
  verification: null,
  planDigest: null,
  predecessorVersion: null,
  artifactDigest: null,
  predicateIds: [],
};
const operations = [
  {
    kind: "set",
    opId: "move-x-v1-b0-e0",
    path: "/beats/0/elements/0/box/x",
    value: 12,
    reason: "canvas direct manipulation",
  },
];

afterEach(() => vi.unstubAllGlobals());

describe("motion workspace API", () => {
  it("binds every direct edit to the current digest, ETag, and a unique idempotency key", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push({ url, init });
      return Response.json(snapshot);
    });

    await patchMotionScene("job/a", snapshot, operations);
    await patchMotionScene("job/a", snapshot, operations);

    expect(calls.map(({ url }) => url)).toEqual([
      "/api/v1/jobs/job%2Fa/motion-scene",
      "/api/v1/jobs/job%2Fa/motion-scene",
    ]);
    const firstHeaders = new Headers(calls[0].init.headers);
    const secondHeaders = new Headers(calls[1].init.headers);
    expect(firstHeaders.get("if-match")).toBe(snapshot.sceneEtag);
    expect(firstHeaders.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/u);
    expect(secondHeaders.get("idempotency-key")).not.toBe(
      firstHeaders.get("idempotency-key"),
    );
    expect(JSON.parse(calls[0].init.body)).toEqual({
      schema: "scene-operation-batch-v1",
      baseSceneDigest: digest,
      operations,
    });
  });

  it("surfaces a stale ETag conflict without accepting a replacement scene", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: { code: "VERSION_CONFLICT" } }, { status: 409 }),
    );

    await expect(
      patchMotionScene("job-a", snapshot, operations),
    ).rejects.toEqual(new MotionWorkspaceApiError("VERSION_CONFLICT"));
  });

  it("rejects false-success and malformed response bodies", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ ok: true }));
    await expect(
      patchMotionScene("job-a", snapshot, operations),
    ).rejects.toEqual(new MotionWorkspaceApiError("INVALID_RESPONSE"));
  });
});
