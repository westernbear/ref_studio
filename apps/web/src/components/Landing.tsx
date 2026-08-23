"use client";

import { useState } from "react";
import { ActionButton, Panel } from "./Primitives";

type Drawer = "notifications" | "settings" | null;

const nav = [
  ["Workflow", "/workflow", "landing_nav_workflow"],
  ["Admin", "/admin", "landing_nav_admin"],
  ["Docs", "/docs", "landing_nav_docs"],
  ["Support", "/support", "landing_nav_support"],
] as const;

const features = [
  ["EYE-01", "Temporal Evidence Extraction"],
  ["EYE-02", "Deterministic Browser Render"],
  ["EYE-03", "Semantic UI Portability"],
] as const;

export function Landing() {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const startCreating = () => {
    const authenticated = document.cookie
      .split(";")
      .some((cookie) => cookie.trim().startsWith("rvs_session="));
    window.location.assign(
      authenticated
        ? "/projects/new/upload"
        : "/sign-in?returnTo=%2Fprojects%2Fnew",
    );
  };
  return (
    <div className="landing">
      <nav className="landing-nav" aria-label="Primary navigation">
        <div className="landing-nav-inner">
          <a
            className="wordmark"
            data-control-id="ref_studio_landing:1"
            href="/"
            aria-label="REF_STUDIO home"
          >
            REF_STUDIO
          </a>
          <div className="landing-links">
            {nav.map(([name, href], index) => (
              <a
                key={href}
                data-control-id={`ref_studio_landing:${index + 2}`}
                href={href}
              >
                {name}
              </a>
            ))}
          </div>
          <div className="landing-actions">
            <ActionButton
              sourceId="ref_studio_landing:6"
              operationId={null}
              state="enabled"
              className="new-project"
              onClick={startCreating}
            >
              New Project
            </ActionButton>
            <ActionButton
              sourceId="ref_studio_landing:7"
              operationId={null}
              state="enabled"
              className="icon-button"
              aria-label="Open notifications"
              onClick={() => setDrawer("notifications")}
            >
              ◌
            </ActionButton>
            <ActionButton
              sourceId="ref_studio_landing:8"
              operationId={null}
              state="enabled"
              className="icon-button"
              aria-label="Open settings"
              onClick={() => setDrawer("settings")}
            >
              ⌘
            </ActionButton>
          </div>
        </div>
      </nav>
      <main className="landing-main">
        <section className="hero" aria-labelledby="landing-title">
          <p className="eyebrow">REFERENCE VIDEO ENGINEERING / 001</p>
          <h1 id="landing-title">REF_STUDIO</h1>
          <p className="tagline">Frontier Reference Video Engineering.</p>
          <ActionButton
            sourceId="ref_studio_landing:9"
            operationId={null}
            state="enabled"
            className="start-button"
            onClick={startCreating}
          >
            Start Creating <span aria-hidden="true">↗</span>
          </ActionButton>
        </section>
        <section className="feature-grid" aria-label="Studio capabilities">
          {features.map(([code, title]) => (
            <Panel key={code} className="feature-card">
              <span className="feature-code">{code}</span>
              <h2>{title}</h2>
              <span className="feature-mark" aria-hidden="true">
                +
              </span>
            </Panel>
          ))}
        </section>
        <p className="pilot-note">
          A bounded 4-second pilot for every reference.
        </p>
      </main>
      <footer className="landing-footer">
        <span>REF_STUDIO</span>
        <div>
          <a data-control-id="ref_studio_landing:10" href="/api">
            API
          </a>
          <a data-control-id="ref_studio_landing:11" href="/legal">
            Legal
          </a>
          <a data-control-id="ref_studio_landing:12" href="/privacy">
            Privacy
          </a>
          <a
            data-control-id="ref_studio_landing:13"
            href="https://github.com/singlerr/ref_studio"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
        <span>© 2024 REF_STUDIO ENGINE. ALL RIGHTS RESERVED.</span>
      </footer>
      {drawer && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onClick={() => setDrawer(null)}
        >
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="drawer-close"
              aria-label="Close drawer"
              onClick={() => setDrawer(null)}
            >
              ×
            </button>
            <p className="eyebrow">CONTROL SURFACE</p>
            <h2 id="drawer-title">
              {drawer === "notifications" ? "Notifications" : "Settings"}
            </h2>
            {drawer === "notifications" ? (
              <p>
                No new notifications. Your studio is ready for the next
                reference.
              </p>
            ) : (
              <p>
                Session preferences are managed locally. Sign in to change
                workspace settings.
              </p>
            )}
            <a
              className="drawer-link"
              href={drawer === "notifications" ? "/workflow" : "/settings"}
            >
              Open {drawer === "notifications" ? "workflow" : "settings"}
            </a>
          </aside>
        </div>
      )}
    </div>
  );
}
