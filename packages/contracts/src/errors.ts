import { z } from "zod";

export const ErrorCodes = [
  "INVALID_REQUEST",
  "VIDEO_DURATION_OUT_OF_RANGE",
  "VIDEO_FPS_UNSUPPORTED",
  "VIDEO_SIZE_LIMIT_EXCEEDED",
  "VIDEO_TYPE_INVALID",
  "AUTHENTICATION_REQUIRED",
  "CSRF_REQUIRED",
  "CSRF_ORIGIN_INVALID",
  "TENANT_HEADER_FORBIDDEN",
  "TENANT_BOUNDARY_BYPASS",
  "ROLE_NOT_PERMITTED",
  "RESOURCE_NOT_FOUND",
  "APPROVAL_REQUIRED",
  "ARTIFACT_UNAVAILABLE",
  "CANCEL_REQUESTED",
  "JOB_NOT_READY",
  "STALE_APPROVAL_UNSAFE",
  "DELETION_EPOCH_STALE",
  "RECEIPT_IMMUTABLE",
  "UPLOAD_QUARANTINED",
  "UPLOAD_RANGE_INVALID",
  "UPLOAD_INCOMPLETE",
  "UPLOAD_EXPIRED",
  "UPLOAD_NOT_ABORTABLE",
  "HASH_MISMATCH",
  "OWNER_MISMATCH",
  "CHOICE_NOT_CURRENT",
  "UNRESOLVED_CHOICE_SKIPPED",
  "TENANT_SUSPENDED",
  "QUOTA_EXCEEDED",
  // I1: these were thrown by uploads.ts's UploadFailure but were not in
  // this enum, so normalizeError's ErrorCodeSchema.safeParse always failed
  // for them and every attachment failure reached the client as a generic
  // INTERNAL_ERROR -- the specific reason never survived the trip through
  // safeEnvelope, no matter what the web client's own reason-key mapping
  // said.
  "ATTACHMENT_TYPE_INVALID",
  "ATTACHMENT_SIZE_LIMIT_EXCEEDED",
  "ATTACHMENT_COUNT_LIMIT_EXCEEDED",
  "ATTACHMENT_QUOTA_EXCEEDED",
  "INTERNAL_ERROR",
  "RUNTIME_PREREQUISITE_MISSING",
  "WORKER_TRANSIENT_FAILURE",
  "INVALID_JOB_TRANSITION",
] as const;
export const ErrorCodeSchema = z.enum(ErrorCodes);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export const SafeErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(240),
    correlationId: z.string().regex(/^cor_[A-Za-z0-9-]+$/),
    details: z
      .array(z.object({ field: z.string(), issue: z.string().max(160) }))
      .default([]),
  })
  .strict();
export type SafeError = z.infer<typeof SafeErrorSchema>;
export const ErrorEnvelopeSchema = z
  .object({ error: SafeErrorSchema })
  .strict();
export function normalizeError(
  error: unknown,
  correlationId: string,
): SafeError {
  if (
    error instanceof Error &&
    ErrorCodeSchema.safeParse(error.message).success
  )
    return {
      code: error.message as ErrorCode,
      message: safeMessage(error.message as ErrorCode),
      correlationId,
      details: [],
    };
  return {
    code: "INTERNAL_ERROR",
    message: safeMessage("INTERNAL_ERROR"),
    correlationId,
    details: [],
  };
}
const safeMessage = (code: ErrorCode): string =>
  code === "INTERNAL_ERROR"
    ? "Something went wrong. Try again later."
    : "The request could not be completed.";
