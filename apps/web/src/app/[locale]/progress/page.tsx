import { CreatorShell } from "../../components/Shells";
import { Panel } from "../../components/Primitives";
import { parseJobProgress } from "../../lib/job-progress";
import { isAuthProblem, liveApiGet } from "../../lib/server-api";
import { ProgressTracker } from "./ProgressTracker";

export default async function ProgressPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly jobId?: string | readonly string[];
  }>;
}) {
  const params = await searchParams;
  const rawJobId = params.jobId;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  if (!jobId)
    return (
      <CreatorShell>
        <Panel>
          <h1>Compiler Progress</h1>
          <p>Choose a compiler job from Workflow to track progress.</p>
          <a className="button button-primary" href="/workflow">
            Workflow
          </a>
        </Panel>
      </CreatorShell>
    );

  const result = await liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}`);
  if (!result.ok)
    return (
      <CreatorShell>
        <Panel>
          <h1>Compiler Progress</h1>
          <p>
            {isAuthProblem(result.code)
              ? "Sign in to track this compiler job."
              : `Compiler job is unavailable: ${result.code}.`}
          </p>
          {isAuthProblem(result.code) ? (
            <a
              className="button button-primary"
              href={`/sign-in?returnTo=${encodeURIComponent(
                `/progress?jobId=${jobId}`,
              )}`}
            >
              Sign in
            </a>
          ) : (
            <a className="button button-primary" href="/workflow">
              Workflow
            </a>
          )}
        </Panel>
      </CreatorShell>
    );

  const job = parseJobProgress(result.body);
  if (!job)
    return (
      <CreatorShell>
        <Panel>
          <h1>Compiler Progress</h1>
          <p>Compiler job returned an unreadable status payload.</p>
          <a className="button button-primary" href="/workflow">
            Workflow
          </a>
        </Panel>
      </CreatorShell>
    );

  return <ProgressTracker initialJob={job} />;
}
