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
  parseJobProgress,
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
