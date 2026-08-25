import { describe, expect, it } from "vitest";
import {
  compileStageRows,
  formatJobStamp,
  isTerminalJobState,
  liveJobStatusError,
  jobActivityPercent,
  jobProgressPercent,
  jobStatusCopy,
  nextApprovalGate,
  parseJobProgress,
  progressStages,
  stageLabel,
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
    expect(jobStatusCopy(job)).toBe("Scene compilation is running.");
    expect(isTerminalJobState("COMPLETED")).toBe(true);
    expect(isTerminalJobState("PREPARING")).toBe(false);
    expect(formatJobStamp("2026-08-23T07:00:00.000Z")).toBe(
      "2026-08-23 07:00:00",
    );
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
    expect(jobStatusCopy(job)).toBe("Waiting for worker runtime preflight.");
  });

  it("shows live status API error codes instead of a generic failure", () => {
    expect(
      liveJobStatusError({ error: { code: "CSRF_ORIGIN_INVALID" } }, 403),
    ).toBe("Job status update failed: CSRF_ORIGIN_INVALID. Retrying.");
    expect(liveJobStatusError(null, 502)).toBe(
      "Job status update failed: HTTP_502. Retrying.",
    );
  });

  it("maps real compiler stage strings to friendly labels, not invented pass names", () => {
    expect(stageLabel("all-frame-analysis")).toBe("Frame Analysis");
    expect(stageLabel("totally-unknown-stage")).toBe("Totally Unknown Stage");
    expect(stageLabel("")).toBe("Preparing");
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
      { key: "something-new", label: "Something New", percent: 30, status: "active" },
    ]);
  });
});
