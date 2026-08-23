import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { authenticateAdminBearer, type AuthStore, type Principal } from "./auth.js"
import { safeEnvelope } from "./boundary.js"

export type AdminTenant = { readonly id: string; readonly name: string; readonly status: string; readonly plan: string; readonly used: number; readonly limit: number; readonly createdAt: string }
export type AdminJob = { readonly id: string; readonly tenantId: string; readonly state: string; readonly attempt: number; readonly creatorId: string; readonly createdAt: string; readonly privatePath?: string }
export type AdminReceipt = { readonly id: string; readonly tenantId: string; readonly jobId: string; readonly gate: string; readonly decision: string; readonly actorId: string; readonly predecessorId: string | null; readonly createdAt: string; readonly artifactPath?: string }
export type AdminAudit = { readonly id: string; readonly tenantId: string | null; readonly jobId?: string; readonly actorId: string; readonly eventType: string; readonly authorization: string; readonly correlationId: string; readonly outcome: string; readonly createdAt: string; readonly rawBytes?: Uint8Array; readonly privatePath?: string }
export type AdminQuarantine = { readonly id: string; readonly tenantId: string; readonly state: string; readonly declaredType: string; readonly magicBytes: string; readonly containerParse: string; readonly reason: string; readonly createdAt: string; readonly rawBytes?: Uint8Array; readonly privatePath?: string }
export type AdminBilling = { readonly tenantId: string; readonly plan: string; readonly billingStatus: string; readonly used: number; readonly limit: number; readonly resetAt: string; readonly renewalAt: string; readonly paymentMethod?: unknown }
export type AdminReadStore = { readonly tenants: readonly AdminTenant[]; readonly jobs: readonly AdminJob[]; readonly receipts: readonly AdminReceipt[]; readonly audit: AdminAudit[]; readonly quarantine: readonly AdminQuarantine[]; readonly billing: readonly AdminBilling[]; readonly recordAudit?: AuthStore["audit"]; readonly queryCount?: { value: number } }
type Query = { readonly tenantId?: string; readonly state?: string; readonly status?: string; readonly plan?: string; readonly eventType?: string; readonly jobId?: string; readonly actorId?: string; readonly outcome?: string; readonly reason?: string; readonly after?: string; readonly limit?: string; readonly include?: string; readonly fields?: string }
const role = (principal: Principal): string => principal.roles[0]?.toUpperCase().replace("-", "_") ?? ""
const page = <T>(items: readonly T[], query: Query): { readonly items: readonly T[]; readonly nextCursor: string | null } => {
  const limit = query.limit === undefined ? 50 : Number(query.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("INVALID_REQUEST")
  const after = typeof query.after === "string" && query.after.length > 0 ? query.after : undefined
  const start = after === undefined ? 0 : Number.parseInt(after, 10)
  if (!Number.isInteger(start) || start < 0 || (after !== undefined && String(start) !== after)) throw new Error("CURSOR_INVALID")
  const selected = items.slice(start, start + limit)
  return { items: selected, nextCursor: start + selected.length < items.length ? String(start + selected.length) : null }
}
const fail = (reply: FastifyReply, error: unknown): void => { const code = error instanceof Error ? error.message : "INTERNAL_ERROR"; reply.code(code === "ADMIN_ACCESS_DENIED" || code === "ROLE_NOT_PERMITTED" ? 403 : code === "RESOURCE_NOT_FOUND" ? 404 : 400).send(safeEnvelope(new Error(code), String(reply.getHeader("x-correlation-id")))) }
const visibleReceipt = (item: AdminReceipt): Omit<AdminReceipt, "artifactPath"> => { const { artifactPath: _path, ...safe } = item; return safe }
const visibleQuarantine = (item: AdminQuarantine): Omit<AdminQuarantine, "rawBytes" | "privatePath"> => { const { rawBytes: _bytes, privatePath: _path, ...safe } = item; return safe }
const visibleBilling = (item: AdminBilling): Record<string, unknown> => ({ tenantId: item.tenantId, plan: item.plan, billingStatus: item.billingStatus, quota: { used: item.used, limit: item.limit, resetAt: item.resetAt }, renewalAt: item.renewalAt, paymentMethod: { type: "REDACTED" } })

export function registerAdminRead(app: FastifyInstance, auth: AuthStore, store: AdminReadStore, now = Date.now()): void {
  app.addHook("onRequest", async (request, reply) => { if (!request.url.startsWith("/admin/")) return; const raw = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : ""; const principal = authenticateAdminBearer(auth, raw, now); if ("code" in principal) { auth.audit({ action: "ADMIN_ACCESS_DENIED", userId: "unknown", tenantId: null, decision: "DENIED" }); fail(reply, new Error(principal.code)) } else (request as FastifyRequest & { adminPrincipal?: Principal }).adminPrincipal = principal })
  const handler = async (request: FastifyRequest<{ Params?: { id?: string; tenantId?: string }; Querystring: Query }>, reply: FastifyReply): Promise<void> => {
    try {
      const principal = (request as FastifyRequest & { adminPrincipal?: Principal }).adminPrincipal
      if (!principal) throw new Error("ADMIN_ACCESS_DENIED")
      const query = request.query ?? {}
      if ([query.include, query.fields].some((value) => typeof value === "string" && /payment|rawBytes|privatePath|artifactPath|stack/i.test(value))) { auth.audit({ action: "ADMIN_SENSITIVE_FIELD_DENIED", userId: principal.userId, tenantId: null, decision: "DENIED" }); throw new Error("ADMIN_ACCESS_DENIED") }
      if (store.queryCount) store.queryCount.value += 1
      const visibleTenants = new Set(role(principal) === "SUPER_ADMIN" ? store.tenants.map((tenant) => tenant.id) : auth.assignments.filter((assignment) => assignment.reviewerId === principal.userId && assignment.scope === "TENANT" && assignment.tenantId !== null).map((assignment) => assignment.tenantId as string)); const pathUrl = (request.url ?? "").split("?")[0] ?? ""; const requested = request.params?.id ?? request.params?.tenantId ?? pathUrl.match(/^\/admin\/tenants\/([^/]+)/)?.[1] ?? pathUrl.match(/^\/admin\/billing\/([^/]+)/)?.[1]
      if (role(principal) !== "SUPER_ADMIN" && visibleTenants.size === 0) throw new Error("ROLE_NOT_PERMITTED")
      if (requested && !visibleTenants.has(requested)) throw new Error("RESOURCE_NOT_FOUND")
      const allowed = (tenantId: string): boolean => visibleTenants.has(tenantId)
      const path = (request.url ?? "").split("?")[0] ?? ""
      if (path === "/admin/tenants") { const items = store.tenants.filter((item) => visibleTenants.has(item.id) && (!query.status || item.status === query.status) && (!query.plan || item.plan === query.plan)).map((item) => ({ id: item.id, name: item.name, status: item.status, plan: item.plan, activeJobs: store.jobs.filter((job) => job.tenantId === item.id && ["QUEUED", "PREPARING", "RENDERING"].includes(job.state)).length, quota: { used: item.used, limit: item.limit }, createdAt: item.createdAt })); auth.audit({ action: "TENANT_VIEWED", userId: principal.userId, tenantId: null, decision: "ALLOWED" }); reply.send(page(items, query)); return }
      if (path.startsWith("/admin/tenants/") && path.endsWith("/jobs")) { const items = store.jobs.filter((item) => item.tenantId === requested && (!query.state || item.state === query.state)).map(({ privatePath: _path, ...safe }) => safe); auth.audit({ action: "TENANT_VIEWED", userId: principal.userId, tenantId: requested ?? null, decision: "ALLOWED" }); reply.send({ tenantId: requested, ...page(items, query) }); return }
      if (path === "/admin/receipts") { const items = store.receipts.filter((item) => allowed(item.tenantId) && (!query.tenantId || item.tenantId === query.tenantId) && (!query.jobId || item.jobId === query.jobId) && (!query.eventType || item.gate === query.eventType)).map(visibleReceipt); auth.audit({ action: "RECEIPT_CHAIN_VIEWED", userId: principal.userId, tenantId: query.tenantId ?? null, decision: "ALLOWED" }); reply.send(page(items, query)); return }
      if (path === "/admin/audit-log") { const items = store.audit.filter((item) => (item.tenantId === null || allowed(item.tenantId)) && (!query.tenantId || item.tenantId === query.tenantId) && (!query.actorId || item.actorId === query.actorId) && (!query.eventType || item.eventType === query.eventType) && (!query.jobId || item.jobId === query.jobId) && (!query.outcome || item.outcome === query.outcome)).map(({ rawBytes: _bytes, privatePath: _path, ...safe }) => safe); auth.audit({ action: "AUDIT_LOG_VIEWED", userId: principal.userId, tenantId: query.tenantId ?? null, decision: "ALLOWED" }); reply.send(page(items, query)); return }
      if (path === "/admin/quarantine") { const items = store.quarantine.filter((item) => allowed(item.tenantId) && (!query.tenantId || item.tenantId === query.tenantId) && (!query.state || item.state === query.state) && (!query.reason || item.reason === query.reason)).map(visibleQuarantine); auth.audit({ action: "QUARANTINE_VIEWED", userId: principal.userId, tenantId: query.tenantId ?? null, decision: "ALLOWED" }); reply.send(page(items, query)); return }
      if (path.startsWith("/admin/billing/")) { const item = store.billing.find((candidate) => candidate.tenantId === requested); if (!item) throw new Error("RESOURCE_NOT_FOUND"); auth.audit({ action: "BILLING_METADATA_VIEWED", userId: principal.userId, tenantId: requested ?? null, decision: "ALLOWED" }); reply.send(visibleBilling(item)); return }
      throw new Error("RESOURCE_NOT_FOUND")
    } catch (error) { fail(reply, error) }
  }
  app.get("/admin/tenants", handler); app.get("/admin/tenants/:id/jobs", handler); app.get("/admin/receipts", handler); app.get("/admin/audit-log", handler); app.get("/admin/quarantine", handler); app.get("/admin/billing/:tenantId", handler)
}
