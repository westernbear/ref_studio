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
import { MOTION_LOOKUP_TOOL_SCHEMA_DIGEST } from "./motion-knowledge.js";
import type { GenerateMotionPlanCandidate } from "./motion-plan-generator.js";

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
      brief: "Use timing and easing for Meridian's meeting-time explainer.",
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
    tenantId: "tenant-a",
    db,
    aiSecretKey: AI_SECRET_KEY,
    generateCanary: async () => ({
      id: "opacity",
      domain: "opacity",
      title_en: "Opacity",
      title_ko: "불투명도",
      definition_en: "Controls visibility.",
      definition_ko: "가시성을 제어한다.",
      distinctions_json: '["opacity is not brightness"]',
      parameters_json: '[{"name":"opacity","unit":"ratio","range":[0,1]}]',
      capabilities_json: '["motion_lookup"]',
      operation_refs_json: '["set_opacity"]',
      verifier_refs_json: '["opacity_range"]',
      sources_json: '["https://example.com/opacity"]',
    }),
    generatePlan: (async (request) => ({
      schema: "motion-plan-v1",
      intent: "Apply bounded timing to the headline.",
      knowledgeCardIds: [request.knowledgeCards[0]?.id ?? "timing-easing"],
      requiredCapabilities: ["keyframes", "easing"],
      canvas: request.jobCanvas,
      keyframeIntents: [
        {
          elementId: "headline",
          anticipationFrames: 12,
          overshootPercent: 8,
          settleFrame: 36,
          staggerFrames: 6,
        },
      ],
      predicateIds: ["scene-spec", "element-kind-capability"],
    })) satisfies GenerateMotionPlanCandidate,
  });

  it("returns the authored spec and a beat sheet", async () => {
    const generate: GenerateScene = async () => ({ object: fixtureSpec });
    const out = await authorScene({ ...baseParams(), now: 1_000, generate });
    const replay = await authorScene({
      ...baseParams(),
      now: 1_000,
      generate,
    });
    expect(out.spec.schema).toBe("scene-spec-v1");
    expect(out.beatSheet).toHaveLength(fixtureSpec.beats.length);
    expect(replay.planDigest).toBe(out.planDigest);
    expect(replay.spec).toEqual(out.spec);
  });

  it("runs a cold-start provider canary before exposing motion.lookup", async () => {
    let exposed: readonly string[] = [];
    const generate: GenerateScene = async (options) => {
      exposed = Object.keys(options.tools);
      return { object: fixtureSpec };
    };
    await authorScene({
      ...baseParams(),
      now: Date.parse("2026-08-30T00:00:00.000Z"),
      motionCanaryTtlMs: 600_000,
      generate,
      generateCanary: async () => ({
        id: "opacity",
        domain: "opacity",
        title_en: "Opacity",
        title_ko: "불투명도",
        definition_en: "Controls visibility.",
        definition_ko: "가시성을 제어한다.",
        distinctions_json: '["opacity is not brightness"]',
        parameters_json: '[{"name":"opacity","unit":"ratio","range":[0,1]}]',
        capabilities_json: '["motion_lookup"]',
        operation_refs_json: '["set_opacity"]',
        verifier_refs_json: '["opacity_range"]',
        sources_json: '["https://example.com/opacity"]',
      }),
    });
    expect(exposed).toEqual(["motion.lookup"]);
  });

  it("hides motion.lookup when the provider canary fails", async () => {
    let exposed: readonly string[] = [];
    const generate: GenerateScene = async (options) => {
      exposed = Object.keys(options.tools);
      return { object: fixtureSpec };
    };
    await authorScene({
      ...baseParams(),
      now: Date.parse("2026-08-30T00:00:00.000Z"),
      motionCanaryTtlMs: 600_000,
      generate,
      generateCanary: async () => {
        throw new Error("provider refused tool");
      },
    });
    expect(exposed).toEqual([]);
  });

  it("invokes the live provider tool channel when no generateCanary stub is injected", async () => {
    let toolChoice: unknown;
    let calledTool = false;
    const generate: GenerateScene = async () => ({ object: fixtureSpec });
    await authorScene({
      ...baseParams(),
      generateCanary: undefined,
      now: Date.parse("2026-08-30T00:00:00.000Z"),
      motionCanaryTtlMs: 600_000,
      generate,
      generateLiveCanary: async (options) => {
        toolChoice = options.toolChoice;
        const lookup = options.tools["motion.lookup"];
        if (
          lookup &&
          "execute" in lookup &&
          typeof lookup.execute === "function"
        ) {
          calledTool = true;
          await lookup.execute(
            { query: "opacity" },
            {
              toolCallId: "canary",
              messages: [],
              abortSignal: options.abortSignal,
            },
          );
        }
        return {
          object: {
            id: "opacity",
            domain: "opacity",
            title_en: "Opacity",
            title_ko: "불투명도",
            definition_en: "Controls visibility.",
            definition_ko: "가시성을 제어한다.",
            distinctions_json: '["opacity is not brightness"]',
            parameters_json:
              '[{"name":"opacity","unit":"ratio","range":[0,1]}]',
            capabilities_json: '["motion_lookup"]',
            operation_refs_json: '["set_opacity"]',
            verifier_refs_json: '["opacity_range"]',
            sources_json: '["https://example.com/opacity"]',
          },
        };
      },
    });
    expect(toolChoice).toEqual({ type: "tool", toolName: "motion.lookup" });
    expect(calledTool).toBe(true);
  });

  it("exposes motion.lookup to the production model call only for the selected identity's fresh PASS", async () => {
    // Given
    const checkedAt = "2026-08-30T00:00:00.000Z";
    db.prepare(
      `INSERT INTO motion_provider_canaries
       (tenant_id, provider_kind, model, status, checked_at, tool_schema_digest, failure_reason)
       VALUES (?, ?, ?, 'PASS', ?, ?, NULL)`,
    ).run(
      "tenant-a",
      "openai",
      "gpt-4o",
      checkedAt,
      MOTION_LOOKUP_TOOL_SCHEMA_DIGEST,
    );
    let exposed: readonly string[] = [];
    const generate: GenerateScene = async (options) => {
      exposed = Object.keys(options.tools);
      return { object: fixtureSpec };
    };

    // When
    await authorScene({
      ...baseParams(),
      now: Date.parse(checkedAt) + 1,
      motionCanaryTtlMs: 600_000,
      generate,
    });

    // Then
    expect(exposed).toEqual(["motion.lookup"]);
  });

  it("injects canonical structured motion knowledge for an exact alias in a longer brief", async () => {
    let capturedPrompt = "";
    const generate: GenerateScene = async (options) => {
      capturedPrompt = options.prompt;
      return { object: fixtureSpec };
    };
    await authorScene({
      ...baseParams(),
      config: {
        ...config,
        brief:
          "Open with a calm explainer, use timing and easing, then end on the logo.",
      },
      generate,
    });
    expect(capturedPrompt).toContain('"id":"timing-easing"');
    expect(capturedPrompt).toContain('"distinctions"');
    expect(capturedPrompt).toContain('"operationRefs"');
    expect(capturedPrompt).toContain('"sources"');
  });

  it("fails closed when the creator brief has no motion knowledge match", async () => {
    // Given
    const neverCalled: GenerateScene = async () => {
      throw new Error("must not be called");
    };

    // When / Then
    await expect(
      authorScene({
        ...baseParams(),
        config: { ...config, brief: "legal compliance certification" },
        generate: neverCalled,
      }),
    ).rejects.toThrow(/MOTION_KNOWLEDGE_NOT_FOUND/);
  });

  it("repairs semantic predicate failures no more than four times", async () => {
    let calls = 0;
    const broken = { ...fixtureSpec, beats: fixtureSpec.beats.slice(0, 1) };
    const generate: GenerateScene = async () => {
      calls += 1;
      return { object: calls === 4 ? fixtureSpec : broken };
    };
    const authored = await authorScene({ ...baseParams(), generate });
    expect(calls).toBe(4);
    expect(authored.spec.beats[0]?.elements[0]?.keyframes).toEqual([
      { frame: 0, scale: 1, ease: "easeIn" },
      { frame: 12, scale: 1.08, ease: "easeOut" },
      { frame: 36, scale: 1, ease: "easeInOut" },
    ]);
    expect(authored.verification?.attempts).toBe(4);
    expect(
      authored.verification?.findings.map((finding) => finding.predicateId),
    ).toEqual([
      "scene-spec",
      "asset-resolvable",
      "no-external-url",
      "element-kind-capability",
    ]);
  });

  it("plans before drafting and repairs a concrete compiler failure", async () => {
    const order: string[] = [];
    const prompts: string[] = [];
    const generatePlan: GenerateMotionPlanCandidate = async (request) => {
      order.push("plan");
      return {
        schema: "motion-plan-v1",
        intent: "Animate the headline.",
        knowledgeCardIds: [request.knowledgeCards[0]?.id ?? "timing-easing"],
        requiredCapabilities: ["keyframes"],
        canvas: request.jobCanvas,
        keyframeIntents: [
          {
            elementId: "headline",
            anticipationFrames: 12,
            overshootPercent: 8,
            settleFrame: 36,
            staggerFrames: 6,
          },
        ],
        predicateIds: ["scene-spec"],
      };
    };
    let drafts = 0;
    const generate: GenerateScene = async (options) => {
      order.push("draft");
      prompts.push(options.prompt);
      drafts += 1;
      if (drafts === 1)
        return {
          object: {
            ...fixtureSpec,
            beats: fixtureSpec.beats.map((beat, beatIndex) =>
              beatIndex === 0
                ? {
                    ...beat,
                    elements: beat.elements.map((element) => ({
                      ...element,
                      elementId: "wrong-headline",
                    })),
                  }
                : beat,
            ),
          },
        };
      return { object: fixtureSpec };
    };

    const authored = await authorScene({
      ...baseParams(),
      generatePlan,
      generate,
    });

    expect(order).toEqual(["plan", "draft", "draft"]);
    expect(prompts[1]).toContain("MOTION_PLAN_UNKNOWN_ELEMENT");
    expect(authored.verification?.attempts).toBe(2);
    expect(authored.planDigest).toBe(
      authored.motionPlan?.reproducibility.planDigest,
    );
    expect(authored.spec.beats[0]?.elements[0]?.keyframes[1]).toEqual({
      frame: 12,
      scale: 1.08,
      ease: "easeOut",
    });
  });

  it("fails before drafting when the semantic plan requires an unavailable capability", async () => {
    let sceneCalls = 0;
    const generate: GenerateScene = async () => {
      sceneCalls += 1;
      return { object: fixtureSpec };
    };
    const generatePlan: GenerateMotionPlanCandidate = async (request) => ({
      schema: "motion-plan-v1",
      intent: "Use an unsupported camera.",
      knowledgeCardIds: [request.knowledgeCards[0]?.id ?? "timing-easing"],
      requiredCapabilities: ["camera"],
      canvas: request.jobCanvas,
      keyframeIntents: [],
      predicateIds: ["scene-spec"],
    });

    await expect(
      authorScene({ ...baseParams(), generatePlan, generate }),
    ).rejects.toThrow(/MOTION_PLAN_UNAVAILABLE_CAPABILITY/u);
    expect(sceneCalls).toBe(0);
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
          "Keep this reference video's exact shots and pacing, use timing and easing, but swap in our new product screenshots and logo in place of the original content.",
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
          "Ignore what happens in the reference video -- use timing and easing, just borrow its dark neon look and mood to build a brand-new scene announcing our conference.",
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
