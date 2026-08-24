"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "../../components/Shells";
import {
  approvalGates,
  isTerminalJobState,
  jobProgressPercent,
  jobStatusCopy,
  nextApprovalGate,
  liveJobStatusError,
  parseJobProgress,
  type JobProgress,
} from "../../lib/job-progress";

type Props = {
  readonly initialJob: JobProgress;
};

const displayPercent = (value: number): string => `${value.toFixed(1)}%`;

export function ProgressTracker({ initialJob }: Props) {
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState("");
  const percent = jobProgressPercent(job);
  const shouldPoll = !isTerminalJobState(job.state);
  const nextGate = nextApprovalGate(job);
  const sceneReviewHref = `/scene-review?jobId=${encodeURIComponent(job.id)}`;
  const approvedGateCount = approvalGates.filter((gate) =>
    job.approvedGates.includes(gate),
  ).length;
  const workerCopy = job.progressStage || job.progressPhase || "Waiting";
  const frameCopy =
    job.framesProcessed === null || job.framesTotal === null
      ? "Pending"
      : `${job.framesProcessed}/${job.framesTotal}`;

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
          setError(liveJobStatusError(body, response.status));
          return;
        }
        const parsed = parseJobProgress(body);
        if (active && parsed) {
          setJob(parsed);
          setError("");
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof Error)
          setError("Network update failed. Retrying.");
        else throw error;
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [initialJob.id, shouldPoll]);

  return (
    <div className="progress-shell">
      <header className="progress-topbar">
        <div className="progress-brand-row">
          <a
            className="progress-wordmark brand-link"
            href="/"
            aria-label="Reference Video Studio home"
          >
            <BrandLogo />
          </a>
          <span className="progress-divider" aria-hidden="true" />
          <span className="progress-kicker">
            {job.state} JOB #{job.id}
          </span>
        </div>
        <nav className="progress-actions" aria-label="Progress actions">
          <a className="button" href="/workflow">
            Workflow
          </a>
          <a className="button button-primary" href={sceneReviewHref}>
            {nextGate ? `Review and approve ${nextGate}` : "Scene Review"}
          </a>
        </nav>
      </header>
      <main className="progress-main">
        <section
          className="progress-title-row"
          aria-labelledby="progress-title"
        >
          <div>
            <h1 id="progress-title">Job Progress</h1>
            <p>{jobStatusCopy(job)}</p>
          </div>
          <span className="status-chip">{displayPercent(percent)}</span>
        </section>
        <section className="progress-grid" aria-label="Live compiler status">
          <div className="progress-log-panel">
            <div className="section-heading">
              <div>
                <h2>Current status</h2>
                <p>Only the information needed to decide what to do next.</p>
              </div>
            </div>
            <div className="progress-meter-row">
              <span>{job.state}</span>
              <div
                className="progress-meter"
                role="progressbar"
                aria-label="Approval gate progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
              >
                <span style={{ inlineSize: `${percent}%` }} />
              </div>
            </div>
            <dl className="detail-grid progress-summary-grid">
              <div>
                <dt>Worker</dt>
                <dd>{workerCopy}</dd>
              </div>
              <div>
                <dt>Frames</dt>
                <dd>{frameCopy}</dd>
              </div>
              <div>
                <dt>Approved</dt>
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
                <h2>Next action</h2>
                <p>
                  {nextGate
                    ? `${nextGate} review is ready.`
                    : "No approval action is waiting."}
                </p>
              </div>
            </div>
            {nextGate ? (
              <a className="button button-primary" href={sceneReviewHref}>
                Review and approve {nextGate}
              </a>
            ) : (
              <a className="button" href="/workflow">
                Back to workflow
              </a>
            )}
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
                    <strong>{gate}</strong>
                    <span>{approved ? "Done" : "Pending"}</span>
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
