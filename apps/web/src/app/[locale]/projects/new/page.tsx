"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { BrandLogo } from "../../../../components/Shells";
import { Link } from "../../../../i18n/navigation";
import {
  createCompilerJob,
  uploadAttachment,
  uploadMp4,
  type AcceptedMedia,
  type Aspect,
  type UploadProgress,
} from "../../../../lib/upload-client";

type WorkflowState =
  | "idle"
  | "uploading"
  | "accepted"
  | "quarantined"
  | "error"
  | "creating"
  | "created";
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

type ReasonKey =
  | "selectSource"
  | "onlyFormats"
  | "fileTooLarge"
  | "tooShort"
  | "uploadCanceled"
  | "accepted"
  | "jobCreated"
  | "videoTypeInvalid"
  | "videoSizeLimitExceeded"
  | "uploadQuarantined"
  | "mediaVfrUnsupported"
  | "mediaDurationInvalid"
  | "mediaIntervalInvalid"
  | "invalidRequest"
  | "tenantBoundaryBypass"
  | "resourceNotFound"
  | "networkInterrupted"
  | "attachmentTypeInvalid"
  | "attachmentSizeLimitExceeded"
  | "attachmentCountLimitExceeded"
  | "attachmentQuotaExceeded"
  | "requestFailed";

const safeReasonKey = (error: unknown): ReasonKey => {
  const code = error instanceof Error ? error.message : "NETWORK_INTERRUPTED";
  const reasons: Record<string, ReasonKey> = {
    VIDEO_TYPE_INVALID: "videoTypeInvalid",
    VIDEO_SIZE_LIMIT_EXCEEDED: "videoSizeLimitExceeded",
    UPLOAD_QUARANTINED: "uploadQuarantined",
    MEDIA_VFR_UNSUPPORTED: "mediaVfrUnsupported",
    MEDIA_DURATION_INVALID: "mediaDurationInvalid",
    MEDIA_INTERVAL_INVALID: "mediaIntervalInvalid",
    INVALID_REQUEST: "invalidRequest",
    TENANT_BOUNDARY_BYPASS: "tenantBoundaryBypass",
    RESOURCE_NOT_FOUND: "resourceNotFound",
    NETWORK_INTERRUPTED: "networkInterrupted",
    // I1.3/I1.4: an attachment failure gets its own reason instead of
    // falling through to the generic "requestFailed" -- a rejected
    // attachment used to give no clue which of the several things that can
    // go wrong with a brand-asset upload actually happened.
    ATTACHMENT_TYPE_INVALID: "attachmentTypeInvalid",
    ATTACHMENT_SIZE_LIMIT_EXCEEDED: "attachmentSizeLimitExceeded",
    ATTACHMENT_COUNT_LIMIT_EXCEEDED: "attachmentCountLimitExceeded",
    ATTACHMENT_QUOTA_EXCEEDED: "attachmentQuotaExceeded",
  };
  return reasons[code] ?? "requestFailed";
};

const formatBytes = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const STATE_KEYS: Readonly<Record<WorkflowState, string>> = {
  idle: "idle",
  uploading: "uploading",
  accepted: "ready",
  quarantined: "quarantined",
  error: "error",
  creating: "creating",
  created: "ready",
};

const PREFLIGHT_CHECKS = ["codecCheck", "fpsStability", "duration", "audioTrack"] as const;
const DURATION_OPTIONS = [15, 20, 25, 30] as const;
const ASPECT_OPTIONS: readonly Aspect[] = ["9:16", "1:1", "16:9"];

// C4: which track a submit produces is now an explicit, visible choice --
// the textarea used to double as a generate-track brief the moment it was
// non-empty, which silently converted an existing restore-track creative
// prompt (e.g. "keep the logo in the corner") into a generate-track job
// that parks at AUTHORING_COMPLETE forever. Default is "restore" so an
// existing user who never touches this control keeps their old behaviour.
type Track = "restore" | "generate";

export default function NewProjectPage() {
  const t = useTranslations("ProjectsNew");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [media, setMedia] = useState<AcceptedMedia | null>(null);
  const [progress, setProgress] = useState<UploadProgress>({
    uploadPercent: 0,
    validationPercent: 0,
  });
  const [state, setState] = useState<WorkflowState>("idle");
  const [reasonKey, setReasonKey] = useState<ReasonKey | null>("selectSource");
  const [prompt, setPrompt] = useState("");
  const [track, setTrack] = useState<Track>("restore");
  const [durationSec, setDurationSec] = useState<number>(20);
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [attachments, setAttachments] = useState<readonly File[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const acceptFile = async (candidate: File | undefined) => {
    if (!candidate) return;
    setFile(candidate);
    setMedia(null);
    setJobId(null);
    setReasonKey(null);
    const acceptedTypes = ["video/mp4", "video/quicktime", "video/webm"];
    const acceptedExtensions = [".mp4", ".mov", ".webm"];
    const lowerName = candidate.name.toLowerCase();
    if (
      !acceptedTypes.includes(candidate.type) ||
      !acceptedExtensions.some((extension) => lowerName.endsWith(extension))
    ) {
      setState("quarantined");
      setReasonKey("onlyFormats");
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setState("error");
      setReasonKey("fileTooLarge");
      return;
    }
    const duration = await new Promise<number>((resolve) => {
      const source = URL.createObjectURL(candidate);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(source);
        resolve(video.duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(source);
        resolve(0);
      };
      video.src = source;
    });
    if (duration > 0 && duration < 4) {
      setState("quarantined");
      setReasonKey("tooShort");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState("uploading");
    try {
      const result = await uploadMp4(candidate, setProgress, controller.signal);
      if (result.durationSeconds < 4 || result.frameCount < result.fps * 4)
        throw new Error("MEDIA_DURATION_INVALID");
      setMedia(result);
      setState("accepted");
      setReasonKey("accepted");
    } catch (error) {
      if (controller.signal.aborted) {
        setState("idle");
        setReasonKey("uploadCanceled");
        return;
      }
      setState(
        error instanceof Error &&
          [
            "VIDEO_TYPE_INVALID",
            "UPLOAD_QUARANTINED",
            "MEDIA_VFR_UNSUPPORTED",
            "MEDIA_DURATION_INVALID",
          ].includes(error.message)
          ? "quarantined"
          : "error",
      );
      setReasonKey(safeReasonKey(error));
    } finally {
      abortRef.current = null;
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setFile(null);
    setMedia(null);
    setProgress({ uploadPercent: 0, validationPercent: 0 });
    setState("idle");
    setReasonKey("selectSource");
    setPrompt("");
    setTrack("restore");
    setDurationSec(20);
    setAspect("9:16");
    setAttachments([]);
    if (inputRef.current) inputRef.current.value = "";
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  };
  const proceed = async () => {
    if (!media) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState("creating");
    try {
      const brief = prompt.trim();
      // generation is attached only when the creator explicitly chose the
      // generate track (C4) -- never merely because the textarea is
      // non-empty. On the restore track that textarea keeps its existing
      // meaning (the creative-intent prompt feeding AI start-frame
      // selection) and its existing behaviour, byte for byte: the `prompt`
      // line below is unchanged from before this fix.
      //
      // A generation brief carries brand attachments by id, so those upload
      // to the shared attachment store first; the job is only created once
      // every attachment has one.
      const generation =
        track === "generate" && brief
          ? {
              brief,
              durationSec,
              aspect,
              attachmentIds: await Promise.all(
                attachments.map((attachment) =>
                  uploadAttachment(attachment, controller.signal),
                ),
              ),
            }
          : undefined;
      const createdJobId = await createCompilerJob(
        media,
        {
          ...(track === "restore" && prompt ? { prompt } : {}),
          ...(generation ? { generation } : {}),
        },
        controller.signal,
      );
      setJobId(createdJobId);
      setState("created");
      setReasonKey("jobCreated");
      window.location.assign(
        `/progress?jobId=${encodeURIComponent(createdJobId)}`,
      );
    } catch (error) {
      setState("error");
      setReasonKey(safeReasonKey(error));
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <div className="upload-shell">
      <header className="upload-header">
        <Link className="brand" href="/" aria-label={t("homeAriaLabel")}>
          <BrandLogo />
        </Link>
        <nav aria-label={t("primaryNavAriaLabel")}>
          <Link data-control-id="upload_validation:1" href="/workflow">
            {t("workflow")}
          </Link>
          <Link data-control-id="upload_validation:2" href="/admin">
            {t("admin")}
          </Link>
        </nav>
        <div className="header-actions">
          <Link
            data-control-id="upload_validation:5"
            className="button button-primary"
            href="/projects/new"
            onClick={(event) => {
              if (file) {
                event.preventDefault();
                reset();
              }
            }}
          >
            {t("newProject")}
          </Link>
        </div>
      </header>
      <main className="upload-main">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>
          {t("heading")}
          <br />
          <span>{t("headingAccent")}</span>
        </h1>
        <p className="intro">{t("intro")}</p>
        <div className="upload-bento">
          <section className="upload-card" aria-labelledby="upload-title">
            <div className="card-heading">
              <div>
                <p className="eyebrow">{t("step01")}</p>
                <h2 id="upload-title">{t("videoSource")}</h2>
              </div>
              <span className="status-chip">{t(`state.${STATE_KEYS[state]}`)}</span>
            </div>
            <label
              data-control-id="upload_validation:8"
              className={`dropzone ${state === "uploading" ? "is-busy" : ""}`}
              htmlFor="reference-file"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void acceptFile(event.dataTransfer.files[0]);
              }}
            >
              <input
                ref={inputRef}
                id="reference-file"
                name="reference-file"
                type="file"
                accept="video/mp4,.mp4,video/quicktime,.mov,video/webm,.webm"
                onChange={(event) => void acceptFile(event.target.files?.[0])}
                disabled={state === "uploading" || state === "creating"}
              />
              <span className="drop-icon" aria-hidden="true">
                ↑
              </span>
              <strong>{file ? file.name : t("dropHere")}</strong>
              <span>
                {file
                  ? `${formatBytes(file.size)} · ${state === "uploading" ? t("uploadingAndValidating") : t("sourceSelected")}`
                  : t("sizeAndFormats")}
              </span>
            </label>
            {file && (
              <div className="file-meta">
                <span>{file.name}</span>
                <span>{formatBytes(file.size)}</span>
              </div>
            )}
            {state === "uploading" && (
              <div className="progress-stack">
                <label htmlFor="upload-progress">
                  {t("upload")}{" "}
                  <progress
                    id="upload-progress"
                    max="100"
                    value={progress.uploadPercent}
                  />
                </label>
                <label htmlFor="validation-progress">
                  {t("validation")}{" "}
                  <progress
                    id="validation-progress"
                    max="100"
                    value={progress.validationPercent}
                  />
                </label>
              </div>
            )}
            {media && (
              <div className="media-meta">
                <span>{t("acceptedNormalizedMedia")}</span>
                <span>
                  {t("mediaSummary", {
                    fps: media.fps,
                    frames: media.frameCount,
                    seconds: media.durationSeconds.toFixed(2),
                  })}
                </span>
              </div>
            )}
            <div className="creative-intent">
              <label htmlFor="creative-track">{t("trackLabel")}</label>
              <select
                id="creative-track"
                value={track}
                onChange={(event) => setTrack(event.target.value as Track)}
              >
                <option value="restore">{t("trackOption.restore")}</option>
                <option value="generate">{t("trackOption.generate")}</option>
              </select>
              <label htmlFor="creative-prompt">{t("creativeIntentLabel")}</label>
              <textarea
                id="creative-prompt"
                placeholder={t("creativeIntentPlaceholder")}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
              {track === "generate" && (
                <p className="generate-track-notice" role="status">
                  {t("generateTrackNotice")}
                </p>
              )}
              {track === "generate" && (
                <div className="generation-fields">
                  <label htmlFor="duration">
                    {t("durationLabel")}
                    <select
                      id="duration"
                      value={durationSec}
                      onChange={(event) =>
                        setDurationSec(Number(event.target.value))
                      }
                    >
                      {DURATION_OPTIONS.map((seconds) => (
                        <option key={seconds} value={seconds}>
                          {t("durationOption", { seconds })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="aspect">
                    {t("aspectLabel")}
                    <select
                      id="aspect"
                      value={aspect}
                      onChange={(event) =>
                        setAspect(event.target.value as Aspect)
                      }
                    >
                      {ASPECT_OPTIONS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
            {track === "generate" && (
              <div className="supplementary-data">
                <div>
                  <span>{t("supplementaryData")}</span>
                  <small>{t("supplementaryDataHint")}</small>
                </div>
                <input
                  ref={attachmentInputRef}
                  id="attachment-file"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/svg+xml,font/ttf,font/otf,font/woff2,video/mp4,.png,.jpg,.jpeg,.svg,.ttf,.otf,.woff2,.mp4"
                  className="visually-hidden"
                  onChange={(event) =>
                    setAttachments([
                      ...attachments,
                      ...Array.from(event.target.files ?? []),
                    ])
                  }
                />
                <label className="button" htmlFor="attachment-file">
                  {t("addAttachments")}
                </label>
              </div>
            )}
            {track === "generate" && attachments.length > 0 && (
              <ul className="attachment-list">
                {attachments.map((attachment, index) => (
                  <li key={`${attachment.name}-${index}`}>
                    <span>{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments(
                          attachments.filter((_, i) => i !== index),
                        )
                      }
                    >
                      {t("remove")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p
              className={`reason ${state === "accepted" || state === "created" ? "success" : ""}`}
              role="status"
            >
              {reasonKey ? t(`reason.${reasonKey}`) : null}
            </p>
            <div className="card-actions">
              <button type="button" onClick={reset} disabled={state === "idle"}>
                {t("cancelChooseAnother")}
              </button>
            </div>
          </section>
          <section className="preflight-card" aria-labelledby="preflight-title">
            <h3 id="preflight-title">{t("preflightChecks")}</h3>
            <ul className="preflight-list">
              {PREFLIGHT_CHECKS.map((key) => (
                <li key={key}>
                  <span>{t(`preflight.${key}`)}</span>
                  <span>
                    {state === "accepted" || state === "created"
                      ? t("preflightStatus.pass")
                      : state === "quarantined" || state === "error"
                        ? t("preflightStatus.failed")
                        : t("preflightStatus.waiting")}
                  </span>
                </li>
              ))}
            </ul>
            <button
              id="submit"
              data-control-id="upload_validation:9"
              className="button-primary"
              type="button"
              onClick={() => void proceed()}
              disabled={
                !media ||
                state === "uploading" ||
                state === "creating" ||
                state === "created" ||
                (track === "generate" && !prompt.trim())
              }
            >
              {state === "creating"
                ? t("creatingJob")
                : state === "created"
                  ? t("jobLabel", { id: jobId ?? "" })
                  : t("proceedToCompiler")}
            </button>
          </section>
        </div>
      </main>
      <footer>
        <a
          data-control-id="upload_validation:13"
          href="https://github.com/singlerr/ref_studio"
          rel="noreferrer"
        >
          {t("github")}
        </a>
      </footer>
    </div>
  );
}
