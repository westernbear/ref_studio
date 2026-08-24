import { liveApiGet } from "../lib/server-api";

const projectReturnTo = encodeURIComponent("/projects/new");

export default async function HomePage() {
  const session = await liveApiGet("/v1/jobs?limit=1");
  const newProjectHref = session.ok
    ? "/projects/new"
    : `/sign-in?returnTo=${projectReturnTo}`;

  return (
    <div className="upload-shell">
      <header className="upload-header">
        <a className="brand-link" href="/" aria-label="Reference Video Studio">
          REF_STUDIO
        </a>
        <nav aria-label="Primary navigation">
          <a href="/workflow">Workflow</a>
          <a href="/admin">Admin</a>
        </nav>
        <div className="header-actions">
          <a className="button button-primary" href={newProjectHref}>
            New Project
          </a>
        </div>
      </header>
      <main className="upload-main">
        <p className="eyebrow">Reference Video Engineering / 001</p>
        <h1>REF_STUDIO</h1>
        <p className="intro">Frontier Reference Video Engineering.</p>
        <a className="button button-primary" href={newProjectHref}>
          {session.ok ? "Start Creating" : "Sign in now"}
        </a>
      </main>
      <footer className="auth-footer">
        <span>REF_STUDIO</span>
        <span>© 2026 REFERENCE VIDEO STUDIO</span>
      </footer>
    </div>
  );
}
