import { describe, expect, it } from "vitest";
import {
  compileStageRows,
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
  stageLabelKey,
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
      progressPhase: "prepare",
      progressStage: "preview-render",
      progressFraction: 0.48,
      framesProcessed: 58,
      framesTotal: 120,
      approvedGates: ["T1", "T2"],
    });
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

  it("maps gate ids, decisions, and job states to translation keys", () => {
    expect(gateLabelKey("T1")).toBe("workerPreflight");
    expect(gateLabelKey("T5")).toBe("deliveryVerified");
    expect(decisionKey("APPROVED")).toBe("verified");
    expect(decisionKey("REJECTED")).toBe("failed");
    expect(decisionKey("PENDING")).toBe("pending");
    expect(jobStateKey("READY")).toBe("ready");
    expect(jobStateKey("SOME_FUTURE_STATE")).toBe("SOME_FUTURE_STATE");
  });

  it("builds an ordered checklist from the current prepare-phase stage", () => {
    const job = parseJobProgress({
      id: "job_1",
      state: "PREPARING",
      preparationStage: "COMPILATION_RUNNING",
      progress: {
        phase: "prepare",
        stage: "compiler:all-frame-analysis",
        fraction: 0.6,
      },
      approvedGates: [],
    });
    const rows = compileStageRows(job);
    expect(rows.map((row) => row.key)).toEqual([
      "download",
      "ffprobe",
      "normalize",
      "preflight",
      "models",
      "all-frame-analysis",
      "audio-and-mapping",
      "evidence",
    ]);
    const active = rows.find((row) => row.key === "all-frame-analysis");
    expect(active).toMatchObject({ status: "active", percent: 60 });
    expect(rows.find((row) => row.key === "download")).toMatchObject({
      status: "done",
      percent: 100,
    });
    expect(rows.find((row) => row.key === "evidence")).toMatchObject({
      status: "pending",
      percent: 0,
    });
  });

  it("builds the render-phase checklist and degrades gracefully for an unrecognized stage", () => {
    const renderJob = parseJobProgress({
      id: "job_2",
      state: "RENDERING",
      preparationStage: "READY",
      progress: { phase: "render", stage: "scene-render", fraction: 0.5 },
      approvedGates: [],
    });
    expect(compileStageRows(renderJob).map((row) => row.key)).toEqual([
      "scene-render",
      "upload",
    ]);
    const unknownJob = parseJobProgress({
      id: "job_3",
      state: "PREPARING",
      preparationStage: "AWAITING_T1",
      progress: { phase: "prepare", stage: "something-new", fraction: 0.3 },
      approvedGates: [],
    });
    expect(compileStageRows(unknownJob)).toEqual([
      {
        key: "something-new",
        labelKey: { known: false, fallback: "Something New" },
        percent: 30,
        status: "active",
      },
    ]);
  });
});

describe("live stage checklist visibility", () => {
  it("goes quiet once preparation finishes, even though READY is not terminal", () => {
    expect(isTerminalJobState("READY")).toBe(false);
    expect(isJobWorking("READY")).toBe(false);
    expect(isJobWorking("AWAITING_T5")).toBe(false);
    expect(isJobWorking("PREPARING")).toBe(true);
    expect(isJobWorking("RENDERING")).toBe(true);
    expect(isJobWorking("ASSEMBLING")).toBe(true);
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
    expect(nextStepKey(at("READY", ["T1", "T2", "T3", "T4"]))).toBe("readyToRender");
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
    const ko = (await import("../messages/ko-KR.json", { with: { type: "json" } })).default;
    const en = (await import("../messages/en-US.json", { with: { type: "json" } })).default;
    const states = [
      "PREPARING", "READY", "QUEUED", "RENDERING", "ASSEMBLING", "AWAITING_T5",
      "COMPLETED", "CANCELLED", "FAILED", "RETRYABLE_ERROR", "STALE_APPROVAL",
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
