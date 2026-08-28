import { describe, expect, it } from "vitest";
import { fixtureSpec } from "./scene-spec.fixture.js";
import {
  SceneSpecSchema,
  SPEC_ASSET_FORMS,
  SPEC_TEXT_WEIGHTS,
  SPEC_TEXT_WEIGHT_AXIS,
} from "./scene-spec.js";

// Patches the fixture's first element with raw JSON, so a test can hand the
// schema a value the TypeScript type would not allow in the first place --
// which is the whole point of asserting what the schema rejects.
const withFirstElement = (patch: Record<string, unknown>): unknown => {
  const next = JSON.parse(JSON.stringify(fixtureSpec)) as {
    beats: { elements: Record<string, unknown>[] }[];
  };
  Object.assign(next.beats[0]!.elements[0]!, patch);
  return next;
};

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

  it("accepts each named font weight on a text element", () => {
    for (const weight of SPEC_TEXT_WEIGHTS)
      expect(() =>
        SceneSpecSchema.parse(withFirstElement({ weight })),
      ).not.toThrow();
  });

  // The reason weight is a named enum and not a number: this schema is also
  // the model's structured-output schema, and a JSON Schema enum is what
  // stops a model emitting 437 on an axis only three points are chosen on.
  it("rejects a font weight outside the named set", () => {
    for (const weight of ["semibold", "medium", 700, "700", 437])
      expect(() =>
        SceneSpecSchema.parse(withFirstElement({ weight })),
      ).toThrow();
  });

  it("accepts each named asset form", () => {
    for (const form of SPEC_ASSET_FORMS) {
      const next = JSON.parse(JSON.stringify(fixtureSpec)) as {
        assets: Record<string, unknown>[];
      };
      Object.assign(next.assets[0]!, { form });
      expect(() => SceneSpecSchema.parse(next)).not.toThrow();
    }
  });

  it("rejects an asset form outside the named set", () => {
    const next = JSON.parse(JSON.stringify(fixtureSpec)) as {
      assets: Record<string, unknown>[];
    };
    Object.assign(next.assets[0]!, { form: "sculpture" });
    expect(() => SceneSpecSchema.parse(next)).toThrow();
  });

  it("maps every named weight to a real point on the font's 400-1000 axis", () => {
    expect(SPEC_TEXT_WEIGHT_AXIS).toEqual({
      regular: 400,
      bold: 700,
      black: 1000,
    });
  });
});
