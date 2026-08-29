"use client";

import type {
  MotionDeliverablesV1,
  MotionSceneSnapshotV1,
} from "@rvs/contracts/motion";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { isJobWorking, type JobProgress } from "../../../lib/job-progress";
import { MotionActionCard } from "./MotionActionCard";
import type { WorkspaceMessage } from "./useMotionWorkspace";

type Props = Readonly<{
  job: JobProgress;
  scene: MotionSceneSnapshotV1;
  deliverables: MotionDeliverablesV1;
  messages: readonly WorkspaceMessage[];
  busy: boolean;
  canUndo: boolean;
  onRefine: (prompt: string) => Promise<void>;
  onUndo: () => Promise<void>;
  onRollback: (version: number) => Promise<void>;
  onRender: () => Promise<void>;
}>;

export function CompilerChatPanel({
  job,
  scene,
  deliverables,
  messages,
  busy,
  canUndo,
  onRefine,
  onUndo,
  onRollback,
  onRender,
}: Props) {
  const t = useTranslations("MotionWorkspace");
  const [prompt, setPrompt] = useState("");
  const history = useRef<HTMLDivElement | null>(null);
  const blocked = busy || isJobWorking(job.state);

  useEffect(() => {
    history.current?.scrollTo({ top: history.current.scrollHeight });
  }, [messages]);

  const visibleText = (entry: WorkspaceMessage): string => {
    if (entry.role !== "error") return entry.text;
    const key = `errors.${entry.text}`;
    return t.has(key) ? t(key) : t("errors.unknown", { code: entry.text });
  };

  const send = async (): Promise<void> => {
    const text = prompt.trim();
    if (!text || blocked) return;
    setPrompt("");
    await onRefine(text);
  };

  return (
    <section
      className="compiler-chat motion-workspace-pane"
      aria-labelledby="compiler-chat-title"
      data-mobile-pane="chat"
    >
      <header className="compiler-chat-header">
        <div>
          <h1 id="compiler-chat-title">{t("chatTitle")}</h1>
          <p>{t("session", { id: job.id })}</p>
        </div>
      </header>
      <div className="compiler-chat-history" ref={history} aria-live="polite">
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
