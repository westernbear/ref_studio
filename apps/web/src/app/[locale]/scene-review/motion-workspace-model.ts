import type {
  MotionSceneSnapshotV1,
  SceneOperationBatchV1,
} from "@rvs/contracts/motion";
import type {
  KeyframeV1,
  KeyframeV2,
  SpecElement,
} from "@rvs/contracts/scene-spec";

export type SceneSelection = Readonly<{
  beatIndex: number;
  elementIndex: number;
}>;

export type ElementFrameState = Readonly<{
  opacity: number;
  scale: number;
  x: number;
  y: number;
}>;

export const clampSplitRatio = (ratio: number): number =>
  Math.min(70, Math.max(30, ratio));

export const sceneIntegrity = (snapshot: MotionSceneSnapshotV1) => ({
  planDigest: snapshot.planDigest,
  artifactDigest: snapshot.artifactDigest,
  sceneDigest: snapshot.sceneDigest,
  capabilities: snapshot.backendCapability.capabilities,
  predicateIds: snapshot.predicateIds,
});

export const isKeyframeV2 = (
  keyframe: KeyframeV1 | KeyframeV2,
): keyframe is KeyframeV2 => "scaleX" in keyframe;

const eased = (progress: number, ease: string): number => {
  if (ease === "easeIn") return progress * progress;
  if (ease === "easeOut") return 1 - (1 - progress) * (1 - progress);
  if (ease === "easeInOut")
    return progress < 0.5
      ? 2 * progress * progress
      : 1 - (-2 * progress + 2) ** 2 / 2;
  return progress;
};

const valueAt = (
  element: SpecElement,
  frame: number,
  key: "opacity" | "scale" | "x" | "y",
  fallback: number,
): number => {
  const values = element.keyframes
    .filter((keyframe) =>
      key === "scale"
        ? (isKeyframeV2(keyframe) ? keyframe.scaleX : keyframe.scale) !==
          undefined
        : keyframe[key] !== undefined,
    )
    .map((keyframe) => ({
      frame: keyframe.frame,
      value:
        key === "scale"
          ? ((isKeyframeV2(keyframe) ? keyframe.scaleX : keyframe.scale) ??
            fallback)
          : (keyframe[key] ?? fallback),
      ease: keyframe.ease,
    }))
    .sort((left, right) => left.frame - right.frame);
  if (values.length === 0) return fallback;
  const before = [...values].reverse().find((value) => value.frame <= frame);
  const after = values.find((value) => value.frame >= frame);
  if (!before) return after?.value ?? fallback;
  if (!after || before.frame === after.frame) return before.value;
  const progress = (frame - before.frame) / (after.frame - before.frame);
  return (
    before.value + (after.value - before.value) * eased(progress, after.ease)
  );
};

export const elementFrameState = (
  element: SpecElement,
  frame: number,
): ElementFrameState => ({
  opacity: valueAt(element, frame, "opacity", 1),
  scale: valueAt(element, frame, "scale", 1),
  x: valueAt(element, frame, "x", 0),
  y: valueAt(element, frame, "y", 0),
});

export const selectedElement = (
  snapshot: MotionSceneSnapshotV1,
  selection: SceneSelection,
): SpecElement | null =>
  snapshot.scene.beats[selection.beatIndex]?.elements[selection.elementIndex] ??
  null;

export const moveElementOperations = (
  snapshot: MotionSceneSnapshotV1,
  beatIndex: number,
  elementIndex: number,
  deltaX: number,
  deltaY: number,
): SceneOperationBatchV1["operations"] => {
  const element = snapshot.scene.beats[beatIndex]?.elements[elementIndex];
  if (!element) return [];
  return [
    {
      kind: "set",
      opId: `move-x-v${snapshot.version}-b${beatIndex}-e${elementIndex}`,
      path: `/beats/${beatIndex}/elements/${elementIndex}/box/x`,
      value: element.box.x + deltaX,
      reason: "canvas direct manipulation",
    },
    {
      kind: "set",
      opId: `move-y-v${snapshot.version}-b${beatIndex}-e${elementIndex}`,
      path: `/beats/${beatIndex}/elements/${elementIndex}/box/y`,
      value: element.box.y + deltaY,
      reason: "canvas direct manipulation",
    },
  ];
};
