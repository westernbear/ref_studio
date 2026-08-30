import {
  SceneSpecSchema,
  type SceneSpec,
} from "../../../packages/contracts/src/scene-spec.js";
import { validateSceneSpec } from "../../../packages/contracts/src/spec-validate.js";
import type { SceneOperationBatchV1 } from "../../../packages/contracts/src/motion.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import { verifyMotionScene as evaluateMotionScene } from "./motion-predicates.js";
import { verifyAndRepair as runVerificationAttempts } from "./verified-scene-authoring.js";

export function verifyMotionScene(scene: SceneSpec) {
  return evaluateMotionScene(scene, {
    requestedPredicateIds: ["element-kind-capability"],
    context: {
      capabilitySnapshot: {
        schema: "backend-capability-snapshot-v1",
        backend: "native",
        capturedAt: "1970-01-01T00:00:00.000Z",
        capabilities: ["text", "image", "shape"],
      },
      resolvableAssetIds: new Set(scene.assets.map((asset) => asset.assetId)),
    },
  });
}

export async function verifyAndRepair(
  initial: SceneSpec,
  verify: (scene: SceneSpec) => Promise<readonly string[]>,
  repair: (scene: SceneSpec, failures: readonly string[]) => Promise<SceneSpec>,
) {
  return runVerificationAttempts({
    initialScene: initial,
    initialArtifact: undefined,
    verify: async (scene, attempt) => {
      const failures = await verify(scene);
      const findings = failures.map((observed) => ({
        predicateId: "scene-spec" as const,
        pass: false,
        target: "scene",
        observed,
        expected: "verification pass",
        remediation: "repair the reported predicate failure",
      }));
      return {
        schema: "verification-report-v1" as const,
        sceneDigest: sha256Hex(scene),
        attempts: attempt,
        status: findings.length === 0 ? ("PASS" as const) : ("FAIL" as const),
        findings,
      };
    },
    repair: async (scene, findings) => ({
      scene: await repair(
        scene,
        findings.map((finding) => finding.observed),
      ),
      artifact: undefined,
    }),
  });
}

const pointerSegments = (path: string): readonly string[] =>
  path
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));

const applyAt = (
  current: unknown,
  segments: readonly string[],
  value: unknown,
  unset: boolean,
): unknown => {
  const [head, ...tail] = segments;
  if (head === undefined) return value;
  if (Array.isArray(current)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= current.length)
      throw new MotionSceneError("INVALID_OPERATION", 422);
    if (tail.length === 0 && unset)
      return current.filter((_item, itemIndex) => itemIndex !== index);
    return current.map((item, itemIndex) =>
      itemIndex === index ? applyAt(item, tail, value, unset) : item,
    );
  }
  if (typeof current !== "object" || current === null)
    throw new MotionSceneError("INVALID_OPERATION", 422);
  const entries = Object.entries(current);
  if (tail.length === 0)
    return Object.fromEntries(
      unset
        ? entries.filter(([key]) => key !== head)
        : [...entries.filter(([key]) => key !== head), [head, value]],
    );
  if (!Object.hasOwn(current, head))
    throw new MotionSceneError("INVALID_OPERATION", 422);
  return Object.fromEntries(
    entries.map(([key, child]) => [
      key,
      key === head ? applyAt(child, tail, value, unset) : child,
    ]),
  );
};

export class MotionSceneError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export function applySceneOperations(
  scene: SceneSpec,
  batch: SceneOperationBatchV1,
): SceneSpec {
  let candidate: unknown = scene;
  for (const operation of batch.operations)
    candidate = applyAt(
      candidate,
      pointerSegments(operation.path),
      operation.kind === "set" ? operation.value : undefined,
      operation.kind === "unset",
    );
  const parsed = SceneSpecSchema.safeParse(candidate);
  if (!parsed.success) throw new MotionSceneError("INVALID_SCENE", 422);
  try {
    return validateSceneSpec(
      parsed.data,
      new Set(parsed.data.assets.map((asset) => asset.assetId)),
    );
  } catch {
    throw new MotionSceneError("INVALID_SCENE", 422);
  }
}

export function keyframesFromMotionIntent(intent: {
  readonly anticipationFrames: number;
  readonly overshootPercent: number;
  readonly settleFrame: number;
  readonly staggerFrames: number;
  readonly elementIndex: number;
}): SceneSpec["beats"][number]["elements"][number]["keyframes"] {
  const start = intent.elementIndex * intent.staggerFrames;
  return [
    { frame: start, scale: 1, ease: "easeIn" },
    {
      frame: start + intent.anticipationFrames,
      scale: 1 + intent.overshootPercent / 100,
      ease: "easeOut",
    },
    { frame: intent.settleFrame + start, scale: 1, ease: "easeInOut" },
  ];
}
