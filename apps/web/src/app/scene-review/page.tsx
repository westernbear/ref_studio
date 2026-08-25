import { CreatorShell } from "../../components/Shells";
import { Panel } from "../../components/Primitives";
import {
  approvalGates,
  nextApprovalGate,
  type ApprovalGate,
} from "../../lib/job-progress";
import {
  field,
  isAuthProblem,
  items,
  liveApiGet,
  text,
} from "../../lib/server-api";
import { RenderJobButton } from "./RenderJobButton";
import { ChoiceResolver } from "./ChoiceResolver";

const gates = approvalGates;
type Gate = ApprovalGate;

const list = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];
const stringList = (value: unknown): readonly string[] =>
  list(value).filter((item): item is string => typeof item === "string");
const numberValue = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatSourceWindow = (seconds: number): string =>
  `${seconds.toFixed(2)}S - ${(seconds + 4).toFixed(2)}S`;
const latestReceiptFor = (
  receipts: readonly unknown[],
  gate: Gate,
  attempt: number,
): unknown =>
  [...receipts]
    .reverse()
    .find(
      (receipt) =>
        text(field(receipt, "gate"), "") === gate &&
        numberValue(field(receipt, "attempt")) === attempt,
    );

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
  const [result, evidenceResult, receiptsResult] = await Promise.all([
    liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}`),
    liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}/evidence`),
    liveApiGet(`/v1/receipts?jobId=${encodeURIComponent(jobId)}`),
  ]);
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
  const state = text(field(result.body, "state"));
  const preparationStage = text(field(result.body, "preparationStage"));
  const etag = text(field(result.body, "etag"), "");
  const attempt = numberValue(field(result.body, "attempt"));
  const approvedGates = stringList(field(result.body, "approvedGates"));
  const receipts = receiptsResult.ok ? items(receiptsResult.body) : [];
  const previewArtifactId = text(field(result.body, "previewArtifactId"), "");
  const runtime = field(result.body, "runtimePreflight");
  const evidence = evidenceResult.ok ? evidenceResult.body : null;
  const sceneInput = field(evidence, "sceneInput");
  const owners = list(field(sceneInput, "owners"));
  const needsChoice = list(field(evidence, "needsChoice"));
  const pendingChoice = needsChoice[0];
  const choiceId = text(field(pendingChoice, "choiceId"), "");
  const ownerIds = owners
    .map((owner) => text(field(owner, "ownerId"), ""))
    .filter(Boolean);
  const nextGate = nextApprovalGate({ state, preparationStage });
  const startFrame = numberValue(field(result.body, "startFrame"));
  const sourceFps = numberValue(field(result.body, "sourceFps"));
  const sourceStart = sourceFps > 0 ? startFrame / sourceFps : 0;
  const sourceUrl = `/api/v1/jobs/${encodeURIComponent(
    jobId,
  )}/source-download#t=${sourceStart},${sourceStart + 4}`;
  return (
    <CreatorShell>
      <div className="stitch-review-shell">
        <aside className="stitch-source-feed" data-landmark="preview">
          <div className="stitch-feed-meta">
            <span>Source Feed // 01</span>
            <span>Live-sync</span>
          </div>
          <div className="stitch-video-frame">
            <video controls preload="metadata" playsInline src={sourceUrl} />
            <span className="stitch-hud stitch-hud-top">REC</span>
            <span className="stitch-hud stitch-hud-bottom">
              {sourceFps > 0 ? `${sourceFps} FPS / 4S` : "FPS PENDING"}
            </span>
            <span className="stitch-draft-mark">DRAFT</span>
          </div>
          <div className="stitch-playback">
            <span>Reference source</span>
            <span>{formatSourceWindow(sourceStart)}</span>
          </div>
          <figure className="stitch-preview-card">
            {previewArtifactId ? (
              <video
                controls
                preload="metadata"
                playsInline
                src={`/api/v1/jobs/${encodeURIComponent(jobId)}/preview-download`}
              />
            ) : (
              <div className="review-media-pending">Preview pending</div>
            )}
            <figcaption>Frame-indexed animatic</figcaption>
          </figure>
        </aside>
        <section className="stitch-review-panel">
          <div className="stitch-review-header">
            <div>
              <h1>
                Scene Review <span>#{text(field(result.body, "id"))}</span>
              </h1>
              <p>Inspect the shot and its automatic verification history.</p>
            </div>
            <a
              className="button button-primary"
              href={`/progress?jobId=${encodeURIComponent(jobId)}`}
            >
              Progress
            </a>
          </div>
          <dl className="detail-grid stitch-review-meta">
            <Detail label="State" value={state} />
            <Detail label="Next gate" value={nextGate ?? "None"} />
            <Detail label="Approved" value={`${approvedGates.length}/5`} />
          </dl>
          <div className="stitch-review-actions">
            <span>
              {nextGate
                ? `${nextGate} is auto-verifying.`
                : "No stage is waiting."}
            </span>
            {state === "READY" && etag && approvedGates.includes("T4") ? (
              <RenderJobButton jobId={jobId} etag={etag} />
            ) : null}
            {state === "COMPLETED" ? (
              <div className="review-actions">
                <a
                  className="button button-primary"
                  href={`/api/v1/jobs/${encodeURIComponent(jobId)}/delivery-download`}
                >
                  Download Delivery
                </a>
                <a
                  className="button"
                  href={`/api/v1/jobs/${encodeURIComponent(jobId)}/report-download`}
                >
                  Download Report
                </a>
              </div>
            ) : null}
          </div>
          {evidence ? (
            <section className="stitch-review-section">
              <div className="stitch-section-heading">
                <h2>Review focus</h2>
                <span>{nextGate ? "Verifying" : "Idle"}</span>
              </div>
              <Panel className="stitch-review-card">
                <p>
                  Evidence is prepared. This is a read-only view of the source,
                  preview, and pipeline history.
                </p>
                <dl className="detail-grid stitch-focus-grid">
                  <Detail label="Owners" value={String(owners.length)} />
                  <Detail
                    label="Preview"
                    value={previewArtifactId ? "Ready" : "Pending"}
                  />
                  <Detail
                    label="Runtime"
                    value={text(field(runtime, "status"), "Pending")}
                  />
                </dl>
              </Panel>
            </section>
          ) : (
            <Panel>
              <p className="empty-copy">Compiler evidence is still pending.</p>
            </Panel>
          )}
          <section className="stitch-review-section" data-landmark="timeline">
            <div className="stitch-section-heading">
              <h2>Pipeline Chain</h2>
              <span>Attempt {attempt}</span>
            </div>
            <ol className="review-gate-chain">
              {gates.map((gate) => {
                const receipt = latestReceiptFor(receipts, gate, attempt);
                const decision = text(field(receipt, "decision"), "Pending");
                return (
                  <li
                    key={gate}
                    className={
                      decision === "APPROVED"
                        ? "is-approved"
                        : decision === "REJECTED"
                          ? "is-rejected"
                          : ""
                    }
                  >
                    <strong>{gate}</strong>
                    <span>{decision}</span>
                  </li>
                );
              })}
            </ol>
          </section>
          {preparationStage === "AWAITING_T2" && choiceId && etag ? (
            <ChoiceResolver
              jobId={jobId}
              etag={etag}
              choiceId={choiceId}
              choiceReason={text(field(pendingChoice, "reason"), "")}
              ownerIds={ownerIds}
            />
          ) : null}
        </section>
      </div>
    </CreatorShell>
  );
}
