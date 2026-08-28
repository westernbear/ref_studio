import { describe, expect, it } from "vitest";
import { fixtureSpec } from "./scene-spec.fixture.js";
import type { SceneSpec, SpecAsset } from "./scene-spec.js";
import { planSceneAssets, SceneAssetError } from "./scene-assets.js";

const specWith = (
  assets: readonly SpecAsset[],
  assetRefs: readonly string[] = [],
): SceneSpec => ({
  ...fixtureSpec,
  assets,
  beats: [
    {
      beatId: "beat-only",
      startFrame: 0,
      endFrame: fixtureSpec.canvas.frameCount,
      shot: "hard-cut",
      elements: assetRefs.map((assetRef, index) => ({
        elementId: `element-${index}`,
        kind: "image" as const,
        assetRef,
        box: { x: 0, y: 0, width: 100, height: 100 },
        keyframes: [],
        effects: [],
      })),
    },
  ],
});

const attachmentAsset: SpecAsset = {
  assetId: "logo",
  kind: "image",
  origin: "attachment",
  ref: "attachment://att_1",
};

const generatedAsset = (form?: "flat" | "object"): SpecAsset => ({
  assetId: "gen1",
  kind: "image",
  origin: "generated",
  ref: "generated://gen1",
  ...(form ? { form } : {}),
  provenance: {
    tool: "author-declared",
    prompt: "a matte black handset, three-quarter view",
    sha256: "0".repeat(64),
  },
});

describe("planSceneAssets", () => {
  // The plan is what the worker's provider seam reads, so "this asset is a
  // rendered three-dimensional object" has to survive planning to reach a
  // provider at all.
  it("carries a generated asset's form through to its source", () => {
    const plan = planSceneAssets(
      specWith([generatedAsset("object")], ["gen1"]),
      {
        attachmentIds: [],
      },
    );
    expect(plan.required[0]?.source).toEqual({
      origin: "generated",
      prompt: "a matte black handset, three-quarter view",
      seed: null,
      form: "object",
    });
  });

  it("defaults a generated asset with no form to flat", () => {
    const plan = planSceneAssets(specWith([generatedAsset()], ["gen1"]), {
      attachmentIds: [],
    });
    expect(plan.required[0]?.source).toEqual({
      origin: "generated",
      prompt: "a matte black handset, three-quarter view",
      seed: null,
      form: "flat",
    });
  });

  it("resolves an element-referenced attachment asset to its attachment id", () => {
    const plan = planSceneAssets(specWith([attachmentAsset], ["logo"]), {
      attachmentIds: ["att_1"],
    });
    expect(plan.required).toEqual([
      {
        assetId: "logo",
        kind: "image",
        source: { origin: "attachment", attachmentId: "att_1" },
      },
    ]);
    expect(plan.inline).toEqual([]);
  });

  it("treats an asset no element references as needing no bytes", () => {
    const plan = planSceneAssets(specWith([attachmentAsset], []), {
      attachmentIds: ["att_1"],
    });
    expect(plan.required).toEqual([]);
    expect(plan.inline).toEqual(["logo"]);
  });

  it("always requires font assets, which the render app loads globally", () => {
    const font: SpecAsset = {
      assetId: "brand-face",
      kind: "font",
      origin: "attachment",
      ref: "attachment://att_font",
    };
    const plan = planSceneAssets(specWith([font], []), {
      attachmentIds: ["att_font"],
    });
    expect(plan.required).toEqual([
      {
        assetId: "brand-face",
        kind: "font",
        source: { origin: "attachment", attachmentId: "att_font" },
      },
    ]);
  });

  it("treats a colour asset as inline -- its ref is the value, there are no bytes", () => {
    const colour: SpecAsset = {
      assetId: "brand-hero",
      kind: "color",
      origin: "evidence",
      ref: "#ff5500",
    };
    const plan = planSceneAssets(specWith([colour], ["brand-hero"]), {
      attachmentIds: [],
    });
    expect(plan.required).toEqual([]);
    expect(plan.inline).toEqual(["brand-hero"]);
  });

  it("fails closed when an attachment ref does not name an attachment this job carries", () => {
    // fixtureSpec's own refs are "attachment://hero.png" -- a filename, not
    // an attachment id. Guessing which upload that meant is exactly the
    // silent substitution this phase must never do.
    expect(() =>
      planSceneAssets(fixtureSpec, { attachmentIds: ["att_1"] }),
    ).toThrow(SceneAssetError);
    try {
      planSceneAssets(fixtureSpec, { attachmentIds: ["att_1"] });
    } catch (error) {
      expect((error as SceneAssetError).token).toBe(
        "ASSET_ATTACHMENT_UNRESOLVED",
      );
      expect((error as SceneAssetError).assetId).toBe("hero-shot");
    }
  });

  it("fails closed when an attachment ref is not an attachment:// url at all", () => {
    const plan = () =>
      planSceneAssets(
        specWith([{ ...attachmentAsset, ref: "att_1" }], ["logo"]),
        { attachmentIds: ["att_1"] },
      );
    expect(plan).toThrow(/ASSET_ATTACHMENT_UNRESOLVED/u);
  });

  it("fails closed on an evidence-origin asset that would need bytes", () => {
    const plan = () =>
      planSceneAssets(
        specWith(
          [
            {
              assetId: "owner-crop",
              kind: "image",
              origin: "evidence",
              ref: "owner_1",
            },
          ],
          ["owner-crop"],
        ),
        { attachmentIds: [] },
      );
    expect(plan).toThrow(/ASSET_EVIDENCE_NOT_MATERIAL/u);
  });

  it("carries a generated asset's prompt and seed through to the provider request", () => {
    const plan = planSceneAssets(
      specWith(
        [
          {
            assetId: "backdrop",
            kind: "image",
            origin: "generated",
            ref: "generated://backdrop",
            provenance: {
              tool: "author-declared",
              prompt: "a dark studio backdrop",
              seed: 7,
              sha256: "0".repeat(64),
            },
          },
        ],
        ["backdrop"],
      ),
      { attachmentIds: [] },
    );
    expect(plan.required).toEqual([
      {
        assetId: "backdrop",
        kind: "image",
        source: {
          origin: "generated",
          prompt: "a dark studio backdrop",
          seed: 7,
          form: "flat",
        },
      },
    ]);
  });

  it("fails closed on a generated asset with no prompt to generate from", () => {
    const plan = () =>
      planSceneAssets(
        specWith(
          [
            {
              assetId: "backdrop",
              kind: "image",
              origin: "generated",
              ref: "generated://backdrop",
            },
          ],
          ["backdrop"],
        ),
        { attachmentIds: [] },
      );
    expect(plan).toThrow(/ASSET_GENERATED_WITHOUT_PROMPT/u);
  });

  it("fails closed on duplicate asset ids, which no artifact key could tell apart", () => {
    const plan = () =>
      planSceneAssets(specWith([attachmentAsset, attachmentAsset], ["logo"]), {
        attachmentIds: ["att_1"],
      });
    expect(plan).toThrow(/ASSET_ID_DUPLICATE/u);
  });
});
