import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureSpec, type GenerationConfig } from "@rvs/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateAiProviderSettings } from "./ai-provider-settings.js";
import { authorScene, type GenerateScene } from "./author-scene.js";
import { openApiDatabase } from "./durable-state.js";

const AI_SECRET_KEY = "test-secret-key-material";

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
      { providerKind: "openai", model: "gpt-4o", apiKey: "sk-test", enabled: true },
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
    const unconfiguredDb = openApiDatabase(join(directory, "unconfigured.sqlite"));
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
    await expect(
      authorScene({ ...baseParams(), generate }),
    ).rejects.toThrow(/SPEC_SCHEMA_INVALID/);
  });

  it("sets the canvas from the job config, not from the model", async () => {
    const generate: GenerateScene = async () => ({ object: fixtureSpec }); // 9:16, 600 frames
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

  it("discards a model-supplied frameCount even within the same aspect", async () => {
    const generate: GenerateScene = async () => ({ object: fixtureSpec }); // 600 frames
    const out = await authorScene({
      ...baseParams(),
      config: { ...config, aspect: "9:16", durationSec: 15 },
      generate,
    });
    expect(out.spec.canvas.frameCount).toBe(450);
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
});
