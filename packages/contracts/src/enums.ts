import { z } from "zod"

export const Roles = ["OWNER", "ADMIN", "MEMBER", "DESIGNATED_REVIEWER", "SUPER_ADMIN", "OPS_ADMIN", "VIEWER", "PLATFORM_OPERATOR", "PLATFORM_ADMIN"] as const
export const Capabilities = ["UPLOAD_CREATE", "JOB_CREATE", "JOB_READ", "JOB_CANCEL", "RECEIPT_READ", "REVIEW_WRITE", "MEMBER_MANAGE", "QUOTA_MANAGE", "RELEASE_REVIEW"] as const
export const ScopeKinds = ["TENANT", "PLATFORM", "RELEASE"] as const
export const TenantKinds = ["PLATFORM", "ORGANIZATION"] as const
export const TenantStatuses = ["ACTIVE", "DELETING", "DELETED"] as const
export const CredentialKinds = ["PASSWORD", "SERVICE"] as const
export const ReviewStatuses = ["PENDING", "APPROVED", "REJECTED"] as const
export const ReceiptDecisions = ["PASS", "FAIL", "NEEDS_CHOICE", "REJECT"] as const
export const RoleSchema = z.enum(Roles)
export const CapabilitySchema = z.enum(Capabilities)
export const ScopeKindSchema = z.enum(ScopeKinds)
export type Role = z.infer<typeof RoleSchema>
export type Capability = z.infer<typeof CapabilitySchema>
export type ScopeKind = z.infer<typeof ScopeKindSchema>
export const UploadStates = ["PENDING", "ACCEPTED", "QUARANTINED", "EXPIRED"] as const
export const ReviewDecisions = ["APPROVED", "REJECTED", "CHANGES_REQUESTED"] as const
export const GateNames = ["T1", "T2", "T3", "T4", "T5", "T6"] as const
