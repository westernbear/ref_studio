export type FeatureFlagSnapshot = Readonly<{
  verifiedMotionAuthoring: boolean;
  nativeSceneV2: boolean;
  adobeMcp: boolean;
}>;

export class FeatureFlagConfigError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`FEATURE_FLAG_CONFIG_INVALID: ${key} must be true or false`);
    this.name = "FeatureFlagConfigError";
    this.key = key;
  }
}

const parse = (env: NodeJS.ProcessEnv, key: string): boolean => {
  const value = env[key];
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new FeatureFlagConfigError(key);
};

export const loadFeatureFlagSnapshot = (
  env: NodeJS.ProcessEnv = process.env,
): FeatureFlagSnapshot =>
  Object.freeze({
    verifiedMotionAuthoring: parse(env, "RVS_VERIFIED_MOTION_AUTHORING"),
    nativeSceneV2: parse(env, "RVS_NATIVE_SCENE_V2"),
    adobeMcp: parse(env, "RVS_ADOBE_MCP"),
  });

export const freezeFeatureFlagSnapshot = (
  snapshot: FeatureFlagSnapshot,
): FeatureFlagSnapshot => Object.freeze({ ...snapshot });
