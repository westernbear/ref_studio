import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  evidenceOwnerIds,
  MAX_PROJECTED_EVIDENCE_BYTES,
  projectEvidenceForAuthoring,
} from "./author-scene-evidence.js";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

// A realistic evidence bundle -- populated per-frame arrays at a realistic
// frame count (240 frames, the schema's max), not the all-zero,
// empty-tracking stub other test suites use. This is what C3 is actually
// about: a real bundle's `observed.effects` alone is frameCount x 432
// floats, and this fixture reproduces that shape so the projection is
// tested against the thing that actually breaks a prompt, not a stand-in
// that happens to already be small.
function realisticEvidenceBundle(frameCount = 240) {
  const fps = 60 as const;
  return {
    schemaVersion: "rvs-reference-evidence-v1",
    state: "MAPPED",
    source: {
      jobId: "job_realistic",
      attemptId: "att_realistic",
      normalizedSha256: sha256("normalized"),
    },
    observed: {
      temporalVolume: {
        profile: "1080x1920",
        fps,
        frameCount,
        intervalMs: [0, 4_000],
        frames: Array.from({ length: frameCount }, (_, index) => ({
          index,
          timeMs: Math.floor((index * 1_000) / fps),
          nativeSha256: sha256(`frame-${index}`),
          confidence: 0.9,
        })),
      },
      ocr: { engine: "EasyOCR ko+en", candidates: [] },
      uiSurfaces: [],
      matting: {
        engine: "RVM MobileNetV3",
        frames: Array.from({ length: frameCount }, (_, frame) => ({
          frame,
          confidence: 0.95,
        })),
      },
      depth: {
        engine: "MiDaS v2.1 small",
        medianNormalized: Array.from(
          { length: frameCount },
          (_, index) => 0.1 + (index % 10) / 10,
        ),
        ownerSamples: [],
      },
      camera: {
        method: "foreground-masked RANSAC background homography",
        frames: Array.from({ length: frameCount }, (_, frame) => ({
          frame,
          confidence: 0.8,
        })),
      },
      // Two owners, each with a full 240-sample track -- this is the field
      // the projection must summarize into a bounding extent, never pass
      // through as per-frame arrays.
      tracking: [
        {
          ownerId: "owner-hero",
          samples: Array.from({ length: frameCount }, (_, frame) => ({
            frame,
            timeMs: Math.floor((frame * 1_000) / fps),
            boundsPx: [100 + frame, 200 + frame * 0.5, 400, 300] as const,
            centroidPx: [300 + frame, 350 + frame * 0.5] as const,
            velocityPxPerMs: [0.2, 0.1] as const,
            confidence: 0.9,
          })),
        },
        {
          ownerId: "owner-logo",
          samples: Array.from({ length: frameCount }, (_, frame) => ({
            frame,
            timeMs: Math.floor((frame * 1_000) / fps),
            boundsPx: [900, 40, 120, 60] as const,
            centroidPx: [960, 70] as const,
            velocityPxPerMs: [0, 0] as const,
            confidence: 0.99,
          })),
        },
      ],
      // frameCount x 432 floats -- the field the finding calls out by name
      // as the dominant contributor to a real bundle's size.
      effects: Array.from({ length: frameCount }, (_, index) => ({
        lowerLightRgb16x9: Array.from(
          { length: 16 * 9 * 3 },
          (_unused, cell) => ((index + cell) % 255) / 255,
        ),
        confidence: 0.85,
        formulas: { lowerLight: "median RGB per 16x9 cell" },
      })),
      rhythm: { beats: [10, 45, 90, 150, 200], tempoBpm: 120 },
      audio: {
        sampleRateHz: 48_000,
        channels: 2,
        anchors: [
          { frame: 10, confidence: 0.7 },
          { frame: 90, confidence: 0.8 },
        ],
      },
      palette: ["#101018", "#ff5500", "#3355ff", "#ffaa33"],
    },
    mappings: {
      textOwnerCount: 1,
      uiOwnerCount: 0,
      residualOwner: "owner-background",
    },
    needsChoice: [],
    sceneInput: {
      owners: [
        {
          ownerId: "owner-hero",
          kind: "hero-shot",
          editable: true,
          confidence: 0.9,
        },
        {
          ownerId: "owner-logo",
          kind: "logo",
          editable: false,
          confidence: 0.99,
        },
        {
          ownerId: "owner-background",
          kind: "global-residual",
          editable: true,
          confidence: 1,
        },
      ],
      tracks: [],
    },
  };
}

describe("projectEvidenceForAuthoring", () => {
  it("summarizes owner geometry instead of carrying per-frame arrays", () => {
    const projected = projectEvidenceForAuthoring(realisticEvidenceBundle());
    expect(projected.sceneInput.owners).toHaveLength(3);
    const hero = projected.sceneInput.owners.find(
      (owner) => owner.ownerId === "owner-hero",
    );
    expect(hero?.geometry?.sampleCount).toBe(240);
    expect(hero?.geometry?.minX).toBeCloseTo(100, 5);
    // The owner with no tracking entry (owner-background) still appears,
    // just with no geometry summary.
    const background = projected.sceneInput.owners.find(
      (owner) => owner.ownerId === "owner-background",
    );
    expect(background?.geometry).toBeNull();
  });

  it("carries the measured palette and audio anchors", () => {
    const projected = projectEvidenceForAuthoring(realisticEvidenceBundle());
    expect(projected.palette).toEqual([
      "#101018",
      "#ff5500",
      "#3355ff",
      "#ffaa33",
    ]);
    expect(projected.audioAnchors).toEqual([
      { frame: 10, confidence: 0.7 },
      { frame: 90, confidence: 0.8 },
    ]);
    expect(projected.rhythm).toEqual({
      beats: [10, 45, 90, 150, 200],
      tempoBpm: 120,
    });
  });

  it("stays under the byte budget for a realistic, populated bundle", () => {
    const projected = projectEvidenceForAuthoring(realisticEvidenceBundle());
    const byteLength = Buffer.byteLength(JSON.stringify(projected), "utf8");
    expect(byteLength).toBeLessThanOrEqual(MAX_PROJECTED_EVIDENCE_BYTES);
    // Sanity check that this is actually testing something: the raw bundle
    // (what the old code stringified whole) is dramatically larger than the
    // projection, driven by the per-frame effects/tracking/temporalVolume
    // arrays the projection never touches.
    const rawByteLength = Buffer.byteLength(
      JSON.stringify(realisticEvidenceBundle()),
      "utf8",
    );
    expect(rawByteLength).toBeGreaterThan(byteLength * 20);
  });

  it("fails loudly, with its own token, above the byte budget", () => {
    const hugeOwners = Array.from({ length: 5_000 }, (_, index) => ({
      ownerId: `owner-${index}-${"x".repeat(64)}`,
      kind: "text",
      editable: true,
    }));
    expect(() =>
      projectEvidenceForAuthoring({ sceneInput: { owners: hugeOwners } }),
    ).toThrow(/EVIDENCE_PROJECTION_TOO_LARGE/);
  });

  it("tolerates a minimal, near-empty evidence object without throwing", () => {
    const projected = projectEvidenceForAuthoring({
      sceneInput: { owners: [] },
    });
    expect(projected).toEqual({
      sceneInput: { owners: [] },
      palette: [],
      rhythm: null,
      audioAnchors: [],
    });
  });

  it("tolerates evidence that isn't an object at all", () => {
    expect(projectEvidenceForAuthoring(null)).toEqual({
      sceneInput: { owners: [] },
      palette: [],
      rhythm: null,
      audioAnchors: [],
    });
  });
});

describe("evidenceOwnerIds", () => {
  it("returns the set of owner ids the projection carries", () => {
    const projected = projectEvidenceForAuthoring(realisticEvidenceBundle());
    expect(evidenceOwnerIds(projected)).toEqual(
      new Set(["owner-hero", "owner-logo", "owner-background"]),
    );
  });
});
