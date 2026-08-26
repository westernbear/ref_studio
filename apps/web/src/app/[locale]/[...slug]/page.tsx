import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { AdminExportButton } from "../../components/AdminExportButton";
import { AiProviderSettingsForm } from "../../components/AiProviderSettingsForm";
import { AdminJobCancelButton } from "../../components/AdminJobCancelButton";
import { AdminJobForceTerminateButton } from "../../components/AdminJobForceTerminateButton";
import { AdminJobRetryButton } from "../../components/AdminJobRetryButton";
import { AdminQuarantineReleaseButton } from "../../components/AdminQuarantineReleaseButton";
import { AdminQuarantineRejectButton } from "../../components/AdminQuarantineRejectButton";
import { AdminShell, CreatorShell } from "../../components/Shells";
import { Panel } from "../../components/Primitives";
import {
  field,
  isAuthProblem,
  items,
  liveApiGet,
  text,
  when,
} from "../../lib/server-api";

type SearchState = Readonly<
  Record<string, string | readonly string[] | undefined>
>;
type Column = {
  readonly label: string;
  readonly value: (row: unknown) => ReactNode;
};

const PAGE_SIZE = 20;
const jobStates = [
  "QUEUED",
  "PREPARING",
  "READY",
  "RENDERING",
  "ASSEMBLING",
  "AWAITING_T5",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "RETRYABLE_ERROR",
] as const;
const adminPages: Record<string, string> = {
  admin: "Admin dashboard",
  "admin/ai-settings": "AI provider settings",
  "admin/audit": "Audit log",
  "admin/billing": "Billing",
  "admin/jobs": "Queue & Delivery",
  "admin/quarantine": "Quarantine",
  "admin/receipts": "Receipt chain",
  "admin/tenants": "Tenants",
};

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const single = (value: string | readonly string[] | undefined): string =>
  typeof value === "string" ? value : (value?.[0] ?? "");
const cursor = (body: unknown): string | null => {
  const value = field(body, "nextCursor");
  return typeof value === "string" && value.length > 0 ? value : null;
};
const listPath = (
  path: string,
  search: SearchState,
  names: readonly string[],
): string => {
  const params = new URLSearchParams();
  for (const name of names) {
    const value = single(search[name]);
    if (value) params.set(name, value);
  }
  params.set("limit", String(PAGE_SIZE));
  return `${path}?${params.toString()}`;
};
const hrefWith = (
  path: string,
  search: SearchState,
  changes: Readonly<Record<string, string | null>>,
): string => {
  const params = new URLSearchParams();
  for (const [name, raw] of Object.entries(search)) {
    const value = single(raw);
    if (value) params.set(name, value);
  }
  for (const [name, value] of Object.entries(changes)) {
    if (value === null || value.length === 0) params.delete(name);
    else params.set(name, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};
const selectedRow = (rows: readonly unknown[], selectedId: string): unknown =>
  rows.find((row) => text(field(row, "id"), "") === selectedId) ?? rows[0];

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
    <div className="page-title" data-landmark="scope-header">
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
  selectedId,
  rowHref,
}: {
  readonly columns: readonly Column[];
  readonly empty: string;
  readonly rows: readonly unknown[];
  readonly selectedId?: string;
  readonly rowHref?: (row: unknown) => string;
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
            {rowHref ? <th scope="col">Details</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowId = text(field(row, "id"), `row-${index}`);
            return (
              <tr
                key={`${rowId}-${index}`}
                className={rowId === selectedId ? "is-selected" : undefined}
              >
                {columns.map((column) => (
                  <td key={column.label}>{column.value(row)}</td>
                ))}
                {rowHref ? (
                  <td>
                    <a className="table-action" href={rowHref(row)}>
                      Inspect
                    </a>
                  </td>
                ) : null}
              </tr>
            );
          })}
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
      {label === "id" ? null : <small>{text(field(row, "id"))}</small>}
    </span>
  );
}

function DetailPanel({
  title,
  row,
  fields,
  landmark = "detail-panel",
  actions,
}: {
  readonly title: string;
  readonly row: unknown;
  readonly fields: readonly Column[];
  readonly landmark?: string | undefined;
  readonly actions?: ReactNode;
}) {
  return (
    <aside className="panel record-detail" data-landmark={landmark}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>Selected live record</p>
        </div>
      </div>
      {row ? (
        <>
          <dl className="record-detail-list">
            {fields.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value(row)}</dd>
              </div>
            ))}
          </dl>
          {actions ? <div className="record-actions">{actions}</div> : null}
        </>
      ) : (
        <p className="empty-copy">No live record is available to inspect.</p>
      )}
    </aside>
  );
}

function FilterBar({
  action,
  children,
}: {
  readonly action: string;
  readonly children: ReactNode;
}) {
  return (
    <form
      className="filter-bar"
      action={action}
      method="get"
      data-landmark="filters"
    >
      <div className="filter-fields">{children}</div>
      <div className="filter-actions">
        <button className="button button-primary" type="submit">
          Apply filters
        </button>
        <a className="button" href={action}>
          Clear
        </a>
      </div>
    </form>
  );
}

function FilterInput({
  label,
  name,
  value,
  placeholder,
}: {
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly placeholder: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="search"
        name={name}
        defaultValue={value}
        placeholder={placeholder}
      />
    </label>
  );
}

type SelectOption = string | { readonly value: string; readonly label: string };
function FilterSelect({
  label,
  name,
  value,
  options,
  allLabel = "All",
}: {
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly allLabel?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <select name={name} defaultValue={value}>
        <option value="">{allLabel}</option>
        {options.map((option) => {
          const optionValue =
            typeof option === "string" ? option : option.value;
          const optionLabel =
            typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function Pagination({
  path,
  search,
  nextCursor,
}: {
  readonly path: string;
  readonly search: SearchState;
  readonly nextCursor: string | null;
}) {
  const parsed = Number(single(search.after) || 0);
  const start = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  const previous = Math.max(0, start - PAGE_SIZE);
  return (
    <nav
      className="pagination"
      aria-label="Record pages"
      data-landmark="pagination"
    >
      {start > 0 ? (
        <a
          className="button"
          href={hrefWith(path, search, {
            after: previous === 0 ? null : String(previous),
            selected: null,
          })}
        >
          Previous
        </a>
      ) : (
        <span className="button is-disabled" aria-disabled="true">
          Previous
        </span>
      )}
      <span>Page {Math.floor(start / PAGE_SIZE) + 1}</span>
      {nextCursor ? (
        <a
          className="button"
          href={hrefWith(path, search, {
            after: nextCursor,
            selected: null,
          })}
        >
          Next
        </a>
      ) : (
        <span className="button is-disabled" aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}

function RecordSurface({
  path,
  search,
  rows,
  columns,
  details,
  empty,
  tableTitle,
  tableLandmark,
  detailTitle,
  detailLandmark,
  nextCursor,
  detailActions,
}: {
  readonly path: string;
  readonly search: SearchState;
  readonly rows: readonly unknown[];
  readonly columns: readonly Column[];
  readonly details: readonly Column[];
  readonly empty: string;
  readonly tableTitle: string;
  readonly tableLandmark: string;
  readonly detailTitle: string;
  readonly detailLandmark?: string | undefined;
  readonly nextCursor: string | null;
  readonly detailActions?: (row: unknown) => ReactNode;
}) {
  const row = selectedRow(rows, single(search.selected));
  const selectedId = text(field(row, "id"), "");
  return (
    <>
      <div className="record-layout">
        <Panel data-landmark={tableLandmark}>
          <div className="section-heading">
            <div>
              <h2>{tableTitle}</h2>
              <p>{rows.length} records on this page</p>
            </div>
          </div>
          <Table
            columns={columns}
            empty={empty}
            rows={rows}
            selectedId={selectedId}
            rowHref={(item) =>
              hrefWith(path, search, {
                selected: text(field(item, "id"), ""),
              })
            }
          />
        </Panel>
        <DetailPanel
          title={detailTitle}
          row={row}
          fields={details}
          landmark={detailLandmark}
          actions={row && detailActions ? detailActions(row) : undefined}
        />
      </div>
      <Pagination path={path} search={search} nextCursor={nextCursor} />
    </>
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

const formatQuota = (row: unknown): string =>
  `${text(field(field(row, "quota"), "used"), "0")} / ${text(
    field(field(row, "quota"), "limit"),
    "0",
  )}`;

function jobDetailActions(row: unknown): ReactNode {
  const jobId = encodeURIComponent(text(field(row, "id")));
  return (
    <a className="button button-primary" href={`/scene-review?jobId=${jobId}`}>
      Scene Review
    </a>
  );
}
const CANCELLABLE_STATES = ["QUEUED", "PREPARING", "RENDERING"];
const RETRYABLE_STATES = ["FAILED", "CANCELLED"];
const TERMINAL_STATES = ["COMPLETED", "CANCELLED", "FAILED"];
function adminJobDetailActions(row: unknown): ReactNode {
  const jobId = text(field(row, "id"));
  const state = text(field(row, "state"));
  const etag = text(field(row, "etag"), "");
  return (
    <>
      {jobDetailActions(row)}
      {etag && CANCELLABLE_STATES.includes(state) ? (
        <AdminJobCancelButton jobId={jobId} etag={etag} />
      ) : null}
      {etag && RETRYABLE_STATES.includes(state) ? (
        <AdminJobRetryButton jobId={jobId} etag={etag} />
      ) : null}
      {etag && !TERMINAL_STATES.includes(state) ? (
        <AdminJobForceTerminateButton jobId={jobId} etag={etag} />
      ) : null}
    </>
  );
}
function quarantineDetailActions(row: unknown): ReactNode {
  const itemId = text(field(row, "id"));
  const tenantId = text(field(row, "tenantId"));
  const version = text(field(row, "version"), "");
  const state = text(field(row, "state"));
  if (!version || state !== "QUARANTINED") return null;
  return (
    <>
      <AdminQuarantineReleaseButton
        itemId={itemId}
        tenantId={tenantId}
        version={version}
      />
      <AdminQuarantineRejectButton
        itemId={itemId}
        tenantId={tenantId}
        version={version}
      />
    </>
  );
}

const tenantColumns: readonly Column[] = [
  { label: "Tenant", value: (row) => <IdCell row={row} label="name" /> },
  { label: "Status", value: (row) => text(field(row, "status")) },
  { label: "Plan", value: (row) => text(field(row, "plan")) },
  { label: "Active jobs", value: (row) => text(field(row, "activeJobs"), "0") },
  {
    label: "Quota",
    value: formatQuota,
  },
];
const tenantDetails: readonly Column[] = [
  { label: "Tenant ID", value: (row) => text(field(row, "id")) },
  { label: "Name", value: (row) => text(field(row, "name")) },
  { label: "Status", value: (row) => text(field(row, "status")) },
  { label: "Plan", value: (row) => text(field(row, "plan")) },
  { label: "Active jobs", value: (row) => text(field(row, "activeJobs"), "0") },
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
const adminJobDetails: readonly Column[] = [
  { label: "Job ID", value: (row) => text(field(row, "id")) },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "Creator", value: (row) => text(field(row, "creatorId")) },
  { label: "State", value: (row) => text(field(row, "state")) },
  { label: "Attempt", value: (row) => text(field(row, "attempt"), "0") },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const creatorJobDetails: readonly Column[] = [
  { label: "Job ID", value: (row) => text(field(row, "id")) },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "State", value: (row) => text(field(row, "state")) },
  { label: "Attempt", value: (row) => text(field(row, "attempt"), "0") },
  {
    label: "Preparation",
    value: (row) => text(field(row, "preparationStage")),
  },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
  { label: "Updated", value: (row) => when(field(row, "updatedAt")) },
];
const quarantineColumns: readonly Column[] = [
  { label: "Upload", value: (row) => <IdCell row={row} label="id" /> },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "State", value: (row) => text(field(row, "state")) },
  { label: "Declared type", value: (row) => text(field(row, "declaredType")) },
  { label: "Reason", value: (row) => text(field(row, "reason")) },
  { label: "Retention", value: (row) => when(field(row, "retentionUntil")) },
];
const quarantineDetails: readonly Column[] = [
  { label: "Upload ID", value: (row) => text(field(row, "id")) },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "State", value: (row) => text(field(row, "state")) },
  { label: "Declared type", value: (row) => text(field(row, "declaredType")) },
  { label: "Magic bytes", value: (row) => text(field(row, "magicBytes")) },
  {
    label: "Container parse",
    value: (row) => text(field(row, "containerParse")),
  },
  { label: "Reason", value: (row) => text(field(row, "reason")) },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const auditColumns: readonly Column[] = [
  { label: "Event", value: (row) => <IdCell row={row} label="eventType" /> },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "Actor", value: (row) => text(field(row, "actorId")) },
  { label: "Outcome", value: (row) => text(field(row, "outcome")) },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const auditDetails: readonly Column[] = [
  { label: "Event ID", value: (row) => text(field(row, "id")) },
  { label: "Event type", value: (row) => text(field(row, "eventType")) },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "Job", value: (row) => text(field(row, "jobId")) },
  { label: "Actor", value: (row) => text(field(row, "actorId")) },
  { label: "Authorization", value: (row) => text(field(row, "authorization")) },
  { label: "Outcome", value: (row) => text(field(row, "outcome")) },
  { label: "Correlation", value: (row) => text(field(row, "correlationId")) },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const receiptDetails: readonly Column[] = [
  { label: "Receipt ID", value: (row) => text(field(row, "id")) },
  { label: "Job", value: (row) => text(field(row, "jobId")) },
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "Gate", value: (row) => text(field(row, "gate")) },
  { label: "Decision", value: (row) => text(field(row, "decision")) },
  { label: "Actor", value: (row) => text(field(row, "actorId")) },
  { label: "Predecessor", value: (row) => text(field(row, "predecessorId")) },
  { label: "Created", value: (row) => when(field(row, "createdAt")) },
];
const billingColumns: readonly Column[] = [
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "Plan", value: (row) => text(field(row, "plan")) },
  { label: "Status", value: (row) => text(field(row, "billingStatus")) },
  {
    label: "Quota",
    value: formatQuota,
  },
  { label: "Renewal", value: (row) => when(field(row, "renewalAt")) },
];
const billingDetails: readonly Column[] = [
  { label: "Tenant", value: (row) => text(field(row, "tenantId")) },
  { label: "Plan", value: (row) => text(field(row, "plan")) },
  { label: "Status", value: (row) => text(field(row, "billingStatus")) },
  {
    label: "Quota reset",
    value: (row) => when(field(field(row, "quota"), "resetAt")),
  },
  { label: "Renewal", value: (row) => when(field(row, "renewalAt")) },
];

async function renderDashboard(title: string) {
  const result = await liveApiGet("/admin/tenants");
  if (!result.ok) return <AdminProblem code={result.code} title={title} />;
  const rows = items(result.body);
  const activeJobs = rows.reduce<number>(
    (total, row) => total + count(field(row, "activeJobs")),
    0,
  );
  return (
    <AdminView
      title={title}
      description="Live platform activity and queue pressure."
    >
      <dl className="metric-grid">
        <div>
          <dt>Visible tenants</dt>
          <dd>{rows.length}</dd>
        </div>
        <div>
          <dt>Active jobs</dt>
          <dd>{activeJobs}</dd>
        </div>
      </dl>
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

async function renderTenants(title: string, search: SearchState) {
  const path = "/admin/tenants";
  const result = await liveApiGet(
    listPath(path, search, ["q", "status", "plan", "after"]),
  );
  if (!result.ok) return <AdminProblem code={result.code} title={title} />;
  const rows = items(result.body);
  return (
    <AdminView
      title={title}
      description="Tenant status, plan, quota, and active work."
    >
      <FilterBar action={path}>
        <FilterInput
          label="Search"
          name="q"
          value={single(search.q)}
          placeholder="Tenant ID or name"
        />
        <FilterSelect
          label="Status"
          name="status"
          value={single(search.status)}
          options={["ACTIVE", "SUSPENDED"]}
        />
        <FilterSelect
          label="Plan"
          name="plan"
          value={single(search.plan)}
          options={["FREE", "PRO", "ENTERPRISE"]}
        />
      </FilterBar>
      <RecordSurface
        path={path}
        search={search}
        rows={rows}
        columns={tenantColumns}
        details={tenantDetails}
        empty="No live tenants match these filters."
        tableTitle="Tenant directory"
        tableLandmark="tenant-table"
        detailTitle="Tenant detail"
        detailLandmark="detail-drawer"
        nextCursor={cursor(result.body)}
        detailActions={(row) => (
          <a
            className="button"
            href={`/admin/jobs?tenantId=${encodeURIComponent(text(field(row, "id")))}`}
          >
            View jobs
          </a>
        )}
      />
    </AdminView>
  );
}

async function renderJobs(title: string, search: SearchState) {
  const path = "/admin/jobs";
  const result = await liveApiGet(
    listPath(path, search, ["q", "tenantId", "state", "after"]),
  );
  if (!result.ok) return <AdminProblem code={result.code} title={title} />;
  const rows = items(result.body);
  return (
    <AdminView title={title} description="Compiler queue and delivery state.">
      <FilterBar action={path}>
        <FilterInput
          label="Search"
          name="q"
          value={single(search.q)}
          placeholder="Job, tenant, or creator"
        />
        <FilterInput
          label="Tenant"
          name="tenantId"
          value={single(search.tenantId)}
          placeholder="Tenant ID"
        />
        <FilterSelect
          label="State"
          name="state"
          value={single(search.state)}
          options={jobStates}
        />
      </FilterBar>
      <RecordSurface
        path={path}
        search={search}
        rows={rows}
        columns={jobColumns}
        details={adminJobDetails}
        empty="No compiler jobs match these filters."
        tableTitle="Queue and delivery"
        tableLandmark="job-table"
        detailTitle="Job detail"
        nextCursor={cursor(result.body)}
        detailActions={adminJobDetailActions}
      />
    </AdminView>
  );
}

async function renderReceipts(title: string, search: SearchState) {
  const path = "/admin/receipts";
  const result = await liveApiGet(
    listPath(path, search, ["q", "tenantId", "jobId", "eventType", "after"]),
  );
  if (!result.ok) return <AdminProblem code={result.code} title={title} />;
  const rows = items(result.body);
  const row = selectedRow(rows, single(search.selected));
  const selectedId = text(field(row, "id"), "");
  return (
    <AdminView
      title={title}
      description="Append-only review decisions in chain order."
    >
      <FilterBar action={path}>
        <FilterInput
          label="Search"
          name="q"
          value={single(search.q)}
          placeholder="Receipt, job, or actor"
        />
        <FilterInput
          label="Tenant"
          name="tenantId"
          value={single(search.tenantId)}
          placeholder="Tenant ID"
        />
        <FilterInput
          label="Job"
          name="jobId"
          value={single(search.jobId)}
          placeholder="Job ID"
        />
        <FilterSelect
          label="Gate"
          name="eventType"
          value={single(search.eventType)}
          options={["T1", "T2", "T3", "T4", "T5", "T6"]}
        />
      </FilterBar>
      <div className="record-layout receipt-layout">
        <Panel data-landmark="timeline">
          <div className="section-heading">
            <div>
              <h2>Receipt timeline</h2>
              <p>{rows.length} decisions on this page</p>
            </div>
          </div>
          {rows.length > 0 ? (
            <ol className="receipt-timeline" data-landmark="timeline-list">
              {rows.map((receipt) => {
                const id = text(field(receipt, "id"));
                return (
                  <li
                    key={id}
                    className={id === selectedId ? "is-selected" : undefined}
                  >
                    <a href={hrefWith(path, search, { selected: id })}>
                      <strong>{text(field(receipt, "gate"))}</strong>
                      <span>{text(field(receipt, "decision"))}</span>
                      <small>{text(field(receipt, "jobId"))}</small>
                      <time>{when(field(receipt, "createdAt"))}</time>
                    </a>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="empty-copy">No live receipts match these filters.</p>
          )}
        </Panel>
        <DetailPanel
          title="Receipt detail"
          row={row}
          fields={receiptDetails}
          landmark="receipt-detail"
        />
      </div>
      <section className="export-band">
        <div>
          <h2>Receipt export</h2>
          <p>Create a short-lived JSONL export request.</p>
        </div>
        <AdminExportButton
          kind="receipt"
          tenantId={single(search.tenantId) || undefined}
        />
      </section>
      <Pagination
        path={path}
        search={search}
        nextCursor={cursor(result.body)}
      />
    </AdminView>
  );
}

async function renderQuarantine(title: string, search: SearchState) {
  const path = "/admin/quarantine";
  const result = await liveApiGet(
    listPath(path, search, ["q", "tenantId", "state", "reason", "after"]),
  );
  if (!result.ok) return <AdminProblem code={result.code} title={title} />;
  const rows = items(result.body);
  return (
    <AdminView
      title={title}
      description="Upload admission evidence and disposition."
    >
      <FilterBar action={path}>
        <FilterInput
          label="Search"
          name="q"
          value={single(search.q)}
          placeholder="Upload, type, or reason"
        />
        <FilterInput
          label="Tenant"
          name="tenantId"
          value={single(search.tenantId)}
          placeholder="Tenant ID"
        />
        <FilterSelect
          label="State"
          name="state"
          value={single(search.state)}
          options={["QUARANTINED", "VALIDATING", "REJECTED", "RELEASED"]}
        />
      </FilterBar>
      <RecordSurface
        path={path}
        search={search}
        rows={rows}
        columns={quarantineColumns}
        details={quarantineDetails}
        empty="No quarantined uploads match these filters."
        tableTitle="Admission queue"
        tableLandmark="quarantine-table"
        detailTitle="Admission evidence"
        detailLandmark="evidence-drawer"
        nextCursor={cursor(result.body)}
        detailActions={quarantineDetailActions}
      />
    </AdminView>
  );
}

async function renderAudit(title: string, search: SearchState) {
  const path = "/admin/audit";
  const result = await liveApiGet(
    listPath("/admin/audit-log", search, [
      "q",
      "tenantId",
      "actorId",
      "eventType",
      "jobId",
      "outcome",
      "after",
    ]),
  );
  if (!result.ok) return <AdminProblem code={result.code} title={title} />;
  const rows = items(result.body);
  return (
    <AdminView
      title={title}
      description="Immutable operator and workflow events."
    >
      <FilterBar action={path}>
        <FilterInput
          label="Search"
          name="q"
          value={single(search.q)}
          placeholder="Event, job, or correlation"
        />
        <FilterInput
          label="Tenant"
          name="tenantId"
          value={single(search.tenantId)}
          placeholder="Tenant ID"
        />
        <FilterInput
          label="Actor"
          name="actorId"
          value={single(search.actorId)}
          placeholder="Actor ID"
        />
        <FilterSelect
          label="Event type"
          name="eventType"
          value={single(search.eventType)}
          allLabel="All Event Types"
          options={[
            { value: "auth", label: "Authentication" },
            { value: "data", label: "Data Access" },
            { value: "job", label: "Job Execution" },
            { value: "config", label: "System Config" },
          ]}
        />
        <FilterInput
          label="Outcome"
          name="outcome"
          value={single(search.outcome)}
          placeholder="Outcome"
        />
      </FilterBar>
      <RecordSurface
        path={path}
        search={search}
        rows={rows}
        columns={auditColumns}
        details={auditDetails}
        empty="No audit events match these filters."
        tableTitle="Audit events"
        tableLandmark="audit-table"
        detailTitle="Event detail"
        detailLandmark="detail-drawer"
        nextCursor={cursor(result.body)}
      />
      <section className="export-band">
        <div>
          <h2>Audit export</h2>
          <p>Create a short-lived JSONL export request.</p>
        </div>
        <AdminExportButton
          kind="audit"
          tenantId={single(search.tenantId) || undefined}
        />
      </section>
    </AdminView>
  );
}

async function renderBilling(title: string, search: SearchState) {
  const tenantResult = await liveApiGet("/admin/tenants?limit=100");
  if (!tenantResult.ok)
    return <AdminProblem code={tenantResult.code} title={title} />;
  const billingResults = await Promise.all(
    items(tenantResult.body).map((tenant) =>
      liveApiGet(
        `/admin/billing/${encodeURIComponent(text(field(tenant, "id")))}`,
      ),
    ),
  );
  const rows = billingResults.flatMap((result) =>
    result.ok ? [result.body] : [],
  );
  return (
    <AdminView title={title} description="Quota and billing metadata.">
      <RecordSurface
        path="/admin/billing"
        search={search}
        rows={rows}
        columns={billingColumns}
        details={billingDetails}
        empty="No live billing records are available."
        tableTitle="Billing accounts"
        tableLandmark="billing-table"
        detailTitle="Billing detail"
        nextCursor={null}
      />
    </AdminView>
  );
}

async function renderAiSettings(title: string) {
  const result = await liveApiGet("/admin/ai-provider-settings");
  if (!result.ok) return <AdminProblem code={result.code} title={title} />;
  const body = result.body;
  return (
    <AdminView
      title={title}
      description="Configure which AI provider powers Compiler Dialogue prompt refinement."
    >
      <AiProviderSettingsForm
        providerKind={text(field(body, "providerKind"), "openai")}
        model={text(field(body, "model"), "")}
        baseUrl={text(field(body, "baseUrl"), "") || null}
        enabled={field(body, "enabled") === true}
        hasApiKey={field(body, "hasApiKey") === true}
        updatedAt={text(field(body, "updatedAt"), "")}
        updatedBy={text(field(body, "updatedBy"), "")}
      />
    </AdminView>
  );
}

async function renderAdmin(key: string, title: string, search: SearchState) {
  if (key === "admin") return renderDashboard(title);
  if (key === "admin/ai-settings") return renderAiSettings(title);
  if (key === "admin/tenants") return renderTenants(title, search);
  if (key === "admin/jobs") return renderJobs(title, search);
  if (key === "admin/receipts") return renderReceipts(title, search);
  if (key === "admin/quarantine") return renderQuarantine(title, search);
  if (key === "admin/billing") return renderBilling(title, search);
  return renderAudit(title, search);
}

async function renderWorkflow(
  path: "/jobs" | "/workflow",
  search: SearchState,
) {
  const result = await liveApiGet(
    listPath("/v1/jobs", search, ["q", "state", "after"]),
  );
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
          description="Compiler jobs for the current workspace."
          action={
            <a className="button button-primary" href="/projects/new">
              New Project
            </a>
          }
        />
        <FilterBar action={path}>
          <FilterInput
            label="Search"
            name="q"
            value={single(search.q)}
            placeholder="Job, state, or upload"
          />
          <FilterSelect
            label="State"
            name="state"
            value={single(search.state)}
            options={jobStates}
          />
        </FilterBar>
        <RecordSurface
          path={path}
          search={search}
          rows={rows}
          columns={jobColumns}
          details={creatorJobDetails}
          empty="No compiler jobs match these filters."
          tableTitle="Compiler jobs"
          tableLandmark="job-table"
          detailTitle="Job detail"
          nextCursor={cursor(result.body)}
          detailActions={jobDetailActions}
        />
      </div>
    </CreatorShell>
  );
}

export default async function StaticDestination({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly slug: string[] }>;
  readonly searchParams: Promise<SearchState>;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const key = slug.join("/");
  const adminTitle = adminPages[key];
  if (adminTitle) return renderAdmin(key, adminTitle, search);
  if (key === "workflow" || key === "jobs")
    return renderWorkflow(`/${key}`, search);
  const review = key.match(/^jobs\/([^/]+)\/review$/u);
  if (review?.[1])
    redirect(`/scene-review?jobId=${encodeURIComponent(review[1])}`);
  notFound();
}
