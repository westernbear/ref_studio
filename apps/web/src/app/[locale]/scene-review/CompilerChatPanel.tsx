"use client";

import type {
  MotionDeliverablesV1,
  MotionSceneSnapshotV1,
} from "@rvs/contracts/motion";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { isJobWorking, type JobProgress } from "../../../lib/job-progress";
import { MotionActionCard } from "./MotionActionCard";
import type { WorkspaceViewState } from "./motion-workspace-model";
import type { WorkspaceMessage } from "./useMotionWorkspace";

type Props = Readonly<{
  id: string;
  job: JobProgress;
  scene: MotionSceneSnapshotV1;
  deliverables: MotionDeliverablesV1;
  messages: readonly WorkspaceMessage[];
  busy: boolean;
  viewState: WorkspaceViewState;
  canUndo: boolean;
  onRefine: (prompt: string) => Promise<void>;
  onUndo: () => Promise<void>;
  onRollback: (version: number) => Promise<void>;
  onRender: () => Promise<void>;
  onRefresh: () => Promise<void>;
}>;

export function CompilerChatPanel({
  id,
  job,
  scene,
  deliverables,
  messages,
  busy,
  viewState,
  canUndo,
  onRefine,
  onUndo,
  onRollback,
  onRender,
  onRefresh,
}: Props) {
  const t = useTranslations("MotionWorkspace");
  const [prompt, setPrompt] = useState("");
  const history = useRef<HTMLDivElement | null>(null);
  const blocked =
    busy ||
    isJobWorking(job.state) ||
    ["offline", "conflict", "cancelled", "unsupported"].includes(viewState);

  useEffect(() => {
    history.current?.scrollTo({ top: history.current.scrollHeight });
  }, [messages]);

  const visibleText = (entry: WorkspaceMessage): string => {
    if (entry.role !== "error") return entry.text;
    const key = `errors.${entry.text}`;
    const message = t.has(key)
      ? t(key)
      : t("errors.unknown", { code: entry.text });
    const parts = [message];
    if (entry.remediation)
      parts.push(t("errors.nextStep", { step: entry.remediation }));
    if (entry.docsUrl) parts.push(entry.docsUrl);
    return parts.join(" ");
  };

  const send = async (): Promise<void> => {
    const text = prompt.trim();
    if (!text || blocked) return;
    setPrompt("");
    await onRefine(text);
  };

  return (
    <section
      id={id}
      className="compiler-chat motion-workspace-pane"
      role="tabpanel"
      aria-labelledby="motion-workspace-chat-tab"
      aria-label={t("chatTitle")}
      data-mobile-pane="chat"
    >
      <header className="compiler-chat-header">
        <div>
          <h1 id="compiler-chat-title">{t("chatTitle")}</h1>
          <p>{t("session", { id: job.id })}</p>
        </div>
      </header>
      <div className="compiler-chat-history" ref={history} aria-live="polite">
        <div
          className="motion-workspace-status"
          data-state={viewState}
          role={
            ["error", "conflict", "offline"].includes(viewState)
              ? "alert"
              : "status"
          }
          aria-busy={viewState === "loading" || viewState === "running"}
        >
          <strong>{t(`states.${viewState}.title`)}</strong>
          <span>{t(`states.${viewState}.detail`)}</span>
          {["error", "conflict", "offline"].includes(viewState) ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRefresh()}
            >
              {t("refreshScene")}
            </button>
          ) : null}
        </div>
        {messages.map((entry) => (
          <article
            key={entry.id}
            className="compiler-chat-message"
            data-role={entry.role}
          >
            <span>
              {entry.role === "user"
                ? t("you")
                : entry.role === "operation"
                  ? t("canvasEvent")
                  : entry.role === "error"
                    ? t("error")
                    : t("assistant")}
            </span>
            <p>{visibleText(entry)}</p>
          </article>
        ))}
        <MotionActionCard
          job={job}
          scene={scene}
          deliverables={deliverables}
          busy={busy}
          canUndo={canUndo}
          onUndo={onUndo}
          onRollback={onRollback}
          onRender={onRender}
          viewState={viewState}
          onRefresh={onRefresh}
        />
      </div>
      <form
        className="compiler-chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="motion-workspace-prompt">
          {t("promptAriaLabel")}
        </label>
        <textarea
          id="motion-workspace-prompt"
          value={prompt}
          disabled={blocked}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={t("promptPlaceholder")}
          rows={2}
        />
        <button type="submit" disabled={blocked || prompt.trim().length === 0}>
          {busy ? t("sending") : t("send")}
        </button>
      </form>
    </section>
  );
}
