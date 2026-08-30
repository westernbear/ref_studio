"use client";

import type {
  MotionDeliverablesV1,
  MotionSceneSnapshotV1,
} from "@rvs/contracts/motion";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { JobProgress } from "../../../lib/job-progress";
import { CompilerChatPanel } from "./CompilerChatPanel";
import { MotionEditorPanel } from "./MotionEditorPanel";
import { clampSplitRatio } from "./motion-workspace-model";
import { useMotionWorkspace } from "./useMotionWorkspace";

const SPLIT_STORAGE_KEY = "rvs.motion-workspace.split-ratio";

type Props = Readonly<{
  initialJob: JobProgress;
  initialScene: MotionSceneSnapshotV1;
  initialDeliverables: MotionDeliverablesV1;
}>;

export function MotionWorkspace({
  initialJob,
  initialScene,
  initialDeliverables,
}: Props) {
  const t = useTranslations("MotionWorkspace");
  const locale = useLocale();
  const [ratio, setRatio] = useState(50);
  const dragging = useRef(false);
  const [mobilePane, setMobilePane] = useState<"chat" | "editor">("chat");
  const workspace = useMotionWorkspace({
    initialJob,
    initialScene,
    initialDeliverables,
    locale,
    initializedMessage: t("initialized"),
  });

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(SPLIT_STORAGE_KEY));
    if (Number.isFinite(stored)) setRatio(clampSplitRatio(stored));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SPLIT_STORAGE_KEY, String(ratio));
  }, [ratio]);

  const resizeFromPointer = (
    currentTarget: HTMLDivElement,
    clientX: number,
  ): void => {
    const parent = currentTarget.parentElement;
    if (!parent) return;
    const bounds = parent.getBoundingClientRect();
    setRatio(clampSplitRatio(((clientX - bounds.left) / bounds.width) * 100));
  };

  return (
    <div
      className="motion-workspace"
      data-mobile-pane={mobilePane}
      style={{
        gridTemplateColumns: `${ratio}fr var(--space-sm) ${100 - ratio}fr`,
      }}
    >
      <CompilerChatPanel
        job={workspace.job}
        scene={workspace.scene}
        deliverables={workspace.deliverables}
        messages={workspace.messages}
        busy={workspace.busy}
        viewState={workspace.viewState}
        canUndo={workspace.canUndo}
        onRefine={workspace.refine}
        onUndo={() => workspace.undo(t("undoEvent"))}
        onRollback={(version) =>
          workspace.rollback(version, t("rollbackEvent", { version }))
        }
        onRender={workspace.render}
        onRefresh={workspace.refresh}
      />
      <div
        className="motion-workspace-separator"
        role="separator"
        tabIndex={0}
        aria-label={t("resizeWorkspace")}
        aria-orientation="vertical"
        aria-valuemin={30}
        aria-valuemax={70}
        aria-valuenow={Math.round(ratio)}
        aria-valuetext={t("splitRatio", { ratio: Math.round(ratio) })}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          resizeFromPointer(event.currentTarget, event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging.current)
            resizeFromPointer(event.currentTarget, event.clientX);
        }}
        onPointerUp={(event) => {
          resizeFromPointer(event.currentTarget, event.clientX);
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onKeyDown={(event) => {
          const next =
            event.key === "ArrowLeft"
              ? ratio - 2
              : event.key === "ArrowRight"
                ? ratio + 2
                : event.key === "Home"
                  ? 30
                  : event.key === "End"
                    ? 70
                    : null;
          if (next !== null) {
            event.preventDefault();
            setRatio(clampSplitRatio(next));
          }
        }}
      />
      <MotionEditorPanel
        job={workspace.job}
        scene={workspace.scene}
        deliverables={workspace.deliverables}
        busy={workspace.busy}
        viewState={workspace.viewState}
        onApply={workspace.applyOperations}
      />
      <nav
        className="motion-mobile-tabs"
        role="tablist"
        aria-label={t("mobileViews")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "chat"}
          onClick={() => setMobilePane("chat")}
        >
          {t("chatTab")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "editor"}
          onClick={() => setMobilePane("editor")}
        >
          {t("editorTab")}
        </button>
      </nav>
    </div>
  );
}
