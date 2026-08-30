import {
  MANDATORY_MOTION_PREDICATE_IDS,
  MOTION_PREDICATE_IDS,
  type MotionPredicateId,
} from "../../../packages/contracts/src/motion-predicates.js";
import type {
  BackendCapabilitySnapshotV1,
  VerificationReportV1,
} from "../../../packages/contracts/src/motion.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import {
  SceneSpecSchema,
  type SceneSpec,
} from "../../../packages/contracts/src/scene-spec.js";

export type MotionVerificationContext = Readonly<{
  capabilitySnapshot: BackendCapabilitySnapshotV1;
  resolvableAssetIds: ReadonlySet<string>;
  frameHashes?: readonly [readonly string[], readonly string[]];
  audioDuration?: Readonly<{
    observedSeconds: number;
    expectedSeconds: number;
    toleranceSeconds: number;
  }>;
  reducedMotion?: Readonly<{ required: boolean; observed: boolean }>;
  adobeReadback?: Readonly<{ expectedDigest: string; observedDigest: string }>;
}>;

type Finding = VerificationReportV1["findings"][number];
const finding = (
  predicateId: MotionPredicateId,
  pass: boolean,
  target: string,
  observed: string,
  expected: string,
  remediation: string,
): Finding => ({
  predicateId,
  pass,
  target,
  observed,
  expected,
  remediation,
});

const safeScene = (value: unknown): SceneSpec | undefined => {
  const parsed = SceneSpecSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const evaluate = (
  predicateId: MotionPredicateId,
  raw: unknown,
  context: MotionVerificationContext,
): Finding => {
  const scene = safeScene(raw);
  if (predicateId === "scene-spec")
    return finding(
      predicateId,
      scene !== undefined,
      "scene",
      scene ? "schema valid" : "schema invalid",
      "strict scene-spec-v1",
      "return a strict SceneSpec without unknown or invalid fields",
    );
  if (!scene)
    return finding(
      predicateId,
      false,
      "scene",
      "scene unavailable",
      "valid SceneSpec",
      "repair scene-spec before evaluating this predicate",
    );

  if (predicateId === "beat-tiling") {
    const beats = [...scene.beats].sort((a, b) => a.startFrame - b.startFrame);
    const pass =
      beats.length > 0 &&
      beats[0]!.startFrame === 0 &&
      beats.at(-1)!.endFrame === scene.canvas.frameCount &&
      beats.every(
        (beat, index) =>
          index === 0 || beats[index - 1]!.endFrame === beat.startFrame,
      );
    return finding(
      predicateId,
      pass,
      "scene.beats",
      pass ? "tiles canvas" : "gap, overlap, or edge mismatch",
      `[0, ${scene.canvas.frameCount}) without gaps or overlaps`,
      "align adjacent beat boundaries to tile the canvas",
    );
  }
  if (predicateId === "keyframe-timing") {
    const invalid = scene.beats.flatMap((beat) =>
      beat.elements.flatMap((element) =>
        element.keyframes
          .filter(
            (keyframe) =>
              keyframe.frame < beat.startFrame ||
              keyframe.frame > beat.endFrame,
          )
          .map((keyframe) => `${element.elementId}@${keyframe.frame}`),
      ),
    );
    return finding(
      predicateId,
      invalid.length === 0,
      "scene.beats[].elements[].keyframes",
      invalid.length ? invalid.join(",") : "all keyframes in beat",
      "each frame within its beat",
      "move keyframes inside their owning beat",
    );
  }
  if (predicateId === "element-kind-capability") {
    const capabilities = context.capabilitySnapshot?.capabilities ?? [];
    const supported = new Set(capabilities);
    const unsupported = [
      ...new Set(
        scene.beats.flatMap((beat) =>
          beat.elements
            .map((element) => element.kind)
            .filter((kind) => !supported.has(kind)),
        ),
      ),
    ];
    return finding(
      predicateId,
      context.capabilitySnapshot !== undefined && unsupported.length === 0,
      "scene.beats[].elements[].kind",
      unsupported.length ? unsupported.join(",") : "all kinds supported",
      capabilities.join(",") || "declared backend kinds",
      "replace unsupported elements or select a capable backend",
    );
  }
  if (predicateId === "asset-resolvable") {
    const declared = new Set(scene.assets.map((asset) => asset.assetId));
    const unresolved = [
      ...new Set(
        scene.beats.flatMap((beat) =>
          beat.elements
            .map((element) => element.assetRef)
            .filter(
              (id): id is string =>
                id !== undefined &&
                (!declared.has(id) || !context.resolvableAssetIds?.has(id)),
            ),
        ),
      ),
    ];
    return finding(
      predicateId,
      context.resolvableAssetIds !== undefined && unresolved.length === 0,
      "scene assets",
      unresolved.length
        ? unresolved.join(",")
        : "all referenced assets resolvable",
      "declared and job-resolvable asset IDs",
      "supply or remove unresolved asset references",
    );
  }
  if (predicateId === "no-external-url") {
    const external = [
      ...scene.assets.map((asset) => asset.ref),
      ...scene.beats.flatMap((beat) =>
        beat.elements.map((element) => element.content ?? ""),
      ),
    ].filter((value) => /^https?:\/\//iu.test(value));
    return finding(
      predicateId,
      external.length === 0,
      "scene asset refs and content",
      external.length
        ? `${external.length} external URL(s)`
        : "no external URLs",
      "local approved references only",
      "replace external URLs with pinned local assets",
    );
  }
  if (predicateId === "frame-hash-deterministic") {
    const hashes = context.frameHashes;
    const validHash = (hash: string) => /^[a-f0-9]{64}$/u.test(hash);
    const pass =
      hashes !== undefined &&
      hashes[0].length > 0 &&
      hashes[0].length === hashes[1].length &&
      hashes[0].every(validHash) &&
      hashes[1].every(validHash) &&
      hashes[0].every((hash, index) => hash === hashes[1][index]);
    return finding(
      predicateId,
      pass,
      "rendered frames",
      hashes
        ? pass
          ? `${hashes[0].length} matching hashes`
          : "hash mismatch"
        : "evidence absent",
      "two non-empty identical frame-hash sequences",
      "render twice and compare every frame hash",
    );
  }
  if (predicateId === "audio-duration") {
    const audio = context.audioDuration;
    const pass =
      audio !== undefined &&
      Number.isFinite(audio.observedSeconds) &&
      Number.isFinite(audio.expectedSeconds) &&
      Number.isFinite(audio.toleranceSeconds) &&
      Math.abs(audio.observedSeconds - audio.expectedSeconds) <=
        audio.toleranceSeconds;
    return finding(
      predicateId,
      pass,
      "audio duration",
      audio ? `${audio.observedSeconds}s` : "evidence absent",
      audio
        ? `${audio.expectedSeconds}s ± ${audio.toleranceSeconds}s`
        : "explicit observed/expected/tolerance",
      "probe audio duration and trim or pad within policy",
    );
  }
  if (predicateId === "reduced-motion") {
    const reduced = context.reducedMotion;
    const pass =
      reduced !== undefined && (!reduced.required || reduced.observed);
    return finding(
      predicateId,
      pass,
      "reduced motion",
      reduced
        ? `required=${reduced.required}, observed=${reduced.observed}`
        : "evidence absent",
      "explicit policy satisfied",
      "produce and observe the required reduced-motion behavior",
    );
  }
  const readback = context.adobeReadback;
  const pass =
    readback !== undefined &&
    /^[a-f0-9]{64}$/u.test(readback.expectedDigest) &&
    readback.expectedDigest === readback.observedDigest;
  return finding(
    predicateId,
    pass,
    "Adobe readback",
    readback ? readback.observedDigest : "evidence absent",
    readback?.expectedDigest ?? "explicit expected and observed digests",
    "read back the AE project and reconcile the digest",
  );
};

export function verifyMotionScene(
  input: unknown,
  options: Readonly<{
    requestedPredicateIds?: readonly MotionPredicateId[];
    context: MotionVerificationContext;
    attempts?: number;
  }>,
): VerificationReportV1 {
  const attempts = options.attempts ?? 1;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 4)
    throw new Error("INVALID_VERIFICATION_ATTEMPTS");
  const requested = options.requestedPredicateIds ?? [];
  for (const id of requested)
    if (!MOTION_PREDICATE_IDS.includes(id))
      throw new Error("UNKNOWN_MOTION_PREDICATE");
  const ids = [...new Set([...MANDATORY_MOTION_PREDICATE_IDS, ...requested])];
  const findings = ids.map((id) => evaluate(id, input, options.context));
  return {
    schema: "verification-report-v1",
    sceneDigest: sha256Hex(safeScene(input) ?? { invalidScene: true }),
    attempts,
    status: findings.every((entry) => entry.pass) ? "PASS" : "FAIL",
    findings,
  };
}
