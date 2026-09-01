import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  SceneSpecSchema,
  SceneSpecV1Schema,
} from "../../../packages/contracts/src/scene-spec.js";
import { MotionPlanGenerateSchema } from "./motion-plan-generator.js";

// OpenAI's response_format rejects any schema whose root is not
// `type: "object"`. Handing generateObject the SceneSpecSchema union sent a
// rootless anyOf and every authoring job died on a 400 that only said
// "got 'type: \"None\"'".
describe("structured-output schemas", () => {
  it.each([
    ["scene spec v1", SceneSpecV1Schema],
    ["motion plan", MotionPlanGenerateSchema],
  ])("%s converts to a root object", (_name, schema) => {
    expect(z.toJSONSchema(schema, { io: "output" }).type).toBe("object");
  });

  it("is the reason the union cannot be sent directly", () => {
    expect(
      z.toJSONSchema(SceneSpecSchema, { io: "output" }).type,
    ).toBeUndefined();
  });
});
