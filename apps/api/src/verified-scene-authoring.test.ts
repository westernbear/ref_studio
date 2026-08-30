import { describe, expect, it } from "vitest";
import { generateVerifiedScene } from "./verified-scene-authoring.js";

describe("verified scene authoring", () => {
  it("repairs at most four times and returns only a verified candidate", async () => {
    const attempts: number[] = [];
    const result = await generateVerifiedScene({
      generate: async (attempt) => {
        attempts.push(attempt);
        return attempt;
      },
      verify: (candidate) => {
        if (candidate !== 4) throw new Error("predicate failed");
        return candidate;
      },
    });
    expect(result).toEqual({
      value: 4,
      attempts: 4,
      failures: ["predicate failed", "predicate failed", "predicate failed"],
    });
    expect(attempts).toEqual([1, 2, 3, 4]);
  });

  it("passes concrete failures to the next repair attempt", async () => {
    const received: string[][] = [];
    const result = await generateVerifiedScene({
      generate: async (attempt, failures) => {
        received.push([...failures]);
        return attempt;
      },
      verify: (candidate) => {
        if (candidate === 1) throw new Error("MOTION_PLAN_UNKNOWN_ELEMENT");
        return candidate;
      },
    });

    expect(received).toEqual([[], ["MOTION_PLAN_UNKNOWN_ELEMENT"]]);
    expect(result.attempts).toBe(2);
    expect(result.failures).toEqual(["MOTION_PLAN_UNKNOWN_ELEMENT"]);
  });

  it("fails after four attempts", async () => {
    let attempts = 0;
    await expect(
      generateVerifiedScene({
        generate: async () => {
          attempts += 1;
          return null;
        },
        verify: () => {
          throw new Error("predicate failed");
        },
      }),
    ).rejects.toThrow(/SCENE_VERIFICATION_FAILED/u);
    expect(attempts).toBe(4);
  });
});
