"use client";

import type {
  MotionSceneSnapshotV1,
  SceneOperationBatchV1,
} from "@rvs/contracts/motion";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { JobProgress } from "../../../lib/job-progress";
import { ScenePropertiesPanel } from "./ScenePropertiesPanel";
import type { SceneSelection } from "./motion-workspace-model";

type Props = Readonly<{
  job: JobProgress;
  scene: MotionSceneSnapshotV1;
  selection: SceneSelection;
  frame: number;
  busy: boolean;
  onFrame: (frame: number) => void;
  onSelect: (selection: SceneSelection) => void;
  onApply: (
    operations: SceneOperationBatchV1["operations"],
    eventText: string,
  ) => Promise<void>;
}>;

export function SceneInspector(props: Props) {
  const { scene, selection, frame, onFrame, onSelect } = props;
  const t = useTranslations("MotionWorkspace");
  const [tab, setTab] = useState<"timeline" | "properties">("timeline");

  return (
    <section className="scene-inspector" aria-label={t("inspectorTitle")}>
      <div className="scene-inspector-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "timeline"}
          onClick={() => setTab("timeline")}
        >
          {t("timeline")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "properties"}
          onClick={() => setTab("properties")}
        >
          {t("properties")}
        </button>
      </div>
      <div className="scene-inspector-body">
        {tab === "timeline" ? (
          <div className="scene-timeline" role="tabpanel">
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
                        setTab("properties");
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
            key={`${scene.version}-${selection.beatIndex}-${selection.elementIndex}`}
            {...props}
          />
        )}
      </div>
    </section>
  );
}
