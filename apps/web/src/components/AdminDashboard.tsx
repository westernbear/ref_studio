"use client";

import { useMemo, useState } from "react";
import { ActionButton, Panel } from "./Primitives";

type Activity = Readonly<{
  id: string;
  tenant: string;
  event: string;
  state: "observed" | "stale" | "blocked";
  when: string;
}>;

const activities: readonly Activity[] = [
  {
    id: "evt-1042",
    tenant: "Aethelgard Dynamics",
    event: "Render frame progress updated",
    state: "observed",
    when: "2 min ago",
  },
  {
    id: "evt-1041",
    tenant: "Omni Consumer Corp",
    event: "T5 approval receipt issued",
    state: "observed",
    when: "8 min ago",
  },
  {
    id: "evt-1038",
    tenant: "Nakamura Labs",
    event: "Delivery remains quarantined",
    state: "blocked",
    when: "21 min ago",
  },
  {
    id: "evt-1037",
    tenant: "Tyrell Corporation",
    event: "Approval digest is stale",
    state: "stale",
    when: "34 min ago",
  },
] as const;

const statusLabel = (state: Activity["state"]): string =>
  ({ observed: "OBSERVED", stale: "STALE APPROVAL", blocked: "BLOCKED" })[
    state
  ];

export function AdminDashboard() {
  const [notice, setNotice] = useState(
    "Live scope connected · last sync just now",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const visibleActivities = useMemo(() => activities.slice(0, 4), []);
  const refresh = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setNotice("Live scope connected · last sync just now");
    }, 250);
  };

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">OPERATIONS / PLATFORM SCOPE</p>
          <h1>Admin dashboard</h1>
          <p className="admin-subtitle">
            Evidence, queue state, and decisions across assigned tenants.
          </p>
        </div>
        <div className="admin-header-actions">
          <button type="button" onClick={refresh}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" onClick={() => setDrawerOpen(true)}>
            Scope details
          </button>
        </div>
      </header>
      <p className="admin-notice" role="status">
        {notice}
      </p>
      <div className="admin-metrics" aria-label="Queue summary">
        <Panel>
          <span className="metric-label">QUEUED</span>
          <strong>12</strong>
          <small>4 awaiting worker claim</small>
        </Panel>
        <Panel>
          <span className="metric-label">RENDERING</span>
          <strong>7</strong>
          <small>Frame progress separate from approval</small>
        </Panel>
        <Panel>
          <span className="metric-label">AT RISK</span>
          <strong className="metric-risk">3</strong>
          <small>Stale or blocked evidence</small>
        </Panel>
        <Panel>
          <span className="metric-label">TENANTS</span>
          <strong>8</strong>
          <small>6 active · 2 paused</small>
        </Panel>
      </div>
      <div className="admin-grid">
        <Panel className="admin-activity">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RECENT ACTIVITY</p>
              <h2>What changed</h2>
            </div>
            <a href="/admin/audit">View audit</a>
          </div>
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">Recent scoped activity</caption>
              <thead>
                <tr>
                  <th>EVENT</th>
                  <th>TENANT</th>
                  <th>STATE</th>
                  <th>WHEN</th>
                </tr>
              </thead>
              <tbody>
                {visibleActivities.map((activity) => (
                  <tr key={activity.id}>
                    <td>
                      {activity.event}
                      <small className="mono">{activity.id}</small>
                    </td>
                    <td>{activity.tenant}</td>
                    <td>
                      <span className={`status status-${activity.state}`}>
                        {statusLabel(activity.state)}
                      </span>
                    </td>
                    <td>{activity.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="admin-queue">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">QUEUE HEALTH</p>
              <h2>Needs attention</h2>
            </div>
            <a href="/admin/jobs">Open jobs</a>
          </div>
          <ul className="risk-list">
            <li>
              <span className="status status-stale">STALE APPROVAL</span>
              <span>RND-8991-X · Aethelgard Dynamics</span>
            </li>
            <li>
              <span className="status status-blocked">BLOCKED</span>
              <span>RND-8970-T · delivery unavailable</span>
            </li>
            <li>
              <span className="status status-observed">OBSERVED</span>
              <span>12 jobs await worker claim</span>
            </li>
          </ul>
        </Panel>
      </div>
      {drawerOpen && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={() => setDrawerOpen(false)}
        >
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scope-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="drawer-close"
              type="button"
              aria-label="Close scope details"
              onClick={() => setDrawerOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">SCOPE HEADER</p>
            <h2 id="scope-title">Platform scope</h2>
            <p>
              Access is derived from server-side tenant assignments. This view
              contains operational metadata only; private paths and billing
              details remain redacted.
            </p>
            <dl className="scope-list">
              <div>
                <dt>Role</dt>
                <dd>Super-admin</dd>
              </div>
              <div>
                <dt>Tenants</dt>
                <dd>All assigned</dd>
              </div>
              <div>
                <dt>Correlation</dt>
                <dd className="mono">scope-2026-08-22</dd>
              </div>
            </dl>
            <a className="drawer-link" href="/admin/jobs">
              Review job queue
            </a>
          </aside>
        </div>
      )}
    </div>
  );
}
