"use client";

import type {
  MotionDeliverablesV1,
  MotionSceneSnapshotV1,
} from "@rvs/contracts/motion";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  isJobWorking,
  jobStateKey,
  type JobProgress,
} from "../../../lib/job-progress";
import { proxiedDownloadUrl } from "./motion-workspace-api";

type Props = Readonly<{
  job: JobProgress;
  scene: MotionSceneSnapshotV1;
  deliverables: MotionDeliverablesV1;
  busy: boolean;
  canUndo: boolean;
  onUndo: () => Promise<void>;
  onRollback: (version: number) => Promise<void>;
  onRender: () => Promise<void>;
}>;

export function MotionActionCard({
  job,
  scene,
  deliverables,
  busy,
  canUndo,
  onUndo,
  onRollback,
  onRender,
}: Props) {
  const t = useTranslations("MotionWorkspace");
  const tState = useTranslations("JobState");
  const [version, setVersion] = useState(scene.version);
  const working = isJobWorking(job.state);
  const verificationPassed = scene.verification?.status === "PASS";
  const progress = Math.max(0, Math.min(1, job.progressFraction));

  useEffect(() => setVersion(scene.version), [scene.version]);

  return (
    <section
      className="motion-action-card"
      aria-labelledby="motion-action-title"
    >
      <header>
        <span id="motion-action-title">{t("actionTitle")}</span>
        <strong data-state={job.state}>{tState(jobStateKey(job.state))}</strong>
      </header>
      <div className="motion-action-body">
        <div className="motion-action-summary">
          <span>{t("version", { version: scene.version })}</span>
          <span>
            {scene.verification
              ? t("verificationResult", {
                  status: scene.verification.status,
                  attempts: scene.verification.attempts,
                })
              : t("verificationPending")}
          </span>
        </div>
        <div
          className="motion-progress"
          role="progressbar"
          aria-label={t("renderProgress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ inlineSize: `${progress * 100}%` }} />
        </div>
        <label className="motion-field">
          <span>{t("backend")}</span>
          <select value={scene.backendCapability.backend} disabled>
            <option value="native">{t("nativeBackend")}</option>
            <option value="adobe">{t("adobeBackend")}</option>
          </select>
        </label>
        {scene.backendCapability.backend === "native" ? (
          <p className="motion-capability-note">{t("adobeLocked")}</p>
        ) : (
          <p className="motion-capability-note">{t("adobeConnected")}</p>
        )}
        <div className="motion-history-controls">
          <label className="motion-field">
            <span>{t("rollbackVersion")}</span>
            <select
              value={version}
              onChange={(event) => setVersion(Number(event.target.value))}
              disabled={busy || working}
            >
              {[...scene.history].reverse().map((entry) => (
                <option key={entry.version} value={entry.version}>
                  {t("version", { version: entry.version })}
                </option>
              ))}
            </select>
          </label>
          <div className="motion-action-buttons">
            <button
              type="button"
              disabled={!canUndo || busy || working}
              onClick={() => void onUndo()}
            >
              {t("undo")}
            </button>
            <button
              type="button"
              disabled={version === scene.version || busy || working}
              onClick={() => void onRollback(version)}
            >
              {t("rollback")}
            </button>
            <button
              type="button"
              disabled={
                job.state !== "COMPLETED" ||
                !verificationPassed ||
                busy ||
                working
              }
              onClick={() => void onRender()}
            >
              {t("render")}
            </button>
          </div>
        </div>
        <div className="motion-downloads" aria-label={t("deliverables")}>
          {deliverables.items.length === 0 ? (
            <span>{t("deliverablesPending")}</span>
          ) : (
            deliverables.items.map((item) => (
              <a key={item.id} href={proxiedDownloadUrl(item.downloadUrl)}>
                {item.kind === "mp4"
                  ? t("downloadVideo")
                  : item.kind === "scene-package"
                    ? t("downloadScenePackage")
                    : t("downloadReport")}
              </a>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
