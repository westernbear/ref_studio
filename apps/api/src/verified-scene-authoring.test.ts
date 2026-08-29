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
    expect(result).toBe(4);
    expect(attempts).toEqual([1, 2, 3, 4]);
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
