import {
  SceneSpecSchema,
  sha256Hex,
  type SceneOperationBatchV1,
  type SceneSpec,
  type VerificationReportV1,
} from "@rvs/contracts";

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
  return parsed.data;
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

export async function verifyAndRepair(
  initial: SceneSpec,
  verify: (scene: SceneSpec) => Promise<readonly string[]>,
  repair: (scene: SceneSpec, failures: readonly string[]) => Promise<SceneSpec>,
): Promise<{
  readonly scene: SceneSpec;
  readonly report: VerificationReportV1;
}> {
  let candidate = initial;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const failures = await verify(candidate);
    if (failures.length === 0)
      return {
        scene: candidate,
        report: {
          schema: "verification-report-v1",
          sceneDigest: sha256Hex(candidate),
          attempts: attempt,
          status: "PASS",
          findings: [],
        },
      };
    if (attempt < 4) candidate = await repair(candidate, failures);
  }
  return {
    scene: initial,
    report: {
      schema: "verification-report-v1",
      sceneDigest: sha256Hex(initial),
      attempts: 4,
      status: "FAIL",
      findings: [
        { predicate: "scene", passed: false, detail: "verification failed" },
      ],
    },
  };
}
