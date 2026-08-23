import { describe, expect, it } from "vitest";
import {
  formatJobStamp,
  isTerminalJobState,
  liveJobStatusError,
  jobProgressPercent,
  parseJobProgress,
} from "../src/lib/job-progress.ts";

describe("compiler progress projection", () => {
  it("parses live job payloads without static progress data", () => {
    expect(
      parseJobProgress({
        id: "job_123",
        state: "PREPARING",
        attempt: 2,
        createdAt: "2026-08-23T07:00:00.000Z",
        updatedAt: "2026-08-23T07:01:00.000Z",
        artifact: { id: "art_1" },
      }),
    ).toEqual({
      id: "job_123",
      state: "PREPARING",
      attempt: 2,
      createdAt: "2026-08-23T07:00:00.000Z",
      updatedAt: "2026-08-23T07:01:00.000Z",
      artifactId: "art_1",
    });
  });

  it("maps job lifecycle states to stable progress", () => {
    expect(jobProgressPercent("PREPARING")).toBe(35);
    expect(jobProgressPercent("RENDERING")).toBe(72);
    expect(jobProgressPercent("COMPLETED")).toBe(100);
    expect(isTerminalJobState("COMPLETED")).toBe(true);
    expect(isTerminalJobState("PREPARING")).toBe(false);
    expect(formatJobStamp("2026-08-23T07:00:00.000Z")).toBe(
      "2026-08-23 07:00:00",
    );
  });

  it("shows live status API error codes instead of a generic failure", () => {
    expect(
      liveJobStatusError({ error: { code: "CSRF_ORIGIN_INVALID" } }, 403),
    ).toBe("Live job status is unavailable: CSRF_ORIGIN_INVALID.");
    expect(liveJobStatusError(null, 502)).toBe(
      "Live job status is unavailable: HTTP_502.",
    );
  });
});
