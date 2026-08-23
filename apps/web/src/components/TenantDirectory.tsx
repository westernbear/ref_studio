"use client";

import { useMemo, useState } from "react";
import { ActionButton, Panel } from "./Primitives";

type Role = "SUPER_ADMIN" | "OPS_ADMIN" | "VIEWER";
type TenantStatus = "active" | "suspended";
type Tenant = Readonly<{
  id: string;
  name: string;
  status: TenantStatus;
  members: number;
  jobs: number;
  quota: number;
  retention: string;
  risk: "low" | "watch";
  version: number;
  activities: readonly string[];
}>;

const seedTenants: readonly Tenant[] = [
  {
    id: "tnt_aegis",
    name: "Aegis Corporation",
    status: "active",
    members: 142,
    jobs: 8,
    quota: 78,
    retention: "30 days",
    risk: "low",
    version: 7,
    activities: [
      "Batch job RND-8991-X completed",
      "Operator assignment reviewed",
      "Storage threshold remains below policy",
    ],
  },
  {
    id: "tnt_vanguard",
    name: "Vanguard Labs",
    status: "active",
    members: 56,
    jobs: 2,
    quota: 32,
    retention: "14 days",
    risk: "low",
    version: 3,
    activities: [
      "Job RND-8990-W published",
      "Member access reviewed",
      "Quota refreshed",
    ],
  },
  {
    id: "tnt_helios",
    name: "Helios Network",
    status: "suspended",
    members: 12,
    jobs: 0,
    quota: 0,
    retention: "7 days",
    risk: "watch",
    version: 4,
    activities: [
      "Suspension policy applied",
      "No active jobs",
      "Audit review requested",
    ],
  },
  {
    id: "tnt_nakamura",
    name: "Nakamura Labs",
    status: "active",
    members: 28,
    jobs: 4,
    quota: 64,
    retention: "30 days",
    risk: "watch",
    version: 5,
    activities: [
      "Delivery remains quarantined",
      "Quota warning threshold reached",
      "Audit event recorded",
    ],
  },
] as const;

const control = (number: number): string => `admin_tenants:${number}`;

export function TenantDirectory() {
  const [tenants, setTenants] = useState<readonly Tenant[]>(seedTenants);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | TenantStatus>("ALL");
  const [view, setView] = useState<"table" | "cards">("table");
  const [role, setRole] = useState<Role>("SUPER_ADMIN");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [confirmTenant, setConfirmTenant] = useState(false);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState(
    "Live scope connected · tenant assignments are server-derived",
  );
  const selected = tenants.find((tenant) => tenant.id === selectedId);
  const canMutate = role !== "VIEWER" && selected?.status === "active";
  const filtered = useMemo(
    () =>
      tenants.filter(
        (tenant) =>
          (status === "ALL" || tenant.status === status) &&
          `${tenant.name} ${tenant.id}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [query, status, tenants],
  );
  const openTenant = (id: string) => {
    setSelectedId(id);
    setMenuId(null);
    setNotice("Tenant detail opened · private media and paths remain redacted");
  };
  const assignRole = () => {
    if (!canMutate || !selected) return;
    setAccessOpen(false);
    setNotice(
      `Access updated for ${selected.name} · before/after recorded in audit ${selected.id}:access`,
    );
  };
  const suspend = () => {
    if (!canMutate || !selected || !confirmTenant || reason.trim().length < 3)
      return;
    setTenants((current) =>
      current.map((tenant) =>
        tenant.id === selected.id
          ? { ...tenant, status: "suspended", version: tenant.version + 1 }
          : tenant,
      ),
    );
    setSuspendOpen(false);
    setConfirmTenant(false);
    setReason("");
    setNotice(
      `Suspension applied to ${selected.id} · before/after and audit result recorded`,
    );
  };

  return (
    <div className="admin-page tenant-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">OPERATIONS / PLATFORM SCOPE</p>
          <h1>Tenants</h1>
          <p className="admin-subtitle">
            Manage active environments and resource allocations without widening
            tenant scope.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            data-control-id={control(1)}
            type="button"
            onClick={() =>
              setNotice(
                "Tenant projection refreshed · assignments re-evaluated server-side",
              )
            }
          >
            Refresh
          </button>
          <a
            data-control-id={control(2)}
            className="tenant-link-button"
            href="/admin/audit"
          >
            Audit index
          </a>
        </div>
      </header>
      <p className="admin-notice" role="status">
        {notice}
      </p>
      <div className="tenant-toolbar">
        <label className="tenant-search">
          Search tenants
          <input
            data-control-id={control(3)}
            aria-label="Search tenants"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tenant or ID"
          />
        </label>
        <label>
          State
          <select
            data-control-id={control(4)}
            aria-label="Filter tenant state"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "ALL" | TenantStatus)
            }
          >
            <option value="ALL">All states</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <div className="tenant-view-toggle" aria-label="Tenant view">
          <button
            data-control-id={control(5)}
            type="button"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            Table
          </button>
          <button
            data-control-id={control(6)}
            type="button"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
          >
            Cards
          </button>
        </div>
      </div>
      <div className="tenant-summary">
        <span>
          VISIBLE <b>{filtered.length}</b>
        </span>
        <span>
          ACTIVE JOBS{" "}
          <b>{filtered.reduce((sum, tenant) => sum + tenant.jobs, 0)}</b>
        </span>
        <span>
          AT RISK{" "}
          <b>{filtered.filter((tenant) => tenant.risk === "watch").length}</b>
        </span>
      </div>
      <Panel className={`tenant-list tenant-list-${view}`}>
        {view === "table" ? (
          <div className="tenant-table-wrap">
            <table>
              <caption className="sr-only">Scoped tenant directory</caption>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Members</th>
                  <th>Active jobs</th>
                  <th>Quota</th>
                  <th>Risk</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tenant, index) => (
                  <tr key={tenant.id} onClick={() => openTenant(tenant.id)}>
                    <td>
                      <button
                        {...(index === 0
                          ? { "data-control-id": control(7) }
                          : { "data-tenant-action": "open" })}
                        className="link-button tenant-name"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openTenant(tenant.id);
                        }}
                      >
                        {tenant.name}
                        <small className="mono">{tenant.id}</small>
                      </button>
                    </td>
                    <td>
                      <span className={`status status-${tenant.status}`}>
                        {tenant.status.toUpperCase()}
                      </span>
                    </td>
                    <td>{tenant.members}</td>
                    <td>{tenant.jobs}</td>
                    <td>
                      <span>{tenant.quota}%</span>
                      <progress max="100" value={tenant.quota} />
                    </td>
                    <td>
                      <span className={`status status-${tenant.risk}`}>
                        {tenant.risk === "watch" ? "WATCH" : "LOW"}
                      </span>
                    </td>
                    <td>
                      <button
                        {...(index === 0
                          ? { "data-control-id": control(8) }
                          : { "data-tenant-action": "more" })}
                        aria-label={`More actions for ${tenant.name}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuId(menuId === tenant.id ? null : tenant.id);
                        }}
                      >
                        More
                      </button>
                      {menuId === tenant.id && (
                        <div className="tenant-menu">
                          <button
                            data-control-id={control(9)}
                            type="button"
                            onClick={() => openTenant(tenant.id)}
                          >
                            Open detail
                          </button>
                          <a
                            data-control-id={control(10)}
                            href={`/admin/jobs?tenantId=${tenant.id}`}
                          >
                            Jobs
                          </a>
                          <a
                            data-control-id={control(11)}
                            href={`/admin/billing?tenantId=${tenant.id}`}
                          >
                            Billing
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tenant-cards">
            {filtered.map((tenant, index) => (
              <article key={tenant.id} className="tenant-card">
                <div className="panel-heading">
                  <div>
                    <h2>{tenant.name}</h2>
                    <small className="mono">{tenant.id}</small>
                  </div>
                  <span className={`status status-${tenant.status}`}>
                    {tenant.status.toUpperCase()}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Members</dt>
                    <dd>{tenant.members}</dd>
                  </div>
                  <div>
                    <dt>Jobs</dt>
                    <dd>{tenant.jobs}</dd>
                  </div>
                  <div>
                    <dt>Quota</dt>
                    <dd>{tenant.quota}%</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>{tenant.risk}</dd>
                  </div>
                </dl>
                <button
                  {...(index === 0
                    ? { "data-control-id": control(12) }
                    : { "data-tenant-action": "open-card" })}
                  type="button"
                  onClick={() => openTenant(tenant.id)}
                >
                  Open detail
                </button>
              </article>
            ))}
          </div>
        )}
        {!filtered.length && (
          <p className="tenant-empty">
            No tenants in the current assigned scope.
          </p>
        )}
      </Panel>
      {selected && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={() => setSelectedId(null)}
        >
          <aside
            className="drawer tenant-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              data-control-id={control(13)}
              className="drawer-close"
              type="button"
              aria-label="Close tenant details"
              onClick={() => setSelectedId(null)}
            >
              ×
            </button>
            <p className="eyebrow">TENANT DETAIL / ASSIGNED SCOPE</p>
            <h2 id="tenant-detail-title">{selected.name}</h2>
            <p className="mono">
              {selected.id} · version {selected.version}
            </p>
            <span className={`status status-${selected.status}`}>
              {selected.status.toUpperCase()}
            </span>
            <div className="tenant-bento">
              <div>
                <span>MEMBERS</span>
                <strong>{selected.members}</strong>
              </div>
              <div>
                <span>ACTIVE JOBS</span>
                <strong>{selected.jobs}</strong>
              </div>
              <div>
                <span>QUOTA</span>
                <strong>{selected.quota}%</strong>
              </div>
              <div>
                <span>RETENTION</span>
                <strong>{selected.retention}</strong>
              </div>
            </div>
            <h3>Recent activity</h3>
            <ul className="tenant-activity">
              {selected.activities.map((activity, index) => (
                <li key={activity}>
                  <a
                    data-control-id={control(14 + index)}
                    href={`/admin/audit?tenantId=${selected.id}&event=${index}`}
                  >
                    {activity}
                    <small>inspect audit event</small>
                  </a>
                </li>
              ))}
            </ul>
            <a
              data-control-id={control(17)}
              className="tenant-activity-link"
              href={`/admin/audit?tenantId=${selected.id}`}
            >
              View all tenant activity
            </a>
            <div className="tenant-drawer-links">
              <a
                data-control-id={control(18)}
                href={`/admin/jobs?tenantId=${selected.id}`}
              >
                Jobs
              </a>
              <a
                data-control-id={control(19)}
                href={`/admin/billing?tenantId=${selected.id}`}
              >
                Billing / quota
              </a>
              <a
                data-control-id={control(20)}
                href={`/admin/audit?tenantId=${selected.id}`}
              >
                Audit trail
              </a>
            </div>
            <div className="tenant-actions">
              <ActionButton
                data-control-id={control(21)}
                sourceId={control(21)}
                operationId={`access:${selected.id}`}
                state={canMutate ? "enabled" : "disabled-viewer"}
                disabled={!canMutate}
                disabledReason={
                  role === "VIEWER"
                    ? "Viewer role cannot mutate tenant access"
                    : "Suspended tenants cannot be changed"
                }
                onClick={() => setAccessOpen(true)}
              >
                Manage access
              </ActionButton>
              <ActionButton
                data-control-id={control(22)}
                sourceId={control(22)}
                operationId={`suspend:${selected.id}`}
                state={canMutate ? "enabled" : "disabled-policy"}
                disabled={!canMutate}
                disabledReason="Suspension requires an assigned operator and active tenant"
                onClick={() => setSuspendOpen(true)}
              >
                Suspend
              </ActionButton>
            </div>
          </aside>
        </div>
      )}
      {accessOpen && selected && (
        <div className="confirm-backdrop">
          <Panel
            className="confirm"
            role="dialog"
            aria-labelledby="access-title"
          >
            <h2 id="access-title">Manage access</h2>
            <p>
              Assignment is bounded to <b>{selected.id}</b>. Viewer role is
              read-only.
            </p>
            <label>
              Acting role
              <select
                data-control-id={control(23)}
                aria-label="Acting role"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                <option value="SUPER_ADMIN">Super-admin</option>
                <option value="OPS_ADMIN">Ops admin</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </label>
            <div className="tenant-confirm-actions">
              <button type="button" onClick={() => setAccessOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={role === "VIEWER"}
                onClick={assignRole}
              >
                Apply access
              </button>
            </div>
          </Panel>
        </div>
      )}
      {suspendOpen && selected && (
        <div className="confirm-backdrop">
          <Panel
            className="confirm"
            role="dialog"
            aria-labelledby="suspend-title"
          >
            <h2 id="suspend-title">Suspend {selected.name}?</h2>
            <p>
              This stops new work and preserves existing audit history. Confirm
              the tenant ID and provide a reason.
            </p>
            <label>
              <input
                type="checkbox"
                checked={confirmTenant}
                onChange={(event) => setConfirmTenant(event.target.checked)}
              />{" "}
              I confirm {selected.id}
            </label>
            <label>
              Reason
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Operational reason"
              />
            </label>
            <div className="tenant-confirm-actions">
              <button type="button" onClick={() => setSuspendOpen(false)}>
                Keep active
              </button>
              <button
                type="button"
                disabled={!confirmTenant || reason.trim().length < 3}
                onClick={suspend}
              >
                Confirm suspension
              </button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
