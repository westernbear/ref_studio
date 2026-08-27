import { describe, expect, it } from "vitest";
import { fixtureSpec } from "./scene-spec.fixture.js";
import type { SceneSpec } from "./scene-spec.js";
import { validateSceneSpec } from "./spec-validate.js";

const clone = (spec: SceneSpec): SceneSpec =>
  structuredClone(spec) as SceneSpec;

const withElement = (
  spec: SceneSpec,
  patch: Partial<SceneSpec["beats"][number]["elements"][number]>,
): SceneSpec => {
  const next = clone(spec);
  const beat = next.beats[0]!;
  const element = beat.elements[0]!;
  Object.assign(element, patch);
  return next;
};

const withBeat = (
  spec: SceneSpec,
  patch: Partial<SceneSpec["beats"][number]>,
): SceneSpec => {
  const next = clone(spec);
  Object.assign(next.beats[0]!, patch);
  return next;
};

const withBeats = (
  spec: SceneSpec,
  patches: readonly Partial<SceneSpec["beats"][number]>[],
): SceneSpec => {
  const next = clone(spec);
  patches.forEach((patch, index) => {
    const beat = next.beats[index];
    if (beat) Object.assign(beat, patch);
  });
  return next;
};

const withKeyframe = (
  spec: SceneSpec,
  patch: Partial<SceneSpec["beats"][number]["elements"][number]["keyframes"][number]>,
): SceneSpec => {
  const next = clone(spec);
  const keyframe = next.beats[0]!.elements[0]!.keyframes[1]!;
  Object.assign(keyframe, patch);
  return next;
};

const withAsset = (
  spec: SceneSpec,
  asset: SceneSpec["assets"][number],
): SceneSpec => {
  const next = clone(spec);
  (next.assets as SceneSpec["assets"][number][]).push(asset);
  return next;
};

const withAssetRef = (spec: SceneSpec, ref: string): SceneSpec => {
  const next = clone(spec);
  (next.assets[0] as { ref: string }).ref = ref;
  return next;
};

describe("validateSceneSpec", () => {
  const ok = new Set(["logo", "hero-shot"]);

  it("passes the fixture", () => {
    expect(validateSceneSpec(fixtureSpec, ok).schema).toBe("scene-spec-v1");
  });

  it("rejects an unresolved asset", () => {
    const bad = withElement(fixtureSpec, { assetRef: "nope" });
    expect(() => validateSceneSpec(bad, ok)).toThrow(/ASSET_REF_UNRESOLVED/);
  });

  it("rejects a beat past the end", () => {
    const bad = withBeat(fixtureSpec, { startFrame: 590, endFrame: 900 });
    expect(() => validateSceneSpec(bad, ok)).toThrow(/BEAT_OUT_OF_RANGE/);
  });

  it("rejects overlapping beats", () => {
    const bad = withBeats(fixtureSpec, [
      { startFrame: 0, endFrame: 300 },
      { startFrame: 200, endFrame: 400 },
    ]);
    expect(() => validateSceneSpec(bad, ok)).toThrow(/BEAT_OVERLAP/);
  });

  // C1: beats must tile [0, frameCount) with no gap, so that the canvas
  // override (authorScene overwriting a model-authored canvas with the
  // job's own config) can never leave dead time the compiler silently
  // skips over. The fixture itself tiles perfectly (0-200-400-600); this
  // carves a gap between beat 0 and beat 1 without overlapping or running
  // past the canvas, which only the tiling check (not BEAT_OUT_OF_RANGE or
  // BEAT_OVERLAP) can catch.
  it("rejects beats that leave a gap instead of tiling the canvas", () => {
    const bad = withBeats(fixtureSpec, [
      { startFrame: 0, endFrame: 150 },
      { startFrame: 200, endFrame: 400 },
    ]);
    expect(() => validateSceneSpec(bad, ok)).toThrow(/BEAT_TILING_INVALID/);
  });

  it("rejects beats that don't start at frame 0", () => {
    const bad = withBeats(fixtureSpec, [{ startFrame: 10, endFrame: 200 }]);
    expect(() => validateSceneSpec(bad, ok)).toThrow(/BEAT_TILING_INVALID/);
  });

  it("rejects a keyframe outside its beat", () => {
    const bad = withKeyframe(fixtureSpec, { frame: 999 });
    expect(() => validateSceneSpec(bad, ok)).toThrow(/KEYFRAME_OUT_OF_BEAT/);
  });

  it("rejects an external url in content", () => {
    const bad = withElement(fixtureSpec, {
      content: "https://cdn.example.com/a.png",
    });
    expect(() => validateSceneSpec(bad, ok)).toThrow(/EXTERNAL_URL/);
  });

  // C2.4: EXTERNAL_URL now also covers SpecAsset.ref, not just
  // element.content -- previously dead because nothing consumed asset.ref
  // through this gate at all.
  it("rejects an external url in an asset ref", () => {
    const bad = withAssetRef(fixtureSpec, "https://cdn.example.com/hero.png");
    expect(() => validateSceneSpec(bad, ok)).toThrow(/EXTERNAL_URL/);
  });

  it("rejects a generated asset with no provenance", () => {
    const bad = withAsset(fixtureSpec, {
      assetId: "gen1",
      kind: "image",
      origin: "generated",
      ref: "art_1",
    });
    expect(() =>
      validateSceneSpec(bad, new Set([...ok, "gen1"])),
    ).toThrow(/GENERATED_ASSET_WITHOUT_PROVENANCE/);
  });

  // blur/glow were removed from SPEC_EFFECTS (both compile to
  // feGaussianBlur, which is not bit-reproducible across independent
  // Chromium launches -- see gen-render-delivery.determinism.test.ts).
  // drop-shadow later joined them: it was clean in isolation, but once
  // generated.ts started painting a real background and a palette-aware
  // fill under it (I5 batch), feDropShadow stopped being bit-reproducible
  // over that opaque backdrop (see the matching comment on SPEC_EFFECTS's
  // definition). SPEC_EFFECTS is empty for now. SceneSpecSchema enforces
  // the allowlist directly (z.enum(SPEC_EFFECTS)) so an unknown effect
  // never reaches validateSceneSpec's own checks -- it fails schema
  // parsing, same as any other malformed spec. An empty effects array must
  // still pass.
  it("rejects any effect as a schema violation -- the allowlist is currently empty", () => {
    const blurred = withElement(fixtureSpec, { effects: ["blur"] });
    expect(() => validateSceneSpec(blurred, ok)).toThrow(
      /SPEC_SCHEMA_INVALID/,
    );
    const dropShadow = withElement(fixtureSpec, { effects: ["drop-shadow"] });
    expect(() => validateSceneSpec(dropShadow, ok)).toThrow(
      /SPEC_SCHEMA_INVALID/,
    );
    const none = withElement(fixtureSpec, { effects: [] });
    expect(validateSceneSpec(none, ok).schema).toBe("scene-spec-v1");
  });
});
