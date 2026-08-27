"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { BrandLogo } from "../../../components/Shells";
import { Link } from "../../../i18n/navigation";
import {
  approvalGates,
  decisionKey,
  gateLabelKey,
  isAuthoringParked,
  isTerminalJobState,
  jobProgressPercent,
  jobStateKey,
  jobStatusMessage,
  nextApprovalGate,
  liveJobStatusErrorCode,
  normalizeStage,
  parseJobProgress,
  stageLabelKey,
  type JobProgress,
} from "../../../lib/job-progress";

type Props = {
  readonly initialJob: JobProgress;
};

const displayPercent = (value: number): string => `${value.toFixed(1)}%`;

export function ProgressTracker({ initialJob }: Props) {
  const t = useTranslations("ProgressTracker");
  const tStatus = useTranslations("JobStatus");
  const tGates = useTranslations("Gates");
  const tDecisions = useTranslations("Decisions");
  const tState = useTranslations("JobState");
  const tStage = useTranslations("StageLabels");
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState("");
  const percent = jobProgressPercent(job);
  // A generate-track job parked at AUTHORING_COMPLETE has nothing left to
  // wait for this release (I4) -- polling it forever would keep this page
  // looking like work is still in progress after it has genuinely stopped.
  const shouldPoll =
    !isTerminalJobState(job.state) && !isAuthoringParked(job.preparationStage);
  const nextGate = nextApprovalGate(job);
  const sceneReviewHref = `/scene-review?jobId=${encodeURIComponent(job.id)}`;
  const approvedGateCount = approvalGates.filter((gate) =>
    job.approvedGates.includes(gate),
  ).length;
  // progressStage arrives raw ("compiler:scene-compile"); normalize it the
  // same way compileStageRows does or the label lookup misses.
  const stageLabel = stageLabelKey(normalizeStage(job.progressStage));
  const workerCopy = job.progressStage
    ? stageLabel.known
      ? tStage(stageLabel.key)
      : stageLabel.fallback
    : job.progressPhase || t("waiting");
  const frameCopy =
    job.framesProcessed === null || job.framesTotal === null
      ? t("pending")
      : `${job.framesProcessed}/${job.framesTotal}`;
  const rawStatus = jobStatusMessage(job);
  // rendererActive/compilerActive interpolate {stage}; without this the main
  // status line reads "컴파일러 작동 중: all-frame-analysis."
  const status = rawStatus.values?.["stage"]
    ? {
        ...rawStatus,
        values: { ...rawStatus.values, stage: workerCopy },
      }
    : rawStatus;

  useEffect(() => {
    if (!shouldPoll) return undefined;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/v1/jobs/${encodeURIComponent(initialJob.id)}`,
          { credentials: "include" },
        );
        const body: unknown = await response.json().catch((error) => {
          if (error instanceof Error) return null;
          throw error;
        });
        if (!response.ok) {
          setError(
            t("statusUpdateFailed", {
              code: liveJobStatusErrorCode(body, response.status),
            }),
          );
          return;
        }
        const parsed = parseJobProgress(body);
        if (active && parsed) {
          setJob(parsed);
          setError("");
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof Error) setError(t("networkUpdateFailed"));
        else throw error;
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJob.id, shouldPoll]);

  return (
    <div className="progress-shell">
      <header className="progress-topbar">
        <div className="progress-brand-row">
          <Link
            className="progress-wordmark brand-link"
            href="/"
            aria-label={t("homeAriaLabel")}
          >
            <BrandLogo />
          </Link>
          <span className="progress-divider" aria-hidden="true" />
          <span className="progress-kicker">
            {t("jobKicker", {
              state: tState(jobStateKey(job.state)),
              id: job.id,
            })}
          </span>
        </div>
        <nav className="progress-actions" aria-label={t("progressActionsAriaLabel")}>
          <Link className="button" href="/workflow">
            {t("workflow")}
          </Link>
          <Link className="button button-primary" href={sceneReviewHref}>
            {t("sceneReview")}
          </Link>
        </nav>
      </header>
      <main className="progress-main">
        <section
          className="progress-title-row"
          aria-labelledby="progress-title"
        >
          <div>
            <h1 id="progress-title">{t("title")}</h1>
            <p>{tStatus(status.key, status.values)}</p>
          </div>
          <span className="status-chip">{displayPercent(percent)}</span>
        </section>
        <section className="progress-grid" aria-label={t("liveStatusAriaLabel")}>
          <div className="progress-log-panel">
            <div className="section-heading">
              <div>
                <h2>{t("currentStatus")}</h2>
                <p>{t("currentStatusHint")}</p>
              </div>
            </div>
            <div className="progress-meter-row">
              <span>{tState(jobStateKey(job.state))}</span>
              <div
                className="progress-meter"
                role="progressbar"
                aria-label={t("gateProgressAriaLabel")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
              >
                <span style={{ inlineSize: `${percent}%` }} />
              </div>
            </div>
            <dl className="detail-grid progress-summary-grid">
              <div>
                <dt>{t("worker")}</dt>
                <dd>{workerCopy}</dd>
              </div>
              <div>
                <dt>{t("frames")}</dt>
                <dd>{frameCopy}</dd>
              </div>
              <div>
                <dt>{t("approved")}</dt>
                <dd>
                  {approvedGateCount}/{approvalGates.length}
                </dd>
              </div>
            </dl>
            {error ? <p className="progress-error">{error}</p> : null}
          </div>
          <div className="progress-side-panel">
            <div className="section-heading">
              <div>
                <h2>{t("pipelineStage")}</h2>
                <p>
                  {nextGate
                    ? t("stageAutoVerifying", { gate: tGates(gateLabelKey(nextGate)) })
                    : t("noStageWaiting")}
                </p>
              </div>
            </div>
            <Link className="button" href={sceneReviewHref}>
              {t("viewJob")}
            </Link>
            <ol className="progress-gate-grid">
              {approvalGates.map((gate) => {
                const approved = job.approvedGates.includes(gate);
                return (
                  <li
                    key={gate}
                    className={
                      approved ? "progress-step is-complete" : "progress-step"
                    }
                  >
                    <strong>{tGates(gateLabelKey(gate))}</strong>
                    <span>{tDecisions(decisionKey(approved ? "APPROVED" : "PENDING"))}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}
