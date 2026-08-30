import { describe, expect, it } from "vitest";
import {
  FeatureFlagConfigError,
  freezeFeatureFlagSnapshot,
  loadFeatureFlagSnapshot,
  type FeatureFlagSnapshot,
} from "./feature-flags.js";

const tuples = [
  [false, false, false],
  [false, false, true],
  [false, true, false],
  [false, true, true],
  [true, false, false],
  [true, false, true],
  [true, true, false],
  [true, true, true],
] as const;

describe("feature flag startup snapshot", () => {
  it.each(tuples)(
    "parses verified=%s native=%s adobe=%s independently",
    (verifiedMotionAuthoring, nativeSceneV2, adobeMcp) => {
      const snapshot = loadFeatureFlagSnapshot({
        RVS_VERIFIED_MOTION_AUTHORING: String(verifiedMotionAuthoring),
        RVS_NATIVE_SCENE_V2: String(nativeSceneV2),
        RVS_ADOBE_MCP: String(adobeMcp),
      });
      expect(snapshot).toEqual({
        verifiedMotionAuthoring,
        nativeSceneV2,
        adobeMcp,
      } satisfies FeatureFlagSnapshot);
      expect(Object.isFrozen(snapshot)).toBe(true);
    },
  );

  it("defaults every absent flag to false", () => {
    expect(loadFeatureFlagSnapshot({})).toEqual({
      verifiedMotionAuthoring: false,
      nativeSceneV2: false,
      adobeMcp: false,
    });
  });

  it.each(["TRUE", "1", "yes", "", "false "])(
    "rejects malformed boolean %s",
    (value) => {
      expect(() => loadFeatureFlagSnapshot({ RVS_ADOBE_MCP: value })).toThrow(
        FeatureFlagConfigError,
      );
    },
  );

  it("does not change after its source environment mutates", () => {
    const env: NodeJS.ProcessEnv = { RVS_NATIVE_SCENE_V2: "true" };
    const snapshot = loadFeatureFlagSnapshot(env);
    env.RVS_NATIVE_SCENE_V2 = "false";
    expect(snapshot.nativeSceneV2).toBe(true);
  });

  it("copies and freezes a complete test override", () => {
    const override = {
      verifiedMotionAuthoring: true,
      nativeSceneV2: false,
      adobeMcp: true,
    };
    const snapshot = freezeFeatureFlagSnapshot(override);
    override.nativeSceneV2 = true;

    expect(snapshot).toEqual({
      verifiedMotionAuthoring: true,
      nativeSceneV2: false,
      adobeMcp: true,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
