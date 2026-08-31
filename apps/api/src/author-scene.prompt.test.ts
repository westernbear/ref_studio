import { describe, expect, it } from "vitest";
import {
  AUTHORING_SYSTEM_PROMPT,
  MOTION_PLAN_SYSTEM_PROMPT,
} from "./author-scene.prompt.js";

// The plan call was shipped pointed at AUTHORING_SYSTEM_PROMPT and returned
// a scene-spec-v1 for every job. Keep the two contracts distinct.
describe("motion plan system prompt", () => {
  it("asks for a motion plan, not a SceneSpec", () => {
    expect(MOTION_PLAN_SYSTEM_PROMPT).toContain("motion-plan-v1");
    expect(MOTION_PLAN_SYSTEM_PROMPT).not.toBe(AUTHORING_SYSTEM_PROMPT);
    expect(MOTION_PLAN_SYSTEM_PROMPT).not.toMatch(
      /produce exactly one JSON object: a SceneSpec/u,
    );
  });

  // normalizeMotionPlan validates requiredCapabilities against the backend
  // snapshot, not the knowledge cards -- two unrelated vocabularies.
  it("sources requiredCapabilities from the capability snapshot", () => {
    expect(MOTION_PLAN_SYSTEM_PROMPT).toContain(
      "capabilitySnapshot.capabilities",
    );
  });

  it("names every predicate the plan schema accepts", () => {
    expect(MOTION_PLAN_SYSTEM_PROMPT).toContain("frame-hash-deterministic");
  });
});
