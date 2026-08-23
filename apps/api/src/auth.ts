import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import type { ErrorCode } from "../../../packages/contracts/src/errors.js"

export type AuthFailure = { readonly code: Extract<ErrorCode, "AUTHENTICATION_REQUIRED" | "CSRF_REQUIRED" | "CSRF_ORIGIN_INVALID" | "TENANT_HEADER_FORBIDDEN" | "TENANT_BOUNDARY_BYPASS" | "ROLE_NOT_PERMITTED"> }
export type User = { readonly id: string; readonly email: string }
export type Principal = { readonly userId: string; readonly tenantId: string; readonly roles: readonly string[]; readonly capabilities: readonly string[]; readonly sessionId?: string; readonly releaseReviewer: boolean }
export type Credential = { readonly userId: string; readonly secretHash: string; readonly kind: "PASSWORD" | "SERVICE"; readonly revokedAt: string | null }
export type Membership = { readonly userId: string; readonly tenantId: string; readonly role: string }
export type Assignment = { readonly reviewerId: string; readonly tenantId: string | null; readonly gate: string; readonly scope: "TENANT" | "RELEASE" }
export type Session = { readonly id: string; readonly userId: string; readonly tenantId: string; readonly expiresAt: number; revokedAt: number | null }
export type ApiToken = { readonly id: string; readonly userId: string; readonly tenantId: string; readonly tokenHash: string; readonly expiresAt: number; revokedAt: number | null }

export const SAFE_LOGIN_ERROR = "AUTHENTICATION_REQUIRED" as const
const IDLE_MS = 30 * 60 * 1000
const hash = (value: string): string => createHash("sha256").update(value).digest("hex")
export const hashBearer = hash
export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string { return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}` }
export function verifyPassword(password: string, encoded: string): boolean {
  const [, salt, expected] = encoded.split("$")
  if (!salt || !expected) return false
  const actual = scryptSync(password, salt, 32).toString("hex")
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

export interface AuthStore {
  readonly credentials: readonly Credential[]
  readonly users: readonly User[]
  readonly memberships: readonly Membership[]
  readonly assignments: readonly Assignment[]
  readonly sessions: Session[]
  readonly apiTokens: ApiToken[]
  readonly audit: (event: { readonly action: string; readonly userId: string; readonly tenantId: string | null; readonly decision: string }) => void
}
export function signIn(store: AuthStore, email: string, password: string, now = Date.now()): { readonly session: Session | null; readonly error: typeof SAFE_LOGIN_ERROR | null } {
  const user = store.users.find((item) => item.email === email)
  const credential = store.credentials.find((item) => item.kind === "PASSWORD" && item.revokedAt === null && item.userId === user?.id)
  const valid = credential !== undefined && verifyPassword(password, credential.secretHash)
  if (!valid) return { session: null, error: SAFE_LOGIN_ERROR }
  const membership = store.memberships.find((item) => item.userId === credential.userId)
  if (!membership) return { session: null, error: SAFE_LOGIN_ERROR }
  const session = { id: randomBytes(24).toString("base64url"), userId: credential.userId, tenantId: membership.tenantId, expiresAt: now + IDLE_MS, revokedAt: null }
  store.sessions.push(session)
  return { session, error: null }
}
export function revokeSession(store: AuthStore, id: string, now = Date.now()): void { const session = store.sessions.find((item) => item.id === id); if (session) { session.revokedAt = now } }
export function rotateSessionTenant(store: AuthStore, id: string, tenantId: string, now = Date.now()): Session | AuthFailure {
  const session = store.sessions.find((item) => item.id === id && item.revokedAt === null && item.expiresAt > now)
  const member = session && store.memberships.some((item) => item.userId === session.userId && item.tenantId === tenantId)
  if (!session || !member) return { code: "TENANT_BOUNDARY_BYPASS" }
  session.revokedAt = now
  const rotated = { id: randomBytes(24).toString("base64url"), userId: session.userId, tenantId, expiresAt: now + IDLE_MS, revokedAt: null }
  store.sessions.push(rotated)
  return rotated
}
export const sessionCookie = (id: string): string => `rvs_session=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`
export const clearSessionCookie = (): string => "rvs_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
export function authenticateBearer(store: AuthStore, raw: string, tenantId: string | undefined, now = Date.now()): Principal | AuthFailure {
  const token = store.apiTokens.find((item) => item.tokenHash === hash(raw) && item.revokedAt === null && item.expiresAt > now)
  if (!token) return { code: "AUTHENTICATION_REQUIRED" }
  if (!tenantId || token.tenantId !== tenantId) { store.audit({ action: "AUTH_TENANT_DENIED", userId: token.userId, tenantId: tenantId ?? null, decision: "DENIED" }); return { code: "TENANT_BOUNDARY_BYPASS" } }
  const membership = store.memberships.find((item) => item.userId === token.userId && item.tenantId === token.tenantId)
  if (!membership) return { code: "AUTHENTICATION_REQUIRED" }
  return principal(store, token.userId, token.tenantId)
}
export function authenticateAdminBearer(store: AuthStore, raw: string, now = Date.now()): Principal | AuthFailure {
  const token = store.apiTokens.find((item) => item.tokenHash === hash(raw) && item.revokedAt === null && item.expiresAt > now)
  if (!token) return { code: "AUTHENTICATION_REQUIRED" }
  const membership = store.memberships.find((item) => item.userId === token.userId && ["SUPER_ADMIN", "OPS_ADMIN", "VIEWER", "super-admin", "ops-admin", "viewer"].includes(item.role))
  if (!membership) return { code: "ROLE_NOT_PERMITTED" }
  return principal(store, token.userId, membership.tenantId)
}
export function authenticateReleaseBearer(store: AuthStore, raw: string, now = Date.now()): Principal | AuthFailure {
  const token = store.apiTokens.find((item) => item.tokenHash === hash(raw) && item.revokedAt === null && item.expiresAt > now)
  if (!token) return { code: "AUTHENTICATION_REQUIRED" }
  return principal(store, token.userId, token.tenantId)
}
export function authenticateSession(store: AuthStore, id: string, csrf: string | undefined, origin: string | undefined, expectedOrigin: string, now = Date.now()): Principal | AuthFailure {
  if (!csrf) return { code: "CSRF_REQUIRED" }
  if (origin !== expectedOrigin) return { code: "CSRF_ORIGIN_INVALID" }
  const session = store.sessions.find((item) => item.id === id && item.revokedAt === null)
  if (!session || session.expiresAt <= now) return { code: "AUTHENTICATION_REQUIRED" }
  return principal(store, session.userId, session.tenantId, session.id)
}
function principal(store: AuthStore, userId: string, tenantId: string, sessionId?: string): Principal {
  const membership = store.memberships.find((item) => item.userId === userId && item.tenantId === tenantId)
  const roles = membership ? [membership.role] : []
  const releaseReviewer = store.assignments.some((item) => item.reviewerId === userId && item.tenantId === null && item.gate === "T6" && item.scope === "RELEASE")
  return { userId, tenantId, roles, capabilities: releaseReviewer ? ["RELEASE_REVIEW"] : [], ...(sessionId ? { sessionId } : {}), releaseReviewer }
}
export function authorizeReleaseReview(store: AuthStore, principalValue: Principal, tenantHeader: string | undefined): AuthFailure | null {
  if (tenantHeader) { store.audit({ action: "RELEASE_TENANT_HEADER", userId: principalValue.userId, tenantId: tenantHeader, decision: "DENIED" }); return { code: "TENANT_HEADER_FORBIDDEN" } }
  return principalValue.releaseReviewer ? null : { code: "ROLE_NOT_PERMITTED" }
}
