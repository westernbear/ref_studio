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
import {
  proxiedDownloadUrl,
  type MotionRenderChoice,
} from "./motion-workspace-api";
import { sceneIntegrity } from "./motion-workspace-model";
import type { WorkspaceViewState } from "./motion-workspace-model";

type Props = Readonly<{
  job: JobProgress;
  scene: MotionSceneSnapshotV1;
  deliverables: MotionDeliverablesV1;
  busy: boolean;
  canUndo: boolean;
  viewState: WorkspaceViewState;
  onUndo: () => Promise<void>;
  onRollback: (version: number) => Promise<void>;
  onRender: (choice: MotionRenderChoice) => Promise<void>;
  onRefresh: () => Promise<void>;
}>;

export function MotionActionCard({
  job,
  scene,
  deliverables,
  busy,
  canUndo,
  viewState,
  onUndo,
  onRollback,
  onRender,
  onRefresh,
}: Props) {
  const t = useTranslations("MotionWorkspace");
  const tState = useTranslations("JobState");
  const [version, setVersion] = useState(scene.version);
  const working = isJobWorking(job.state);
  const verificationPassed = scene.verification?.status === "PASS";
  const progress = Math.max(0, Math.min(1, job.progressFraction));
  const integrity = sceneIntegrity(scene);
  const actionBlocked =
    busy ||
    working ||
    ["offline", "conflict", "cancelled", "unsupported", "loading"].includes(
      viewState,
    );
  const adobeReady =
    scene.backendCapability.capabilities.includes("ENROLLED") &&
    scene.backendCapability.capabilities.includes("READY");

  const [backend, setBackend] = useState<"native" | "adobe">(
    adobeReady ? "adobe" : "native",
  );
  const devices = scene.adobeDevices ?? [];
  const projects = scene.adobeProjects ?? [];
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");

  useEffect(() => setVersion(scene.version), [scene.version]);
  useEffect(() => {
    if (!adobeReady) setBackend("native");
  }, [adobeReady]);

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
        {viewState === "repair" ? (
          <div className="motion-repair-callout" role="alert">
            <strong>{t("states.repair.title")}</strong>
            <span>{t("states.repair.detail")}</span>
          </div>
        ) : null}
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
        <dl
          className="motion-action-metadata"
          data-testid="motion-scene-metadata"
        >
          <div>
            <dt>{t("planDigest")}</dt>
            <dd>{integrity.planDigest ?? t("metadataUnavailable")}</dd>
          </div>
          <div>
            <dt>{t("knowledgeCards")}</dt>
            <dd>
              {integrity.knowledgeCards.length > 0
                ? integrity.knowledgeCards
                    .map((card) => `${card.titleEn} / ${card.titleKo}`)
                    .join(", ")
                : integrity.knowledgeCardIds.length > 0
                  ? integrity.knowledgeCardIds.join(", ")
                  : t("knowledgeCardsUnavailable")}
            </dd>
          </div>
          <div>
            <dt>{t("capabilities")}</dt>
            <dd>
              {integrity.capabilities.join(", ") || t("metadataUnavailable")}
            </dd>
          </div>
          <div>
            <dt>{t("predicateIds")}</dt>
            <dd>
              {integrity.predicateIds.join(", ") || t("metadataUnavailable")}
            </dd>
          </div>
          <div>
            <dt>{t("commandLifecycle")}</dt>
            <dd>
              {[job.state, job.progressPhase, job.progressStage]
                .filter(Boolean)
                .join(" / ")}
            </dd>
          </div>
          <div>
            <dt>{t("artifactIntegrity")}</dt>
            <dd>{integrity.artifactDigest ?? integrity.sceneDigest}</dd>
          </div>
        </dl>
        {scene.verification?.findings.length ? (
          <ul
            className="motion-verification-findings"
            aria-label={t("verificationFindings")}
          >
            {scene.verification.findings.map((finding) => (
              <li key={finding.predicateId} data-pass={finding.pass}>
                <strong>{finding.predicateId}</strong>
                <span>
                  {finding.pass ? finding.observed : finding.remediation}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
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
          <select
            value={backend}
            disabled={!adobeReady}
            onChange={(event) =>
              setBackend(event.target.value === "adobe" ? "adobe" : "native")
            }
          >
            <option value="native">{t("nativeBackend")}</option>
            <option value="adobe">{t("adobeBackend")}</option>
          </select>
        </label>
        {!adobeReady ? (
          <p className="motion-capability-note">{t("adobeLocked")}</p>
        ) : (
          <>
            <label className="motion-field">
              <span>{t("adobeDevice")}</span>
              <select
                value={deviceId}
                disabled={backend !== "adobe" || devices.length === 0}
                onChange={(event) => setDeviceId(event.target.value)}
              >
                {devices.length === 0 ? (
                  <option value="">{t("adobeDeviceUnavailable")}</option>
                ) : (
                  devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="motion-field">
              <span>{t("adobeProject")}</span>
              <select
                value={projectId}
                disabled={backend !== "adobe" || projects.length === 0}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {projects.length === 0 ? (
                  <option value="">{t("adobeProjectUnavailable")}</option>
                ) : (
                  projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            <p className="motion-capability-note">{t("adobeConnected")}</p>
          </>
        )}
        <div className="motion-history-controls">
          <label className="motion-field">
            <span>{t("rollbackVersion")}</span>
            <select
              value={version}
              onChange={(event) => setVersion(Number(event.target.value))}
              disabled={actionBlocked}
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
              disabled={!canUndo || actionBlocked}
              onClick={() => void onUndo()}
            >
              {t("undo")}
            </button>
            {viewState === "conflict" || viewState === "offline" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRefresh()}
              >
                {t("refreshScene")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={version === scene.version || actionBlocked}
              onClick={() => void onRollback(version)}
            >
              {t("rollback")}
            </button>
            <button
              type="button"
              disabled={
                job.state !== "COMPLETED" ||
                !verificationPassed ||
                actionBlocked
              }
              onClick={() =>
                void onRender(
                  backend === "adobe"
                    ? { backend, deviceId, projectId }
                    : { backend: "native" },
                )
              }
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
