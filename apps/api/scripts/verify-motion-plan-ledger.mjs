import { createHash } from "node:crypto";
import {
  generateMotionPlan,
  redactMotionPlanBrief,
} from "../dist/apps/api/src/motion-plan-generator.js";
import {
  MotionPlanSemanticV1Schema,
  MotionPlanV1Schema,
} from "../dist/packages/contracts/src/motion.js";

const stable = (value) =>
  Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
const digest = (value) =>
  createHash("sha256")
    .update(Buffer.from(stable(value), "utf8"))
    .digest("hex");

const canvas = { width: 1920, height: 1080, fps: 30, frameCount: 450 };
const capabilitySnapshot = {
  schema: "backend-capability-snapshot-v1",
  backend: "native",
  capturedAt: "2026-08-30T00:00:00.000Z",
  capabilities: ["position", "scale"],
};
const knowledgeCards = [
  {
    id: "timing-easing",
    definition: "Timing.",
    capabilities: ["position", "scale"],
  },
];
const projectedEvidence = {
  sceneInput: { owners: [] },
  palette: [],
  rhythm: null,
  audioAnchors: [],
};
const brief =
  "Use /home/fixture/private.mov Authorization: Bearer fixture.value api_key=sk-fixture123456";
const input = {
  brief,
  knowledgeCards,
  projectedEvidence,
  jobCanvas: canvas,
  attachmentIds: [],
  capabilitySnapshot,
  promptVersion: "motion-plan-prompt-v1",
  modelVersion: "fake-model-v1",
};
const candidate = {
  schema: "motion-plan-v1",
  intent: "title",
  knowledgeCardIds: ["timing-easing"],
  requiredCapabilities: ["position", "scale"],
  canvas,
  keyframeIntents: [],
  predicateIds: ["scene-spec"],
};

let providerBrief = "";
const fake = async (request) => {
  providerBrief = request.brief;
  return candidate;
};
const first = await generateMotionPlan(input, fake);
const second = await generateMotionPlan(input, fake);
const { planDigest, ...reproducibility } = first.plan.reproducibility;
const expected = {
  knowledgeCardDigest: digest(knowledgeCards),
  promptDigest: digest({
    brief: redactMotionPlanBrief(brief),
    promptVersion: input.promptVersion,
  }),
  modelDigest: digest({ modelVersion: input.modelVersion }),
  evidenceDigest: digest(projectedEvidence),
  capabilitySnapshotDigest: digest(capabilitySnapshot),
  planDigest: digest({ ...first.plan, reproducibility }),
};
const legacy = {
  schema: "motion-plan-v1",
  intent: "legacy",
  keyframeIntents: [],
  predicates: ["scene-spec"],
};
const overflow = {
  ...candidate,
  keyframeIntents: [
    {
      elementId: "x",
      anticipationFrames: 10_000,
      overshootPercent: 1,
      settleFrame: 449,
      staggerFrames: 10_000,
    },
  ],
};
const checks = {
  legacyAccepted: MotionPlanV1Schema.safeParse(legacy).success,
  legacyExtraRejected: !MotionPlanV1Schema.safeParse({ ...legacy, extra: true })
    .success,
  overflowRejected: !MotionPlanSemanticV1Schema.safeParse(overflow).success,
  briefRedacted: !/\/home\/|Bearer|sk-fixture|api_key=/u.test(providerBrief),
  repeated: first.planDigest === second.planDigest,
  semanticOnly: !("scene" in first) && !("operations" in first),
  digests: Object.fromEntries(
    Object.entries(expected).map(([key, value]) => [
      key,
      first.plan.reproducibility[key] === value,
    ]),
  ),
};
const ok = Object.entries(checks).every(([key, value]) =>
  key === "digests" ? Object.values(value).every(Boolean) : value === true,
);
console.log(
  JSON.stringify({
    ok,
    planDigest: first.planDigest,
    metadata: first.plan.reproducibility,
    checks,
  }),
);
process.exit(ok ? 0 : 1);
