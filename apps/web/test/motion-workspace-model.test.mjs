import { fixtureSpec, sha256Hex } from "@rvs/contracts";
import { describe, expect, it } from "vitest";
import {
  clampSplitRatio,
  elementFrameState,
  moveElementOperations,
  optimisticScene,
  sceneIntegrity,
  scenePropertySupported,
  tabIndexForKey,
  workspaceViewState,
} from "../src/app/[locale]/scene-review/motion-workspace-model.ts";

const snapshot = {
  schema: "motion-scene-snapshot-v1",
  version: 1,
  sceneEtag: `"${sha256Hex(fixtureSpec)}"`,
  sceneDigest: sha256Hex(fixtureSpec),
  scene: fixtureSpec,
  history: [
    {
      version: 1,
      sceneDigest: sha256Hex(fixtureSpec),
      createdAt: "2026-08-29T00:00:00.000Z",
    },
  ],
  backendCapability: {
    schema: "backend-capability-snapshot-v1",
    backend: "native",
    capturedAt: "2026-08-29T00:00:00.000Z",
    capabilities: ["text", "shape", "x", "y", "uniform-scale", "opacity"],
  },
  verification: {
    schema: "verification-report-v1",
    sceneDigest: sha256Hex(fixtureSpec),
    attempts: 1,
    status: "PASS",
    findings: [],
  },
};

describe("motion workspace model", () => {
  it("clamps the splitter and preserves two percent keyboard steps", () => {
    expect(clampSplitRatio(12)).toBe(30);
    expect(clampSplitRatio(52)).toBe(52);
    expect(clampSplitRatio(91)).toBe(70);
  });

  it("uses APG keyboard semantics for two-tab controls", () => {
    expect(
      ["ArrowLeft", "ArrowRight", "Home", "End"].map((key) =>
        tabIndexForKey(key, 0, 1),
      ),
    ).toEqual([1, 1, 0, 1]);
    expect(
      ["ArrowLeft", "ArrowRight", "Home", "End"].map((key) =>
        tabIndexForKey(key, 1, 1),
      ),
    ).toEqual([0, 0, 0, 1]);
    expect(tabIndexForKey("Enter", 0, 1)).toBeNull();
  });

  it("builds the same versioned scene operations for direct canvas movement", () => {
    const element = fixtureSpec.beats[0]?.elements[0];
    expect(element).toBeDefined();
    expect(moveElementOperations(snapshot, 0, 0, 12, -6)).toEqual([
      {
        kind: "set",
        opId: "move-x-v1-b0-e0",
        path: "/beats/0/elements/0/box/x",
        value: element.box.x + 12,
        reason: "canvas direct manipulation",
      },
      {
        kind: "set",
        opId: "move-y-v1-b0-e0",
        path: "/beats/0/elements/0/box/y",
        value: element.box.y - 6,
        reason: "canvas direct manipulation",
      },
    ]);
  });

  it("evaluates the visible keyframe state at the selected frame", () => {
    const element = fixtureSpec.beats[0]?.elements[0];
    expect(element).toBeDefined();
    const frame = element.keyframes[0]?.frame ?? 0;
    expect(elementFrameState(element, frame)).toMatchObject({
      opacity: element.keyframes[0]?.opacity ?? 1,
      scale: element.keyframes[0]?.scale ?? 1,
      x: element.keyframes[0]?.x ?? 0,
      y: element.keyframes[0]?.y ?? 0,
    });
  });

  it("uses scaleX for a scene-spec-v2 canvas preview", () => {
    const source = fixtureSpec.beats[0]?.elements[0];
    expect(source).toBeDefined();
    const frame = source.keyframes[0]?.frame ?? 0;
    const v2Element = {
      ...source,
      anchor: { x: 0.5, y: 0.5 },
      keyframes: source.keyframes.map(
        ({ scale: ignoredScale, ...keyframe }) => ({
          ...keyframe,
          scaleX: 1.2,
          scaleY: 0.8,
        }),
      ),
    };
    expect(elementFrameState(v2Element, frame).scale).toBe(1.2);
  });

  it("keeps plan, artifact, capability, and predicate metadata bound to the scene snapshot", () => {
    expect(
      sceneIntegrity({
        ...snapshot,
        planDigest: "b".repeat(64),
        artifactDigest: "c".repeat(64),
        predicateIds: ["scene-spec"],
      }),
    ).toEqual({
      planDigest: "b".repeat(64),
      artifactDigest: "c".repeat(64),
      sceneDigest: sha256Hex(fixtureSpec),
      capabilities: snapshot.backendCapability.capabilities,
      predicateIds: ["scene-spec"],
    });
  });

  it("previews direct operations without changing immutable history", () => {
    const next = optimisticScene(
      snapshot,
      moveElementOperations(snapshot, 0, 0, 12, -6),
    );
    expect(next.scene.beats[0].elements[0].box.x).toBe(
      snapshot.scene.beats[0].elements[0].box.x + 12,
    );
    expect(next.history).toBe(snapshot.history);
    expect(snapshot.scene.beats[0].elements[0].box.x).toBe(
      fixtureSpec.beats[0].elements[0].box.x,
    );
  });

  it("gates every inspector property by its advertised capability", () => {
    const capabilities = ["text", "x", "opacity", "uniform-scale"];
    expect(
      [
        "content",
        "x",
        "y",
        "width",
        "height",
        "scale",
        "opacity",
        "easing",
      ].map((property) => scenePropertySupported(capabilities, property)),
    ).toEqual([true, true, false, false, false, true, true, false]);
  });

  it.each([
    [{ online: false }, "offline"],
    [{ errorCode: "VERSION_CONFLICT" }, "conflict"],
    [{ busy: true }, "loading"],
    [{ state: "CANCELLED" }, "cancelled"],
    [{ state: "RENDERING", progressFraction: 0.4 }, "running"],
    [{ state: "QUEUED" }, "queued"],
    [{ scene: { ...snapshot, scene: { ...fixtureSpec, beats: [] } } }, "empty"],
    [
      {
        scene: {
          ...snapshot,
          backendCapability: {
            ...snapshot.backendCapability,
            capabilities: [],
          },
        },
      },
      "unsupported",
    ],
    [
      {
        scene: {
          ...snapshot,
          verification: {
            ...snapshot.verification,
            status: "FAIL",
            findings: [
              {
                predicateId: "scene-spec",
                pass: false,
                target: "scene",
                observed: "invalid",
                expected: "valid",
                remediation: "repair scene",
              },
            ],
          },
        },
      },
      "repair",
    ],
    [{ state: "COMPLETED", deliverableCount: 0 }, "partial"],
    [{ state: "COMPLETED", deliverableCount: 1 }, "success"],
    [{ errorCode: "INVALID_RESPONSE" }, "error"],
    [{}, "initial"],
  ])("classifies the visible workspace state %#", (overrides, expected) => {
    expect(
      workspaceViewState({
        state: "READY",
        progressFraction: 0,
        busy: false,
        online: true,
        errorCode: null,
        scene: snapshot,
        deliverableCount: 0,
        ...overrides,
      }),
    ).toBe(expected);
  });
});
