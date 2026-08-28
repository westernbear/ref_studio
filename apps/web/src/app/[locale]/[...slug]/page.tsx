import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminExportButton } from "../../../components/AdminExportButton";
import { AiProviderSettingsForm } from "../../../components/AiProviderSettingsForm";
import { MaterialProviderSettingsForm } from "../../../components/MaterialProviderSettingsForm";
import { AdminJobCancelButton } from "../../../components/AdminJobCancelButton";
import { AdminJobForceTerminateButton } from "../../../components/AdminJobForceTerminateButton";
import { AdminJobRetryButton } from "../../../components/AdminJobRetryButton";
import { AdminQuarantineReleaseButton } from "../../../components/AdminQuarantineReleaseButton";
import { AdminQuarantineRejectButton } from "../../../components/AdminQuarantineRejectButton";
import { AdminShell, CreatorShell } from "../../../components/Shells";
import { Panel } from "../../../components/Primitives";
import { Link } from "../../../i18n/navigation";
import {
  field,
  isAuthProblem,
  items,
  liveApiGet,
  text,
  when,
} from "../../../lib/server-api";

type SearchState = Readonly<
  Record<string, string | readonly string[] | undefined>
>;
type Column = {
  readonly label: string;
  readonly value: (row: unknown) => ReactNode;
};
type T = Awaited<ReturnType<typeof getTranslations<"AdminSlug">>>;

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
const adminPageKeys: Record<string, string> = {
  admin: "dashboard",
  "admin/ai-settings": "aiSettings",
  "admin/material-settings": "materialSettings",
  "admin/audit": "audit",
  "admin/billing": "billing",
  "admin/jobs": "jobs",
  "admin/quarantine": "quarantine",
  "admin/receipts": "receipts",
  "admin/tenants": "tenants",
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
  detailsLabel,
  inspectLabel,
}: {
  readonly columns: readonly Column[];
  readonly empty: string;
  readonly rows: readonly unknown[];
  readonly selectedId?: string;
  readonly rowHref?: (row: unknown) => string;
  readonly detailsLabel: string;
  readonly inspectLabel: string;
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
            {rowHref ? <th scope="col">{detailsLabel}</th> : null}
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
                      {inspectLabel}
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
  t,
}: {
  readonly title: string;
  readonly row: unknown;
  readonly fields: readonly Column[];
  readonly landmark?: string | undefined;
  readonly actions?: ReactNode;
  readonly t: T;
}) {
  return (
    <aside className="panel record-detail" data-landmark={landmark}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{t("selectedLiveRecord")}</p>
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
        <p className="empty-copy">{t("noRecordToInspect")}</p>
      )}
    </aside>
  );
}

function FilterBar({
  action,
  children,
  t,
}: {
  readonly action: string;
  readonly children: ReactNode;
  readonly t: T;
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
          {t("applyFilters")}
        </button>
        <a className="button" href={action}>
          {t("clear")}
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
  allLabel,
}: {
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly allLabel: string;
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
  t,
}: {
  readonly path: string;
  readonly search: SearchState;
  readonly nextCursor: string | null;
  readonly t: T;
}) {
  const parsed = Number(single(search.after) || 0);
  const start = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  const previous = Math.max(0, start - PAGE_SIZE);
  return (
    <nav
      className="pagination"
      aria-label={t("recordPagesAriaLabel")}
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
          {t("previous")}
        </a>
      ) : (
        <span className="button is-disabled" aria-disabled="true">
          {t("previous")}
        </span>
      )}
      <span>{t("page", { number: Math.floor(start / PAGE_SIZE) + 1 })}</span>
      {nextCursor ? (
        <a
          className="button"
          href={hrefWith(path, search, {
            after: nextCursor,
            selected: null,
          })}
        >
          {t("next")}
        </a>
      ) : (
        <span className="button is-disabled" aria-disabled="true">
          {t("next")}
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
  t,
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
  readonly t: T;
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
              <p>{t("recordsOnThisPage", { count: rows.length })}</p>
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
            detailsLabel={t("details")}
            inspectLabel={t("inspect")}
          />
        </Panel>
        <DetailPanel
          title={detailTitle}
          row={row}
          fields={details}
          landmark={detailLandmark}
          actions={row && detailActions ? detailActions(row) : undefined}
          t={t}
        />
      </div>
      <Pagination path={path} search={search} nextCursor={nextCursor} t={t} />
    </>
  );
}

function ProblemPanel({
  admin,
  code,
  title,
  t,
}: {
  readonly admin: boolean;
  readonly code: string;
  readonly title: string;
  readonly t: T;
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
            ? t("adminSignInRequired")
            : t("signInToViewWorkflow")
          : t("recordsUnavailable", { code })}
      </p>
      {isAuthProblem(code) ? (
        <a className="button button-primary" href={href}>
          {t("signIn")}
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
  t,
}: {
  readonly code: string;
  readonly title: string;
  readonly t: T;
}) {
  return (
    <AdminShell>
      <div className="admin-page">
        <ProblemPanel admin code={code} title={title} t={t} />
      </div>
    </AdminShell>
  );
}

const formatQuota = (row: unknown): string =>
  `${text(field(field(row, "quota"), "used"), "0")} / ${text(
    field(field(row, "quota"), "limit"),
    "0",
  )}`;

function jobDetailActions(t: T): (row: unknown) => ReactNode {
  return (row) => {
    const jobId = encodeURIComponent(text(field(row, "id")));
    return (
      <a
        className="button button-primary"
        href={`/scene-review?jobId=${jobId}`}
      >
        {t("sceneReview")}
      </a>
    );
  };
}
const CANCELLABLE_STATES = ["QUEUED", "PREPARING", "RENDERING"];
const RETRYABLE_STATES = ["FAILED", "CANCELLED"];
const TERMINAL_STATES = ["COMPLETED", "CANCELLED", "FAILED"];
function adminJobDetailActions(t: T): (row: unknown) => ReactNode {
  return (row) => {
    const jobId = text(field(row, "id"));
    const state = text(field(row, "state"));
    const etag = text(field(row, "etag"), "");
    return (
      <>
        {jobDetailActions(t)(row)}
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
  };
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

const tenantColumns = (t: T): readonly Column[] => [
  {
    label: t("fields.tenant"),
    value: (row) => <IdCell row={row} label="name" />,
  },
  { label: t("fields.status"), value: (row) => text(field(row, "status")) },
  { label: t("fields.plan"), value: (row) => text(field(row, "plan")) },
  {
    label: t("fields.activeJobs"),
    value: (row) => text(field(row, "activeJobs"), "0"),
  },
  { label: t("fields.quota"), value: formatQuota },
];
const tenantDetails = (t: T): readonly Column[] => [
  { label: t("fields.tenantId"), value: (row) => text(field(row, "id")) },
  { label: t("fields.name"), value: (row) => text(field(row, "name")) },
  { label: t("fields.status"), value: (row) => text(field(row, "status")) },
  { label: t("fields.plan"), value: (row) => text(field(row, "plan")) },
  {
    label: t("fields.activeJobs"),
    value: (row) => text(field(row, "activeJobs"), "0"),
  },
  { label: t("fields.created"), value: (row) => when(field(row, "createdAt")) },
];
const jobColumns = (t: T): readonly Column[] => [
  {
    label: t("fields.job"),
    value: (row) => (
      <a
        href={`/scene-review?jobId=${encodeURIComponent(text(field(row, "id")))}`}
      >
        {text(field(row, "id"))}
      </a>
    ),
  },
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.state"), value: (row) => text(field(row, "state")) },
  {
    label: t("fields.attempt"),
    value: (row) => text(field(row, "attempt"), "0"),
  },
  { label: t("fields.created"), value: (row) => when(field(row, "createdAt")) },
];
const adminJobDetails = (t: T): readonly Column[] => [
  { label: t("fields.jobId"), value: (row) => text(field(row, "id")) },
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.creator"), value: (row) => text(field(row, "creatorId")) },
  { label: t("fields.state"), value: (row) => text(field(row, "state")) },
  {
    label: t("fields.attempt"),
    value: (row) => text(field(row, "attempt"), "0"),
  },
  { label: t("fields.created"), value: (row) => when(field(row, "createdAt")) },
];
const creatorJobDetails = (t: T): readonly Column[] => [
  { label: t("fields.jobId"), value: (row) => text(field(row, "id")) },
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.state"), value: (row) => text(field(row, "state")) },
  {
    label: t("fields.attempt"),
    value: (row) => text(field(row, "attempt"), "0"),
  },
  {
    label: t("fields.preparation"),
    value: (row) => text(field(row, "preparationStage")),
  },
  { label: t("fields.created"), value: (row) => when(field(row, "createdAt")) },
  { label: t("fields.updated"), value: (row) => when(field(row, "updatedAt")) },
];
const quarantineColumns = (t: T): readonly Column[] => [
  {
    label: t("fields.upload"),
    value: (row) => <IdCell row={row} label="id" />,
  },
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.state"), value: (row) => text(field(row, "state")) },
  {
    label: t("fields.declaredType"),
    value: (row) => text(field(row, "declaredType")),
  },
  { label: t("fields.reason"), value: (row) => text(field(row, "reason")) },
  {
    label: t("fields.retention"),
    value: (row) => when(field(row, "retentionUntil")),
  },
];
const quarantineDetails = (t: T): readonly Column[] => [
  { label: t("fields.uploadId"), value: (row) => text(field(row, "id")) },
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.state"), value: (row) => text(field(row, "state")) },
  {
    label: t("fields.declaredType"),
    value: (row) => text(field(row, "declaredType")),
  },
  {
    label: t("fields.magicBytes"),
    value: (row) => text(field(row, "magicBytes")),
  },
  {
    label: t("fields.containerParse"),
    value: (row) => text(field(row, "containerParse")),
  },
  { label: t("fields.reason"), value: (row) => text(field(row, "reason")) },
  { label: t("fields.created"), value: (row) => when(field(row, "createdAt")) },
];
const auditColumns = (t: T): readonly Column[] => [
  {
    label: t("fields.event"),
    value: (row) => <IdCell row={row} label="eventType" />,
  },
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.actor"), value: (row) => text(field(row, "actorId")) },
  { label: t("fields.outcome"), value: (row) => text(field(row, "outcome")) },
  { label: t("fields.created"), value: (row) => when(field(row, "createdAt")) },
];
const auditDetails = (t: T): readonly Column[] => [
  { label: t("fields.eventId"), value: (row) => text(field(row, "id")) },
  {
    label: t("fields.eventType"),
    value: (row) => text(field(row, "eventType")),
  },
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.job"), value: (row) => text(field(row, "jobId")) },
  { label: t("fields.actor"), value: (row) => text(field(row, "actorId")) },
  {
    label: t("fields.authorization"),
    value: (row) => text(field(row, "authorization")),
  },
  { label: t("fields.outcome"), value: (row) => text(field(row, "outcome")) },
  {
    label: t("fields.correlation"),
    value: (row) => text(field(row, "correlationId")),
  },
  { label: t("fields.created"), value: (row) => when(field(row, "createdAt")) },
];
const receiptDetails = (t: T): readonly Column[] => [
  { label: t("fields.receiptId"), value: (row) => text(field(row, "id")) },
  { label: t("fields.job"), value: (row) => text(field(row, "jobId")) },
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.gate"), value: (row) => text(field(row, "gate")) },
  { label: t("fields.decision"), value: (row) => text(field(row, "decision")) },
  { label: t("fields.actor"), value: (row) => text(field(row, "actorId")) },
  {
    label: t("fields.predecessor"),
    value: (row) => text(field(row, "predecessorId")),
  },
  { label: t("fields.created"), value: (row) => when(field(row, "createdAt")) },
];
const billingColumns = (t: T): readonly Column[] => [
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.plan"), value: (row) => text(field(row, "plan")) },
  {
    label: t("fields.status"),
    value: (row) => text(field(row, "billingStatus")),
  },
  { label: t("fields.quota"), value: formatQuota },
  { label: t("fields.renewal"), value: (row) => when(field(row, "renewalAt")) },
];
const billingDetails = (t: T): readonly Column[] => [
  { label: t("fields.tenant"), value: (row) => text(field(row, "tenantId")) },
  { label: t("fields.plan"), value: (row) => text(field(row, "plan")) },
  {
    label: t("fields.status"),
    value: (row) => text(field(row, "billingStatus")),
  },
  {
    label: t("fields.quotaReset"),
    value: (row) => when(field(field(row, "quota"), "resetAt")),
  },
  { label: t("fields.renewal"), value: (row) => when(field(row, "renewalAt")) },
];

async function renderDashboard(title: string, t: T) {
  const result = await liveApiGet("/admin/tenants");
  if (!result.ok)
    return <AdminProblem code={result.code} title={title} t={t} />;
  const rows = items(result.body);
  const activeJobs = rows.reduce<number>(
    (total, row) => total + count(field(row, "activeJobs")),
    0,
  );
  return (
    <AdminView title={title} description={t("dashboardDescription")}>
      <dl className="metric-grid">
        <div>
          <dt>{t("visibleTenants")}</dt>
          <dd>{rows.length}</dd>
        </div>
        <div>
          <dt>{t("fields.activeJobs")}</dt>
          <dd>{activeJobs}</dd>
        </div>
      </dl>
      <Panel>
        <Table
          columns={tenantColumns(t)}
          empty={t("noLiveTenants")}
          rows={rows}
          detailsLabel={t("details")}
          inspectLabel={t("inspect")}
        />
      </Panel>
    </AdminView>
  );
}

async function renderTenants(title: string, search: SearchState, t: T) {
  const path = "/admin/tenants";
  const result = await liveApiGet(
    listPath(path, search, ["q", "status", "plan", "after"]),
  );
  if (!result.ok)
    return <AdminProblem code={result.code} title={title} t={t} />;
  const rows = items(result.body);
  return (
    <AdminView title={title} description={t("tenantsDescription")}>
      <FilterBar action={path} t={t}>
        <FilterInput
          label={t("search")}
          name="q"
          value={single(search.q)}
          placeholder={t("tenantSearchPlaceholder")}
        />
        <FilterSelect
          label={t("fields.status")}
          name="status"
          value={single(search.status)}
          options={["ACTIVE", "SUSPENDED"]}
          allLabel={t("all")}
        />
        <FilterSelect
          label={t("fields.plan")}
          name="plan"
          value={single(search.plan)}
          options={["FREE", "PRO", "ENTERPRISE"]}
          allLabel={t("all")}
        />
      </FilterBar>
      <RecordSurface
        path={path}
        search={search}
        rows={rows}
        columns={tenantColumns(t)}
        details={tenantDetails(t)}
        empty={t("noTenantsMatch")}
        tableTitle={t("tenantDirectory")}
        tableLandmark="tenant-table"
        detailTitle={t("tenantDetail")}
        detailLandmark="detail-drawer"
        nextCursor={cursor(result.body)}
        detailActions={(row) => (
          <a
            className="button"
            href={`/admin/jobs?tenantId=${encodeURIComponent(text(field(row, "id")))}`}
          >
            {t("viewJobs")}
          </a>
        )}
        t={t}
      />
    </AdminView>
  );
}

async function renderJobs(title: string, search: SearchState, t: T) {
  const path = "/admin/jobs";
  const result = await liveApiGet(
    listPath(path, search, ["q", "tenantId", "state", "after"]),
  );
  if (!result.ok)
    return <AdminProblem code={result.code} title={title} t={t} />;
  const rows = items(result.body);
  return (
    <AdminView title={title} description={t("jobsDescription")}>
      <FilterBar action={path} t={t}>
        <FilterInput
          label={t("search")}
          name="q"
          value={single(search.q)}
          placeholder={t("jobSearchPlaceholder")}
        />
        <FilterInput
          label={t("fields.tenant")}
          name="tenantId"
          value={single(search.tenantId)}
          placeholder={t("tenantIdPlaceholder")}
        />
        <FilterSelect
          label={t("fields.state")}
          name="state"
          value={single(search.state)}
          options={jobStates}
          allLabel={t("all")}
        />
      </FilterBar>
      <RecordSurface
        path={path}
        search={search}
        rows={rows}
        columns={jobColumns(t)}
        details={adminJobDetails(t)}
        empty={t("noJobsMatch")}
        tableTitle={t("queueAndDelivery")}
        tableLandmark="job-table"
        detailTitle={t("jobDetail")}
        nextCursor={cursor(result.body)}
        detailActions={adminJobDetailActions(t)}
        t={t}
      />
    </AdminView>
  );
}

async function renderReceipts(title: string, search: SearchState, t: T) {
  const path = "/admin/receipts";
  const result = await liveApiGet(
    listPath(path, search, ["q", "tenantId", "jobId", "eventType", "after"]),
  );
  if (!result.ok)
    return <AdminProblem code={result.code} title={title} t={t} />;
  const rows = items(result.body);
  const row = selectedRow(rows, single(search.selected));
  const selectedId = text(field(row, "id"), "");
  return (
    <AdminView title={title} description={t("receiptsDescription")}>
      <FilterBar action={path} t={t}>
        <FilterInput
          label={t("search")}
          name="q"
          value={single(search.q)}
          placeholder={t("receiptSearchPlaceholder")}
        />
        <FilterInput
          label={t("fields.tenant")}
          name="tenantId"
          value={single(search.tenantId)}
          placeholder={t("tenantIdPlaceholder")}
        />
        <FilterInput
          label={t("fields.job")}
          name="jobId"
          value={single(search.jobId)}
          placeholder={t("jobIdPlaceholder")}
        />
        <FilterSelect
          label={t("fields.gate")}
          name="eventType"
          value={single(search.eventType)}
          options={["T1", "T2", "T3", "T4", "T5"]}
          allLabel={t("all")}
        />
      </FilterBar>
      <div className="record-layout receipt-layout">
        <Panel data-landmark="timeline">
          <div className="section-heading">
            <div>
              <h2>{t("receiptTimeline")}</h2>
              <p>{t("decisionsOnThisPage", { count: rows.length })}</p>
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
            <p className="empty-copy">{t("noReceiptsMatch")}</p>
          )}
        </Panel>
        <DetailPanel
          title={t("receiptDetail")}
          row={row}
          fields={receiptDetails(t)}
          landmark="receipt-detail"
          t={t}
        />
      </div>
      <section className="export-band">
        <div>
          <h2>{t("receiptExport")}</h2>
          <p>{t("exportRequestHint")}</p>
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
        t={t}
      />
    </AdminView>
  );
}

async function renderQuarantine(title: string, search: SearchState, t: T) {
  const path = "/admin/quarantine";
  const result = await liveApiGet(
    listPath(path, search, ["q", "tenantId", "state", "reason", "after"]),
  );
  if (!result.ok)
    return <AdminProblem code={result.code} title={title} t={t} />;
  const rows = items(result.body);
  return (
    <AdminView title={title} description={t("quarantineDescription")}>
      <FilterBar action={path} t={t}>
        <FilterInput
          label={t("search")}
          name="q"
          value={single(search.q)}
          placeholder={t("quarantineSearchPlaceholder")}
        />
        <FilterInput
          label={t("fields.tenant")}
          name="tenantId"
          value={single(search.tenantId)}
          placeholder={t("tenantIdPlaceholder")}
        />
        <FilterSelect
          label={t("fields.state")}
          name="state"
          value={single(search.state)}
          options={["QUARANTINED", "VALIDATING", "REJECTED", "RELEASED"]}
          allLabel={t("all")}
        />
      </FilterBar>
      <RecordSurface
        path={path}
        search={search}
        rows={rows}
        columns={quarantineColumns(t)}
        details={quarantineDetails(t)}
        empty={t("noQuarantineMatch")}
        tableTitle={t("admissionQueue")}
        tableLandmark="quarantine-table"
        detailTitle={t("admissionEvidence")}
        detailLandmark="evidence-drawer"
        nextCursor={cursor(result.body)}
        detailActions={quarantineDetailActions}
        t={t}
      />
    </AdminView>
  );
}

async function renderAudit(title: string, search: SearchState, t: T) {
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
  if (!result.ok)
    return <AdminProblem code={result.code} title={title} t={t} />;
  const rows = items(result.body);
  return (
    <AdminView title={title} description={t("auditDescription")}>
      <FilterBar action={path} t={t}>
        <FilterInput
          label={t("search")}
          name="q"
          value={single(search.q)}
          placeholder={t("auditSearchPlaceholder")}
        />
        <FilterInput
          label={t("fields.tenant")}
          name="tenantId"
          value={single(search.tenantId)}
          placeholder={t("tenantIdPlaceholder")}
        />
        <FilterInput
          label={t("fields.actor")}
          name="actorId"
          value={single(search.actorId)}
          placeholder={t("actorIdPlaceholder")}
        />
        <FilterSelect
          label={t("fields.eventType")}
          name="eventType"
          value={single(search.eventType)}
          allLabel={t("allEventTypes")}
          options={[
            { value: "auth", label: t("eventTypes.auth") },
            { value: "data", label: t("eventTypes.data") },
            { value: "job", label: t("eventTypes.job") },
            { value: "config", label: t("eventTypes.config") },
          ]}
        />
        <FilterInput
          label={t("fields.outcome")}
          name="outcome"
          value={single(search.outcome)}
          placeholder={t("fields.outcome")}
        />
      </FilterBar>
      <RecordSurface
        path={path}
        search={search}
        rows={rows}
        columns={auditColumns(t)}
        details={auditDetails(t)}
        empty={t("noAuditMatch")}
        tableTitle={t("auditEvents")}
        tableLandmark="audit-table"
        detailTitle={t("eventDetail")}
        detailLandmark="detail-drawer"
        nextCursor={cursor(result.body)}
        t={t}
      />
      <section className="export-band">
        <div>
          <h2>{t("auditExport")}</h2>
          <p>{t("exportRequestHint")}</p>
        </div>
        <AdminExportButton
          kind="audit"
          tenantId={single(search.tenantId) || undefined}
        />
      </section>
    </AdminView>
  );
}

async function renderBilling(title: string, search: SearchState, t: T) {
  const tenantResult = await liveApiGet("/admin/tenants?limit=100");
  if (!tenantResult.ok)
    return <AdminProblem code={tenantResult.code} title={title} t={t} />;
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
    <AdminView title={title} description={t("billingDescription")}>
      <RecordSurface
        path="/admin/billing"
        search={search}
        rows={rows}
        columns={billingColumns(t)}
        details={billingDetails(t)}
        empty={t("noBillingRecords")}
        tableTitle={t("billingAccounts")}
        tableLandmark="billing-table"
        detailTitle={t("billingDetail")}
        nextCursor={null}
        t={t}
      />
    </AdminView>
  );
}

// The model list comes from the provider, server-side, on the same load as
// the settings themselves -- no new browser-reachable admin surface, and it
// refreshes on the router.refresh() the form already does after saving. A
// provider that will not list is not an error here: `models` is empty, the
// form says why, and the field stays free text.
const providerModels = async (
  path: string,
): Promise<Readonly<{ models: readonly string[]; reason: string | null }>> => {
  const result = await liveApiGet(path);
  if (!result.ok) return { models: [], reason: result.code };
  const models = field(result.body, "models");
  return {
    models: Array.isArray(models) ? models.map((model) => text(model)) : [],
    reason: text(field(result.body, "reason")) || null,
  };
};

async function renderAiSettings(title: string, t: T) {
  const result = await liveApiGet("/admin/ai-provider-settings");
  if (!result.ok)
    return <AdminProblem code={result.code} title={title} t={t} />;
  const models = await providerModels("/admin/ai-provider-models");
  const body = result.body;
  return (
    <AdminView title={title} description={t("aiSettingsDescription")}>
      <AiProviderSettingsForm
        models={models.models}
        modelsReason={models.reason}
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

// The three generators a scene can draw material from: one vendor with a
// key, two services this deployment runs itself. All three set here.
async function renderMaterialSettings(title: string, t: T) {
  const result = await liveApiGet("/admin/material-provider-settings");
  if (!result.ok)
    return <AdminProblem code={result.code} title={title} t={t} />;
  const models = await providerModels("/admin/material-provider-models");
  const body = result.body;
  return (
    <AdminView title={title} description={t("materialSettingsDescription")}>
      <MaterialProviderSettingsForm
        models={models.models}
        modelsReason={models.reason}
        providerKind={text(field(body, "providerKind"), "openai")}
        model={text(field(body, "model"), "")}
        enabled={field(body, "enabled") === true}
        hasApiKey={field(body, "hasApiKey") === true}
        videoBaseUrl={text(field(body, "videoBaseUrl"), "") || null}
        model3dBaseUrl={text(field(body, "model3dBaseUrl"), "") || null}
        updatedAt={text(field(body, "updatedAt"), "")}
        updatedBy={text(field(body, "updatedBy"), "")}
      />
    </AdminView>
  );
}

async function renderAdmin(
  key: string,
  title: string,
  search: SearchState,
  t: T,
) {
  if (key === "admin") return renderDashboard(title, t);
  if (key === "admin/ai-settings") return renderAiSettings(title, t);
  if (key === "admin/material-settings")
    return renderMaterialSettings(title, t);
  if (key === "admin/tenants") return renderTenants(title, search, t);
  if (key === "admin/jobs") return renderJobs(title, search, t);
  if (key === "admin/receipts") return renderReceipts(title, search, t);
  if (key === "admin/quarantine") return renderQuarantine(title, search, t);
  if (key === "admin/billing") return renderBilling(title, search, t);
  return renderAudit(title, search, t);
}

async function renderWorkflow(
  path: "/jobs" | "/workflow",
  search: SearchState,
  t: T,
) {
  const result = await liveApiGet(
    listPath("/v1/jobs", search, ["q", "state", "after"]),
  );
  if (!result.ok)
    return (
      <CreatorShell>
        <ProblemPanel
          admin={false}
          code={result.code}
          title={t("workflow")}
          t={t}
        />
      </CreatorShell>
    );
  const rows = items(result.body);
  return (
    <CreatorShell>
      <div className="live-stack">
        <PageTitle
          title={t("workflow")}
          description={t("workflowDescription")}
          action={
            <Link className="button button-primary" href="/projects/new">
              {t("newProject")}
            </Link>
          }
        />
        <FilterBar action={path} t={t}>
          <FilterInput
            label={t("search")}
            name="q"
            value={single(search.q)}
            placeholder={t("workflowSearchPlaceholder")}
          />
          <FilterSelect
            label={t("fields.state")}
            name="state"
            value={single(search.state)}
            options={jobStates}
            allLabel={t("all")}
          />
        </FilterBar>
        <RecordSurface
          path={path}
          search={search}
          rows={rows}
          columns={jobColumns(t)}
          details={creatorJobDetails(t)}
          empty={t("noJobsMatch")}
          tableTitle={t("compilerJobs")}
          tableLandmark="job-table"
          detailTitle={t("jobDetail")}
          nextCursor={cursor(result.body)}
          detailActions={jobDetailActions(t)}
          t={t}
        />
      </div>
    </CreatorShell>
  );
}

export default async function StaticDestination({
  params,
  searchParams,
}: {
  readonly params: Promise<{
    readonly slug: string[];
    readonly locale: string;
  }>;
  readonly searchParams: Promise<SearchState>;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const t = await getTranslations("AdminSlug");
  const key = slug.join("/");
  const adminPageKey = adminPageKeys[key];
  if (adminPageKey)
    return renderAdmin(key, t(`titles.${adminPageKey}`), search, t);
  if (key === "workflow" || key === "jobs")
    return renderWorkflow(`/${key}`, search, t);
  const review = key.match(/^jobs\/([^/]+)\/review$/u);
  if (review?.[1])
    redirect(`/scene-review?jobId=${encodeURIComponent(review[1])}`);
  notFound();
}
