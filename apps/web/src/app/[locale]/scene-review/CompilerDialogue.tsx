"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { errorCode } from "../../../lib/api-error";
import { ThinkingIndicator } from "../../../components/ThinkingIndicator";
import {
  isJobWorking,
  isTerminalJobState,
  jobStateKey,
  nextStepKey,
  normalizeStage,
  runningStageIndex,
  shotLabelKey,
  stageLabelKey,
  thinkingPhaseFor,
  liveJobStatusErrorCode,
  parseJobProgress,
  type BeatSheetEntry,
  type JobProgress,
} from "../../../lib/job-progress";
import {
  createCompilerJob,
  requestId,
  type AcceptedMedia,
} from "../../../lib/upload-client";
import { useRouter } from "../../../i18n/navigation";

type TranslatedOwner = Readonly<{
  ownerId: string;
  sourceLocale: string;
  content: string;
  translatedText: string;
}>;
type Proposal = {
  readonly startFrame: number;
  readonly rationale: string;
  // Heuristic proposals carry a key so their fixed rationales can be
  // translated; AI rationales are free text and only have `rationale`.
  readonly rationaleKey?: string;
};
type ChatMessage =
  | { readonly role: "system"; readonly textKey: string }
  | { readonly role: "user"; readonly text: string }
  | {
      readonly role: "proposals";
      readonly plannerKind: "ai" | "heuristic";
      readonly proposals: readonly Proposal[];
    }
  | { readonly role: "error"; readonly text: string }
  // One entry per stage the job actually reached. Kept after the run ends:
  // the log is the record of what happened, not a spinner that tidies itself
  // away and leaves the creator wondering what the compiler did.
  | { readonly role: "stage"; readonly stage: string }
  // Shown once, the first time the job's authored scene shows up on a poll
  // (scene authoring runs in the API, not as a worker phase) -- the beat
  // sheet is the one place the creator can read what the AI actually
  // planned before the film gets built, so it belongs in the log next to
  // everything else that happened. Kept in sync (not just added once) as
  // the scene changes -- see the effect that maintains it.
  | { readonly role: "beats"; readonly beats: readonly BeatSheetEntry[] }
  // A generate-track chat reply: what the AI understood it should change,
  // and which beats diffChangedBeatIds actually found different (never the
  // model's own claim -- see apps/api/src/patch-scene.ts).
  | {
      readonly role: "patch";
      readonly summary: string;
      readonly changedBeatIds: readonly string[];
    };

type Props = {
  readonly initialJob: JobProgress;
  readonly media: AcceptedMedia | null;
  readonly sourceUrl: string;
  // The "start the final video" button, handed in by the page. It lives next
  // to the line that tells the reader to press it: a button sitting under a
  // 520px-tall dialogue reads as page furniture, not as the next step.
  readonly renderAction?: ReactNode;
};

export function CompilerDialogue({
  initialJob,
  media,
  sourceUrl,
  renderAction,
}: Props) {
  const t = useTranslations("CompilerDialogue");
  const tState = useTranslations("JobState");
  const tStage = useTranslations("StageLabels");
  const tShot = useTranslations("ShotLabels");
  const tRationale = useTranslations("ProposalRationales");
  const tNext = useTranslations("NextStep");
  // AI rationales are free text: the server needs the reader's locale to
  // ask the model for the right language.
  const locale = useLocale();
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  // Derived from the live-polled job, not a static prop -- otherwise the
  // preview never appears once rendering finishes after initial page load.
  const previewUrl = job.previewArtifactId
    ? `/api/v1/jobs/${encodeURIComponent(job.id)}/preview-download`
    : null;
  const previewLabeledUrl = job.previewLabeledArtifactId
    ? `/api/v1/jobs/${encodeURIComponent(job.id)}/preview-labeled-download`
    : null;
  // The captioned cut is the one worth looking at: it names the treatment on
  // each surface, which is the whole question this screen asks. Offering the
  // clean cut beside it was a second switch to work out for a difference the
  // reader has no reason to care about, so the clean cut only stands in when
  // the captioned one has not been made yet.
  const shownPreviewUrl = previewLabeledUrl ?? previewUrl;
  const finalVideoUrl = job.artifactId
    ? `/api/v1/jobs/${encodeURIComponent(job.id)}/delivery-download`
    : null;
  const resultVideoUrl =
    job.state === "COMPLETED" ? finalVideoUrl : shownPreviewUrl;
  const resultLabel = job.state === "COMPLETED" ? t("final") : t("preview");
  const resultPendingLabel =
    job.state === "COMPLETED" ? t("finalPending") : t("previewPending");
  const evidenceVideoUrl = job.evidenceVideoArtifactId
    ? `/api/v1/jobs/${encodeURIComponent(job.id)}/evidence-video-download`
    : null;
  const [compareSource, setCompareSource] = useState<"reference" | "evidence">(
    "reference",
  );
  const compareUrl =
    compareSource === "evidence" && evidenceVideoUrl
      ? evidenceVideoUrl
      : sourceUrl;
  const [messages, setMessages] = useState<readonly ChatMessage[]>([
    { role: "system", textKey: "initialized" },
  ]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  // The chat is blocked while anything is running -- a note sent into a
  // half-built scene lands against a version that no longer exists by the
  // time the worker finishes, and the reply reads as the compiler ignoring
  // the request. The thinking indicator below the history is what explains
  // the dead button, so the two are derived from the same call.
  const thinkingPhase = thinkingPhaseFor(job, sending);
  const busy = sending || isJobWorking(job.state);
  const [lastPrompt, setLastPrompt] = useState("");
  const [applying, setApplying] = useState<number | null>(null);
  const [applyError, setApplyError] = useState("");
  const [pollError, setPollError] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [translatedOwners, setTranslatedOwners] = useState<
    readonly TranslatedOwner[]
  >([]);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const refreshedProjectionRef = useRef("");

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
          setPollError(
            t("statusUpdateFailed", {
              code: liveJobStatusErrorCode(body, response.status),
            }),
          );
          return;
        }
        const parsed = parseJobProgress(body);
        if (parsed) {
          const refreshKey = [
            parsed.state,
            parsed.attempt,
            parsed.approvedGates.join(","),
            parsed.artifactId,
            parsed.previewArtifactId,
            parsed.previewLabeledArtifactId,
          ].join("|");
          if (refreshedProjectionRef.current !== refreshKey) {
            refreshedProjectionRef.current = refreshKey;
            router.refresh();
          }
          setJob(parsed);
          setPollError("");
        }
      } catch {
        if (active) setPollError(t("networkUpdateFailed"));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJob.id, job.state]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/v1/jobs/${encodeURIComponent(initialJob.id)}/evidence`,
          { credentials: "include" },
        );
        if (!response.ok) return;
        const body: unknown = await response.json().catch(() => null);
        if (!active || typeof body !== "object" || body === null) return;
        const sceneInput = (body as Record<string, unknown>)["sceneInput"];
        const owners =
          typeof sceneInput === "object" && sceneInput !== null
            ? (sceneInput as Record<string, unknown>)["owners"]
            : null;
        if (!Array.isArray(owners)) return;
        const translated = owners
          .filter(
            (owner): owner is Record<string, unknown> =>
              typeof owner === "object" && owner !== null,
          )
          .filter(
            (owner) =>
              typeof owner["ownerId"] === "string" &&
              typeof owner["sourceLocale"] === "string" &&
              typeof owner["content"] === "string" &&
              typeof owner["translatedText"] === "string",
          )
          .map((owner) => ({
            ownerId: owner["ownerId"] as string,
            sourceLocale: owner["sourceLocale"] as string,
            content: owner["content"] as string,
            translatedText: owner["translatedText"] as string,
          }));
        if (active) setTranslatedOwners(translated);
      } catch {
        // Translation is best-effort enrichment (task F2) -- absence is a
        // normal state, not an error to surface.
      }
    };
    void load();
    if (isTerminalJobState(job.state)) return undefined;
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJob.id, job.state]);

  useEffect(() => {
    const stage = job.progressStage;
    if (!stage) return;
    setMessages((previous) => {
      const lastStage = [...previous]
        .reverse()
        .find((message) => message.role === "stage");
      if (lastStage?.role === "stage" && lastStage.stage === stage)
        return previous;
      return [...previous, { role: "stage", stage }];
    });
  }, [job.progressStage]);

  // Keeps the beat-sheet message current rather than letting it accumulate
  // stale copies: a scene patch amends the same scene in place, so its beat
  // sheet updates the one existing message (staying where it already is in
  // the log) instead of appending a second copy underneath the chat that
  // asked for the change.
  useEffect(() => {
    const beats = job.beatSheet;
    if (!beats) return;
    setMessages((previous) => {
      const index = previous.findIndex((message) => message.role === "beats");
      if (index === -1) return [...previous, { role: "beats", beats }];
      const existing = previous[index];
      if (
        existing?.role === "beats" &&
        JSON.stringify(existing.beats) === JSON.stringify(beats)
      )
        return previous;
      const next = [...previous];
      next[index] = { role: "beats", beats };
      return next;
    });
  }, [job.beatSheet]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight });
  }, [messages]);

  const send = async (text: string) => {
    if (!text || busy) return;
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
          body: JSON.stringify({ prompt: text, locale }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessages((previous) => [
          ...previous,
          {
            role: "error",
            text: t("statusUpdateFailed", {
              code: liveJobStatusErrorCode(body, response.status),
            }),
          },
        ]);
        return;
      }
      // Two distinct shapes come back from this one endpoint, deliberately
      // never merged (see refine-prompt.ts's ScenePatchChatResponse
      // docstring): a restore-track job's response is exactly what it has
      // always been, {plannerKind, proposals}; a generate-track job's is a
      // scene patch, {changedBeatIds, beatSheet, summary}. Which one the
      // creator gets depends only on the job, not on anything this client
      // decides.
      const parsed = body as
        | { plannerKind: "ai" | "heuristic"; proposals: readonly Proposal[] }
        | {
            changedBeatIds: readonly string[];
            beatSheet: readonly BeatSheetEntry[];
            summary: string;
          };
      if ("proposals" in parsed) {
        setMessages((previous) => [
          ...previous,
          {
            role: "proposals",
            plannerKind: parsed.plannerKind,
            proposals: parsed.proposals,
          },
        ]);
      } else {
        // Requirement: the creator has just asked for a change and should
        // see that it is being made, not a stale "completed" -- update the
        // locally-held job right away rather than waiting up to 3s for the
        // next poll. This also re-arms the polling effects below (their
        // dependency is job.state), which stopped once the job reached a
        // terminal state.
        setJob((previous) => ({
          ...previous,
          state: "QUEUED",
          progressPhase: "prepare",
          progressStage: "scene-patch",
          progressFraction: 0,
          framesProcessed: null,
          framesTotal: null,
          beatSheet: parsed.beatSheet,
        }));
        setMessages((previous) => [
          ...previous,
          {
            role: "patch",
            summary: parsed.summary,
            changedBeatIds: parsed.changedBeatIds,
          },
        ]);
      }
      setLastPrompt(text);
    } catch {
      setMessages((previous) => [
        ...previous,
        { role: "error", text: t("connectionInterrupted") },
      ]);
    } finally {
      setSending(false);
    }
  };

  const apply = async (proposal: Proposal, index: number) => {
    if (!media) {
      setApplyError(t("sourceMediaUnavailable"));
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
      setApplyError(t("createJobFailed"));
      setApplying(null);
    }
  };

  // Rides along with the decision below and never speaks for itself: a failed
  // thumbs is not something to stop a reviewer over, and the decision beside
  // it reports its own outcome.
  const rate = async (thumbsUp: boolean) => {
    try {
      await fetch(`/api/v1/jobs/${encodeURIComponent(job.id)}/rate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestId(),
        },
        body: JSON.stringify({ thumbsUp }),
      });
    } catch {
      // The decision is the durable record; this is a signal on top of it.
    }
  };

  const submitFeedback = async (decision: "LOOKS_GOOD" | "NEEDS_CHANGES") => {
    setFeedbackSending(true);
    setFeedbackStatus("");
    // The screen used to carry a thumbs pair beside these two, asking the same
    // question of the same person into a different endpoint. One control, both
    // records: the decision is the durable one and reports its own failures,
    // the rating rides along and is not worth interrupting anyone over.
    void rate(decision === "LOOKS_GOOD");
    try {
      const response = await fetch(
        `/api/v1/jobs/${encodeURIComponent(job.id)}/feedback`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": requestId(),
          },
          body: JSON.stringify({
            decision,
            locale,
            ...(feedbackNote ? { note: feedbackNote } : {}),
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedbackStatus(
          t("feedbackFailed", {
            code: errorCode(body) || "HTTP_" + response.status,
          }),
        );
        return;
      }
      const parsed = body as {
        proposals: {
          plannerKind: "ai" | "heuristic";
          proposals: readonly Proposal[];
        } | null;
      };
      const proposals = parsed.proposals;
      if (proposals) {
        setMessages((previous) => [
          ...previous,
          {
            role: "proposals",
            plannerKind: proposals.plannerKind,
            proposals: proposals.proposals,
          },
        ]);
      }
      setFeedbackStatus(t("feedbackRecorded"));
      setFeedbackNote("");
    } catch {
      setFeedbackStatus(t("connectionInterrupted"));
    } finally {
      setFeedbackSending(false);
    }
  };

  const activeStageIndex = runningStageIndex(
    messages.map((message) => message.role),
    job.progressStage,
  );
  const framesLabel =
    job.framesProcessed !== null && job.framesTotal !== null
      ? `${job.framesProcessed}/${job.framesTotal}`
      : null;
  // Frames when the stage counts them, otherwise the fraction it reports.
  // Either way it has to move, because a stage name on its own does not.
  const stageProgress =
    framesLabel ??
    (job.progressFraction > 0
      ? `${Math.round(job.progressFraction * 100)}%`
      : null);

  return (
    <div className="dialogue-shell">
      <div className="dialogue-chat" data-landmark="compiler-dialogue">
        <div className="dialogue-chat-header">
          <div>
            <h2>{t("title")}</h2>
            <p>{t("sessionId", { id: job.id })}</p>
          </div>
        </div>
        <div
          className="dialogue-chat-history"
          data-landmark="chat-history"
          ref={historyRef}
        >
          {messages.map((message, index) => {
            if (message.role === "system")
              return (
                <div className="dialogue-message" key={index}>
                  <span className="dialogue-message-label">
                    {t("systemNode")}
                  </span>
                  <p>{t(message.textKey)}</p>
                </div>
              );
            if (message.role === "user")
              return (
                <div
                  className="dialogue-message dialogue-message-user"
                  key={index}
                >
                  <span className="dialogue-message-label">
                    {t("userPrompt")}
                  </span>
                  <p>{message.text}</p>
                </div>
              );
            if (message.role === "stage") {
              const label = stageLabelKey(normalizeStage(message.stage));
              const active =
                isJobWorking(job.state) && index === activeStageIndex;
              return (
                <div
                  className="dialogue-message dialogue-message-stage"
                  key={index}
                >
                  <span
                    className={
                      active
                        ? "dialogue-message-label dialogue-message-label-active"
                        : "dialogue-message-label"
                    }
                  >
                    {active ? (
                      <span className="spinner" aria-hidden="true" />
                    ) : null}
                    {label.known ? tStage(label.key) : label.fallback}
                    {/* Rendering the scene reports frame by frame for two
                        minutes under one stage name, and a stage only earns a
                        new line when its name changes -- so without the count
                        beside it the screen sits still long enough to read as
                        stopped. */}
                    {active && stageProgress ? (
                      <span className="dialogue-stage-progress">
                        {stageProgress}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            }
            if (message.role === "error")
              return (
                <div
                  className="dialogue-message dialogue-message-error"
                  key={index}
                >
                  <p>{message.text}</p>
                </div>
              );
            if (message.role === "patch")
              return (
                <div className="dialogue-message" key={index}>
                  <span className="dialogue-message-label">
                    {t("patchLabel")}
                  </span>
                  <p>{message.summary}</p>
                  <p className="dialogue-patch-changed">
                    {message.changedBeatIds.length
                      ? t("patchChangedBeats", {
                          beats: message.changedBeatIds.join(", "),
                        })
                      : t("patchNoBeatsChanged")}
                  </p>
                  <p className="dialogue-patch-rendering">
                    {t("patchRenderStarted")}
                  </p>
                </div>
              );
            if (message.role === "beats")
              return (
                <div className="dialogue-message" key={index}>
                  <span className="dialogue-message-label">
                    {t("beatSheetLabel")}
                  </span>
                  <ul className="dialogue-beat-sheet" data-testid="beat-sheet">
                    {message.beats.map((beat) => {
                      const label = shotLabelKey(beat.shot);
                      return (
                        <li key={beat.beatId}>
                          <strong>
                            {label.known ? tShot(label.key) : label.fallback}
                          </strong>
                          {beat.words ? <p>{beat.words}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            return (
              <div className="dialogue-message" key={index}>
                <span className="dialogue-message-label">
                  {message.plannerKind === "ai"
                    ? t("aiProposal")
                    : t("heuristicProposal")}
                </span>
                <ul className="dialogue-proposal-list">
                  {message.proposals.map((proposal, proposalIndex) => (
                    <li key={proposalIndex}>
                      <div>
                        <strong>
                          {t("startFrame", { frame: proposal.startFrame })}
                        </strong>
                        <p>
                          {proposal.rationaleKey
                            ? tRationale(proposal.rationaleKey)
                            : proposal.rationale}
                        </p>
                      </div>
                      <button
                        className="button"
                        type="button"
                        disabled={applying !== null}
                        onClick={() => void apply(proposal, proposalIndex)}
                      >
                        {applying === proposalIndex
                          ? t("applying")
                          : t("apply")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {/* The model is working and has produced nothing yet. Authoring
              a scene is one call that runs 25-37 seconds against a live
              provider; until this, the pane simply sat blank, which is
              indistinguishable from a broken one. */}
          {thinkingPhase ? <ThinkingIndicator phase={thinkingPhase} /> : null}
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
                if (!busy && prompt) {
                  void send(prompt);
                  setPrompt("");
                }
              }
            }}
            placeholder={t("promptPlaceholder")}
            rows={1}
            aria-label={t("promptAriaLabel")}
          />
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || !prompt}
          >
            {sending ? t("sending") : t("send")}
          </button>
        </form>
      </div>
      <div className="dialogue-preview" data-landmark="preview-canvas">
        <div className="dialogue-preview-toolbar">
          <span className="status-chip">{tState(jobStateKey(job.state))}</span>
          {job.state === "STALE_APPROVAL" ? (
            <span className="status-chip is-stale">{t("staleApproval")}</span>
          ) : null}
          {/* Everything else on this screen reports state. This is the only
              line that says whose turn it is, which is what was missing the
              moment the compiler went quiet and the reader was left with two
              videos and no idea what came next. */}
          <p className="dialogue-next-step" aria-live="polite">
            {tNext(nextStepKey(job))}
          </p>
          {renderAction}
        </div>
        <div className="dialogue-preview-frame" data-landmark="compare-row">
          {/* Each pane keeps its name on screen whatever it is showing. Two
              panes that each offered a pair of chips looked like one row of
              four, said nothing about which side was which, and -- once the
              left pane was switched to the annotated cut -- put an annotated
              video under both, so the reference could be read as the preview.
              The name is fixed; the chip only turns that pane's overlay on. */}
          <div className="dialogue-compare-pane">
            <div className="dialogue-compare-head">
              <span className="dialogue-compare-name">{t("reference")}</span>
              {evidenceVideoUrl ? (
                <button
                  type="button"
                  className="chip-toggle"
                  aria-pressed={compareSource === "evidence"}
                  data-active={compareSource === "evidence"}
                  onClick={() =>
                    setCompareSource(
                      compareSource === "evidence" ? "reference" : "evidence",
                    )
                  }
                >
                  {t("showAnalysis")}
                </button>
              ) : null}
            </div>
            <video controls preload="metadata" playsInline src={compareUrl} />
          </div>
          <div className="dialogue-compare-pane">
            <div className="dialogue-compare-head">
              <span className="dialogue-compare-name">{resultLabel}</span>
            </div>
            {resultVideoUrl ? (
              <video
                controls
                preload="metadata"
                playsInline
                src={resultVideoUrl}
              />
            ) : (
              <div className="dialogue-preview-pending" role="status">
                <span className="spinner spinner-lg" aria-hidden="true" />
                <span>{resultPendingLabel}</span>
              </div>
            )}
          </div>
        </div>
        <div className="dialogue-preview-footer" data-landmark="preview-footer">
          <div>
            <span>{t("job", { id: job.id })}</span>
            {framesLabel ? (
              <span>{t("frames", { frames: framesLabel })}</span>
            ) : null}
          </div>
        </div>
        {translatedOwners.length > 0 ? (
          <div className="dialogue-translations" data-landmark="translations">
            <span className="status-chip">{t("translations")}</span>
            <ul>
              {translatedOwners.map((owner) => (
                <li key={owner.ownerId}>
                  <span className="chip-toggle" data-active="true">
                    {owner.sourceLocale}
                  </span>
                  <span>{owner.content}</span>
                  <span aria-hidden="true">{"→"}</span>
                  <span className="chip-toggle" data-active="true">
                    {owner.sourceLocale === "ko-KR" ? "en-US" : "ko-KR"}
                  </span>
                  <span>{owner.translatedText}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="dialogue-decision-row" data-landmark="feedback">
          <div className="dialogue-decision-buttons">
            <button
              type="button"
              className="chip-toggle"
              disabled={feedbackSending}
              onClick={() => void submitFeedback("LOOKS_GOOD")}
            >
              {t("looksGood")}
            </button>
            <button
              type="button"
              className="chip-toggle"
              disabled={feedbackSending}
              onClick={() => void submitFeedback("NEEDS_CHANGES")}
            >
              {t("needsChanges")}
            </button>
            <button
              type="button"
              className="chip-toggle"
              disabled={sending}
              onClick={() =>
                void send(lastPrompt || t("proposeAlternateVariants"))
              }
            >
              {t("variations")}
            </button>
          </div>
          <textarea
            value={feedbackNote}
            onChange={(event) => setFeedbackNote(event.target.value)}
            placeholder={t("feedbackNotePlaceholder")}
            rows={1}
            aria-label={t("feedbackNoteAriaLabel")}
          />
          {feedbackStatus ? (
            <p className="dialogue-rate-status" aria-live="polite">
              {feedbackStatus}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
