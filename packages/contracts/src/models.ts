import { z } from "zod"
import { ApiTokenId, ArtifactId, AttemptId, AuthoringIRVersionId, BrowserPassSpecVersionId, CasObjectId, CredentialId, EvidenceId, ExportId, JobId, LeaseId, ReceiptId, ReviewId, SceneId, SceneIRVersionId, SessionId, TenantId, UploadId, UserId } from "./ids.js"
import { CredentialKinds, GateNames, ReceiptDecisions, ReviewStatuses, RoleSchema, ScopeKindSchema, TenantKinds, TenantStatuses, UploadStates } from "./enums.js"
import { JobStateSchema } from "./lifecycle.js"
import { AuthoringIRSchema, BrowserPassSpecSchema, EvidenceSchema, SceneIRSchema } from "./ir.js"

const Timestamp = z.iso.datetime({ offset: true })
const NullableTimestamp = Timestamp.nullable()
const TenantRef = z.object({ tenantId: TenantId })
export const TenantSchema = z.object({ id: TenantId, name: z.string().min(1), kind: z.enum(TenantKinds), status: z.enum(TenantStatuses), deletionEpoch: z.number().int().nonnegative(), createdAt: Timestamp })
export const UserSchema = z.object({ id: UserId, email: z.email(), displayName: z.string().min(1), createdAt: Timestamp })
export const CredentialSchema = z.object({ id: CredentialId, userId: UserId, kind: z.enum(CredentialKinds), secretHash: z.string().min(1), createdAt: Timestamp, revokedAt: NullableTimestamp })
export const SessionSchema = TenantRef.extend({ id: SessionId, userId: UserId, expiresAt: Timestamp, revokedAt: NullableTimestamp, createdAt: Timestamp })
export const ApiTokenSchema = TenantRef.extend({ id: ApiTokenId, userId: UserId, tokenHash: z.string().min(1), expiresAt: Timestamp, revokedAt: NullableTimestamp, createdAt: Timestamp })
export const MembershipSchema = TenantRef.extend({ userId: UserId, role: RoleSchema, createdAt: Timestamp })
export const ReviewerAssignmentSchema = z.object({ id: ReviewId, tenantId: TenantId.nullable(), reviewerId: UserId, gate: z.enum(GateNames), scope: ScopeKindSchema, createdAt: Timestamp })
export const CasObjectSchema = TenantRef.extend({ id: CasObjectId, sha256: z.string().regex(/^[a-f0-9]{64}$/), contentType: z.string().min(1), sizeBytes: z.number().int().nonnegative(), purpose: z.string().min(1), retentionUntil: Timestamp })
export const UploadSchema = TenantRef.extend({ id: UploadId, filename: z.string().min(1), contentType: z.literal("video/mp4"), sizeBytes: z.number().int().nonnegative(), state: z.enum(UploadStates), casObjectId: CasObjectId.nullable(), createdAt: Timestamp, expiresAt: Timestamp })
export const AttemptSchema = TenantRef.extend({ id: AttemptId, jobId: JobId, number: z.number().int().positive(), state: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]), createdAt: Timestamp })
export const LeaseSchema = TenantRef.extend({ id: LeaseId, jobId: JobId, attemptId: AttemptId, workerId: z.string().min(1), acquiredAt: Timestamp, expiresAt: Timestamp, releasedAt: NullableTimestamp })
export const JobModelSchema = TenantRef.extend({ id: JobId, creatorId: UserId, uploadId: UploadId, sceneId: SceneId, state: JobStateSchema, attempt: z.number().int().nonnegative(), deletionEpoch: z.number().int().nonnegative(), createdAt: Timestamp })
export const ReviewSchema = TenantRef.extend({ id: ReviewId, jobId: JobId, gate: z.enum(GateNames), status: z.enum(ReviewStatuses), createdAt: Timestamp })
export const ReceiptSchema = TenantRef.extend({ id: ReceiptId, jobId: JobId, attemptId: AttemptId, sequence: z.number().int().positive(), gate: z.enum(GateNames), decision: z.enum(ReceiptDecisions), actorId: UserId, predecessorId: ReceiptId.nullable(), artifactCasIds: z.array(CasObjectId), createdAt: Timestamp })
export const AuditEventSchema = z.object({ id: ReceiptId, tenantId: TenantId.nullable(), actorId: UserId, action: z.string().min(1), targetType: z.string().min(1), targetId: z.string().min(1), decision: z.string().min(1), correlationId: z.string().regex(/^cor_[A-Za-z0-9-]+$/), createdAt: Timestamp })
export const QuotaSchema = TenantRef.extend({ plan: z.string().min(1), limitSeconds: z.number().int().nonnegative(), usedSeconds: z.number().int().nonnegative(), enforcementState: z.enum(["ENFORCED", "GRACE"]), supportGrantExpiresAt: NullableTimestamp })
export const IdempotencyKeySchema = TenantRef.extend({ key: z.string().min(1).max(255), requestHash: z.string().min(1), responseJson: z.string(), createdAt: Timestamp })
export const ExportSchema = TenantRef.extend({ id: ExportId, requestedBy: UserId, state: z.enum(["QUEUED", "READY", "EXPIRED", "FAILED"]), createdAt: Timestamp })
export const ArtifactSchema = TenantRef.extend({ id: ArtifactId, exportId: ExportId.nullable(), casObjectId: CasObjectId, kind: z.string().min(1), createdAt: Timestamp })
export const AuthoringIRVersionSchema = TenantRef.extend({ id: AuthoringIRVersionId, sceneId: SceneId, version: z.number().int().positive(), ir: AuthoringIRSchema, createdAt: Timestamp })
export const SceneIRVersionSchema = TenantRef.extend({ id: SceneIRVersionId, sceneId: SceneId, version: z.number().int().positive(), ir: SceneIRSchema, createdAt: Timestamp })
export const BrowserPassSpecVersionSchema = TenantRef.extend({ id: BrowserPassSpecVersionId, sceneId: SceneId, version: z.number().int().positive(), spec: BrowserPassSpecSchema, createdAt: Timestamp })
export const EvidenceModelSchema = EvidenceSchema.extend({ id: EvidenceId })
export const CoreModelSchemas = { TenantSchema, UserSchema, CredentialSchema, SessionSchema, ApiTokenSchema, MembershipSchema, ReviewerAssignmentSchema, UploadSchema, CasObjectSchema, JobModelSchema, AttemptSchema, LeaseSchema, ReviewSchema, ReceiptSchema, AuditEventSchema, QuotaSchema, IdempotencyKeySchema, ExportSchema, ArtifactSchema, AuthoringIRVersionSchema, SceneIRVersionSchema, BrowserPassSpecVersionSchema, EvidenceModelSchema } as const
export type Tenant = z.infer<typeof TenantSchema>
export type User = z.infer<typeof UserSchema>
