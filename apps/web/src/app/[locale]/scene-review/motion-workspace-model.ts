import type {
  MotionSceneSnapshotV1,
  SceneOperationBatchV1,
} from "@rvs/contracts/motion";
import type {
  KeyframeV1,
  KeyframeV2,
  SpecElement,
} from "@rvs/contracts/scene-spec";
import { SceneSpecSchema } from "@rvs/contracts/scene-spec";
import type { JobProgress } from "../../../lib/job-progress";

export type WorkspaceMessage =
  | Readonly<{ id: string; role: "assistant"; text: string }>
  | Readonly<{ id: string; role: "user"; text: string }>
  | Readonly<{ id: string; role: "operation"; text: string }>
  | Readonly<{
      id: string;
      role: "error";
      text: string;
      remediation?: string;
      docsUrl?: string;
      causeCategory?: string;
    }>;

export const workspaceMessage = (
  role: WorkspaceMessage["role"],
  text: string,
  remediation?: string,
  extras?: { docsUrl?: string; causeCategory?: string },
): WorkspaceMessage => {
  if (role === "error")
    return {
      id: crypto.randomUUID(),
      role,
      text,
      ...(remediation ? { remediation } : {}),
      ...(extras?.docsUrl ? { docsUrl: extras.docsUrl } : {}),
      ...(extras?.causeCategory ? { causeCategory: extras.causeCategory } : {}),
    };
  return { id: crypto.randomUUID(), role, text };
};

export const queuedMotionJob = (job: JobProgress): JobProgress => ({
  ...job,
  state: "QUEUED",
  progressPhase: "prepare",
  progressStage: "scene-patch",
  progressFraction: 0,
  framesProcessed: null,
  framesTotal: null,
});

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

export type WorkspaceViewState =
  | "initial"
  | "loading"
  | "empty"
  | "unsupported"
  | "error"
  | "conflict"
  | "repair"
  | "queued"
  | "running"
  | "success"
  | "partial"
  | "cancelled"
  | "offline";

export type SceneProperty =
  | "content"
  | "x"
  | "y"
  | "width"
  | "height"
  | "scale"
  | "opacity"
  | "easing";

const PROPERTY_CAPABILITY: Readonly<Partial<Record<SceneProperty, string>>> = {
  content: "text",
  x: "x",
  y: "y",
  scale: "uniform-scale",
  opacity: "opacity",
  easing: "easing",
};

export const scenePropertySupported = (
  capabilities: readonly string[],
  property: SceneProperty,
): boolean => {
  const capability = PROPERTY_CAPABILITY[property];
  return capability !== undefined && capabilities.includes(capability);
};

type WorkspaceStateInput = Readonly<{
  state: string;
  progressFraction: number;
  busy: boolean;
  online: boolean;
  errorCode: string | null;
  scene: MotionSceneSnapshotV1;
  deliverableCount: number;
}>;

export const workspaceViewState = ({
  state,
  busy,
  online,
  errorCode,
  scene,
  deliverableCount,
}: WorkspaceStateInput): WorkspaceViewState => {
  if (!online || errorCode === "NETWORK_INTERRUPTED") return "offline";
  if (errorCode === "VERSION_CONFLICT") return "conflict";
  if (busy) return "loading";
  if (state === "CANCELLED") return "cancelled";
  if (["PREPARING", "RENDERING", "ASSEMBLING"].includes(state))
    return "running";
  if (state === "QUEUED") return "queued";
  if (scene.scene.beats.length === 0) return "empty";
  if (
    !scene.backendCapability.capabilities.includes("x") ||
    !scene.backendCapability.capabilities.includes("y")
  )
    return "unsupported";
  if (scene.verification?.status === "FAIL") return "repair";
  if (state === "COMPLETED")
    return deliverableCount > 0 ? "success" : "partial";
  if (errorCode) return "error";
  return "initial";
};

export const optimisticScene = (
  snapshot: MotionSceneSnapshotV1,
  operations: SceneOperationBatchV1["operations"],
): MotionSceneSnapshotV1 => {
  const candidate: unknown = structuredClone(snapshot.scene);
  for (const operation of operations) {
    const segments = operation.path.split("/").slice(1);
    const key = segments.pop();
    if (!key || ["__proto__", "constructor", "prototype"].includes(key))
      return snapshot;
    let parent: unknown = candidate;
    for (const segment of segments) {
      if (
        parent === null ||
        typeof parent !== "object" ||
        ["__proto__", "constructor", "prototype"].includes(segment)
      )
        return snapshot;
      parent = Reflect.get(parent, segment);
    }
    if (parent === null || typeof parent !== "object") return snapshot;
    const changed =
      operation.kind === "set"
        ? Reflect.set(parent, key, operation.value)
        : Reflect.deleteProperty(parent, key);
    if (!changed) return snapshot;
  }
  const parsed = SceneSpecSchema.safeParse(candidate);
  return parsed.success ? { ...snapshot, scene: parsed.data } : snapshot;
};

export const clampSplitRatio = (ratio: number): number =>
  Math.min(70, Math.max(30, ratio));

export const tabIndexForKey = (
  key: string,
  current: number,
  lastIndex: number,
): number | null => {
  if (key === "Home") return 0;
  if (key === "End") return lastIndex;
  if (key === "ArrowLeft") return current === 0 ? lastIndex : current - 1;
  if (key === "ArrowRight") return current === lastIndex ? 0 : current + 1;
  return null;
};

export const sceneIntegrity = (snapshot: MotionSceneSnapshotV1) => ({
  planDigest: snapshot.planDigest,
  artifactDigest: snapshot.artifactDigest,
  sceneDigest: snapshot.sceneDigest,
  capabilities: snapshot.backendCapability.capabilities,
  predicateIds: snapshot.predicateIds,
  knowledgeCardIds: snapshot.knowledgeCardIds,
  knowledgeCards: snapshot.knowledgeCards ?? [],
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
