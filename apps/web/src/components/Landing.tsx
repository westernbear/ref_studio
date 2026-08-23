"use client";

import { ActionButton } from "./Primitives";

const nav = [
  ["Workflow", "/workflow", "landing_nav_workflow"],
  ["Admin", "/admin", "landing_nav_admin"],
  ["Docs", "/docs", "landing_nav_docs"],
  ["Support", "/support", "landing_nav_support"],
] as const;

export function Landing() {
  const startCreating = () => {
    const authenticated = document.cookie
      .split(";")
      .some((cookie) => cookie.trim().startsWith("rvs_session="));
    window.location.assign(
      authenticated ? "/projects/new" : "/sign-in?returnTo=%2Fprojects%2Fnew",
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
          </div>
        </div>
      </nav>
      <main className="landing-main">
        <section className="hero" aria-labelledby="landing-title">
          <p className="eyebrow">REFERENCE VIDEO ENGINEERING / 001</p>
          <h1 id="landing-title">REF_STUDIO</h1>
          <p className="tagline">Frontier Reference Video Engineering.</p>
          <ActionButton
            sourceId="ref_studio_landing:7"
            operationId={null}
            state="enabled"
            className="start-button"
            onClick={startCreating}
          >
            Start Creating <span aria-hidden="true">↗</span>
          </ActionButton>
        </section>
      </main>
      <footer className="landing-footer">
        <span>REF_STUDIO</span>
        <div>
          <a data-control-id="ref_studio_landing:8" href="/api">
            API
          </a>
          <a data-control-id="ref_studio_landing:9" href="/legal">
            Legal
          </a>
          <a data-control-id="ref_studio_landing:10" href="/privacy">
            Privacy
          </a>
          <a
            data-control-id="ref_studio_landing:11"
            href="https://github.com/singlerr/ref_studio"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
        <span>© 2024 REF_STUDIO ENGINE. ALL RIGHTS RESERVED.</span>
      </footer>
    </div>
  );
}
