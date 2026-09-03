import { getTranslations } from "next-intl/server";
import { liveApiGet } from "../../lib/server-api";
import { BrandLogo } from "../../components/Shells";
import { Link } from "../../i18n/navigation";

const projectReturnTo = encodeURIComponent("/projects/new");
const featureCards = ["extraction", "render", "portability"] as const;

export default async function HomePage() {
  const t = await getTranslations("Landing");
  const session = await liveApiGet("/v1/jobs?limit=1");
  const newProjectHref = session.ok
    ? "/projects/new"
    : `/sign-in?returnTo=${projectReturnTo}`;

  return (
    <div className="landing-shell">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-left">
            <Link
              className="landing-brand"
              href="/"
              aria-label={t("homeAriaLabel")}
            >
              <BrandLogo />
            </Link>
            <nav
              className="landing-links"
              aria-label={t("primaryNavAriaLabel")}
            >
              <Link href="/workflow">{t("nav.workflow")}</Link>
              <Link href="/admin">{t("nav.admin")}</Link>
              <a href="#docs">{t("nav.docs")}</a>
              <a href="#support">{t("nav.support")}</a>
            </nav>
          </div>
          <div className="landing-actions">
            <Link className="landing-new-project" href={newProjectHref}>
              {t("newProject")}
            </Link>
          </div>
        </div>
      </header>
      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <h1 id="landing-title">REF_STUDIO</h1>
          <p>{t("tagline")}</p>
          <Link className="landing-cta" href={newProjectHref}>
            {t("startCreating")}
          </Link>
        </section>
        <section
          className="landing-features"
          aria-label={t("featuresAriaLabel")}
        >
          {featureCards.map((key) => (
            <article className="landing-feature" key={key}>
              <span>{t(`features.${key}.code`)}</span>
              <h2>{t(`features.${key}.title`)}</h2>
            </article>
          ))}
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span className="landing-footer-brand">REF_STUDIO</span>
          <nav
            className="landing-footer-links"
            aria-label={t("footerNavAriaLabel")}
          >
            <a href="#api">{t("footer.api")}</a>
            <a href="#legal">{t("footer.legal")}</a>
            <a href="#privacy">{t("footer.privacy")}</a>
            <a href="#github">{t("footer.github")}</a>
          </nav>
          <span>{t("copyright")}</span>
        </div>
      </footer>
    </div>
  );
}
