import { describe, expect, it } from "vitest";
import { fixtureSpec } from "./scene-spec.fixture.js";
import { SceneSpecSchema } from "./scene-spec.js";

describe("SceneSpecSchema", () => {
  it("accepts the fixture spec", () => {
    expect(() => SceneSpecSchema.parse(fixtureSpec)).not.toThrow();
  });

  it("rejects a hex colour that is not a hex colour", () => {
    const bad = {
      ...fixtureSpec,
      palette: { ...fixtureSpec.palette, hero: "purple" },
    };
    expect(() => SceneSpecSchema.parse(bad)).toThrow();
  });

  it("rejects an unknown key anywhere", () => {
    const bad = { ...fixtureSpec, surprise: true };
    expect(() => SceneSpecSchema.parse(bad)).toThrow();
  });
});
