import { CreatorShell } from "../../components/Shells";
import { Panel } from "../../components/Primitives";
import {
  field,
  isAuthProblem,
  liveApiGet,
  text,
  when,
} from "../../lib/server-api";

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default async function SceneReviewPage({
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
          <h1>Scene Review</h1>
          <p>Choose a compiler job from Workflow to review.</p>
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
          <h1>Scene Review</h1>
          <p>
            {isAuthProblem(result.code)
              ? "Sign in to view this compiler job."
              : `Compiler job is unavailable: ${result.code}.`}
          </p>
          {isAuthProblem(result.code) ? (
            <a
              className="button button-primary"
              href={`/sign-in?returnTo=${encodeURIComponent(
                `/scene-review?jobId=${jobId}`,
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
  return (
    <CreatorShell>
      <div className="live-stack">
        <div className="page-title">
          <div>
            <h1>Scene Review</h1>
            <p>Live compiler job status and review entry point.</p>
          </div>
          <a className="button button-primary" href="/workflow">
            Workflow
          </a>
        </div>
        <Panel>
          <dl className="detail-grid">
            <Detail label="Job" value={text(field(result.body, "id"))} />
            <Detail label="State" value={text(field(result.body, "state"))} />
            <Detail
              label="Attempt"
              value={text(field(result.body, "attempt"), "0")}
            />
            <Detail
              label="Created"
              value={when(field(result.body, "createdAt"))}
            />
            <Detail
              label="Updated"
              value={when(field(result.body, "updatedAt"))}
            />
          </dl>
        </Panel>
      </div>
    </CreatorShell>
  );
}
