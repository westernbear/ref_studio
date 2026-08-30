"use client";

import type {
  MotionDeliverablesV1,
  MotionSceneSnapshotV1,
  SceneOperationBatchV1,
} from "@rvs/contracts/motion";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { JobProgress } from "../../../lib/job-progress";
import { proxiedDownloadUrl } from "./motion-workspace-api";
import {
  moveElementOperations,
  selectedElement,
  type SceneSelection,
  type WorkspaceViewState,
} from "./motion-workspace-model";
import { SceneCanvas } from "./SceneCanvas";
import { SceneInspector } from "./SceneInspector";

type Props = Readonly<{
  job: JobProgress;
  scene: MotionSceneSnapshotV1;
  deliverables: MotionDeliverablesV1;
  busy: boolean;
  viewState: WorkspaceViewState;
  onApply: (
    operations: SceneOperationBatchV1["operations"],
    eventText: string,
  ) => Promise<void>;
}>;

export function MotionEditorPanel({
  job,
  scene,
  deliverables,
  busy,
  viewState,
  onApply,
}: Props) {
  const t = useTranslations("MotionWorkspace");
  const [selection, setSelection] = useState<SceneSelection>({
    beatIndex: 0,
    elementIndex: 0,
  });
  const [frame, setFrame] = useState(scene.scene.beats[0]?.startFrame ?? 0);
  const video = deliverables.items.find((item) => item.kind === "mp4");
  const interactionBlocked =
    busy ||
    ["offline", "conflict", "cancelled", "unsupported", "loading"].includes(
      viewState,
    );

  const move = async (deltaX: number, deltaY: number): Promise<void> => {
    const element = selectedElement(scene, selection);
    if (!element) return;
    await onApply(
      moveElementOperations(
        scene,
        selection.beatIndex,
        selection.elementIndex,
        deltaX,
        deltaY,
      ),
      t("moveEvent", { id: element.elementId, x: deltaX, y: deltaY }),
    );
  };

  return (
    <section
      className="motion-editor motion-workspace-pane"
      aria-label={t("editorTitle")}
      data-mobile-pane="editor"
    >
      <SceneCanvas
        scene={scene}
        selection={selection}
        frame={frame}
        videoUrl={video ? proxiedDownloadUrl(video.downloadUrl) : null}
        busy={interactionBlocked}
        viewState={viewState}
        onFrame={setFrame}
        onSelect={setSelection}
        onMove={move}
      />
      <SceneInspector
        job={job}
        scene={scene}
        selection={selection}
        frame={frame}
        busy={interactionBlocked}
        viewState={viewState}
        onFrame={setFrame}
        onSelect={setSelection}
        onApply={onApply}
      />
    </section>
  );
}
