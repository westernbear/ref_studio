import { CreatorShell, EmptySurface, AdminShell } from "../../components/Shells"
import { JobQueue } from "../../components/JobQueue"
import { AdminDashboard } from "../../components/AdminDashboard"
import { TenantDirectory } from "../../components/TenantDirectory"
import { ReceiptChain } from "../../components/ReceiptChain"
import { QuarantineReview } from "../../components/QuarantineReview"
import { AuditLog } from "../../components/AuditLog"

const publicPages: Record<string, readonly [string, string]> = {
  workflow: ["Workflow", "Build a reference from temporal evidence and deterministic browser renders."],
  docs: ["Docs", "Generated OpenAPI: /docs/openapi.json and /docs/openapi.yaml."],
  support: ["Support", "For bounded pilot support, review the workflow guide or contact your workspace administrator."],
  api: ["API", "API status is available at /health. OpenAPI links: /docs/openapi.json and /docs/openapi.yaml."],
  legal: ["Legal", "REF_STUDIO is a bounded reference-video engineering pilot."],
  privacy: ["Privacy", "Upload processing is scoped to your authenticated workspace and retained according to the project policy."],
  settings: ["Settings", "Workspace settings require an authenticated session."],
  "projects/new": ["New Project", "Sign in to upload a reference video."],
  "projects/new/upload": ["Upload Project", "Authenticated upload intake is ready."],
  "sign-in": ["Sign In", "Sign in to continue to your requested workspace destination."],
}

export default async function StaticDestination({ params }: { readonly params: Promise<{ readonly slug: string[] }> }) {
  const { slug } = await params
  const key = slug.join("/")
  if (key === "admin/jobs") return <JobQueue />
  if (key === "admin/tenants") return <AdminShell><TenantDirectory /></AdminShell>
  if (key === "admin/receipts") return <AdminShell><ReceiptChain /></AdminShell>
  if (key === "admin/quarantine") return <AdminShell><QuarantineReview /></AdminShell>
  if (key === "admin/audit") return <AdminShell><AuditLog /></AdminShell>
  if (key === "admin") return <AdminShell><AdminDashboard /></AdminShell>
  const [title, description] = publicPages[key] ?? ["Reference Video Studio", "This bounded destination is not available."]
  if (key.startsWith("admin")) return <AdminShell><EmptySurface title={title} description={description} /></AdminShell>
  return <CreatorShell><EmptySurface title={title} description={description} /></CreatorShell>
}
