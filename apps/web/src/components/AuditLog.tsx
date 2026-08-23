"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { ActionButton, Panel } from "./Primitives";

type Outcome = "SUCCESS" | "DENIED" | "FAILED";
type AuditEvent = Readonly<{
  id: string;
  time: string;
  eventType: string;
  outcome: Outcome;
  actor: string;
  tenant: string;
  correlationId: string;
  objectType: string;
  objectId: string;
  safeDetail: string;
}>;
const events: readonly AuditEvent[] = [
  {
    id: "evt_20260822_0912_01",
    time: "2026-08-22 09:12:44 UTC",
    eventType: "AUDIT_LOG_VIEWED",
    outcome: "SUCCESS",
    actor: "ops.admin@rvs.local",
    tenant: "tenant_alpha",
    correlationId: "corr_7d8f2a11",
    objectType: "audit-log",
    objectId: "audit-page-01",
    safeDetail: "Viewed platform-scoped audit history.",
  },
  {
    id: "evt_20260822_0908_02",
    time: "2026-08-22 09:08:19 UTC",
    eventType: "JOB_CANCEL_REQUESTED",
    outcome: "SUCCESS",
    actor: "ops.admin@rvs.local",
    tenant: "tenant_alpha",
    correlationId: "corr_4a90be21",
    objectType: "job",
    objectId: "job_9921_x",
    safeDetail: "Cancellation request recorded for an assigned job.",
  },
  {
    id: "evt_20260822_0856_03",
    time: "2026-08-22 08:56:03 UTC",
    eventType: "TENANT_ROLE_CHANGED",
    outcome: "SUCCESS",
    actor: "ops.admin@rvs.local",
    tenant: "tenant_beta",
    correlationId: "corr_2be4c911",
    objectType: "tenant",
    objectId: "tenant_beta",
    safeDetail: "Role projection changed within platform scope.",
  },
  {
    id: "evt_20260822_0841_04",
    time: "2026-08-22 08:41:27 UTC",
    eventType: "AUDIT_EXPORT_CREATED",
    outcome: "SUCCESS",
    actor: "ops.admin@rvs.local",
    tenant: "platform",
    correlationId: "corr_1fe201a8",
    objectType: "export",
    objectId: "export_20260822_01",
    safeDetail:
      "Scoped export artifact created; artifact expires after 90 days.",
  },
  {
    id: "evt_20260822_0819_05",
    time: "2026-08-22 08:19:55 UTC",
    eventType: "QUARANTINE_RELEASE_BLOCKED",
    outcome: "DENIED",
    actor: "viewer@rvs.local",
    tenant: "tenant_alpha",
    correlationId: "corr_09c4e0b2",
    objectType: "quarantine-item",
    objectId: "qitem_001",
    safeDetail: "Viewer role cannot release quarantined material.",
  },
  {
    id: "evt_20260821_1740_06",
    time: "2026-08-21 17:40:12 UTC",
    eventType: "AUDIT_QUERY_FAILED",
    outcome: "FAILED",
    actor: "system",
    tenant: "platform",
    correlationId: "corr_8c1100de",
    objectType: "audit-log",
    objectId: "audit-query-06",
    safeDetail: "The bounded audit query failed; retry without changing scope.",
  },
];
const control = (number: number): string => `admin_audit_log:${number}`;

export function AuditLog() {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("ALL");
  const [outcome, setOutcome] = useState("ALL");
  const [actor, setActor] = useState("ALL");
  const [tenant, setTenant] = useState("ALL");
  const [range, setRange] = useState("24h");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [notice, setNotice] = useState(
    "Append-only history · platform scope · safe fields only",
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const [queryFailed, setQueryFailed] = useState(false);
  const role = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("role");
  const filtered = useMemo(
    () =>
      events.filter((event) => {
        const needle = query.toLowerCase();
        const recent =
          range === "24h" ? event.id !== "evt_20260821_1740_06" : true;
        return (
          recent &&
          outcome !== "INVALID" &&
          (!needle ||
            `${event.id} ${event.eventType} ${event.actor} ${event.tenant} ${event.correlationId}`
              .toLowerCase()
              .includes(needle)) &&
          (eventType === "ALL" || event.eventType === eventType) &&
          (outcome === "ALL" || event.outcome === outcome) &&
          (actor === "ALL" || event.actor === actor) &&
          (tenant === "ALL" || event.tenant === tenant)
        );
      }),
    [actor, eventType, outcome, query, range, tenant],
  );
  const pageRows = filtered.slice(page * 4, page * 4 + 4);
  const clear = () => {
    setQuery("");
    setEventType("ALL");
    setOutcome("ALL");
    setActor("ALL");
    setTenant("ALL");
    setRange("24h");
    setPage(0);
    setQueryFailed(false);
    setNotice("Filters cleared · append-only history unchanged");
  };
  const copyCorrelation = async (id: string) => {
    try {
      await navigator.clipboard?.writeText(id);
    } catch {
      setNotice(`Correlation ID ready to copy: ${id}`);
      return;
    }
    setNotice(`Copied correlation ID ${id}`);
  };
  const exportRows = () => {
    if (role === "viewer") {
      setExportOpen(false);
      setNotice("Export denied · viewer role cannot create audit artifacts");
      return;
    }
    const body = JSON.stringify(
      {
        scope: tenant === "ALL" ? "platform" : tenant,
        filters: { query, eventType, outcome, actor, tenant, range },
        rows: filtered.map(
          ({
            id,
            time,
            eventType: type,
            outcome: result,
            actor: eventActor,
            tenant: eventTenant,
            correlationId,
          }) => ({
            id,
            time,
            eventType: type,
            outcome: result,
            actor: eventActor,
            tenant: eventTenant,
            correlationId,
          }),
        ),
        expires: "2026-11-20T09:12:44Z",
      },
      null,
      2,
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([body], { type: "application/json" }),
    );
    link.download = "audit-export-scoped.json";
    link.click();
    URL.revokeObjectURL(link.href);
    setExportOpen(false);
    setExportReady(true);
    setNotice(
      `Scoped export created for ${filtered.length} rows · AUDIT_EXPORT_CREATED recorded`,
    );
  };
  const relatedHref =
    selected?.objectType === "job"
      ? `/admin/jobs?jobId=${selected.objectId}`
      : selected?.objectType === "tenant"
        ? `/admin/tenants?tenant=${selected.objectId}`
        : `/admin/audit?event=${selected?.id ?? ""}`;
  const selectFilter =
    (setter: (value: string) => void) =>
    (event: ChangeEvent<HTMLSelectElement>) => {
      setter(event.target.value);
      setPage(0);
    };
  const updateQuery = (value: string) => {
    setQuery(value);
    setPage(0);
    setQueryFailed(value === "__error__");
    setNotice(
      value === "__error__"
        ? "Audit query failed · no raw error details exposed"
        : notice,
    );
  };
  return (
    <div className="admin-page audit-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">OPERATIONS / IMMUTABLE EVENTS</p>
          <h1>Audit log</h1>
          <p className="admin-subtitle">
            Search operational history without editing, deleting, or exposing
            restricted fields.
          </p>
        </div>
      </header>
      <p className="admin-notice" role="status" aria-live="polite">
        {notice}
      </p>
      <Panel className="audit-toolbar">
        <div className="audit-search">
          <label htmlFor="audit-query">Search events and IDs</label>
          <input
            id="audit-query"
            data-control-id={control(1)}
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Correlation, actor, tenant, event, ID"
          />
        </div>
        <label>
          Event type
          <select
            data-control-id={control(2)}
            value={eventType}
            onChange={selectFilter(setEventType)}
          >
            <option value="ALL">All Event Types</option>
            {[...new Set(events.map((event) => event.eventType))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Outcome
          <select
            data-control-id={control(3)}
            value={outcome}
            onChange={selectFilter(setOutcome)}
          >
            <option>ALL</option>
            <option>SUCCESS</option>
            <option>DENIED</option>
            <option>FAILED</option>
            <option value="INVALID">Invalid token</option>
          </select>
        </label>
        <label>
          Actor
          <select
            data-control-id={control(4)}
            value={actor}
            onChange={selectFilter(setActor)}
          >
            <option>ALL</option>
            <option>ops.admin@rvs.local</option>
            <option>viewer@rvs.local</option>
            <option>system</option>
          </select>
        </label>
        <label>
          Tenant
          <select
            data-control-id={control(5)}
            value={tenant}
            onChange={selectFilter(setTenant)}
          >
            <option>ALL</option>
            <option>platform</option>
            <option>tenant_alpha</option>
            <option>tenant_beta</option>
          </select>
        </label>
        <label>
          Date range
          <select
            data-control-id={control(6)}
            value={range}
            onChange={(event) => {
              setRange(event.target.value);
              setPage(0);
            }}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </label>
        <button data-control-id={control(7)} type="button" onClick={clear}>
          Clear filters
        </button>
      </Panel>
      <Panel className="audit-list">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RESULTS</p>
            <h2>
              {queryFailed ? "Query unavailable" : `${filtered.length} events`}
            </h2>
          </div>
          <button
            data-control-id={control(11)}
            type="button"
            onClick={() => setExportOpen(true)}
          >
            Export filtered
          </button>
        </div>
        {queryFailed ? (
          <div className="audit-empty" role="alert">
            The bounded audit query failed.{" "}
            <button type="button" onClick={() => updateQuery("")}>
              Retry query
            </button>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>Outcome</th>
                  <th>Actor / Tenant</th>
                  <th>Correlation</th>
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((event, index) => (
                  <tr key={event.id}>
                    <td className="mono">{event.time}</td>
                    <td>
                      <b>{event.eventType}</b>
                      <small className="mono">{event.id}</small>
                    </td>
                    <td>
                      <span
                        className={`status status-${event.outcome.toLowerCase()}`}
                      >
                        {event.outcome}
                      </span>
                    </td>
                    <td>
                      {event.actor}
                      <small>{event.tenant}</small>
                    </td>
                    <td className="mono">{event.correlationId}</td>
                    <td>
                      <button
                        data-control-id={index === 0 ? control(8) : undefined}
                        className="link-button"
                        type="button"
                        onClick={() => setSelected(event)}
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!queryFailed && filtered.length === 0 ? (
          <p className="audit-empty">
            No events match this bounded scope. Restricted events remain hidden.
          </p>
        ) : null}
        <div className="audit-pager">
          <ActionButton
            data-control-id={control(14)}
            sourceId={control(14)}
            operationId="audit-page-prev"
            state={page === 0 ? "disabled-without-previous-cursor" : "enabled"}
            disabledReason="There is no previous page."
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </ActionButton>
          <span className="mono">Page {page + 1} · newest first</span>
          <ActionButton
            data-control-id={control(15)}
            sourceId={control(15)}
            operationId="audit-page-next"
            state={
              (page + 1) * 4 >= filtered.length
                ? "disabled-without-next-cursor"
                : "enabled"
            }
            disabledReason="There is no next page."
            disabled={(page + 1) * 4 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </ActionButton>
        </div>
      </Panel>
      {exportReady ? (
        <p className="audit-export-note" role="status">
          Download ready · export artifact expires after 90 days; audit rows
          remain visible indefinitely.
        </p>
      ) : null}
      {selected ? (
        <div className="drawer-backdrop">
          <aside
            className="drawer audit-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-detail-title"
          >
            <button
              className="drawer-close"
              type="button"
              aria-label="Close audit details"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <p className="eyebrow">IMMUTABLE RECORD</p>
            <h2 id="audit-detail-title">{selected.eventType}</h2>
            <p>{selected.safeDetail}</p>
            <div className="audit-immutable">
              No edit or delete operations are available. Corrections create a
              new linked event.
            </div>
            <dl className="audit-fields">
              {[
                ["EVENT ID", selected.id],
                ["CORRELATION ID", selected.correlationId],
                ["ACTOR", selected.actor],
                ["TENANT SCOPE", selected.tenant],
                ["RECORDED", selected.time],
                ["SAFE METADATA", selected.safeDetail],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="actions">
              <button
                data-control-id={control(9)}
                type="button"
                onClick={() => copyCorrelation(selected.correlationId)}
              >
                Copy correlation ID
              </button>
              <a data-control-id={control(10)} href={relatedHref}>
                Open related object
              </a>
            </div>
          </aside>
        </div>
      ) : null}
      {exportOpen ? (
        <div className="confirm-backdrop">
          <Panel
            className="confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-export-title"
          >
            <h2 id="audit-export-title">Create scoped export?</h2>
            <p>
              {role === "viewer"
                ? "Viewer role cannot create export artifacts."
                : `Export ${filtered.length} filtered safe events for the current platform scope. The export expires after 90 days.`}
            </p>
            <div className="tenant-confirm-actions">
              <button
                data-control-id={control(12)}
                type="button"
                onClick={() => setExportOpen(false)}
              >
                Cancel
              </button>
              <button
                data-control-id={control(13)}
                type="button"
                onClick={exportRows}
                disabled={role === "viewer"}
              >
                Confirm export
              </button>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
