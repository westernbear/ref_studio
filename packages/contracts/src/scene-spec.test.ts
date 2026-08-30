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

  it("accepts bounded local audio policy and rejects unsafe variants", () => {
    const withAudio = (patch: Record<string, unknown>) => ({
      ...fixtureSpec,
      assets: [
        ...fixtureSpec.assets,
        {
          assetId: "soundtrack",
          kind: "audio",
          origin: "attachment",
          ref: "attachment://soundtrack",
          audio: { gainDb: 0, durationPolicy: "reject" },
          ...patch,
        },
      ],
    });
    expect(() => SceneSpecSchema.parse(withAudio({}))).not.toThrow();
    for (const patch of [
      { origin: "generated" },
      { audio: undefined },
      { audio: { gainDb: 13, durationPolicy: "reject" } },
      { audio: { gainDb: 0, durationPolicy: "stretch" } },
    ])
      expect(() => SceneSpecSchema.parse(withAudio(patch))).toThrow();
  });

  it("maps every named weight to a real point on the font's 400-1000 axis", () => {
    expect(SPEC_TEXT_WEIGHT_AXIS).toEqual({
      regular: 400,
      bold: 700,
      black: 1000,
    });
  });

  it("accepts v2 transform fields and rejects them on v1", () => {
    const v2 = JSON.parse(JSON.stringify(fixtureSpec)) as Record<
      string,
      unknown
    > & {
      beats: { elements: Record<string, unknown>[] }[];
    };
    v2["schema"] = "scene-spec-v2";
    for (const beat of v2.beats)
      for (const element of beat.elements) {
        element["anchor"] = { x: 0, y: 0 };
        element["keyframes"] = (
          element["keyframes"] as Record<string, unknown>[]
        ).map(({ scale, ...keyframe }) => ({
          ...keyframe,
          ...(typeof scale === "number"
            ? { scaleX: scale, scaleY: scale }
            : {}),
        }));
      }
    Object.assign(v2.beats[0]!.elements[0]!, {
      anchor: { x: 420, y: 80 },
      parentElementId: undefined,
      keyframes: [
        {
          frame: 0,
          opacity: 1,
          x: 0,
          y: 0,
          rotation: -15,
          scaleX: 1.25,
          scaleY: 0.8,
          ease: "easeInOut",
        },
      ],
    });
    expect(() => SceneSpecSchema.parse(v2)).not.toThrow();

    const v1 = JSON.parse(JSON.stringify(v2)) as Record<string, unknown>;
    v1["schema"] = "scene-spec-v1";
    expect(() => SceneSpecSchema.parse(v1)).toThrow();
  });

  it("rejects non-finite v2 transform values and unknown fields", () => {
    for (const patch of [
      { rotation: Number.POSITIVE_INFINITY },
      { scaleX: Number.NaN },
      { scaleY: Number.NEGATIVE_INFINITY },
      { surprise: 1 },
    ]) {
      const v2 = JSON.parse(JSON.stringify(fixtureSpec)) as Record<
        string,
        unknown
      > & {
        beats: { elements: Record<string, unknown>[] }[];
      };
      v2["schema"] = "scene-spec-v2";
      v2.beats[0]!.elements[0]!["anchor"] = { x: 0, y: 0 };
      v2.beats[0]!.elements[0]!["keyframes"] = [
        { frame: 0, ease: "linear", ...patch },
      ];
      expect(() => SceneSpecSchema.parse(v2)).toThrow();
    }
  });

  it("accepts finite negative and large v2 transforms", () => {
    const v2 = JSON.parse(JSON.stringify(fixtureSpec)) as Record<
      string,
      unknown
    > & {
      beats: { elements: Record<string, unknown>[] }[];
    };
    v2["schema"] = "scene-spec-v2";
    for (const [beatIndex, beat] of v2.beats.entries())
      for (const element of beat.elements) {
        element["anchor"] = { x: -1_000_000, y: 1_000_000 };
        element["keyframes"] = [
          {
            frame: beatIndex * 200,
            rotation: -360_000,
            scaleX: -10_000,
            scaleY: 10_000,
            ease: "linear",
          },
        ];
      }
    expect(() => SceneSpecSchema.parse(v2)).not.toThrow();
  });
});
