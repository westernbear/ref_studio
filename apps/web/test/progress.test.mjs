import { describe, expect, it } from "vitest";
import {
  decisionKey,
  formatJobStamp,
  gateLabelKey,
  isJobWorking,
  isTerminalJobState,
  jobActivityPercent,
  jobProgressPercent,
  jobStateKey,
  jobStatusMessage,
  liveJobStatusErrorCode,
  nextApprovalGate,
  nextStepKey,
  parseJobProgress,
  runningStageIndex,
  progressStages,
  shotLabelKey,
  stageLabelKey,
  thinkingPhaseFor,
} from "../src/lib/job-progress.ts";

describe("compiler progress projection", () => {
  it("parses live job payloads without static progress data", () => {
    expect(
      parseJobProgress({
        id: "job_123",
        state: "PREPARING",
        preparationStage: "PREVIEW_RUNNING",
        attempt: 2,
        updatedAt: "2026-08-23T07:01:00.000Z",
        artifact: { id: "art_1" },
        progress: {
          phase: "prepare",
          stage: "preview-render",
          fraction: 0.48,
          framesProcessed: 58,
          framesTotal: 120,
        },
        approvedGates: ["T1", "T2"],
      }),
    ).toEqual({
      id: "job_123",
      state: "PREPARING",
      preparationStage: "PREVIEW_RUNNING",
      attempt: 2,
      updatedAt: "2026-08-23T07:01:00.000Z",
      artifactId: "art_1",
      previewArtifactId: "",
      previewLabeledArtifactId: "",
      evidenceVideoArtifactId: "",
      failureCode: null,
      failureReason: null,
      progressPhase: "prepare",
      progressStage: "preview-render",
      progressFraction: 0.48,
      framesProcessed: 58,
      framesTotal: 120,
      approvedGates: ["T1", "T2"],
      beatSheet: null,
    });
  });

  it("parses a populated beat sheet and drops entries missing a beatId", () => {
    const job = parseJobProgress({
      id: "job_authored",
      state: "READY",
      beatSheet: [
        { beatId: "beat-open", shot: "push-in", words: "REF STUDIO" },
        { beatId: "beat-hero", shot: "hard-cut", words: "" },
        { shot: "type-flash", words: "dropped, no beatId" },
      ],
    });
    expect(job).not.toBeNull();
    expect(job?.beatSheet).toEqual([
      { beatId: "beat-open", shot: "push-in", words: "REF STUDIO" },
      { beatId: "beat-hero", shot: "hard-cut", words: "" },
    ]);
  });

  it("treats a missing or empty beat sheet as null", () => {
    expect(parseJobProgress({ id: "job_no_beats" })?.beatSheet).toBeNull();
    expect(
      parseJobProgress({ id: "job_empty_beats", beatSheet: [] })?.beatSheet,
    ).toBeNull();
  });

  it("keeps approval progress separate from worker activity", () => {
    const job = parseJobProgress({
      id: "job_123",
      state: "PREPARING",
      preparationStage: "COMPILATION_RUNNING",
      progress: { fraction: 0.48 },
      approvedGates: ["T1", "T2"],
    });
    expect(job).not.toBeNull();
    if (!job) throw new Error("job fixture did not parse");
    expect(jobProgressPercent(job)).toBe(40);
    expect(jobActivityPercent(job)).toBe(48);
    expect(jobStatusMessage(job)).toEqual({ key: "compilationRunning" });
    expect(isTerminalJobState("COMPLETED")).toBe(true);
    expect(isTerminalJobState("PREPARING")).toBe(false);
    expect(formatJobStamp("2026-08-23T07:00:00.000Z")).toBe(
      "2026-08-23 07:00:00",
    );
    expect(formatJobStamp("")).toBeNull();
    expect(progressStages.map((stage) => stage.state)).toContain("READY");
  });

  it("does not surface a manual T1 approval action", () => {
    const job = parseJobProgress({
      id: "job_123",
      state: "PREPARING",
      preparationStage: "AWAITING_T1",
      approvedGates: [],
    });
    expect(job).not.toBeNull();
    if (!job) throw new Error("job fixture did not parse");
    expect(nextApprovalGate(job)).toBeNull();
    expect(jobStatusMessage(job)).toEqual({ key: "awaitingT1" });
  });

  it("carries an interpolated stage name for active rendering/compiling", () => {
    const rendering = parseJobProgress({
      id: "job_r",
      state: "RENDERING",
      preparationStage: "",
      progress: { phase: "render", stage: "scene-render", fraction: 0.5 },
      approvedGates: [],
    });
    expect(jobStatusMessage(rendering)).toEqual({
      key: "rendererActive",
      values: { stage: "scene-render" },
    });
  });

  it("returns a content-safety failure key distinct from a plain failure", () => {
    const safetyFailed = parseJobProgress({
      id: "job_s",
      state: "FAILED",
      failureCode: "CONTENT_SAFETY_REJECTED",
      approvedGates: [],
    });
    expect(jobStatusMessage(safetyFailed)).toEqual({ key: "failedSafety" });
    const plainFailed = parseJobProgress({
      id: "job_p",
      state: "FAILED",
      approvedGates: [],
    });
    expect(jobStatusMessage(plainFailed)).toEqual({ key: "failed" });
  });

  it("shows live status API error codes instead of a generic failure", () => {
    expect(
      liveJobStatusErrorCode({ error: { code: "CSRF_ORIGIN_INVALID" } }, 403),
    ).toBe("CSRF_ORIGIN_INVALID");
    expect(liveJobStatusErrorCode(null, 502)).toBe("HTTP_502");
  });

  it("maps real compiler stage strings to a known key, or a title-cased fallback", () => {
    expect(stageLabelKey("all-frame-analysis")).toEqual({
      known: true,
      key: "allFrameAnalysis",
    });
    expect(stageLabelKey("totally-unknown-stage")).toEqual({
      known: false,
      fallback: "Totally Unknown Stage",
    });
    expect(stageLabelKey("")).toEqual({ known: false, fallback: "" });
  });

  // The chat edit loop (apps/api/src/refine-prompt.ts's applyScenePatch)
  // sets job.progress.stage to this exact string the instant a scene patch
  // is accepted -- known here so the stage log reads as a real step, not an
  // unrecognized fallback.
  it("maps the scene-patch stage to a known key", () => {
    expect(stageLabelKey("scene-patch")).toEqual({
      known: true,
      key: "scenePatch",
    });
  });

  it("maps SceneSpec shot names to a known key, or a title-cased fallback", () => {
    expect(shotLabelKey("push-in")).toEqual({ known: true, key: "pushIn" });
    expect(shotLabelKey("tile-grid")).toEqual({ known: true, key: "tileGrid" });
    expect(shotLabelKey("some-future-shot")).toEqual({
      known: false,
      fallback: "Some Future Shot",
    });
  });

  it("maps gate ids, decisions, and job states to translation keys", () => {
    expect(gateLabelKey("T1")).toBe("workerPreflight");
    expect(gateLabelKey("T5")).toBe("deliveryVerified");
    expect(decisionKey("APPROVED")).toBe("verified");
    expect(decisionKey("REJECTED")).toBe("failed");
    expect(decisionKey("PENDING")).toBe("pending");
    expect(jobStateKey("READY")).toBe("ready");
    expect(jobStateKey("SOME_FUTURE_STATE")).toBe("SOME_FUTURE_STATE");
  });

  it("goes quiet once preparation finishes, even though READY is not terminal", () => {
    expect(isTerminalJobState("READY")).toBe(false);
    expect(isJobWorking("READY")).toBe(false);
    expect(isJobWorking("AWAITING_T5")).toBe(false);
    expect(isJobWorking("PREPARING")).toBe(true);
    expect(isJobWorking("RENDERING")).toBe(true);
    expect(isJobWorking("ASSEMBLING")).toBe(true);
  });
});

describe("a generate-track job on its way through authoring and material generation", () => {
  it("shows an honest status while authoring is actually running", () => {
    const running = parseJobProgress({
      id: "job_authoring",
      state: "PREPARING",
      preparationStage: "AUTHORING_RUNNING",
      progress: { phase: "prepare", stage: "authoring", fraction: 0 },
      approvedGates: [],
    });
    expect(jobStatusMessage(running)).toEqual({
      key: "compilerActive",
      values: { stage: "authoring" },
    });
  });

  it("moves on to material generation instead of parking, once authoring finishes", () => {
    // workers.ts clears progress and sets ASSETS_QUEUED the moment the scene
    // is authored, so the status line must speak for the new stage rather
    // than the finished one.
    const queued = parseJobProgress({
      id: "job_assets",
      state: "PREPARING",
      preparationStage: "ASSETS_QUEUED",
      progress: null,
      approvedGates: [],
    });
    expect(jobStatusMessage(queued)).toEqual({ key: "assetsQueued" });
    // Still ordinary in-flight work: nothing here is a terminal waypoint.
    expect(nextStepKey(queued)).toBe("building");
  });

  it("names the assets stage the worker actually reports", () => {
    const running = parseJobProgress({
      id: "job_assets_running",
      state: "PREPARING",
      preparationStage: "ASSETS_RUNNING",
      progress: { phase: "prepare", stage: "scene-assets", fraction: 0.2 },
      approvedGates: [],
    });
    expect(jobStatusMessage(running)).toEqual({
      key: "compilerActive",
      values: { stage: "scene-assets" },
    });
  });

  it("resolves JobStatus keys for every generate-track stage in both catalogues", async () => {
    const ko = (
      await import("../messages/ko-KR.json", { with: { type: "json" } })
    ).default;
    const en = (
      await import("../messages/en-US.json", { with: { type: "json" } })
    ).default;
    for (const stage of [
      "AUTHORING_QUEUED",
      "AUTHORING_RUNNING",
      "ASSETS_QUEUED",
      "ASSETS_RUNNING",
    ]) {
      const job = parseJobProgress({
        id: "job_x",
        state: "PREPARING",
        preparationStage: stage,
        progress: null,
        approvedGates: [],
      });
      const key = jobStatusMessage(job).key;
      expect(ko.JobStatus[key], `ko-KR JobStatus.${key}`).toBeTruthy();
      expect(en.JobStatus[key], `en-US JobStatus.${key}`).toBeTruthy();
    }
  });

  it("labels the worker's scene-assets stage in both catalogues", async () => {
    const ko = (
      await import("../messages/ko-KR.json", { with: { type: "json" } })
    ).default;
    const en = (
      await import("../messages/en-US.json", { with: { type: "json" } })
    ).default;
    expect(ko.StageLabels.sceneAssets).toBeTruthy();
    expect(en.StageLabels.sceneAssets).toBeTruthy();
  });
});

describe("which accumulated stage message is running", () => {
  const log = ["system", "stage", "stage", "user", "stage"];

  it("marks only the last stage, not every message naming the same one", () => {
    // A retry sends the job back through a stage it has already logged, so the
    // same stage sits in the chat twice; matching on the stage name lit both.
    expect(runningStageIndex(log, "normalize")).toBe(4);
  });

  it("marks nothing once progress is cleared", () => {
    // A retry nulls the job's progress before the next stage reports.
    expect(runningStageIndex(log, "")).toBe(-1);
  });

  it("marks nothing when no stage has been logged yet", () => {
    expect(runningStageIndex(["system"], "download")).toBe(-1);
  });
});

describe("what to do next", () => {
  const at = (state, gates = []) => ({ state, approvedGates: gates });

  it("asks for the render once the rebuild has passed its checks", () => {
    expect(nextStepKey(at("READY", ["T1", "T2", "T3", "T4"]))).toBe(
      "readyToRender",
    );
  });

  it("does not ask for it while the checks are still running", () => {
    expect(nextStepKey(at("READY", ["T1", "T2"]))).toBe("verifying");
  });

  it("says work is under way for every state a worker is busy in", () => {
    expect(nextStepKey(at("PREPARING"))).toBe("building");
    for (const state of ["QUEUED", "RENDERING", "ASSEMBLING"])
      expect(nextStepKey(at(state))).toBe("buildingFinal");
  });

  it("points at the delivery when there is one, and at a fresh start when there is not", () => {
    expect(nextStepKey(at("COMPLETED"))).toBe("collectDelivery");
    expect(nextStepKey(at("FAILED"))).toBe("startOver");
    expect(nextStepKey(at("CANCELLED"))).toBe("startOver");
  });
});

describe("every next step has words in both catalogues", () => {
  it("resolves each key nextStepKey can return", async () => {
    const ko = (
      await import("../messages/ko-KR.json", { with: { type: "json" } })
    ).default;
    const en = (
      await import("../messages/en-US.json", { with: { type: "json" } })
    ).default;
    const states = [
      "PREPARING",
      "READY",
      "QUEUED",
      "RENDERING",
      "ASSEMBLING",
      "AWAITING_T5",
      "COMPLETED",
      "CANCELLED",
      "FAILED",
      "RETRYABLE_ERROR",
      "STALE_APPROVAL",
    ];
    const keys = new Set(
      states.flatMap((state) => [
        nextStepKey({ state, approvedGates: [] }),
        nextStepKey({ state, approvedGates: ["T4"] }),
      ]),
    );
    for (const key of keys) {
      expect(ko.NextStep[key], `ko-KR NextStep.${key}`).toBeTruthy();
      expect(en.NextStep[key], `en-US NextStep.${key}`).toBeTruthy();
    }
  });
});

describe("chat thinking phase", () => {
  const job = (state, preparationStage = "") => ({ state, preparationStage });

  it("shows the patch phase while a chat note is in flight", () => {
    expect(thinkingPhaseFor(job("RENDERING"), true)).toBe("patching");
  });
  it("shows the authoring phase while the model writes the scene", () => {
    expect(thinkingPhaseFor(job("PREPARING", "AUTHORING_RUNNING"), false)).toBe(
      "authoring",
    );
    expect(thinkingPhaseFor(job("PREPARING", "AUTHORING_QUEUED"), false)).toBe(
      "authoring",
    );
  });
  it("shows the compiling phase for every other working state", () => {
    expect(thinkingPhaseFor(job("PREPARING", "ASSETS_RUNNING"), false)).toBe(
      "compiling",
    );
    expect(thinkingPhaseFor(job("RENDERING"), false)).toBe("compiling");
    expect(thinkingPhaseFor(job("ASSEMBLING"), false)).toBe("compiling");
  });
  it("goes quiet when nothing is running", () => {
    expect(thinkingPhaseFor(job("READY"), false)).toBeNull();
    expect(thinkingPhaseFor(job("AWAITING_T5"), false)).toBeNull();
    expect(thinkingPhaseFor(job("COMPLETED"), false)).toBeNull();
  });
});
