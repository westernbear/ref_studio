import { z } from "zod";

export const ErrorCauseCategories = [
  "auth",
  "validation",
  "conflict",
  "quota",
  "capability",
  "verification",
  "media",
  "adobe",
  "network",
  "internal",
] as const;
export const ErrorCauseCategorySchema = z.enum(ErrorCauseCategories);
export type ErrorCauseCategory = z.infer<typeof ErrorCauseCategorySchema>;

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
  "ATTACHMENT_TYPE_INVALID",
  "ATTACHMENT_SIZE_LIMIT_EXCEEDED",
  "ATTACHMENT_COUNT_LIMIT_EXCEEDED",
  "ATTACHMENT_QUOTA_EXCEEDED",
  "AI_PROVIDER_NOT_CONFIGURED",
  "MATERIAL_PROVIDER_NOT_CONFIGURED",
  "MATERIAL_GENERATION_FAILED",
  "MOTION_AUTHORING_DISABLED",
  "MOTION_KNOWLEDGE_NOT_FOUND",
  "MOTION_CANARY_REQUIRED",
  "MOTION_CANARY_EXPIRED",
  "MOTION_CANARY_FAILED",
  "MOTION_PLAN_INVALID",
  "PLAN_ELEMENT_NOT_FOUND",
  "INVALID_OPERATION",
  "INVALID_SCENE",
  "VERSION_CONFLICT",
  "PRECONDITION_REQUIRED",
  "SCENE_VERIFICATION_FAILED",
  "AUTHORING_TIMEOUT",
  "AUTHORING_CANCELLED",
  "ASSET_REF_UNRESOLVED",
  "VIDEO_DECODE_UNSUPPORTED",
  "MEDIA_QC_FAILED",
  "PACKAGE_INTEGRITY_FAILED",
  "RENDER_CANCELLED",
  "BLENDER_BUDGET_EXCEEDED",
  "RESOURCE_BUDGET_EXCEEDED",
  "NETWORK_INTERRUPTED",
  "IDEMPOTENCY_CONFLICT",
  "ADOBE_DEVICE_NOT_FOUND",
  "ADOBE_COMMAND_NOT_FOUND",
  "ADOBE_COMMAND_REPLAY_MISMATCH",
  "ADOBE_RELAY_REQUEST_INVALID",
  "ADOBE_RELAY_TIMESTAMP_INVALID",
  "ADOBE_RELAY_KEY_INVALID",
  "ADOBE_RELAY_BODY_INVALID",
  "ADOBE_RELAY_SIGNATURE_INVALID",
  "ADOBE_RELAY_BINDING_REJECTED",
  "ADOBE_RELAY_REPLAY",
  "ADOBE_RELAY_RATE_LIMIT",
  "ADOBE_AE_READBACK_FAILED",
  "ADOBE_CRASH_RECOVERY",
  "INTERNAL_ERROR",
  "RUNTIME_PREREQUISITE_MISSING",
  "WORKER_TRANSIENT_FAILURE",
  "INVALID_JOB_TRANSITION",
] as const;
export const ErrorCodeSchema = z.enum(ErrorCodes);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const SafePredecessorSchema = z
  .object({
    sceneVersion: z.number().int().nonnegative().optional(),
    sceneDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    artifactId: z.string().min(1).max(120).optional(),
  })
  .strict();
export type SafePredecessor = z.infer<typeof SafePredecessorSchema>;

export const SafeErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(240),
    causeCategory: ErrorCauseCategorySchema,
    remediation: z.string().min(1).max(240),
    docsUrl: z.string().min(1).max(160),
    correlationId: z.string().regex(/^cor_[A-Za-z0-9-]+$/),
    details: z
      .array(z.object({ field: z.string(), issue: z.string().max(160) }))
      .default([]),
    safePredecessor: SafePredecessorSchema.optional(),
  })
  .strict();
export type SafeError = z.infer<typeof SafeErrorSchema>;

type ErrorCatalogEntry = Readonly<{
  message: string;
  causeCategory: ErrorCauseCategory;
  remediation: string;
}>;

const docsUrlFor = (code: ErrorCode): string => `/docs/errors#${code}`;

const DEFAULT_ENTRY: ErrorCatalogEntry = {
  message: "The request could not be completed.",
  causeCategory: "internal",
  remediation:
    "Retry once. If it fails again, contact support with the correlation ID.",
};

const CATALOG: Readonly<Partial<Record<ErrorCode, ErrorCatalogEntry>>> = {
  INTERNAL_ERROR: {
    message: "Something went wrong. Try again later.",
    causeCategory: "internal",
    remediation:
      "Retry later. If it persists, contact support with the correlation ID.",
  },
  INVALID_REQUEST: {
    message: "The request body or headers are invalid.",
    causeCategory: "validation",
    remediation: "Fix the highlighted fields and resubmit.",
  },
  VERSION_CONFLICT: {
    message: "The scene changed in another session.",
    causeCategory: "conflict",
    remediation: "Reload the current version, then retry your edit.",
  },
  PRECONDITION_REQUIRED: {
    message: "A current scene version precondition is required.",
    causeCategory: "conflict",
    remediation: "Send If-Match with the latest ETag and retry.",
  },
  SCENE_VERIFICATION_FAILED: {
    message: "Scene verification failed before publish.",
    causeCategory: "verification",
    remediation:
      "Review failed predicates, repair the scene, and retry within four attempts.",
  },
  IDEMPOTENCY_CONFLICT: {
    message: "This idempotency key was reused with a different request body.",
    causeCategory: "conflict",
    remediation: "Use a new Idempotency-Key for a changed request.",
  },
  MOTION_AUTHORING_DISABLED: {
    message: "Verified motion authoring is not accepting new changes.",
    causeCategory: "capability",
    remediation:
      "Use Native read-only views or enable verified authoring, then retry.",
  },
  MOTION_KNOWLEDGE_NOT_FOUND: {
    message: "No supported motion knowledge matched the brief.",
    causeCategory: "validation",
    remediation: "Edit the brief to use a supported domain term and retry.",
  },
  MOTION_CANARY_REQUIRED: {
    message: "Provider tool canary admission is required.",
    causeCategory: "capability",
    remediation:
      "Keep Native available; re-run canary after the provider is configured.",
  },
  MOTION_CANARY_EXPIRED: {
    message: "Provider tool canary admission has expired.",
    causeCategory: "capability",
    remediation: "Re-run the canary before exposing locked tools.",
  },
  MOTION_CANARY_FAILED: {
    message: "Provider tool canary admission failed.",
    causeCategory: "capability",
    remediation:
      "Fix the provider, re-run canary, and keep Adobe locked until it passes.",
  },
  MOTION_PLAN_INVALID: {
    message: "The motion plan failed schema or allowlist checks.",
    causeCategory: "validation",
    remediation: "Apply field remediations and regenerate the plan.",
  },
  PLAN_ELEMENT_NOT_FOUND: {
    message: "The plan references a missing element or card.",
    causeCategory: "validation",
    remediation: "Create a new plan that only references known elements.",
  },
  INVALID_OPERATION: {
    message: "That scene operation path is not allowed.",
    causeCategory: "validation",
    remediation: "Use an allowlisted JSON pointer for this backend.",
  },
  INVALID_SCENE: {
    message: "That change would make the scene invalid.",
    causeCategory: "validation",
    remediation: "The previous scene was kept. Adjust the edit and retry.",
  },
  AUTHORING_TIMEOUT: {
    message: "Authoring timed out before a safe scene was published.",
    causeCategory: "verification",
    remediation: "Keep the previous scene and explicitly retry authoring.",
  },
  AUTHORING_CANCELLED: {
    message: "Authoring was cancelled before publish.",
    causeCategory: "verification",
    remediation: "Keep the previous scene and explicitly retry when ready.",
  },
  ASSET_REF_UNRESOLVED: {
    message: "A required asset reference could not be resolved.",
    causeCategory: "validation",
    remediation: "Attach or approve the missing asset, then retry.",
  },
  VIDEO_DECODE_UNSUPPORTED: {
    message: "The video asset cannot be decoded by the pinned runtime.",
    causeCategory: "media",
    remediation: "Replace the asset with a supported codec or runtime.",
  },
  MEDIA_QC_FAILED: {
    message: "Media quality checks rejected the render output.",
    causeCategory: "media",
    remediation: "Correct codec, frame, or duration settings and rerender.",
  },
  PACKAGE_INTEGRITY_FAILED: {
    message: "The scene package failed integrity verification.",
    causeCategory: "verification",
    remediation:
      "Rebuild the full package; the previous package remains available.",
  },
  RENDER_CANCELLED: {
    message: "Rendering was cancelled.",
    causeCategory: "media",
    remediation: "Temporary files were removed; start an explicit rerender.",
  },
  BLENDER_BUDGET_EXCEEDED: {
    message: "The 3D asset exceeded the Blender resource budget.",
    causeCategory: "quota",
    remediation:
      "Simplify triangles, materials, or textures, or use Native 2D.",
  },
  RESOURCE_BUDGET_EXCEEDED: {
    message: "A resource budget was exceeded before mutation.",
    causeCategory: "quota",
    remediation:
      "Reduce scene size, operations, frames, or package bytes and retry.",
  },
  NETWORK_INTERRUPTED: {
    message: "The connection was interrupted.",
    causeCategory: "network",
    remediation:
      "Retry with the same idempotency key if the request was mutating.",
  },
  QUOTA_EXCEEDED: {
    message: "The tenant quota was exceeded.",
    causeCategory: "quota",
    remediation: "Free quota or ask an administrator to raise the limit.",
  },
  TENANT_BOUNDARY_BYPASS: {
    message: "Tenant ownership checks rejected the request.",
    causeCategory: "auth",
    remediation: "Use credentials and headers for the owning tenant only.",
  },
  ROLE_NOT_PERMITTED: {
    message: "The caller lacks the required capability.",
    causeCategory: "auth",
    remediation: "Switch to an authorized role or request access.",
  },
  AUTHENTICATION_REQUIRED: {
    message: "Authentication is required.",
    causeCategory: "auth",
    remediation: "Sign in and retry the request.",
  },
  ADOBE_RELAY_REPLAY: {
    message: "Adobe relay rejected a replayed nonce.",
    causeCategory: "adobe",
    remediation: "Send a fresh nonce and request ID for the enrolled device.",
  },
  ADOBE_COMMAND_REPLAY_MISMATCH: {
    message: "Adobe command replay did not match the terminal binding.",
    causeCategory: "adobe",
    remediation: "Do not reuse a command ID with a different nonce or digest.",
  },
  ADOBE_RELAY_SIGNATURE_INVALID: {
    message: "Adobe relay signature verification failed.",
    causeCategory: "adobe",
    remediation: "Re-enroll the device key and resign the canonical body.",
  },
  ADOBE_RELAY_RATE_LIMIT: {
    message: "Adobe relay rate limit was exceeded.",
    causeCategory: "adobe",
    remediation: "Wait for the rate window to reset, then retry.",
  },
  ADOBE_AE_READBACK_FAILED: {
    message: "After Effects readback failed for the command.",
    causeCategory: "adobe",
    remediation:
      "Inspect the working copy, then retry after manual verification.",
  },
  ADOBE_CRASH_RECOVERY: {
    message: "Adobe spool recovered after a crash or lease expiry.",
    causeCategory: "adobe",
    remediation: "Allow one serialized retry; do not force duplicate mutation.",
  },
  ADOBE_DEVICE_NOT_FOUND: {
    message: "The Adobe device enrollment was not found.",
    causeCategory: "adobe",
    remediation: "Enroll the device before sending relay commands.",
  },
  ADOBE_COMMAND_NOT_FOUND: {
    message: "The Adobe command was not found for this tenant.",
    causeCategory: "adobe",
    remediation: "Check the command ID or enqueue a new command.",
  },
  JOB_NOT_READY: {
    message: "The job is not ready for this action.",
    causeCategory: "conflict",
    remediation: "Wait for the current phase to finish, then retry.",
  },
  ARTIFACT_UNAVAILABLE: {
    message: "The requested artifact is unavailable.",
    causeCategory: "verification",
    remediation: "Rebuild or select a previously published artifact.",
  },
  CANCEL_REQUESTED: {
    message: "The operation was cancelled.",
    causeCategory: "verification",
    remediation:
      "The previous safe artifact remains; start a new explicit run.",
  },
};

const catalogEntry = (code: ErrorCode): ErrorCatalogEntry =>
  CATALOG[code] ?? DEFAULT_ENTRY;

export type NormalizeErrorOptions = Readonly<{
  details?: SafeError["details"];
  safePredecessor?: SafePredecessor;
}>;

export function normalizeError(
  error: unknown,
  correlationId: string,
  options: NormalizeErrorOptions = {},
): SafeError {
  const code =
    error instanceof Error && ErrorCodeSchema.safeParse(error.message).success
      ? (error.message as ErrorCode)
      : "INTERNAL_ERROR";
  const entry = catalogEntry(code);
  return {
    code,
    message: entry.message,
    causeCategory: entry.causeCategory,
    remediation: entry.remediation,
    docsUrl: docsUrlFor(code),
    correlationId,
    details: options.details ?? [],
    ...(options.safePredecessor
      ? { safePredecessor: options.safePredecessor }
      : {}),
  };
}
