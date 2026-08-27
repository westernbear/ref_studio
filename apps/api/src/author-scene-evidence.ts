// Projects a full measured-evidence bundle (EvidenceBundleSchema in
// creator-workflow.ts) down to what a scene-authoring prompt actually
// needs, per whole-branch review finding C3.
//
// authorScene() used to hand the model `JSON.stringify(evidence)` whole.
// `observed.effects` alone is frameCount x 432 floats; add per-frame
// temporalVolume/matting/camera/tracking/ocr and a real job's evidence
// bundle is on the order of a megabyte of JSON -- hundreds of thousands of
// tokens the model never asked for and cannot use (it authors a beat sheet
// and a handful of hex colours, not a frame-by-frame reproduction). Every
// real generate job would overrun the model's context and fail with
// SCENE_AUTHORING_FAILED after analysis, compilation, the evidence video,
// and the preview had all already run.
//
// This module is intentionally untyped against the full EvidenceBundleSchema
// (defined in creator-workflow.ts, which itself imports from author-scene.ts
// for AuthoredScene -- importing the schema back here would be circular).
// It reads defensively instead: every field is optional, missing or
// malformed shapes just contribute nothing, so a minimal test fixture (or a
// genuinely NEEDS_CHOICE bundle) projects to an equally minimal payload
// rather than throwing.

export type ProjectedOwner = {
  readonly ownerId: string;
  readonly kind: string;
  readonly editable: boolean;
  // A summary of the owner's measured on-screen geometry across the
  // evidence's tracking samples -- a bounding extent and a sample count,
  // never the per-frame arrays themselves.
  readonly geometry: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly sampleCount: number;
  } | null;
};

export type ProjectedEvidence = {
  readonly sceneInput: {
    readonly owners: readonly ProjectedOwner[];
  };
  readonly palette: readonly string[];
  readonly rhythm: Record<string, unknown> | null;
  readonly audioAnchors: readonly { readonly frame: number; readonly confidence: number }[];
};

// Fail loudly above this, rather than silently truncating -- a silently
// truncated projection would hand the model half a scene's worth of
// context with no indication anything was cut.
export const MAX_PROJECTED_EVIDENCE_BYTES = 16_384;

export class EvidenceProjectionError extends Error {
  readonly token: string;
  constructor(token: string) {
    super(token);
    this.name = "EvidenceProjectionError";
    this.token = token;
  }
}

type AnyRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const num = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

function summarizeGeometry(samples: readonly unknown[]): ProjectedOwner["geometry"] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let sampleCount = 0;
  for (const sample of samples) {
    if (!isRecord(sample)) continue;
    const bounds = sample["boundsPx"];
    if (!Array.isArray(bounds) || bounds.length < 4) continue;
    const x = num(bounds[0]);
    const y = num(bounds[1]);
    const width = num(bounds[2]);
    const height = num(bounds[3]);
    if (x === undefined || y === undefined || width === undefined || height === undefined)
      continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
    sampleCount += 1;
  }
  if (sampleCount === 0) return null;
  return { minX, minY, maxX, maxY, sampleCount };
}

export function projectEvidenceForAuthoring(evidence: unknown): ProjectedEvidence {
  const record = isRecord(evidence) ? evidence : {};
  const sceneInputRaw = isRecord(record["sceneInput"]) ? record["sceneInput"] : {};
  const ownersRaw = Array.isArray(sceneInputRaw["owners"]) ? sceneInputRaw["owners"] : [];
  const observedRaw = isRecord(record["observed"]) ? record["observed"] : {};
  const trackingRaw = Array.isArray(observedRaw["tracking"]) ? observedRaw["tracking"] : [];

  const geometryByOwner = new Map<string, ProjectedOwner["geometry"]>();
  for (const track of trackingRaw) {
    if (!isRecord(track)) continue;
    const ownerId = track["ownerId"];
    if (typeof ownerId !== "string") continue;
    const samples = Array.isArray(track["samples"]) ? track["samples"] : [];
    geometryByOwner.set(ownerId, summarizeGeometry(samples));
  }

  const owners: ProjectedOwner[] = [];
  for (const owner of ownersRaw) {
    if (!isRecord(owner)) continue;
    const ownerId = owner["ownerId"];
    if (typeof ownerId !== "string" || ownerId.length === 0) continue;
    const kind = owner["kind"];
    owners.push({
      ownerId,
      kind: typeof kind === "string" ? kind : "unknown",
      editable: owner["editable"] === true,
      geometry: geometryByOwner.get(ownerId) ?? null,
    });
  }

  const paletteRaw = observedRaw["palette"];
  const palette = Array.isArray(paletteRaw)
    ? paletteRaw.filter((entry): entry is string => typeof entry === "string")
    : [];

  const rhythmRaw = observedRaw["rhythm"];
  const rhythm = isRecord(rhythmRaw) ? rhythmRaw : null;

  const audioRaw = isRecord(observedRaw["audio"]) ? observedRaw["audio"] : {};
  const anchorsRaw = Array.isArray(audioRaw["anchors"]) ? audioRaw["anchors"] : [];
  const audioAnchors = anchorsRaw.filter(isRecord).map((anchor) => ({
    frame: num(anchor["frame"]) ?? 0,
    confidence: num(anchor["confidence"]) ?? 0,
  }));

  const projected: ProjectedEvidence = {
    sceneInput: { owners },
    palette,
    rhythm,
    audioAnchors,
  };

  const serialized = JSON.stringify(projected);
  const serializedByteLength = Buffer.from(serialized).byteLength;
  if (serializedByteLength > MAX_PROJECTED_EVIDENCE_BYTES)
    throw new EvidenceProjectionError("EVIDENCE_PROJECTION_TOO_LARGE");

  return projected;
}

// Owner ids the measured evidence actually supplies -- see authorScene.ts's
// resolvableAssetIds, which treats an "evidence"-origin asset as
// resolvable only when the evidence names at least one owner.
export function evidenceOwnerIds(projected: ProjectedEvidence): ReadonlySet<string> {
  return new Set(projected.sceneInput.owners.map((owner) => owner.ownerId));
}
