"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "../../components/Shells";
import {
  approvalGates,
  formatJobStamp,
  isTerminalJobState,
  jobActivityPercent,
  jobProgressPercent,
  jobStatusCopy,
  liveJobStatusError,
  parseJobProgress,
  progressStages,
  type JobProgress,
} from "../../lib/job-progress";

type Props = {
  readonly initialJob: JobProgress;
};

const displayPercent = (value: number): string => `${value.toFixed(1)}%`;

const stageClass = (jobState: string, stageState: string): string => {
  const activeIndex = progressStages.findIndex(
    (stage) => stage.state === jobState,
  );
  const stageIndex = progressStages.findIndex(
    (stage) => stage.state === stageState,
  );
  if (activeIndex === -1) return "progress-step";
  if (stageIndex < activeIndex) return "progress-step is-complete";
  if (stageIndex === activeIndex) return "progress-step is-active";
  return "progress-step";
};

export function ProgressTracker({ initialJob }: Props) {
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState("");
  const percent = jobProgressPercent(job);
  const activityPercent = jobActivityPercent(job);
  const shouldPoll = !isTerminalJobState(job.state);
  const approvedGateCount = approvalGates.filter((gate) =>
    job.approvedGates.includes(gate),
  ).length;
  const logs = [
    ["JOB_STATE", job.state],
    ["ATTEMPT", String(job.attempt)],
    ["APPROVED_GATES", `${approvedGateCount}/${approvalGates.length}`],
    ["WORKER_PHASE", job.progressPhase || "Pending"],
    ["WORKER_STAGE", job.progressStage || "Pending"],
    ["WORKER_FRACTION", displayPercent(activityPercent)],
    [
      "FRAMES",
      job.framesProcessed === null || job.framesTotal === null
        ? "Pending"
        : `${job.framesProcessed}/${job.framesTotal}`,
    ],
    ["UPDATED_AT", formatJobStamp(job.updatedAt)],
    ["ARTIFACT", job.artifactId || "Pending"],
  ];

  useEffect(() => {
    if (!shouldPoll) return undefined;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/v1/jobs/${encodeURIComponent(initialJob.id)}`,
          { credentials: "include" },
        );
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setError(liveJobStatusError(body, response.status));
          return;
        }
        const parsed = parseJobProgress(body);
        if (active && parsed) {
          setJob(parsed);
          setError("");
        }
      } catch {
        if (!active) return;
        setError("Network update failed. Retrying.");
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
            href="/workflow"
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
            Run in Background
          </a>
          <a
            className="button button-primary"
            href={`/scene-review?jobId=${encodeURIComponent(job.id)}`}
          >
            Scene Review
          </a>
        </nav>
      </header>
      <main className="progress-main">
        <section className="progress-hero" aria-labelledby="progress-title">
          <p className="eyebrow">Approval Progress</p>
          <h1 id="progress-title">{displayPercent(percent)}</h1>
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
          <p>{jobStatusCopy(job)}</p>
          <div className="progress-activity">
            <div>
              <span>Worker activity</span>
              <strong>{displayPercent(activityPercent)}</strong>
            </div>
            <div
              className="progress-meter progress-meter-secondary"
              role="progressbar"
              aria-label="Current worker activity"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(activityPercent)}
            >
              <span style={{ inlineSize: `${activityPercent}%` }} />
            </div>
          </div>
          {error ? <p className="progress-error">{error}</p> : null}
        </section>
        <section className="progress-grid" aria-label="Live compiler status">
          <div className="progress-log-panel">
            <h2>Observed job log</h2>
            <dl>
              {logs.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="progress-side-panel">
            <h2>Approval gates</h2>
            <ol>
              {approvalGates.map((gate) => (
                <li
                  key={gate}
                  className={
                    job.approvedGates.includes(gate)
                      ? "progress-step is-complete"
                      : "progress-step"
                  }
                >
                  <strong>{gate}</strong>
                  <span>
                    {job.approvedGates.includes(gate) ? "Approved" : "Pending"}
                  </span>
                </li>
              ))}
            </ol>
            <h2 className="progress-subheading">Technical stages</h2>
            <ol>
              {progressStages.map((stage) => (
                <li
                  key={stage.state}
                  className={stageClass(job.state, stage.state)}
                >
                  <strong>{stage.label}</strong>
                  <span>{stage.description}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <footer className="progress-footer">
        <span>LIVE JOB ID: {job.id}</span>
        <span>LAST UPDATE: {formatJobStamp(job.updatedAt)}</span>
      </footer>
    </div>
  );
}
