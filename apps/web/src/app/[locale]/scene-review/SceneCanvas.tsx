"use client";

import type { MotionSceneSnapshotV1 } from "@rvs/contracts/motion";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  elementFrameState,
  type SceneSelection,
  type WorkspaceViewState,
} from "./motion-workspace-model";
import { resolveSceneInteraction } from "./scene-interactions";

type Props = Readonly<{
  scene: MotionSceneSnapshotV1;
  selection: SceneSelection;
  frame: number;
  videoUrl: string | null;
  busy: boolean;
  viewState: WorkspaceViewState;
  onFrame: (frame: number) => void;
  onSelect: (selection: SceneSelection) => void;
  onMove: (deltaX: number, deltaY: number) => Promise<void>;
}>;

type Drag = Readonly<{
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}>;

export function SceneCanvas({
  scene,
  selection,
  frame,
  videoUrl,
  busy,
  viewState,
  onFrame,
  onSelect,
  onMove,
}: Props) {
  const t = useTranslations("MotionWorkspace");
  const surface = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const activeBeatIndex = useMemo(() => {
    const index = scene.scene.beats.findIndex(
      (beat) => beat.startFrame <= frame && frame <= beat.endFrame,
    );
    return index >= 0 ? index : selection.beatIndex;
  }, [frame, scene.scene.beats, selection.beatIndex]);
  const activeBeat = scene.scene.beats[activeBeatIndex];

  useEffect(() => {
    if (!video.current) return;
    const seconds = frame / scene.scene.canvas.fps;
    if (Math.abs(video.current.currentTime - seconds) > 0.02)
      video.current.currentTime = seconds;
  }, [frame, scene.scene.canvas.fps]);

  const finishDrag = async (
    currentX: number,
    currentY: number,
  ): Promise<void> => {
    if (!drag || !surface.current) return;
    const bounds = surface.current.getBoundingClientRect();
    const deltaX =
      ((currentX - drag.startX) / bounds.width) * scene.scene.canvas.width;
    const deltaY =
      ((currentY - drag.startY) / bounds.height) * scene.scene.canvas.height;
    setDrag(null);
    if (Math.abs(deltaX) + Math.abs(deltaY) >= 0.5)
      await onMove(Math.round(deltaX), Math.round(deltaY));
  };

  return (
    <section
      className="scene-canvas"
      aria-labelledby="scene-canvas-title"
      aria-busy={viewState === "loading" || viewState === "running"}
      data-state={viewState}
    >
      <header className="scene-canvas-toolbar">
        <h2 id="scene-canvas-title">{t("canvasTitle")}</h2>
        <div role="group" aria-label={t("zoomControls")}>
          <button
            type="button"
            disabled={zoom <= 0.75}
            onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}
            aria-label={t("zoomOut")}
          >
            −
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            {t("fit")}
          </button>
          <button
            type="button"
            disabled={zoom >= 1.5}
            onClick={() => setZoom((value) => Math.min(1.5, value + 0.25))}
            aria-label={t("zoomIn")}
          >
            +
          </button>
        </div>
      </header>
      <div className="scene-canvas-stage">
        {viewState === "empty" || viewState === "unsupported" ? (
          <p className="scene-canvas-placeholder">
            {t(`states.${viewState}.detail`)}
          </p>
        ) : null}
        <div
          className="scene-canvas-surface"
          ref={surface}
          style={{
            aspectRatio: `${scene.scene.canvas.width} / ${scene.scene.canvas.height}`,
            transform: `scale(${zoom})`,
          }}
        >
          {videoUrl ? (
            <video
              ref={video}
              src={videoUrl}
              preload="metadata"
              muted
              playsInline
              aria-label={t("renderedScene")}
            />
          ) : null}
          <div className="scene-canvas-grid" aria-hidden="true" />
          {activeBeat?.elements.map((element, elementIndex) => {
            const state = elementFrameState(element, frame);
            const selected =
              activeBeatIndex === selection.beatIndex &&
              elementIndex === selection.elementIndex;
            const offsetX = selected && drag ? drag.currentX - drag.startX : 0;
            const offsetY = selected && drag ? drag.currentY - drag.startY : 0;
            const left =
              ((element.box.x + state.x) / scene.scene.canvas.width) * 100;
            const top =
              ((element.box.y + state.y) / scene.scene.canvas.height) * 100;
            const target = { beatIndex: activeBeatIndex, elementIndex };
            const applyInteraction = (value: unknown): void => {
              const action = resolveSceneInteraction(value);
              if (!action) return;
              onSelect(action.target);
              if (action.kind === "move") void onMove(action.x, action.y);
            };
            return (
              <button
                type="button"
                key={element.elementId}
                className="scene-canvas-element"
                data-kind={element.kind}
                aria-pressed={selected}
                aria-label={t("selectElement", { id: element.elementId })}
                disabled={busy}
                style={{
                  insetInlineStart: `${left}%`,
                  insetBlockStart: `${top}%`,
                  inlineSize: `${(element.box.width / scene.scene.canvas.width) * 100}%`,
                  blockSize: `${(element.box.height / scene.scene.canvas.height) * 100}%`,
                  opacity: state.opacity,
                  transform: `translate(${offsetX}px, ${offsetY}px) scale(${state.scale})`,
                }}
                onClick={() => applyInteraction({ kind: "pointer", target })}
                onFocus={() => applyInteraction({ kind: "focus", target })}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  applyInteraction({ kind: "pointer", target });
                  setDrag({
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    currentX: event.clientX,
                    currentY: event.clientY,
                  });
                }}
                onPointerMove={(event) =>
                  setDrag((current) =>
                    current?.pointerId === event.pointerId
                      ? {
                          ...current,
                          currentX: event.clientX,
                          currentY: event.clientY,
                        }
                      : current,
                  )
                }
                onPointerUp={(event) =>
                  void finishDrag(event.clientX, event.clientY)
                }
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(event) => {
                  const action = resolveSceneInteraction({
                    kind: "keyboard",
                    target,
                    key: event.key,
                    shiftKey: event.shiftKey,
                  });
                  if (action?.kind === "move") {
                    event.preventDefault();
                    onSelect(action.target);
                    void onMove(action.x, action.y);
                  }
                }}
              >
                <span>{element.content || element.elementId}</span>
              </button>
            );
          })}
          <span className="scene-canvas-id">
            {t("sceneFrame", { version: scene.version, frame })}
          </span>
        </div>
      </div>
      <label className="scene-scrubber">
        <span>{t("frame", { frame })}</span>
        <input
          type="range"
          min={0}
          max={scene.scene.canvas.frameCount - 1}
          value={frame}
          onChange={(event) => onFrame(Number(event.target.value))}
        />
      </label>
    </section>
  );
}
