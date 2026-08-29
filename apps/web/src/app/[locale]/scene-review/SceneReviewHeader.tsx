import { getTranslations } from "next-intl/server";
import { BrandLogo } from "../../../components/Shells";
import { Link } from "../../../i18n/navigation";

export async function SceneReviewHeader() {
  const t = await getTranslations("SceneReview.header");
  return (
    <header className="upload-header" data-landmark="app-header">
      <Link className="brand" href="/" aria-label={t("homeAriaLabel")}>
        <BrandLogo />
      </Link>
      <nav aria-label={t("primaryNavAriaLabel")}>
        <Link href="/workflow">{t("workflow")}</Link>
        <Link href="/admin">{t("admin")}</Link>
        <Link href="/docs">{t("docs")}</Link>
        <Link href="/support">{t("support")}</Link>
      </nav>
      <div className="header-actions">
        <Link className="button button-primary" href="/projects/new">
          {t("newProject")}
        </Link>
      </div>
    </header>
  );
}
