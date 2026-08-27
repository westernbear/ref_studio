import { getTranslations } from "next-intl/server";
import { BrandLogo } from "../../../components/Shells";
import { Panel } from "../../../components/Primitives";
import {
  approvalGates,
  decisionKey,
  gateLabelKey,
  parseJobProgress,
  type ApprovalGate,
} from "../../../lib/job-progress";
import {
  field,
  isAuthProblem,
  items,
  liveApiGet,
  text,
} from "../../../lib/server-api";
import type { AcceptedMedia } from "../../../lib/upload-client";
import { Link } from "../../../i18n/navigation";
import { CompilerDialogue } from "./CompilerDialogue";
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

async function ScreenHeader() {
  const t = await getTranslations("SceneReview.header");
  return (
    <header className="upload-header" data-landmark="app-header">
      <Link className="brand" href="/" aria-label={t("homeAriaLabel")}>
        <BrandLogo />
      </Link>
      <nav aria-label={t("primaryNavAriaLabel")}>
        <Link href="/workflow">{t("workflow")}</Link>
        <Link href="/admin">{t("admin")}</Link>
        <a href="/docs">{t("docs")}</a>
        <a href="/support">{t("support")}</a>
      </nav>
      <div className="header-actions">
        <Link className="button button-primary" href="/projects/new">
          {t("newProject")}
        </Link>
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
  const t = await getTranslations("SceneReview");
  const tGates = await getTranslations("Gates");
  const tDecisions = await getTranslations("Decisions");
  const params = await searchParams;
  const rawJobId = params.jobId;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  if (!jobId)
    return (
      <div className="upload-shell">
        <ScreenHeader />
        <main className="upload-main">
          <Panel>
            <h1>{t("title")}</h1>
            <p>{t("chooseJob")}</p>
            <Link className="button button-primary" href="/workflow">
              {t("header.workflow")}
            </Link>
          </Panel>
        </main>
      </div>
    );
  const [result, receiptsResult] = await Promise.all([
    liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}`),
    liveApiGet(`/v1/receipts?jobId=${encodeURIComponent(jobId)}`),
  ]);
  if (!result.ok)
    return (
      <div className="upload-shell">
        <ScreenHeader />
        <main className="upload-main">
          <Panel>
            <h1>{t("title")}</h1>
            <p>
              {isAuthProblem(result.code)
                ? t("signInToView")
                : t("unavailable", { code: result.code })}
            </p>
            {isAuthProblem(result.code) ? (
              <Link
                className="button button-primary"
                href={`/sign-in?returnTo=${encodeURIComponent(
                  `/scene-review?jobId=${jobId}`,
                )}`}
              >
                {t("signIn")}
              </Link>
            ) : (
              <Link className="button button-primary" href="/workflow">
                {t("header.workflow")}
              </Link>
            )}
          </Panel>
        </main>
      </div>
    );
  const uploadId = text(field(result.body, "uploadId"), "");
  const uploadResult = uploadId
    ? await liveApiGet(`/v1/uploads/${encodeURIComponent(uploadId)}`)
    : null;
  // GET /v1/uploads/:id spreads the media fields directly onto the response
  // body ({ uploadId, state, fps, frameCount, durationSeconds }) -- there is
  // no nested `.media` object.
  const acceptedMedia: AcceptedMedia | null =
    uploadResult?.ok && field(uploadResult.body, "fps")
      ? {
          uploadId,
          fps: numberValue(field(uploadResult.body, "fps")),
          frameCount: numberValue(field(uploadResult.body, "frameCount")),
          durationSeconds: numberValue(
            field(uploadResult.body, "durationSeconds"),
          ),
        }
      : null;

  const state = text(field(result.body, "state"));
  const preparationStage = text(field(result.body, "preparationStage"));
  const etag = text(field(result.body, "etag"), "");
  const attempt = numberValue(field(result.body, "attempt"));
  const approvedGates = stringList(field(result.body, "approvedGates"));
  const receipts = receiptsResult.ok ? items(receiptsResult.body) : [];
  const previewArtifactId = text(field(result.body, "previewArtifactId"), "");
  const startFrame = numberValue(field(result.body, "startFrame"));
  const sourceFps = numberValue(field(result.body, "sourceFps"));
  const sourceStart = sourceFps > 0 ? startFrame / sourceFps : 0;
  const sourceUrl = `/api/v1/jobs/${encodeURIComponent(
    jobId,
  )}/source-download#t=${sourceStart},${sourceStart + 4}`;
  const initialJob = parseJobProgress(result.body) ?? {
    id: jobId,
    state,
    preparationStage,
    attempt,
    updatedAt: "",
    artifactId: "",
    previewArtifactId,
    previewLabeledArtifactId: "",
    evidenceVideoArtifactId: "",
    failureCode: null,
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
          renderAction={
            state === "READY" && etag && approvedGates.includes("T4") ? (
              <RenderJobButton jobId={jobId} etag={etag} />
            ) : null
          }
        />
        <div className="stitch-review-actions" data-landmark="gate-action">
          {state === "COMPLETED" ? (
            <div className="review-actions">
              <a
                className="button button-primary"
                href={`/api/v1/jobs/${encodeURIComponent(jobId)}/delivery-download`}
              >
                {t("downloadDelivery")}
              </a>
              <a
                className="button"
                href={`/api/v1/jobs/${encodeURIComponent(jobId)}/report-download`}
              >
                {t("downloadReport")}
              </a>
            </div>
          ) : null}
        </div>
        <section className="stitch-review-section" data-landmark="timeline">
          <div className="stitch-section-heading">
            <h2>{t("verificationStages")}</h2>
            <span>{t("attempt", { number: attempt })}</span>
          </div>
          <ol className="review-gate-chain">
            {gates.map((gate) => {
              const receipt = latestReceiptFor(receipts, gate, attempt);
              const decision = text(field(receipt, "decision"), "PENDING");
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
                  <strong>{tGates(gateLabelKey(gate))}</strong>
                  <span>{tDecisions(decisionKey(decision))}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
}
