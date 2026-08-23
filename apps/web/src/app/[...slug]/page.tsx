import type { ReactNode } from "react";
import {
  AdminShell,
  CreatorShell,
  EmptySurface,
} from "../../components/Shells";
import { Panel } from "../../components/Primitives";
import {
  field,
  isAuthProblem,
  items,
  liveApiGet,
  text,
  when,
  type ApiResult,
} from "../../lib/server-api";

type Column = {
  readonly label: string;
  readonly value: (row: unknown) => ReactNode;
};

const publicPages: Record<string, readonly [string, string]> = {
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

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

function PageTitle({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Table({
  columns,
  empty,
  rows,
}: {
  readonly columns: readonly Column[];
  readonly empty: string;
  readonly rows: readonly unknown[];
}) {
  if (rows.length === 0) return <p className="empty-copy">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="live-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${text(field(row, "id"), "row")}-${index}`}>
              {columns.map((column) => (
                <td key={column.label}>{column.value(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IdCell({
  row,
  label,
}: {
  readonly row: unknown;
  readonly label: string;
}) {
  return (
    <span className="id-cell">
      <strong>{text(field(row, label))}</strong>
      <small>{text(field(row, "id"))}</small>
    </span>
  );
}

function ProblemPanel({
  admin,
  code,
  title,
}: {
  readonly admin: boolean;
  readonly code: string;
  readonly title: string;
}) {
  const href = `${admin ? "/admin/sign-in" : "/sign-in"}?returnTo=${encodeURIComponent(
    admin ? "/admin" : "/workflow",
  )}`;
  return (
    <Panel>
      <h1>{title}</h1>
      <p>
        {isAuthProblem(code)
          ? admin
            ? "Admin sign-in required."
            : "Sign in to view workflow jobs."
          : `Live records are unavailable: ${code}.`}
      </p>
      {isAuthProblem(code) ? (
        <a className="button button-primary" href={href}>
          Sign in
        </a>
      ) : null}
    </Panel>
  );
}

function AdminView({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <AdminShell>
      <div className="admin-page live-stack">
        <PageTitle title={title} description={description} />
        {children}
      </div>
    </AdminShell>
  );
}

function AdminProblem({
  code,
  title,
}: {
  readonly code: string;
  readonly title: string;
}) {
  return (
    <AdminShell>
      <div className="admin-page">
        <ProblemPanel admin code={code} title={title} />
      </div>
    </AdminShell>
  );
}

const tenantColumns: readonly Column[] = [
  { label: "Tenant", value: (row) => <IdCell row={row} label="name" /> },
  { label: "Status", value: (row) => text(field(row, "status")) },
  { label: "Plan", value: (row) => text(field(row, "plan")) },
  { label: "Active jobs", value: (row) => text(field(row, "activeJobs"), "0") },
  {
    label: "Quota",
    value: (row) =>
      `${text(field(field(row, "quota"), "used"), "0")} / ${text(
        field(field(row, "quota"), "limit"),
        "0",
      )}`,
  },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const jobColumns: readonly Column[] = [
  {
    label: "Job",
    value: (row) => (
      <a
        href={`/scene-review?jobId=${encodeURIComponent(text(field(row, "id")))}`}
      >
        {text(field(row, "id"))}
      </a>
    ),
  },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "State", value: (row) => text(field(row, "state")) },
  { label: "Attempt", value: (row) => text(field(row, "attempt"), "0") },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const receiptColumns: readonly Column[] = [
  { label: "Receipt", value: (row) => <IdCell row={row} label="id" /> },
  { label: "Job", value: (row) => text(field(row, "jobId")) },
  { label: "Gate", value: (row) => text(field(row, "gate")) },
  { label: "Decision", value: (row) => text(field(row, "decision")) },
  { label: "Actor", value: (row) => text(field(row, "actorId")) },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const quarantineColumns: readonly Column[] = [
  { label: "Upload", value: (row) => <IdCell row={row} label="id" /> },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "State", value: (row) => text(field(row, "state")) },
  { label: "Declared type", value: (row) => text(field(row, "declaredType")) },
  { label: "Reason", value: (row) => text(field(row, "reason")) },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const auditColumns: readonly Column[] = [
  { label: "Event", value: (row) => <IdCell row={row} label="eventType" /> },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "Actor", value: (row) => text(field(row, "actorId")) },
  { label: "Outcome", value: (row) => text(field(row, "outcome")) },
  { label: "Correlation", value: (row) => text(field(row, "correlationId")) },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const billingColumns: readonly Column[] = [
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "Plan", value: (row) => text(field(row, "plan")) },
  { label: "Status", value: (row) => text(field(row, "billingStatus")) },
  {
    label: "Quota",
    value: (row) =>
      `${text(field(field(row, "quota"), "used"), "0")} / ${text(
        field(field(row, "quota"), "limit"),
        "0",
      )}`,
  },
  { label: "Renewal", value: (row) => text(field(row, "renewalAt")) },
];

async function tenantRows(): Promise<ApiResult> {
  const result = await liveApiGet("/admin/tenants");
  return result.ok
    ? { ok: true, body: items(result.body) }
    : { ok: false, code: result.code };
}

async function renderTenants(title: string, dashboard = false) {
  const result = await tenantRows();
  if (!result.ok) return <AdminProblem code={result.code} title={title} />;
  const rows = Array.isArray(result.body) ? result.body : [];
  const activeJobs = rows.reduce(
    (total, row) => total + count(field(row, "activeJobs")),
    0,
  );
  return (
    <AdminView
      title={title}
      description={
        dashboard
          ? "Live platform tenants and queue pressure."
          : "Live tenants loaded from the admin API."
      }
    >
      {dashboard ? (
        <dl className="metric-grid">
          <div>
            <dt>Tenants</dt>
            <dd>{rows.length}</dd>
          </div>
          <div>
            <dt>Active jobs</dt>
            <dd>{activeJobs}</dd>
          </div>
        </dl>
      ) : null}
      <Panel>
        <Table
          columns={tenantColumns}
          empty="No live tenants are available."
          rows={rows}
        />
      </Panel>
    </AdminView>
  );
}

async function renderJobs(title: string) {
  const tenantResult = await tenantRows();
  if (!tenantResult.ok)
    return <AdminProblem code={tenantResult.code} title={title} />;
  const tenants = Array.isArray(tenantResult.body) ? tenantResult.body : [];
  const jobResults = await Promise.all(
    tenants.map((tenant) =>
      liveApiGet(
        `/admin/tenants/${encodeURIComponent(text(field(tenant, "id")))}/jobs`,
      ),
    ),
  );
  const failed = jobResults.find((result) => !result.ok);
  if (failed && !failed.ok)
    return <AdminProblem code={failed.code} title={title} />;
  const rows = jobResults.flatMap((result) =>
    result.ok ? [...items(result.body)] : [],
  );
  return (
    <AdminView
      title={title}
      description="Live compiler queue and delivery state."
    >
      <Panel>
        <Table
          columns={jobColumns}
          empty="No compiler jobs have been created yet."
          rows={rows}
        />
      </Panel>
    </AdminView>
  );
}

async function renderAdminList(
  title: string,
  path: string,
  columns: readonly Column[],
  empty: string,
) {
  const result = await liveApiGet(path);
  if (!result.ok) return <AdminProblem code={result.code} title={title} />;
  return (
    <AdminView
      title={title}
      description="Live records loaded from the admin API."
    >
      <Panel>
        <Table columns={columns} empty={empty} rows={items(result.body)} />
      </Panel>
    </AdminView>
  );
}

async function renderBilling(title: string) {
  const tenantResult = await tenantRows();
  if (!tenantResult.ok)
    return <AdminProblem code={tenantResult.code} title={title} />;
  const tenants = Array.isArray(tenantResult.body) ? tenantResult.body : [];
  const billingResults = await Promise.all(
    tenants.map((tenant) =>
      liveApiGet(
        `/admin/billing/${encodeURIComponent(text(field(tenant, "id")))}`,
      ),
    ),
  );
  const rows = billingResults.flatMap((result) =>
    result.ok ? [result.body] : [],
  );
  return (
    <AdminView title={title} description="Live quota and billing metadata.">
      <Panel>
        <Table
          columns={billingColumns}
          empty="No live billing records are available."
          rows={rows}
        />
      </Panel>
    </AdminView>
  );
}

async function renderAdmin(key: string, title: string) {
  if (key === "admin") return renderTenants(title, true);
  if (key === "admin/tenants") return renderTenants(title);
  if (key === "admin/jobs") return renderJobs(title);
  if (key === "admin/billing") return renderBilling(title);
  if (key === "admin/receipts")
    return renderAdminList(
      title,
      "/admin/receipts",
      receiptColumns,
      "No live receipts have been created yet.",
    );
  if (key === "admin/quarantine")
    return renderAdminList(
      title,
      "/admin/quarantine",
      quarantineColumns,
      "No quarantined uploads are present.",
    );
  return renderAdminList(
    title,
    "/admin/audit-log",
    auditColumns,
    "No live audit events are available.",
  );
}

async function renderWorkflow() {
  const result = await liveApiGet("/v1/jobs");
  if (!result.ok)
    return (
      <CreatorShell>
        <ProblemPanel admin={false} code={result.code} title="Workflow" />
      </CreatorShell>
    );
  const rows = items(result.body);
  return (
    <CreatorShell>
      <div className="live-stack">
        <PageTitle
          title="Workflow"
          description="Live compiler jobs for the current workspace."
          action={
            <a className="button button-primary" href="/projects/new">
              New Project
            </a>
          }
        />
        <Panel>
          <Table
            columns={jobColumns}
            empty="No compiler jobs have been created yet."
            rows={rows}
          />
        </Panel>
      </div>
    </CreatorShell>
  );
}

export default async function StaticDestination({
  params,
}: {
  readonly params: Promise<{ readonly slug: string[] }>;
}) {
  const { slug } = await params;
  const key = slug.join("/");
  const adminTitle = adminPages[key];
  if (adminTitle) return renderAdmin(key, adminTitle);
  if (key === "workflow") return renderWorkflow();
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
