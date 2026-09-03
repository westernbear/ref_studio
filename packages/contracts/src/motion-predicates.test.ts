import { describe, expect, it } from "vitest";
import {
  MANDATORY_MOTION_PREDICATE_IDS,
  MOTION_PREDICATES,
  MOTION_PREDICATE_IDS,
} from "./motion-predicates.js";
import { MotionPlanV1Schema, VerificationReportV1Schema } from "./motion.js";

describe("motion predicate contracts", () => {
  it("publishes exactly the strict ten-predicate registry", () => {
    expect(MOTION_PREDICATES.map(({ id }) => id)).toEqual(MOTION_PREDICATE_IDS);
    expect(MOTION_PREDICATE_IDS).toHaveLength(10);
    expect(MANDATORY_MOTION_PREDICATE_IDS).toEqual([
      "scene-spec",
      "asset-resolvable",
      "no-external-url",
    ]);
    expect(Object.isFrozen(MOTION_PREDICATES)).toBe(true);
  });

  it("rejects unknown current predicates and finding fields", () => {
    const report = VerificationReportV1Schema.parse({
      schema: "verification-report-v1",
      sceneDigest: "0".repeat(64),
      attempts: 1,
      status: "PASS",
      findings: [
        {
          predicateId: "element-kind-capability",
          pass: true,
          target: "scene",
          observed: "ok",
          expected: "ok",
          remediation: "none",
        },
      ],
    });
    expect(report.findings[0]?.predicateId).toBe("element-kind-capability");
    expect(
      VerificationReportV1Schema.safeParse({ ...report, extra: true }).success,
    ).toBe(false);
    expect(
      MotionPlanV1Schema.safeParse({
        schema: "motion-plan-v1",
        intent: "x",
        knowledgeCardIds: [],
        requiredCapabilities: [],
        canvas: { width: 1920, height: 1080, fps: 30, frameCount: 450 },
        keyframeIntents: [],
        predicateIds: ["shell.exec"],
        reproducibility: {
          knowledgeCardDigest: "0".repeat(64),
          promptDigest: "0".repeat(64),
          modelDigest: "0".repeat(64),
          evidenceDigest: "0".repeat(64),
          capabilitySnapshotDigest: "0".repeat(64),
          planDigest: "0".repeat(64),
          knowledgeCardIds: [],
          requiredCapabilities: [],
          promptVersion: "motion-plan-prompt-v1",
          modelVersion: "fake-model-v1",
        },
      }).success,
    ).toBe(false);
  });
});
