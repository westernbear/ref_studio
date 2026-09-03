import { getTranslations } from "next-intl/server";
import { CreatorShell } from "../../../components/Shells";
import { parseJobProgress } from "../../../lib/job-progress";
import { isAuthProblem, liveApiGet } from "../../../lib/server-api";
import { Link } from "../../../i18n/navigation";
import { ProgressTracker } from "./ProgressTracker";

export default async function ProgressPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly jobId?: string | readonly string[];
  }>;
}) {
  const t = await getTranslations("ProgressPage");
  const params = await searchParams;
  const rawJobId = params.jobId;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  if (!jobId)
    return (
      <CreatorShell>
        <section className="panel">
          <h1>{t("title")}</h1>
          <p>{t("chooseJob")}</p>
          <Link className="button button-primary" href="/workflow">
            {t("workflow")}
          </Link>
        </section>
      </CreatorShell>
    );

  const result = await liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}`);
  if (!result.ok)
    return (
      <CreatorShell>
        <section className="panel">
          <h1>{t("title")}</h1>
          <p>
            {isAuthProblem(result.code)
              ? t("signInToTrack")
              : t("unavailable", { code: result.code })}
          </p>
          {isAuthProblem(result.code) ? (
            <Link
              className="button button-primary"
              href={`/sign-in?returnTo=${encodeURIComponent(
                `/progress?jobId=${jobId}`,
              )}`}
            >
              {t("signIn")}
            </Link>
          ) : (
            <Link className="button button-primary" href="/workflow">
              {t("workflow")}
            </Link>
          )}
        </section>
      </CreatorShell>
    );

  const job = parseJobProgress(result.body);
  if (!job)
    return (
      <CreatorShell>
        <section className="panel">
          <h1>{t("title")}</h1>
          <p>{t("unreadable")}</p>
          <Link className="button button-primary" href="/workflow">
            {t("workflow")}
          </Link>
        </section>
      </CreatorShell>
    );

  return <ProgressTracker initialJob={job} />;
}
