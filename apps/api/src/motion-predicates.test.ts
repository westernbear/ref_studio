import { describe, expect, it } from "vitest";
import { fixtureSpec } from "@rvs/contracts";
import { verifyMotionScene } from "./motion-predicates.js";

const context = (overrides: Record<string, unknown> = {}) => ({
  capabilitySnapshot: {
    schema: "backend-capability-snapshot-v1" as const,
    backend: "native" as const,
    capturedAt: "2026-08-30T00:00:00.000Z",
    capabilities: ["text", "image", "shape"],
  },
  resolvableAssetIds: new Set(fixtureSpec.assets.map((asset) => asset.assetId)),
  ...overrides,
});

describe("motion predicate evaluator", () => {
  it("runs only stable requested plus mandatory predicates with complete findings", () => {
    const report = verifyMotionScene(fixtureSpec, {
      requestedPredicateIds: [
        "beat-tiling",
        "scene-spec",
        "frame-hash-deterministic",
      ],
      context: context({
        frameHashes: [["a".repeat(64)], ["a".repeat(64)]],
      }),
    });
    expect(report.findings.map((entry) => entry.predicateId)).toEqual([
      "scene-spec",
      "asset-resolvable",
      "no-external-url",
      "beat-tiling",
      "frame-hash-deterministic",
    ]);
    expect(report.status).toBe("PASS");
    expect(
      report.findings.every(
        (entry) =>
          Object.keys(entry).sort().join(",") ===
          "expected,observed,pass,predicateId,remediation,target",
      ),
    ).toBe(true);
  });

  it("fails closed when requested runtime evidence is absent", () => {
    const report = verifyMotionScene(fixtureSpec, {
      requestedPredicateIds: [
        "frame-hash-deterministic",
        "audio-duration",
        "reduced-motion",
        "adobe-readback",
      ],
      context: context(),
    });
    expect(report.status).toBe("FAIL");
    expect(
      report.findings
        .filter((entry) => !entry.pass)
        .map((entry) => entry.predicateId),
    ).toEqual([
      "frame-hash-deterministic",
      "audio-duration",
      "reduced-motion",
      "adobe-readback",
    ]);
  });

  it("fails malformed scenes and rejects unknown runtime predicate IDs", () => {
    const malformed = verifyMotionScene(
      { schema: "scene-spec-v1", injected: true },
      { context: context() },
    );
    expect(malformed.status).toBe("FAIL");
    expect(malformed.findings.every((entry) => !entry.pass)).toBe(true);
    expect(() =>
      verifyMotionScene(fixtureSpec, {
        requestedPredicateIds: ["shell.exec" as never],
        context: context(),
      }),
    ).toThrow("UNKNOWN_MOTION_PREDICATE");
    expect(() =>
      verifyMotionScene(fixtureSpec, { attempts: 5, context: context() }),
    ).toThrow("INVALID_VERIFICATION_ATTEMPTS");
  });

  it("reports unsupported kinds, unresolved assets, external URLs, timing and readback mismatches", () => {
    const first = fixtureSpec.beats[0]!;
    const scene = {
      ...fixtureSpec,
      assets: [
        { ...fixtureSpec.assets[0]!, ref: "https://evil.invalid/a" },
        ...fixtureSpec.assets.slice(1),
      ],
      beats: [
        {
          ...first,
          elements: [
            {
              ...first.elements[0]!,
              kind: "video" as const,
              assetRef: "missing",
              keyframes: [{ frame: 500, ease: "linear" as const }],
            },
          ],
        },
        ...fixtureSpec.beats.slice(1),
      ],
    };
    const report = verifyMotionScene(scene, {
      requestedPredicateIds: [
        "keyframe-timing",
        "element-kind-capability",
        "adobe-readback",
      ],
      context: context({
        adobeReadback: {
          expectedDigest: "a".repeat(64),
          observedDigest: "b".repeat(64),
        },
      }),
    });
    expect(report.status).toBe("FAIL");
    expect(
      report.findings
        .filter((entry) => !entry.pass)
        .map((entry) => entry.predicateId),
    ).toEqual([
      "asset-resolvable",
      "no-external-url",
      "keyframe-timing",
      "element-kind-capability",
      "adobe-readback",
    ]);
  });

  it("reports beat, frame-hash, audio, and reduced-motion mismatches", () => {
    const scene = {
      ...fixtureSpec,
      beats: [
        fixtureSpec.beats[0]!,
        { ...fixtureSpec.beats[1]!, startFrame: 201 },
        fixtureSpec.beats[2]!,
      ],
    };
    const report = verifyMotionScene(scene, {
      requestedPredicateIds: [
        "beat-tiling",
        "frame-hash-deterministic",
        "audio-duration",
        "reduced-motion",
      ],
      context: context({
        frameHashes: [["a".repeat(64)], ["b".repeat(64)]],
        audioDuration: {
          observedSeconds: 9,
          expectedSeconds: 10,
          toleranceSeconds: 0.01,
        },
        reducedMotion: { required: true, observed: false },
      }),
    });
    expect(
      report.findings
        .filter((entry) => !entry.pass)
        .map((entry) => entry.predicateId),
    ).toEqual([
      "beat-tiling",
      "frame-hash-deterministic",
      "audio-duration",
      "reduced-motion",
    ]);
  });

  it("rejects embedded case-insensitive URL tokens and keyframes at the exclusive beat end", () => {
    const first = fixtureSpec.beats[0]!;
    const scene = {
      ...fixtureSpec,
      beats: [
        {
          ...first,
          elements: [
            {
              ...first.elements[0]!,
              content: "ordinary prose before HtTpS://evil.invalid/path after",
              keyframes: [{ frame: first.endFrame, ease: "linear" as const }],
            },
          ],
        },
        ...fixtureSpec.beats.slice(1),
      ],
    };
    const report = verifyMotionScene(scene, {
      requestedPredicateIds: ["keyframe-timing"],
      context: context(),
    });
    expect(
      report.findings
        .filter((entry) => !entry.pass)
        .map((entry) => entry.predicateId),
    ).toEqual(["no-external-url", "keyframe-timing"]);
  });

  it("preserves ordinary prose that does not contain a URL token", () => {
    const first = fixtureSpec.beats[0]!;
    const scene = {
      ...fixtureSpec,
      beats: [
        {
          ...first,
          elements: [
            {
              ...first.elements[0]!,
              content: "HTTPS is a protocol, but this is not a URL.",
            },
          ],
        },
        ...fixtureSpec.beats.slice(1),
      ],
    };
    expect(verifyMotionScene(scene, { context: context() }).status).toBe(
      "PASS",
    );
  });
});
