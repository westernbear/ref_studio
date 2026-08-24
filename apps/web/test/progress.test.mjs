import { describe, expect, it } from "vitest";
import {
  formatJobStamp,
  isTerminalJobState,
  liveJobStatusError,
  jobActivityPercent,
  jobProgressPercent,
  jobStatusCopy,
  parseJobProgress,
  progressStages,
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

  it("shows live status API error codes instead of a generic failure", () => {
    expect(
      liveJobStatusError({ error: { code: "CSRF_ORIGIN_INVALID" } }, 403),
    ).toBe("Job status update failed: CSRF_ORIGIN_INVALID. Retrying.");
    expect(liveJobStatusError(null, 502)).toBe(
      "Job status update failed: HTTP_502. Retrying.",
    );
  });
});
