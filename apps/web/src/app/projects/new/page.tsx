"use client";

import { useRef, useState } from "react";
import {
  createCompilerJob,
  uploadMp4,
  type AcceptedMedia,
  type UploadProgress,
} from "../../../lib/upload-client";

type WorkflowState =
  | "idle"
  | "uploading"
  | "accepted"
  | "quarantined"
  | "error"
  | "creating"
  | "created";
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

const safeReason = (error: unknown): string => {
  const code = error instanceof Error ? error.message : "NETWORK_INTERRUPTED";
  const reasons: Record<string, string> = {
    VIDEO_TYPE_INVALID:
      "This MP4 could not be admitted. Choose a supported H.264 video.",
    VIDEO_SIZE_LIMIT_EXCEEDED:
      "This file is larger than the 2 GB upload limit.",
    UPLOAD_QUARANTINED:
      "This upload is isolated for safety and cannot continue.",
    MEDIA_VFR_UNSUPPORTED: "Variable frame rate video is not supported.",
    MEDIA_DURATION_INVALID: "The video must be between 4 and 300 seconds.",
    MEDIA_INTERVAL_INVALID:
      "Choose a four-second interval inside the accepted media.",
    INVALID_REQUEST: "The request could not be completed. Retry.",
    TENANT_BOUNDARY_BYPASS: "This upload session is no longer available.",
    RESOURCE_NOT_FOUND: "This upload session is no longer available.",
    NETWORK_INTERRUPTED: "The connection was interrupted. Retry to continue.",
  };
  return reasons[code] ?? "The request could not be completed. Retry.";
};

const formatBytes = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function NewProjectPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [media, setMedia] = useState<AcceptedMedia | null>(null);
  const [progress, setProgress] = useState<UploadProgress>({
    uploadPercent: 0,
    validationPercent: 0,
  });
  const [state, setState] = useState<WorkflowState>("idle");
  const [reason, setReason] = useState("Select an MP4 source to begin.");
  const [startFrame, setStartFrame] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);

  const acceptFile = async (candidate: File | undefined) => {
    if (!candidate) return;
    setFile(candidate);
    setMedia(null);
    setJobId(null);
    setReason("");
    if (
      candidate.type !== "video/mp4" ||
      !candidate.name.toLowerCase().endsWith(".mp4")
    ) {
      setState("quarantined");
      setReason("Only MP4 video files can be admitted.");
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setState("error");
      setReason("This file is larger than the 2 GB upload limit.");
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
      setReason("The video is shorter than the required four-second interval.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState("uploading");
    try {
      const result = await uploadMp4(candidate, setProgress, controller.signal);
      const acceptedDuration = result.durationSeconds || duration;
      const acceptedFps = result.fps || 30;
      const acceptedFrames =
        result.frameCount || Math.floor(acceptedDuration * acceptedFps);
      const normalized = {
        ...result,
        durationSeconds: acceptedDuration,
        fps: acceptedFps,
        frameCount: acceptedFrames,
      };
      if (acceptedDuration < 4 || acceptedFrames < acceptedFps * 4)
        throw new Error("MEDIA_DURATION_INVALID");
      setMedia(normalized);
      setState("accepted");
      setReason("Accepted normalized media. Select a four-second interval.");
    } catch (error) {
      if (controller.signal.aborted) {
        setState("idle");
        setReason("Upload canceled.");
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
      setReason(safeReason(error));
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
    setReason("Select an MP4 source to begin.");
    if (inputRef.current) inputRef.current.value = "";
  };
  const intervalValid = Boolean(
    media && startFrame >= 0 && startFrame + media.fps * 4 <= media.frameCount,
  );
  const proceed = async () => {
    if (!media || !intervalValid) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState("creating");
    try {
      const createdJobId = await createCompilerJob(
        media,
        startFrame,
        controller.signal,
      );
      setJobId(createdJobId);
      setState("created");
      setReason("Compiler job created. Opening progress.");
      window.location.assign(
        `/progress?jobId=${encodeURIComponent(createdJobId)}`,
      );
    } catch (error) {
      setState("error");
      setReason(safeReason(error));
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <div className="upload-shell">
      <header className="upload-header">
        <a
          className="brand"
          href="/workflow"
          aria-label="Reference Video Studio home"
        >
          RVS
        </a>
        <nav aria-label="Primary navigation">
          <a data-control-id="upload_validation:1" href="/workflow">
            Workflow
          </a>
          <a data-control-id="upload_validation:2" href="/admin">
            Admin
          </a>
          <a data-control-id="upload_validation:3" href="/docs">
            Docs
          </a>
          <a data-control-id="upload_validation:4" href="/support">
            Support
          </a>
        </nav>
        <div className="header-actions">
          <a
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
            New Project
          </a>
        </div>
      </header>
      <main className="upload-main">
        <p className="eyebrow">SOURCE / VALIDATION</p>
        <h1>
          Bring your reference video
          <br />
          <span>into focus.</span>
        </h1>
        <p className="intro">
          Upload one source. We’ll quarantine, validate, and normalize it before
          anything reaches the compiler.
        </p>
        <section className="upload-card" aria-labelledby="upload-title">
          <div className="card-heading">
            <div>
              <p className="eyebrow">STEP 01</p>
              <h2 id="upload-title">Video source</h2>
            </div>
            <span className="status-chip">
              {state === "accepted" || state === "created"
                ? "READY"
                : state.toUpperCase()}
            </span>
          </div>
          <label
            data-control-id="upload_validation:8"
            className={`dropzone ${state === "uploading" ? "is-busy" : ""}`}
            htmlFor="upload-file"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void acceptFile(event.dataTransfer.files[0]);
            }}
          >
            <input
              ref={inputRef}
              id="upload-file"
              name="upload-file"
              type="file"
              accept="video/mp4,.mp4"
              onChange={(event) => void acceptFile(event.target.files?.[0])}
              disabled={state === "uploading" || state === "creating"}
            />
            <span className="drop-icon" aria-hidden="true">
              ↑
            </span>
            <strong>{file ? file.name : "Drop an MP4 here or browse"}</strong>
            <span>
              {file
                ? `${formatBytes(file.size)} · ${state === "uploading" ? "Uploading and validating" : "Source selected"}`
                : "H.264 MP4 · up to 2 GB · CFR 24/25/30/50/60 fps"}
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
                Upload{" "}
                <progress
                  id="upload-progress"
                  max="100"
                  value={progress.uploadPercent}
                />
              </label>
              <label htmlFor="validation-progress">
                Validation{" "}
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
              <span>Accepted normalized media</span>
              <span>
                {media.fps} fps · {media.frameCount} frames ·{" "}
                {media.durationSeconds.toFixed(2)}s
              </span>
            </div>
          )}
          {media && (
            <div className="interval">
              <label htmlFor="interval">
                Start frame{" "}
                <input
                  id="interval"
                  type="number"
                  min="0"
                  max={Math.max(0, media.frameCount - media.fps * 4)}
                  step="1"
                  value={startFrame}
                  onChange={(event) =>
                    setStartFrame(Number(event.target.value))
                  }
                />
              </label>
              <span>
                Exact interval: [{startFrame}, {startFrame + media.fps * 4}) · 4
                seconds
              </span>
            </div>
          )}
          <p
            className={`reason ${state === "accepted" || state === "created" ? "success" : ""}`}
            role="status"
          >
            {reason}
          </p>
          <div className="card-actions">
            <button type="button" onClick={reset} disabled={state === "idle"}>
              Cancel / choose another
            </button>
            <button
              data-control-id="upload_validation:9"
              className="button-primary"
              type="button"
              onClick={() => void proceed()}
              disabled={
                !intervalValid ||
                state === "uploading" ||
                state === "creating" ||
                state === "created"
              }
            >
              {state === "creating"
                ? "Creating job…"
                : state === "created"
                  ? `Job ${jobId}`
                  : "Proceed to Compiler →"}
            </button>
          </div>
        </section>
      </main>
      <footer>
        <a data-control-id="upload_validation:10" href="/api">
          API
        </a>
        <a data-control-id="upload_validation:11" href="/legal">
          Legal
        </a>
        <a data-control-id="upload_validation:12" href="/privacy">
          Privacy
        </a>
        <a
          data-control-id="upload_validation:13"
          href="https://github.com/singlerr/ref_studio"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
