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

  // compileMotionPlan rejects an empty plan (MOTION_PLAN_EMPTY_OPERATIONS)
  // and duplicate targets (MOTION_PLAN_DUPLICATE_TARGET); neither rule was
  // stated anywhere the model could read.
  it("states the compiler's plan-shape rules", () => {
    expect(MOTION_PLAN_SYSTEM_PROMPT).toMatch(/[Aa]t least one/u);
    expect(MOTION_PLAN_SYSTEM_PROMPT).toMatch(/at most once/u);
  });

  // MOTION_PLAN_UNKNOWN_ELEMENT / _KEYFRAME_OUT_OF_BOUNDS: the scene author
  // is the only one who can satisfy these, so it has to be told.
  it("tells the scene author the plan's ids and beats bind", () => {
    expect(AUTHORING_SYSTEM_PROMPT).toContain("## Motion plan");
    expect(AUTHORING_SYSTEM_PROMPT).toMatch(/elementId/u);
    expect(AUTHORING_SYSTEM_PROMPT).toMatch(/targetBeat/u);
  });

  // frame-hash-deterministic and the three other runtime-evidence
  // predicates are scored against evidence nothing in this pipeline
  // produces, so offering them to the planner is offering a job failure.
  it("offers only predicates decidable from the scene", () => {
    expect(MOTION_PLAN_SYSTEM_PROMPT).toContain("beat-tiling");
    expect(MOTION_PLAN_SYSTEM_PROMPT).not.toContain("frame-hash-deterministic");
    expect(MOTION_PLAN_SYSTEM_PROMPT).not.toContain("audio-duration");
  });
});
