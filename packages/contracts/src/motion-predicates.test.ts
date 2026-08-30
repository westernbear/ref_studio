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

  it("rejects unknown current predicates and finding fields while reading legacy reports", () => {
    const legacy = VerificationReportV1Schema.parse({
      schema: "verification-report-v1",
      sceneDigest: "0".repeat(64),
      attempts: 1,
      status: "PASS",
      findings: [
        {
          predicate: "native-element-kinds",
          passed: true,
          detail: "legacy pass",
        },
      ],
    });
    expect(legacy.findings[0]?.predicateId).toBe("element-kind-capability");
    expect(
      VerificationReportV1Schema.safeParse({ ...legacy, extra: true }).success,
    ).toBe(false);
    expect(
      MotionPlanV1Schema.safeParse({
        schema: "motion-plan-v1",
        intent: "x",
        keyframeIntents: [],
        predicates: ["shell.exec"],
      }).success,
    ).toBe(false);
  });
});
