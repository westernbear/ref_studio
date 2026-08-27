import { describe, expect, it } from "vitest";
import { CANVAS, frameCountFor, GenerationConfigSchema } from "./generation.js";

describe("GenerationConfig", () => {
  it("accepts a 20 second 9:16 brief", () => {
    const parsed = GenerationConfigSchema.parse({
      brief: "신발 광고, 브랜드 X",
      durationSec: 20,
      aspect: "9:16",
      attachmentIds: [],
    });
    expect(parsed.durationSec).toBe(20);
  });
  it("rejects a duration under 15 seconds", () => {
    expect(() =>
      GenerationConfigSchema.parse({
        brief: "x",
        durationSec: 4,
        aspect: "9:16",
        attachmentIds: [],
      }),
    ).toThrow();
  });
  it("rejects an unknown key", () => {
    expect(() =>
      GenerationConfigSchema.parse({
        brief: "x",
        durationSec: 20,
        aspect: "9:16",
        attachmentIds: [],
        extra: 1,
      }),
    ).toThrow();
  });
  it("computes frame count at 30fps", () => {
    expect(frameCountFor(20)).toBe(600);
  });
  it("maps every aspect to a canvas", () => {
    expect(CANVAS["9:16"]).toEqual({ width: 1080, height: 1920 });
    expect(CANVAS["1:1"]).toEqual({ width: 1080, height: 1080 });
    expect(CANVAS["16:9"]).toEqual({ width: 1920, height: 1080 });
  });
});
