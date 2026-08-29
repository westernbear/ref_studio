import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AdminWorkerOfflineButton } from "../../../../components/AdminWorkerOfflineButton";
import { Panel } from "../../../../components/Primitives";
import { AdminShell } from "../../../../components/Shells";
import { Link } from "../../../../i18n/navigation";
import {
  field,
  isAuthProblem,
  items,
  liveApiGet,
  text,
  when,
} from "../../../../lib/server-api";

type SearchState = Readonly<
  Record<string, string | readonly string[] | undefined>
>;
type T = Awaited<ReturnType<typeof getTranslations<"AdminWorkers">>>;

const single = (value: string | readonly string[] | undefined): string =>
  typeof value === "string" ? value : (value?.[0] ?? "");

const rows = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const strings = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const queryPath = (search: SearchState): string => {
  const params = new URLSearchParams();
  for (const name of ["q", "status"]) {
    const value = single(search[name]);
    if (value) params.set(name, value);
  }
  const query = params.toString();
  return query ? `/admin/workers?${query}` : "/admin/workers";
};

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ProblemPanel({ code, t }: { readonly code: string; readonly t: T }) {
  return (
    <Panel>
      <h1>{t("title")}</h1>
      <p>
        {isAuthProblem(code) ? t("signInRequired") : t("unavailable", { code })}
      </p>
      {isAuthProblem(code) ? (
        <a
          className="button button-primary"
          href="/admin/sign-in?returnTo=%2Fadmin%2Fworkers"
        >
          {t("signIn")}
        </a>
      ) : null}
    </Panel>
  );
}

function FilterBar({
  search,
  t,
}: {
  readonly search: SearchState;
  readonly t: T;
}) {
  return (
    <form
      className="filter-bar"
      action="/admin/workers"
      method="get"
      data-landmark="worker-filters"
    >
      <div className="filter-fields">
        <label>
          <span>{t("search")}</span>
          <input
            type="search"
            name="q"
            defaultValue={single(search.q)}
            placeholder={t("searchPlaceholder")}
          />
        </label>
        <label>
          <span>{t("status")}</span>
          <select name="status" defaultValue={single(search.status)}>
            <option value="">{t("all")}</option>
            <option value="ONLINE">{t("online")}</option>
            <option value="OFFLINE">{t("offline")}</option>
          </select>
        </label>
      </div>
      <div className="filter-actions">
        <button className="button button-primary" type="submit">
          {t("applyFilters")}
        </button>
        <Link className="button" href="/admin/workers">
          {t("clear")}
        </Link>
      </div>
    </form>
  );
}

function WorkerCard({
  worker,
  t,
}: {
  readonly worker: unknown;
  readonly t: T;
}) {
  const id = text(field(worker, "id"));
  const status = text(field(worker, "status"), "OFFLINE");
  const capabilities = strings(field(worker, "capabilities"));
  const leases = rows(field(worker, "leases"));
  return (
    <Panel data-landmark="worker-card">
      <div className="section-heading">
        <div>
          <h2>{id}</h2>
          <p>{capabilities.join(" / ") || t("noCapabilityReported")}</p>
        </div>
        <span className="status-chip">{status}</span>
      </div>
      <dl className="detail-grid worker-summary-grid">
        <Metric
          label={t("lastHeartbeat")}
          value={when(field(worker, "lastHeartbeatAt"))}
        />
        <Metric
          label={t("activeJobs")}
          value={text(field(worker, "activeLeaseCount"), "0")}
        />
      </dl>
      {leases.length > 0 ? (
        <div className="worker-job-list">
          {leases.slice(0, 3).map((lease) => {
            const jobId = text(field(lease, "jobId"));
            return (
              <a
                key={jobId}
                href={`/scene-review?jobId=${encodeURIComponent(jobId)}`}
              >
                <span>{jobId}</span>
                <small>{text(field(lease, "phase"), t("working"))}</small>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="empty-copy">{t("noActiveJob")}</p>
      )}
      <div className="record-actions">
        <AdminWorkerOfflineButton
          workerId={id}
          disabled={status !== "ONLINE" && leases.length === 0}
        />
      </div>
    </Panel>
  );
}

export default async function AdminWorkersPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchState>;
}) {
  const t = await getTranslations("AdminWorkers");
  const search = await searchParams;
  const result = await liveApiGet(queryPath(search));
  if (!result.ok)
    return (
      <AdminShell>
        <div className="admin-page">
          <ProblemPanel code={result.code} t={t} />
        </div>
      </AdminShell>
    );
  const summary = field(result.body, "summary");
  const workers = items(result.body);
  return (
    <AdminShell>
      <div className="admin-page live-stack">
        <div className="page-title" data-landmark="scope-header">
          <div>
            <h1>{t("title")}</h1>
            <p>{t("subtitle")}</p>
          </div>
        </div>
        <dl className="metric-grid">
          <Metric
            label={t("workers")}
            value={text(field(summary, "totalWorkers"), "0")}
          />
          <Metric
            label={t("online")}
            value={text(field(summary, "onlineWorkers"), "0")}
          />
          <Metric
            label={t("activeLeases")}
            value={text(field(summary, "activeLeases"), "0")}
          />
        </dl>
        <FilterBar search={search} t={t} />
        {workers.length > 0 ? (
          workers.map((worker) => (
            <WorkerCard key={text(field(worker, "id"))} worker={worker} t={t} />
          ))
        ) : (
          <Panel>
            <p className="empty-copy">{t("noWorkersRegistered")}</p>
          </Panel>
        )}
      </div>
    </AdminShell>
  );
}
