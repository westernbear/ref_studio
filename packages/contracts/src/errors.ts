import { z } from "zod"

export const ErrorCodes = ["INVALID_REQUEST", "VIDEO_DURATION_OUT_OF_RANGE", "VIDEO_FPS_UNSUPPORTED", "VIDEO_SIZE_LIMIT_EXCEEDED", "VIDEO_TYPE_INVALID", "AUTHENTICATION_REQUIRED", "CSRF_REQUIRED", "CSRF_ORIGIN_INVALID", "TENANT_HEADER_FORBIDDEN", "TENANT_BOUNDARY_BYPASS", "ROLE_NOT_PERMITTED", "RESOURCE_NOT_FOUND", "STALE_APPROVAL_UNSAFE", "DELETION_EPOCH_STALE", "RECEIPT_IMMUTABLE", "UPLOAD_QUARANTINED", "OWNER_MISMATCH", "UNRESOLVED_CHOICE_SKIPPED", "TENANT_SUSPENDED", "QUOTA_EXCEEDED", "INTERNAL_ERROR", "RUNTIME_PREREQUISITE_MISSING", "WORKER_TRANSIENT_FAILURE", "INVALID_JOB_TRANSITION"] as const
export const ErrorCodeSchema = z.enum(ErrorCodes)
export type ErrorCode = z.infer<typeof ErrorCodeSchema>
export const SafeErrorSchema = z.object({ code: ErrorCodeSchema, message: z.string().min(1).max(240), correlationId: z.string().regex(/^cor_[A-Za-z0-9-]+$/), details: z.array(z.object({ field: z.string(), issue: z.string().max(160) })).default([]) }).strict()
export type SafeError = z.infer<typeof SafeErrorSchema>
export const ErrorEnvelopeSchema = z.object({ error: SafeErrorSchema }).strict()
export function normalizeError(error: unknown, correlationId: string): SafeError {
  if (error instanceof Error && ErrorCodeSchema.safeParse(error.message).success) return { code: error.message as ErrorCode, message: safeMessage(error.message as ErrorCode), correlationId, details: [] }
  return { code: "INTERNAL_ERROR", message: safeMessage("INTERNAL_ERROR"), correlationId, details: [] }
}
const safeMessage = (code: ErrorCode): string => code === "INTERNAL_ERROR" ? "Something went wrong. Try again later." : "The request could not be completed."
