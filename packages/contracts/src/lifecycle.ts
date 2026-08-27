import { z } from "zod";

export const JobStates = [
  "PREPARING",
  "READY",
  "QUEUED",
  "RENDERING",
  "ASSEMBLING",
  "AWAITING_T5",
  "COMPLETED",
  "STALE_APPROVAL",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "RETRYABLE_ERROR",
  "FAILED",
] as const;
export const JobStateSchema = z.enum(JobStates);
export type JobState = z.infer<typeof JobStateSchema>;
export const RetryClasses = [
  "TRANSIENT_WORKER",
  "TRANSIENT_UPLOAD",
  "VALIDATION",
  "STALE_APPROVAL",
  "NON_RETRYABLE",
] as const;
export const RetryClassSchema = z.enum(RetryClasses);
export type RetryClass = z.infer<typeof RetryClassSchema>;
export const transitions: Readonly<Record<JobState, readonly JobState[]>> = {
  PREPARING: ["READY", "CANCEL_REQUESTED", "FAILED"],
  READY: ["QUEUED", "STALE_APPROVAL", "FAILED"],
  STALE_APPROVAL: ["READY", "FAILED"],
  QUEUED: ["RENDERING", "CANCEL_REQUESTED", "FAILED"],
  RENDERING: ["ASSEMBLING", "CANCEL_REQUESTED", "RETRYABLE_ERROR", "FAILED"],
  ASSEMBLING: ["AWAITING_T5", "RETRYABLE_ERROR", "FAILED"],
  AWAITING_T5: ["COMPLETED", "FAILED", "STALE_APPROVAL"],
  CANCEL_REQUESTED: ["CANCELLED", "FAILED"],
  RETRYABLE_ERROR: ["PREPARING", "QUEUED", "FAILED"],
  // Otherwise terminal, but a generate-track job's scene can still be
  // patched from chat after delivery: the amended scene has to go back
  // through the same render, which re-enters exactly where a fresh delivery
  // would (QUEUED -> RENDERING -> ... -> COMPLETED again). See
  // apps/api/src/refine-prompt.ts.
  COMPLETED: ["QUEUED"],
  CANCELLED: [],
  FAILED: [],
};
export const isLegalTransition = (from: JobState, to: JobState): boolean =>
  transitions[from].includes(to);
export function assertLegalTransition(from: JobState, to: JobState): void {
  if (!isLegalTransition(from, to)) throw new Error("INVALID_JOB_TRANSITION");
}
export const ProgressSchema = z
  .object({
    approvedGateCount: z.number().int().nonnegative(),
    requiredGateCount: z.number().int().positive(),
    framesRendered: z.number().int().nonnegative(),
    framesTotal: z.number().int().positive(),
    phase: z.enum(["PREPARING", "RENDERING", "ASSEMBLING"]).optional(),
  })
  .refine(
    (v) =>
      v.approvedGateCount <= v.requiredGateCount &&
      v.framesRendered <= v.framesTotal,
  );
export type Progress = z.infer<typeof ProgressSchema>;
