import { BrandLogo } from "../../components/Shells";
import { Panel } from "../../components/Primitives";
import { approvalGates, parseJobProgress, type ApprovalGate } from "../../lib/job-progress";
import {
  field,
  isAuthProblem,
  items,
  liveApiGet,
  text,
} from "../../lib/server-api";
import type { AcceptedMedia } from "../../lib/upload-client";
import { CompilerDialogue } from "./CompilerDialogue";
import { ChoiceResolver } from "./ChoiceResolver";
import { RenderJobButton } from "./RenderJobButton";

const gates = approvalGates;
type Gate = ApprovalGate;

const list = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];
const numberValue = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const stringList = (value: unknown): readonly string[] =>
  list(value).filter((item): item is string => typeof item === "string");
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

function ScreenHeader() {
  return (
    <header className="upload-header" data-landmark="app-header">
      <a className="brand" href="/" aria-label="Reference Video Studio home">
        <BrandLogo />
      </a>
      <nav aria-label="Primary navigation">
        <a href="/workflow">Workflow</a>
        <a href="/admin">Admin</a>
        <a href="/docs">Docs</a>
        <a href="/support">Support</a>
      </nav>
      <div className="header-actions">
        <a className="button button-primary" href="/projects/new">
          New Project
        </a>
      </div>
    </header>
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
      <div className="upload-shell">
        <ScreenHeader />
        <main className="upload-main">
          <Panel>
            <h1>Scene Review</h1>
            <p>Choose a compiler job from Workflow to review.</p>
            <a className="button button-primary" href="/workflow">
              Workflow
            </a>
          </Panel>
        </main>
      </div>
    );
  const [result, evidenceResult, receiptsResult] = await Promise.all([
    liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}`),
    liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}/evidence`),
    liveApiGet(`/v1/receipts?jobId=${encodeURIComponent(jobId)}`),
  ]);
  if (!result.ok)
    return (
      <div className="upload-shell">
        <ScreenHeader />
        <main className="upload-main">
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
        </main>
      </div>
    );
  const uploadId = text(field(result.body, "uploadId"), "");
  const uploadResult = uploadId
    ? await liveApiGet(`/v1/uploads/${encodeURIComponent(uploadId)}`)
    : null;
  const media = field(uploadResult?.ok ? uploadResult.body : null, "media");
  const acceptedMedia: AcceptedMedia | null =
    uploadResult?.ok && field(media, "fps")
      ? {
          uploadId,
          fps: numberValue(field(media, "fps")),
          frameCount: numberValue(field(media, "frameCount")),
          durationSeconds: numberValue(field(media, "durationSeconds")),
        }
      : null;

  const state = text(field(result.body, "state"));
  const preparationStage = text(field(result.body, "preparationStage"));
  const etag = text(field(result.body, "etag"), "");
  const attempt = numberValue(field(result.body, "attempt"));
  const approvedGates = stringList(field(result.body, "approvedGates"));
  const receipts = receiptsResult.ok ? items(receiptsResult.body) : [];
  const previewArtifactId = text(field(result.body, "previewArtifactId"), "");
  const evidence = evidenceResult.ok ? evidenceResult.body : null;
  const sceneInput = field(evidence, "sceneInput");
  const owners = list(field(sceneInput, "owners"));
  const needsChoice = list(field(evidence, "needsChoice"));
  const pendingChoice = needsChoice[0];
  const choiceId = text(field(pendingChoice, "choiceId"), "");
  const ownerIds = owners
    .map((owner) => text(field(owner, "ownerId"), ""))
    .filter(Boolean);
  const startFrame = numberValue(field(result.body, "startFrame"));
  const sourceFps = numberValue(field(result.body, "sourceFps"));
  const sourceStart = sourceFps > 0 ? startFrame / sourceFps : 0;
  const sourceUrl = `/api/v1/jobs/${encodeURIComponent(
    jobId,
  )}/source-download#t=${sourceStart},${sourceStart + 4}`;
  const previewUrl = previewArtifactId
    ? `/api/v1/jobs/${encodeURIComponent(jobId)}/preview-download`
    : null;
  const initialJob = parseJobProgress(result.body) ?? {
    id: jobId,
    state,
    preparationStage,
    attempt,
    updatedAt: "",
    artifactId: "",
    progressPhase: "",
    progressStage: "",
    progressFraction: 0,
    framesProcessed: null,
    framesTotal: null,
    approvedGates: [],
  };

  return (
    <div className="upload-shell">
      <ScreenHeader />
      <main className="upload-main dialogue-main">
        <CompilerDialogue
          initialJob={initialJob}
          media={acceptedMedia}
          sourceUrl={sourceUrl}
          previewUrl={previewUrl}
        />
        <div className="stitch-review-actions" data-landmark="gate-action">
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
      </main>
    </div>
  );
}
