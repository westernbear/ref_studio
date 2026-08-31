// Every API refusal the new-project screen can receive, and the message key
// that explains it.
//
// Lifted out of the page so a test can hold it against the list of codes the
// job-creation path actually returns. Three times now a refusal has been
// added on the API side and reached the creator as the generic
// "requestFailed" -- "the request could not be completed, retry" -- for a
// condition retrying could never fix. A code missing here is not a cosmetic
// gap; it is the difference between "turn on the material generator" and a
// dead end.
export type ReasonKey =
  // Set by the screen itself, never by an API refusal.
  | "selectSource"
  | "onlyFormats"
  | "fileTooLarge"
  | "tooShort"
  | "uploadCanceled"
  | "accepted"
  | "jobCreated"
  // Everything below comes back from the API.
  | "videoTypeInvalid"
  | "videoSizeLimitExceeded"
  | "uploadQuarantined"
  | "mediaVfrUnsupported"
  | "mediaDurationInvalid"
  | "mediaIntervalInvalid"
  | "invalidRequest"
  | "tenantBoundaryBypass"
  | "resourceNotFound"
  | "networkInterrupted"
  | "attachmentTypeInvalid"
  | "attachmentSizeLimitExceeded"
  | "attachmentCountLimitExceeded"
  | "attachmentQuotaExceeded"
  | "aiProviderNotConfigured"
  | "materialProviderNotConfigured"
  | "motionAuthoringDisabled"
  | "requestFailed";

export const JOB_CREATE_REASONS: Readonly<Record<string, ReasonKey>> = {
  VIDEO_TYPE_INVALID: "videoTypeInvalid",
  VIDEO_SIZE_LIMIT_EXCEEDED: "videoSizeLimitExceeded",
  UPLOAD_QUARANTINED: "uploadQuarantined",
  MEDIA_VFR_UNSUPPORTED: "mediaVfrUnsupported",
  MEDIA_DURATION_INVALID: "mediaDurationInvalid",
  MEDIA_INTERVAL_INVALID: "mediaIntervalInvalid",
  INTERVAL_INVALID: "mediaIntervalInvalid",
  MOTION_AUTHORING_DISABLED: "motionAuthoringDisabled",
  INVALID_REQUEST: "invalidRequest",
  TENANT_BOUNDARY_BYPASS: "tenantBoundaryBypass",
  RESOURCE_NOT_FOUND: "resourceNotFound",
  NETWORK_INTERRUPTED: "networkInterrupted",
  // I1.3/I1.4: an attachment failure gets its own reason instead of falling
  // through to the generic "requestFailed" -- a rejected attachment used to
  // give no clue which of the several things that can go wrong with a
  // brand-asset upload actually happened.
  ATTACHMENT_TYPE_INVALID: "attachmentTypeInvalid",
  ATTACHMENT_SIZE_LIMIT_EXCEEDED: "attachmentSizeLimitExceeded",
  ATTACHMENT_COUNT_LIMIT_EXCEEDED: "attachmentCountLimitExceeded",
  ATTACHMENT_QUOTA_EXCEEDED: "attachmentQuotaExceeded",
  // The generate track's two prerequisites. Both are refused at creation
  // rather than ten minutes later, and both name a setting an operator can
  // go and change.
  AI_PROVIDER_NOT_CONFIGURED: "aiProviderNotConfigured",
  MATERIAL_PROVIDER_NOT_CONFIGURED: "materialProviderNotConfigured",
};

export const reasonKeyFor = (error: unknown): ReasonKey => {
  const code = error instanceof Error ? error.message : "NETWORK_INTERRUPTED";
  return JOB_CREATE_REASONS[code] ?? "requestFailed";
};
