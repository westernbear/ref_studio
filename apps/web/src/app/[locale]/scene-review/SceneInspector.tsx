"use client";

import type {
  MotionSceneSnapshotV1,
  SceneOperationBatchV1,
} from "@rvs/contracts/motion";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { JobProgress } from "../../../lib/job-progress";
import { ScenePropertiesPanel } from "./ScenePropertiesPanel";
import type {
  SceneSelection,
  WorkspaceViewState,
} from "./motion-workspace-model";

type Props = Readonly<{
  job: JobProgress;
  scene: MotionSceneSnapshotV1;
  selection: SceneSelection;
  frame: number;
  busy: boolean;
  viewState: WorkspaceViewState;
  onFrame: (frame: number) => void;
  onSelect: (selection: SceneSelection) => void;
  onApply: (
    operations: SceneOperationBatchV1["operations"],
    eventText: string,
  ) => Promise<void>;
}>;

export function SceneInspector(props: Props) {
  const { scene, selection, frame, onFrame, onSelect, viewState } = props;
  const t = useTranslations("MotionWorkspace");
  const [tab, setTab] = useState<"timeline" | "properties">("timeline");
  const selectTab = (
    next: "timeline" | "properties",
    target?: EventTarget | null,
  ): void => {
    setTab(next);
    const button = (
      target as HTMLElement | null
    )?.parentElement?.querySelector<HTMLButtonElement>(`#motion-${next}-tab`);
    button?.focus();
  };

  return (
    <section
      className="scene-inspector"
      aria-label={t("inspectorTitle")}
      aria-busy={viewState === "loading" || viewState === "running"}
      data-state={viewState}
    >
      <div className="scene-inspector-tabs" role="tablist">
        <button
          id="motion-timeline-tab"
          type="button"
          role="tab"
          aria-selected={tab === "timeline"}
          aria-controls="motion-timeline-panel"
          tabIndex={tab === "timeline" ? 0 : -1}
          onClick={() => selectTab("timeline")}
          onKeyDown={(event) => {
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              selectTab("properties", event.currentTarget);
            }
          }}
        >
          {t("timeline")}
        </button>
        <button
          id="motion-properties-tab"
          type="button"
          role="tab"
          aria-selected={tab === "properties"}
          aria-controls="motion-properties-panel"
          tabIndex={tab === "properties" ? 0 : -1}
          onClick={() => selectTab("properties")}
          onKeyDown={(event) => {
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              selectTab("timeline", event.currentTarget);
            }
          }}
        >
          {t("properties")}
        </button>
      </div>
      <div className="scene-inspector-body">
        {tab === "timeline" ? (
          <div
            id="motion-timeline-panel"
            className="scene-timeline"
            role="tabpanel"
            aria-labelledby="motion-timeline-tab"
          >
            {scene.scene.beats.map((beat, beatIndex) => (
              <section key={beat.beatId}>
                <button
                  type="button"
                  className="scene-beat"
                  aria-pressed={
                    beat.startFrame <= frame && frame <= beat.endFrame
                  }
                  onClick={() => {
                    onFrame(beat.startFrame);
                    onSelect({ beatIndex, elementIndex: 0 });
                  }}
                >
                  <span>{beat.beatId}</span>
                  <span>
                    {beat.startFrame}–{beat.endFrame}
                  </span>
                </button>
                <div className="scene-layer-list">
                  {beat.elements.map((item, elementIndex) => (
                    <button
                      type="button"
                      key={item.elementId}
                      aria-pressed={
                        selection.beatIndex === beatIndex &&
                        selection.elementIndex === elementIndex
                      }
                      onClick={() => {
                        onFrame(Math.max(frame, beat.startFrame));
                        onSelect({ beatIndex, elementIndex });
                        selectTab("properties");
                      }}
                    >
                      <span>{item.elementId}</span>
                      <small>{item.kind}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <ScenePropertiesPanel
            id="motion-properties-panel"
            ariaLabelledBy="motion-properties-tab"
            key={`${scene.version}-${selection.beatIndex}-${selection.elementIndex}`}
            {...props}
          />
        )}
      </div>
    </section>
  );
}
