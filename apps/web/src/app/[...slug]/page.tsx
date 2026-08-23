import {
  AdminShell,
  CreatorShell,
  EmptySurface,
} from "../../components/Shells";

const publicPages: Record<string, readonly [string, string]> = {
  workflow: ["Workflow", "No live workflow is connected yet."],
  docs: ["Docs", "No live documentation page is connected yet."],
  support: ["Support", "No live support content is connected yet."],
  api: ["API", "No public API page is connected yet."],
  legal: ["Legal", "No legal content is connected yet."],
  privacy: ["Privacy", "No privacy content is connected yet."],
  settings: ["Settings", "No workspace settings page is connected yet."],
  "sign-in": [
    "Sign In",
    "Sign in to continue to your requested workspace destination.",
  ],
};
const adminPages: Record<string, string> = {
  admin: "Admin dashboard",
  "admin/audit": "Audit log",
  "admin/billing": "Billing",
  "admin/jobs": "Queue & Delivery",
  "admin/quarantine": "Quarantine",
  "admin/receipts": "Receipt chain",
  "admin/tenants": "Tenants",
};

export default async function StaticDestination({
  params,
}: {
  readonly params: Promise<{ readonly slug: string[] }>;
}) {
  const { slug } = await params;
  const key = slug.join("/");
  const adminTitle = adminPages[key];
  if (adminTitle)
    return (
      <AdminShell>
        <div className="admin-page">
          <EmptySurface
            title={adminTitle}
            description="No live records are connected for this page."
          />
        </div>
      </AdminShell>
    );
  const [title, description] = publicPages[key] ?? [
    "Reference Video Studio",
    "This bounded destination is not available.",
  ];
  if (key.startsWith("admin"))
    return (
      <AdminShell>
        <EmptySurface title={title} description={description} />
      </AdminShell>
    );
  return (
    <CreatorShell>
      <EmptySurface title={title} description={description} />
    </CreatorShell>
  );
}
