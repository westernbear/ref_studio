"use client";

import { useEffect, useRef, useState } from "react";
import { errorCode } from "../../lib/api-error";
import {
  compileStageRows,
  isTerminalJobState,
  liveJobStatusError,
  parseJobProgress,
  type JobProgress,
} from "../../lib/job-progress";
import { createCompilerJob, requestId, type AcceptedMedia } from "../../lib/upload-client";

type Proposal = { readonly startFrame: number; readonly rationale: string };
type ChatMessage =
  | { readonly role: "system"; readonly text: string }
  | { readonly role: "user"; readonly text: string }
  | {
      readonly role: "proposals";
      readonly plannerKind: "ai" | "heuristic";
      readonly proposals: readonly Proposal[];
    }
  | { readonly role: "error"; readonly text: string };

type Props = {
  readonly initialJob: JobProgress;
  readonly media: AcceptedMedia | null;
  readonly sourceUrl: string;
};

export function CompilerDialogue({ initialJob, media, sourceUrl }: Props) {
  const [job, setJob] = useState(initialJob);
  // Derived from the live-polled job, not a static prop -- otherwise the
  // preview never appears once rendering finishes after initial page load.
  const previewUrl = job.previewArtifactId
    ? `/api/v1/jobs/${encodeURIComponent(job.id)}/preview-download`
    : null;
  const [messages, setMessages] = useState<readonly ChatMessage[]>([
    {
      role: "system",
      text: "Compiler initialized. Ready for scene refinement directives.",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  const [applying, setApplying] = useState<number | null>(null);
  const [applyError, setApplyError] = useState("");
  const [rateStatus, setRateStatus] = useState("");
  const [pollError, setPollError] = useState("");
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isTerminalJobState(job.state)) return undefined;
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
        if (!active) return;
        if (!response.ok) {
          setPollError(liveJobStatusError(body, response.status));
          return;
        }
        const parsed = parseJobProgress(body);
        if (parsed) {
          setJob(parsed);
          setPollError("");
        }
      } catch {
        if (active) setPollError("Network update failed. Retrying.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [initialJob.id, job.state]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight });
  }, [messages]);

  const send = async (text: string) => {
    if (!text || sending) return;
    setSending(true);
    setMessages((previous) => [...previous, { role: "user", text }]);
    try {
      const response = await fetch(
        `/api/v1/jobs/${encodeURIComponent(job.id)}/refine-prompt`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": requestId(),
          },
          body: JSON.stringify({ prompt: text }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessages((previous) => [
          ...previous,
          { role: "error", text: liveJobStatusError(body, response.status) },
        ]);
        return;
      }
      const parsed = body as {
        plannerKind: "ai" | "heuristic";
        proposals: readonly Proposal[];
      };
      setMessages((previous) => [
        ...previous,
        {
          role: "proposals",
          plannerKind: parsed.plannerKind,
          proposals: parsed.proposals,
        },
      ]);
      setLastPrompt(text);
    } catch {
      setMessages((previous) => [
        ...previous,
        { role: "error", text: "The connection was interrupted. Retry." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const apply = async (proposal: Proposal, index: number) => {
    if (!media) {
      setApplyError("Source media is unavailable for this job.");
      return;
    }
    setApplying(index);
    setApplyError("");
    try {
      const newJobId = await createCompilerJob(
        media,
        { startFrame: proposal.startFrame },
        new AbortController().signal,
      );
      window.location.assign(
        `/scene-review?jobId=${encodeURIComponent(newJobId)}`,
      );
    } catch {
      setApplyError("Could not create a job for this window. Retry.");
      setApplying(null);
    }
  };

  const rate = async (thumbsUp: boolean) => {
    setRateStatus("");
    try {
      const response = await fetch(
        `/api/v1/jobs/${encodeURIComponent(job.id)}/rate`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": requestId(),
          },
          body: JSON.stringify({ thumbsUp }),
        },
      );
      setRateStatus(
        response.ok
          ? "Thanks for the feedback."
          : `Rating failed: ${errorCode(await response.json().catch(() => null)) || "HTTP_" + response.status}.`,
      );
    } catch {
      setRateStatus("The connection was interrupted. Retry.");
    }
  };

  const stageRows = compileStageRows(job);
  const framesLabel =
    job.framesProcessed !== null && job.framesTotal !== null
      ? `${job.framesProcessed}/${job.framesTotal}`
      : null;

  return (
    <div className="dialogue-shell">
      <div className="dialogue-chat" data-landmark="compiler-dialogue">
        <div className="dialogue-chat-header">
          <div>
            <h2>Compiler Dialogue</h2>
            <p>Session ID: {job.id}</p>
          </div>
        </div>
        <div className="dialogue-chat-history" data-landmark="chat-history" ref={historyRef}>
          {messages.map((message, index) => {
            if (message.role === "system")
              return (
                <div className="dialogue-message" key={index}>
                  <span className="dialogue-message-label">System Node</span>
                  <p>{message.text}</p>
                </div>
              );
            if (message.role === "user")
              return (
                <div className="dialogue-message dialogue-message-user" key={index}>
                  <span className="dialogue-message-label">User Prompt</span>
                  <p>{message.text}</p>
                </div>
              );
            if (message.role === "error")
              return (
                <div className="dialogue-message dialogue-message-error" key={index}>
                  <p>{message.text}</p>
                </div>
              );
            return (
              <div className="dialogue-message" key={index}>
                <span className="dialogue-message-label">
                  {message.plannerKind === "ai" ? "AI Proposal" : "Heuristic Proposal"}
                </span>
                <ul className="dialogue-proposal-list">
                  {message.proposals.map((proposal, proposalIndex) => (
                    <li key={proposalIndex}>
                      <div>
                        <strong>Start frame {proposal.startFrame}</strong>
                        <p>{proposal.rationale}</p>
                      </div>
                      <button
                        className="button"
                        type="button"
                        disabled={applying !== null}
                        onClick={() => void apply(proposal, proposalIndex)}
                      >
                        {applying === proposalIndex ? "Applying..." : "Apply"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {stageRows.length > 0 && !isTerminalJobState(job.state) ? (
            <div className="dialogue-message">
              <span className="dialogue-message-label dialogue-message-label-active">
                Compiling Scene...
              </span>
              <div className="dialogue-stage-list">
                {stageRows.map((row) => (
                  <div className="dialogue-stage-row" key={row.key}>
                    <span>{row.label}</span>
                    <span>{row.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {applyError ? <p className="dialogue-error">{applyError}</p> : null}
          {pollError ? <p className="dialogue-error">{pollError}</p> : null}
        </div>
        <form
          className="dialogue-input"
          onSubmit={(event) => {
            event.preventDefault();
            void send(prompt);
            setPrompt("");
          }}
        >
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!sending && prompt) {
                  void send(prompt);
                  setPrompt("");
                }
              }
            }}
            placeholder="Refine generation parameters..."
            rows={1}
            aria-label="Refine generation parameters"
          />
          <button className="button button-primary" type="submit" disabled={sending || !prompt}>
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
      <div className="dialogue-preview" data-landmark="preview-canvas">
        <div className="dialogue-preview-toolbar">
          <span className="status-chip">{job.state}</span>
        </div>
        <div className="dialogue-preview-frame">
          {previewUrl ? (
            <video controls preload="metadata" playsInline src={previewUrl} />
          ) : (
            <video controls preload="metadata" playsInline src={sourceUrl} />
          )}
        </div>
        <div className="dialogue-preview-footer" data-landmark="preview-footer">
          <div>
            <span>Job: {job.id}</span>
            {framesLabel ? <span>Frames: {framesLabel}</span> : null}
          </div>
          <div className="dialogue-feedback">
            <span>Rate Generation:</span>
            <button className="button" type="button" onClick={() => void rate(true)}>
              👍
            </button>
            <button className="button" type="button" onClick={() => void rate(false)}>
              👎
            </button>
            <button
              className="button"
              type="button"
              disabled={sending}
              onClick={() => void send(lastPrompt || "Propose alternate variants.")}
            >
              Variations
            </button>
          </div>
        </div>
        {rateStatus ? (
          <p className="dialogue-rate-status" aria-live="polite">
            {rateStatus}
          </p>
        ) : null}
      </div>
    </div>
  );
}
