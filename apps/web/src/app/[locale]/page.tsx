import { liveApiGet } from "../lib/server-api";
import { BrandLogo } from "../components/Shells";

const projectReturnTo = encodeURIComponent("/projects/new");
const featureCards = [
  ["EYE-01", "Temporal Evidence Extraction"],
  ["EYE-02", "Deterministic Browser Render"],
  ["EYE-03", "Semantic UI Portability"],
] as const;

export default async function HomePage() {
  const session = await liveApiGet("/v1/jobs?limit=1");
  const newProjectHref = session.ok
    ? "/projects/new"
    : `/sign-in?returnTo=${projectReturnTo}`;

  return (
    <div className="landing-shell">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-left">
            <a
              className="landing-brand"
              href="/"
              aria-label="Reference Video Studio home"
            >
              <BrandLogo />
            </a>
            <nav className="landing-links" aria-label="Primary navigation">
              <a href="/workflow">Workflow</a>
              <a href="/admin">Admin</a>
              <a href="#docs">Docs</a>
              <a href="#support">Support</a>
            </nav>
          </div>
          <div className="landing-actions">
            <a className="landing-new-project" href={newProjectHref}>
              New Project
            </a>
            <button
              className="landing-icon-button"
              type="button"
              aria-label="Notifications"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm8-4-2-2v-5a6.1 6.1 0 0 0-4.5-5.9V4a1.5 1.5 0 0 0-3 0v1.1A6.1 6.1 0 0 0 6 11v5l-2 2v1h16v-1Z" />
              </svg>
            </button>
            <button
              className="landing-icon-button"
              type="button"
              aria-label="Settings"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.4 7.4 0 0 0-1.69-.98L14.5 2.42A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42L9.12 5.07c-.61.24-1.18.56-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.02.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.14.24.42.34.68.22l2.41-.97c.51.4 1.07.73 1.69.97l.38 2.65a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.38-2.65c.61-.24 1.18-.57 1.69-.97l2.41.97c.26.11.54.02.68-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <h1 id="landing-title">REF_STUDIO</h1>
          <p>Frontier Reference Video Engineering.</p>
          <a className="landing-cta" href={newProjectHref}>
            Start Creating
          </a>
        </section>
        <section
          className="landing-features"
          aria-label="Reference engineering capabilities"
        >
          {featureCards.map(([code, title]) => (
            <article className="landing-feature" key={code}>
              <span>{code}</span>
              <h2>{title}</h2>
            </article>
          ))}
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span className="landing-footer-brand">REF_STUDIO</span>
          <nav className="landing-footer-links" aria-label="Footer navigation">
            <a href="#api">API</a>
            <a href="#legal">Legal</a>
            <a href="#privacy">Privacy</a>
            <a href="#github">GitHub</a>
          </nav>
          <span>© 2024 REF_STUDIO ENGINE. ALL RIGHTS RESERVED.</span>
        </div>
      </footer>
    </div>
  );
}
