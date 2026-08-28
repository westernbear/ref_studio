import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fixtureSpec,
  type GenerationConfig,
  type SceneSpec,
} from "@rvs/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateAiProviderSettings } from "./ai-provider-settings.js";
import { authorScene, type GenerateScene } from "./author-scene.js";
import { openApiDatabase } from "./durable-state.js";

const AI_SECRET_KEY = "test-secret-key-material";

// A minimal, tiling-correct single-beat spec for an arbitrary frameCount --
// used to prove the canvas override applies cleanly when the model's own
// beats happen to fit it, independent of fixtureSpec's fixed 600-frame
// shape (which is used instead to prove the *rejection* path, C1.4).
const specForFrameCount = (frameCount: number): SceneSpec => ({
  ...fixtureSpec,
  assets: [],
  beats: [
    {
      beatId: "beat-only",
      startFrame: 0,
      endFrame: frameCount,
      shot: "hard-cut",
      elements: [
        {
          elementId: "headline",
          kind: "text",
          content: "TEST",
          box: { x: 0, y: 0, width: 100, height: 100 },
          keyframes: [
            { frame: 0, opacity: 1, ease: "linear" },
            { frame: Math.max(frameCount - 1, 0), opacity: 1, ease: "linear" },
          ],
          effects: [],
        },
      ],
    },
  ],
});

describe("authorScene", () => {
  let directory: string;
  let db: ReturnType<typeof openApiDatabase>;
  let config: GenerationConfig;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "rvs-author-scene-"));
    db = openApiDatabase(join(directory, "app.sqlite"));
    config = {
      brief: "Meridian finds meeting times nobody hates.",
      durationSec: 20,
      aspect: "9:16",
      attachmentIds: ["att_1"],
    };
    updateAiProviderSettings(
      db,
      {
        providerKind: "openai",
        model: "gpt-4o",
        apiKey: "sk-test",
        enabled: true,
      },
      "admin",
      1_000,
      AI_SECRET_KEY,
    );
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const baseParams = () => ({
    evidence: { sceneInput: { owners: [] } },
    config,
    attachments: [{ attachmentId: "att_1", kind: "image" }],
    db,
    aiSecretKey: AI_SECRET_KEY,
  });

  it("returns the authored spec and a beat sheet", async () => {
    const generate: GenerateScene = async () => ({ object: fixtureSpec });
    const out = await authorScene({ ...baseParams(), generate });
    expect(out.spec.schema).toBe("scene-spec-v1");
    expect(out.beatSheet).toHaveLength(fixtureSpec.beats.length);
  });

  it("fails when no provider is configured", async () => {
    const unconfiguredDb = openApiDatabase(
      join(directory, "unconfigured.sqlite"),
    );
    const neverCalled: GenerateScene = async () => {
      throw new Error("must not be called");
    };
    await expect(
      authorScene({
        ...baseParams(),
        db: unconfiguredDb,
        generate: neverCalled,
      }),
    ).rejects.toThrow(/AI_PROVIDER_NOT_CONFIGURED/);
    unconfiguredDb.close();
  });

  it("fails when the model returns an invalid spec", async () => {
    const generate: GenerateScene = async () =>
      ({ object: { junk: true } }) as never;
    await expect(authorScene({ ...baseParams(), generate })).rejects.toThrow(
      /SPEC_SCHEMA_INVALID/,
    );
  });

  it("sets the canvas from the job config, not from the model, when the authored beats already fit it", async () => {
    const generate: GenerateScene = async () => ({
      object: specForFrameCount(450),
    });
    const out = await authorScene({
      ...baseParams(),
      config: { ...config, aspect: "16:9", durationSec: 15 },
      generate,
    });
    expect(out.spec.canvas).toEqual({
      width: 1920,
      height: 1080,
      fps: 30,
      frameCount: 450,
    });
  });

  // C1.4: the canvas override still applies unconditionally, but it is no
  // longer trusted blindly -- a model-authored spec whose beats no longer
  // fit the overridden canvas now fails the job instead of silently
  // shipping beats that run past the end (or leave a gap). This replaces a
  // prior version of this test that fed a 600-frame 9:16 fixture into a
  // 16:9/15s (450-frame) config and asserted only the resulting canvas
  // field, which proved the override ran but not that it was safe to run.
  it("fails when the overridden canvas no longer fits the model's beats (aspect mismatch)", async () => {
    const generate: GenerateScene = async () => ({ object: fixtureSpec }); // 9:16, 600 frames, tiled for 600
    await expect(
      authorScene({
        ...baseParams(),
        config: { ...config, aspect: "16:9", durationSec: 15 }, // -> 450 frames
        generate,
      }),
    ).rejects.toThrow(/BEAT_OUT_OF_RANGE/);
  });

  it("fails when the overridden canvas no longer fits the model's beats (frame count mismatch within the same aspect)", async () => {
    const generate: GenerateScene = async () => ({ object: fixtureSpec }); // 9:16, 600 frames, tiled for 600
    await expect(
      authorScene({
        ...baseParams(),
        config: { ...config, aspect: "9:16", durationSec: 15 }, // -> 450 frames, same aspect
        generate,
      }),
    ).rejects.toThrow(/BEAT_OUT_OF_RANGE/);
  });

  it("lets the model choose SWAP for a brief that plainly asks for substitution, without pinning the mode in the prompt", async () => {
    let capturedPrompt = "";
    const generate: GenerateScene = async (options) => {
      capturedPrompt = options.prompt;
      return { object: fixtureSpec }; // fixtureSpec.mode is "SWAP"
    };
    const out = await authorScene({
      ...baseParams(),
      config: {
        ...config,
        brief:
          "Keep this reference video's exact shots and pacing, but swap in our new product screenshots and logo in place of the original content.",
      },
      generate,
    });
    expect(out.spec.mode).toBe("SWAP");
    // The prompt must ask the model to decide, not tell it the answer -- the
    // old hardcoded instruction pinned every call to SWAP regardless of the
    // brief, making REINTERPRET unreachable.
    expect(capturedPrompt).not.toMatch(/Author for the "SWAP" mode/u);
    expect(capturedPrompt).toMatch(/you decide the mode/iu);
  });

  it("lets the model choose REINTERPRET for a brief that plainly asks for a fresh take, without pinning the mode in the prompt", async () => {
    let capturedPrompt = "";
    const reinterpretSpec = { ...fixtureSpec, mode: "REINTERPRET" as const };
    const generate: GenerateScene = async (options) => {
      capturedPrompt = options.prompt;
      return { object: reinterpretSpec };
    };
    const out = await authorScene({
      ...baseParams(),
      config: {
        ...config,
        brief:
          "Ignore what happens in the reference video -- just borrow its dark neon look and mood to build a brand-new scene announcing our conference.",
      },
      generate,
    });
    expect(out.spec.mode).toBe("REINTERPRET");
    expect(capturedPrompt).not.toMatch(/Author for the "SWAP" mode/u);
    expect(capturedPrompt).toMatch(/you decide the mode/iu);
  });

  // C1.1: the prompt states the exact canvas as a hard requirement instead
  // of telling the model it is a placeholder.
  it("states the exact canvas in the prompt, not a placeholder", async () => {
    let capturedPrompt = "";
    const generate: GenerateScene = async (options) => {
      capturedPrompt = options.prompt;
      return { object: specForFrameCount(450) };
    };
    await authorScene({
      ...baseParams(),
      config: { ...config, aspect: "16:9", durationSec: 15 },
      generate,
    });
    expect(capturedPrompt).toMatch(/width: 1920/u);
    expect(capturedPrompt).toMatch(/height: 1080/u);
    expect(capturedPrompt).toMatch(/frameCount: 450/u);
    expect(capturedPrompt).not.toMatch(/is a placeholder/iu);
  });

  // A brief routinely names its files ("use 05_ranking.jpg for the ranking
  // beat"). Without the names, the model saw a list of interchangeable ids
  // and could not honour that -- observed in production, where it invented
  // five attachment refs named after files that were never uploaded.
  it("gives the model each attachment's filename alongside its id", async () => {
    let capturedPrompt = "";
    const generate: GenerateScene = async (options) => {
      capturedPrompt = options.prompt;
      return { object: fixtureSpec };
    };
    await authorScene({
      ...baseParams(),
      attachments: [
        { attachmentId: "att_1", kind: "image/png", fileName: "logo.png" },
        {
          attachmentId: "att_2",
          kind: "image/jpeg",
          fileName: "05_ranking.jpg",
        },
      ],
      generate,
    });
    expect(capturedPrompt).toContain('att_1 (image/png) named "logo.png"');
    expect(capturedPrompt).toContain(
      'att_2 (image/jpeg) named "05_ranking.jpg"',
    );
  });

  // C3: the evidence bundle reaches the prompt as a projection, not raw --
  // projectEvidenceForAuthoring's own tests cover the projection's shape and
  // its byte cap directly; this proves authorScene actually calls it and
  // fails the job (rather than the model call) when the cap is exceeded.
  it("fails closed when the evidence projects to more than the byte budget", async () => {
    const hugeOwners = Array.from({ length: 5_000 }, (_, index) => ({
      ownerId: `owner-${index}-${"x".repeat(64)}`,
      kind: "text",
      editable: true,
      confidence: 1,
    }));
    const neverCalled: GenerateScene = async () => {
      throw new Error("must not be called");
    };
    await expect(
      authorScene({
        ...baseParams(),
        evidence: { sceneInput: { owners: hugeOwners } },
        generate: neverCalled,
      }),
    ).rejects.toThrow(/EVIDENCE_PROJECTION_TOO_LARGE/);
  });

  // C2.2: an asset the model claims comes from an attachment must actually
  // be backed by one -- a job with zero attachments referencing an
  // "attachment"-origin asset is a hallucinated resource, not a valid spec.
  it("fails closed when an attachment-origin asset is used but no attachment was given", async () => {
    const generate: GenerateScene = async () => ({ object: fixtureSpec });
    await expect(
      authorScene({
        ...baseParams(),
        attachments: [],
        generate,
      }),
    ).rejects.toThrow(/ASSET_REF_UNRESOLVED/);
  });
});
