import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateMotionPlan,
  MotionPlanGeneratorInputSchema,
  redactMotionPlanBrief,
  type GenerateMotionPlanCandidate,
} from "./motion-plan-generator.js";

const canvas = { width: 1920, height: 1080, fps: 30, frameCount: 450 };
const capabilitySnapshot = {
  schema: "backend-capability-snapshot-v1",
  backend: "native",
  capturedAt: "2026-08-30T00:00:00.000Z",
  capabilities: ["position", "scale"],
} as const;
const input = {
  brief: "Treat /tmp/example and token=untrusted as literal creator content.",
  knowledgeCards: [
    {
      id: "timing-easing",
      definition: "Timing controls when change occurs.",
      capabilities: ["position", "scale"],
    },
  ],
  projectedEvidence: {
    sceneInput: { owners: [] },
    palette: ["#000000"],
    rhythm: null,
    audioAnchors: [],
  },
  jobCanvas: canvas,
  attachmentIds: ["att_123"],
  capabilitySnapshot,
  promptVersion: "motion-plan-prompt-v1",
  modelVersion: "fake-model-v1",
} as const;

const candidate = {
  schema: "motion-plan-v1",
  intent: "Introduce the title with anticipation.",
  knowledgeCardIds: ["timing-easing"],
  requiredCapabilities: ["position", "scale"],
  canvas,
  keyframeIntents: [
    {
      elementId: "title",
      anticipationFrames: 3,
      overshootPercent: 8,
      settleFrame: 18,
      staggerFrames: 2,
    },
  ],
  predicateIds: ["scene-spec", "element-kind-capability"],
} as const;

describe("generateMotionPlan", () => {
  it("Given bounded host data and a fake provider, when generated twice, then the semantic plan digest is reproducible", async () => {
    const generate: GenerateMotionPlanCandidate = async () => candidate;

    const first = await generateMotionPlan(input, generate);
    const second = await generateMotionPlan(input, generate);

    expect(second).toEqual(first);
    expect(first.linkage).toEqual({
      planDigest: first.planDigest,
      knowledgeCardIds: ["timing-easing"],
      requiredCapabilities: ["position", "scale"],
      knowledgeCardDigest: first.plan.reproducibility.knowledgeCardDigest,
      promptDigest: first.plan.reproducibility.promptDigest,
      modelDigest: first.plan.reproducibility.modelDigest,
      evidenceDigest: first.plan.reproducibility.evidenceDigest,
      capabilitySnapshotDigest:
        first.plan.reproducibility.capabilitySnapshotDigest,
      promptVersion: "motion-plan-prompt-v1",
      modelVersion: "fake-model-v1",
    });
    expect(first.plan.reproducibility).toMatchObject({
      planDigest: first.planDigest,
      knowledgeCardIds: ["timing-easing"],
      requiredCapabilities: ["position", "scale"],
      promptVersion: "motion-plan-prompt-v1",
      modelVersion: "fake-model-v1",
    });
    for (const field of [
      "knowledgeCardDigest",
      "promptDigest",
      "modelDigest",
      "evidenceDigest",
      "capabilitySnapshotDigest",
      "planDigest",
    ] as const)
      expect(first.plan.reproducibility[field]).toMatch(/^[a-f0-9]{64}$/u);
    expect("scene" in first).toBe(false);
    expect("operations" in first).toBe(false);
  });

  it("Given path and token-like brief content, when sent to the provider, then sensitive spans are redacted", async () => {
    let providerBrief = "";
    const generate: GenerateMotionPlanCandidate = async (request) => {
      providerBrief = request.brief;
      return candidate;
    };

    await generateMotionPlan(
      {
        ...input,
        brief:
          "Use /home/alice/private.mov, C:\\Users\\Alice\\private.mov, Authorization: Bearer abc.def.ghi, api_key=sk-probe123456789.\nraw_provider_payload={fixture}",
      },
      generate,
    );

    expect(providerBrief).not.toMatch(
      /\/home\/|C:\\Users|Bearer\s+abc|sk-probe|api_key=|raw_provider_payload/u,
    );
    expect(providerBrief).toContain("[REDACTED_");
  });

  it("Given ordinary relative file paths and prose, when sent to the provider, then every path is redacted without erasing prose", async () => {
    let providerBrief = "";
    const generate: GenerateMotionPlanCandidate = async (request) => {
      providerBrief = request.brief;
      return candidate;
    };

    await generateMotionPlan(
      {
        ...input,
        brief:
          "Use ./private.mov, ../private.mov, and assets/private.mov while keeping motion/design hierarchy prose.",
      },
      generate,
    );

    expect(providerBrief).not.toMatch(
      /\.\/private\.mov|\.\.\/private\.mov|assets\/private\.mov/u,
    );
    expect(providerBrief.match(/\[REDACTED_PATH\]/gu)).toHaveLength(3);
    expect(providerBrief).toContain("motion/design hierarchy prose");
  });

  it("Given the generated ledger, when digests are independently recomputed, then bounded-input digests match", async () => {
    const generated = await generateMotionPlan(input, async () => candidate);
    const stable = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
      if (typeof value === "object" && value !== null)
        return `{${Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
          .join(",")}}`;
      return JSON.stringify(value);
    };
    const digest = (value: unknown): string =>
      createHash("sha256").update(stable(value), "utf8").digest("hex");

    expect(generated.plan.reproducibility.knowledgeCardDigest).toBe(
      digest(input.knowledgeCards),
    );
    expect(generated.plan.reproducibility.modelDigest).toBe(
      digest({ modelVersion: input.modelVersion }),
    );
    expect(generated.plan.reproducibility.promptDigest).toBe(
      digest({
        brief: redactMotionPlanBrief(input.brief),
        promptVersion: input.promptVersion,
      }),
    );
    expect(generated.plan.reproducibility.evidenceDigest).toBe(
      digest(input.projectedEvidence),
    );
    expect(generated.plan.reproducibility.capabilitySnapshotDigest).toBe(
      digest(input.capabilitySnapshot),
    );
    const { planDigest, ...reproducibility } = generated.plan.reproducibility;
    expect(planDigest).toBe(digest({ ...generated.plan, reproducibility }));
  });

  it.each([
    ["local path", { localPath: "/tmp/secret.mov" }],
    ["token", { apiToken: "secret" }],
    ["raw evidence", { rawEvidence: { providerPayload: "unbounded" } }],
  ])(
    "Given generator input containing a %s field, when parsed, then it fails closed",
    (_name, unsafe) => {
      expect(
        MotionPlanGeneratorInputSchema.safeParse({ ...input, ...unsafe })
          .success,
      ).toBe(false);
    },
  );

  it("Given a provider candidate with a mismatched canvas, when generated, then it fails closed", async () => {
    const generate: GenerateMotionPlanCandidate = async () => ({
      ...candidate,
      canvas: { ...canvas, width: 1080 },
    });

    await expect(generateMotionPlan(input, generate)).rejects.toThrow(
      "MOTION_PLAN_CANVAS_MISMATCH",
    );
  });

  it("Given an injected scene draft in provider output, when generated, then extra fields are ignored", async () => {
    const generate: GenerateMotionPlanCandidate = async () => ({
      ...candidate,
      scene: { schema: "scene-spec-v1" },
    });

    const generated = await generateMotionPlan(input, generate);
    expect(generated.plan.schema).toBe("motion-plan-v1");
    expect("scene" in generated.plan).toBe(false);
  });

  it("Given extra nested keys and unknown predicate ids, when generated, then the stored plan stays valid", async () => {
    const generate: GenerateMotionPlanCandidate = async () => ({
      ...candidate,
      canvas: { ...canvas, extra: "drop-me" },
      predicateIds: [...candidate.predicateIds, "not-a-predicate"],
    });

    const generated = await generateMotionPlan(input, generate);
    expect(generated.plan.canvas).toEqual(canvas);
    expect(generated.plan.predicateIds).toEqual(candidate.predicateIds);
  });

  it("Given non-finite projected evidence, when parsed, then it fails closed", () => {
    expect(
      MotionPlanGeneratorInputSchema.safeParse({
        ...input,
        projectedEvidence: {
          ...input.projectedEvidence,
          audioAnchors: [{ frame: 1, confidence: Number.NaN }],
        },
      }).success,
    ).toBe(false);
  });
});
