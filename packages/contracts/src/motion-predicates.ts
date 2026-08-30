export const MOTION_PREDICATE_IDS = Object.freeze([
  "scene-spec",
  "beat-tiling",
  "keyframe-timing",
  "element-kind-capability",
  "asset-resolvable",
  "no-external-url",
  "frame-hash-deterministic",
  "audio-duration",
  "reduced-motion",
  "adobe-readback",
] as const);

export type MotionPredicateId = (typeof MOTION_PREDICATE_IDS)[number];

export type MotionPredicateMetadata = Readonly<{
  id: MotionPredicateId;
  target: "scene" | "artifact" | "audio" | "accessibility" | "adobe";
  requiresRuntimeEvidence: boolean;
}>;

const MOTION_PREDICATE_METADATA = [
  { id: "scene-spec", target: "scene", requiresRuntimeEvidence: false },
  { id: "beat-tiling", target: "scene", requiresRuntimeEvidence: false },
  { id: "keyframe-timing", target: "scene", requiresRuntimeEvidence: false },
  {
    id: "element-kind-capability",
    target: "scene",
    requiresRuntimeEvidence: false,
  },
  { id: "asset-resolvable", target: "scene", requiresRuntimeEvidence: false },
  { id: "no-external-url", target: "scene", requiresRuntimeEvidence: false },
  {
    id: "frame-hash-deterministic",
    target: "artifact",
    requiresRuntimeEvidence: true,
  },
  { id: "audio-duration", target: "audio", requiresRuntimeEvidence: true },
  {
    id: "reduced-motion",
    target: "accessibility",
    requiresRuntimeEvidence: true,
  },
  { id: "adobe-readback", target: "adobe", requiresRuntimeEvidence: true },
] satisfies MotionPredicateMetadata[];

export const MOTION_PREDICATES: readonly MotionPredicateMetadata[] =
  Object.freeze(
    MOTION_PREDICATE_METADATA.map((metadata) => Object.freeze(metadata)),
  );

export const MANDATORY_MOTION_PREDICATE_IDS = Object.freeze([
  "scene-spec",
  "asset-resolvable",
  "no-external-url",
] as const satisfies readonly MotionPredicateId[]);
