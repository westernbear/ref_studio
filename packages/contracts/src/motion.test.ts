import { describe, expect, it } from "vitest";
import { SceneOperationBatchV1Schema } from "./motion.js";

describe("SceneOperationBatchV1", () => {
  it("rejects unknown fields and duplicate operation ids", () => {
    const base = "a".repeat(64);
    expect(
      SceneOperationBatchV1Schema.safeParse({
        schema: "scene-operation-batch-v1",
        baseSceneDigest: base,
        operations: [
          { kind: "unset", opId: "same", path: "/beats/0", reason: "one" },
          { kind: "unset", opId: "same", path: "/beats/1", reason: "two" },
        ],
      }).success,
    ).toBe(false);
    expect(
      SceneOperationBatchV1Schema.safeParse({
        schema: "scene-operation-batch-v1",
        baseSceneDigest: base,
        operations: [
          { kind: "unset", opId: "one", path: "/beats/0", reason: "one" },
        ],
        extra: true,
      }).success,
    ).toBe(false);
  });
});
