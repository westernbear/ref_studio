"use client";

import type {
  MotionSceneSnapshotV1,
  SceneOperationBatchV1,
} from "@rvs/contracts/motion";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { isJobWorking, type JobProgress } from "../../../lib/job-progress";
import {
  isKeyframeV2,
  scenePropertySupported,
  selectedElement,
  type SceneProperty,
  type SceneSelection,
} from "./motion-workspace-model";

type Props = Readonly<{
  id: string;
  ariaLabelledBy: string;
  job: JobProgress;
  scene: MotionSceneSnapshotV1;
  selection: SceneSelection;
  busy: boolean;
  onApply: (
    operations: SceneOperationBatchV1["operations"],
    eventText: string,
  ) => Promise<void>;
}>;

const numberFrom = (data: FormData, name: string, fallback: number): number => {
  const value = Number(data.get(name));
  return Number.isFinite(value) ? value : fallback;
};

export function ScenePropertiesPanel({
  id,
  ariaLabelledBy,
  job,
  scene,
  selection,
  busy,
  onApply,
}: Props) {
  const t = useTranslations("MotionWorkspace");
  const [keyframeIndex, setKeyframeIndex] = useState(0);
  const element = selectedElement(scene, selection);
  const keyframe = element?.keyframes[keyframeIndex];
  const disabled = busy || isJobWorking(job.state) || !element;
  const supports = (capability: string): boolean =>
    scene.backendCapability.capabilities.includes(capability);
  const supportsProperty = (property: SceneProperty): boolean =>
    scenePropertySupported(scene.backendCapability.capabilities, property);
  const unsupportedTitle = (property: SceneProperty): string | undefined =>
    supportsProperty(property) ? undefined : t("unsupportedProperty");

  const apply = async (data: FormData): Promise<void> => {
    if (!element) return;
    const base = `/beats/${selection.beatIndex}/elements/${selection.elementIndex}`;
    const fields = [
      ["box-x", `${base}/box/x`, numberFrom(data, "box-x", element.box.x), "x"],
      ["box-y", `${base}/box/y`, numberFrom(data, "box-y", element.box.y), "y"],
    ] as const;
    const operations: SceneOperationBatchV1["operations"][number][] = fields
      .filter((field) => supports(field[3]))
      .map(([name, path, value]) => ({
        kind: "set",
        opId: `${name}-v${scene.version}`,
        path,
        value,
        reason: "properties panel edit",
      }));
    if (keyframe) {
      const keyframeBase = `${base}/keyframes/${keyframeIndex}`;
      const scale = isKeyframeV2(keyframe)
        ? (keyframe.scaleX ?? 1)
        : (keyframe.scale ?? 1);
      if (supportsProperty("scale"))
        operations.push({
          kind: "set",
          opId: `scale-v${scene.version}`,
          path: `${keyframeBase}/${isKeyframeV2(keyframe) ? "scaleX" : "scale"}`,
          value: numberFrom(data, "scale", scale),
          reason: "properties panel edit",
        });
      if (supportsProperty("opacity"))
        operations.push({
          kind: "set",
          opId: `opacity-v${scene.version}`,
          path: `${keyframeBase}/opacity`,
          value: numberFrom(data, "opacity", keyframe.opacity ?? 1),
          reason: "properties panel edit",
        });
      if (supportsProperty("x"))
        operations.push({
          kind: "set",
          opId: `keyframe-x-v${scene.version}`,
          path: `${keyframeBase}/x`,
          value: numberFrom(data, "keyframe-x", keyframe.x ?? 0),
          reason: "properties panel edit",
        });
      if (supportsProperty("y"))
        operations.push({
          kind: "set",
          opId: `keyframe-y-v${scene.version}`,
          path: `${keyframeBase}/y`,
          value: numberFrom(data, "keyframe-y", keyframe.y ?? 0),
          reason: "properties panel edit",
        });
      if (supportsProperty("easing"))
        operations.push({
          kind: "set",
          opId: `ease-v${scene.version}`,
          path: `${keyframeBase}/ease`,
          value: String(data.get("ease") ?? keyframe.ease),
          reason: "properties panel edit",
        });
      if (isKeyframeV2(keyframe) && supports("per-axis-scale"))
        operations.push({
          kind: "set",
          opId: `scale-y-v${scene.version}`,
          path: `${keyframeBase}/scaleY`,
          value: numberFrom(data, "scale", scale),
          reason: "properties panel edit",
        });
    }
    if (element.kind === "text" && supportsProperty("content"))
      operations.push({
        kind: "set",
        opId: `content-v${scene.version}`,
        path: `${base}/content`,
        value: String(data.get("content") ?? element.content ?? ""),
        reason: "properties panel edit",
      });
    await onApply(operations, t("propertyEvent", { id: element.elementId }));
  };

  return (
    <form
      id={id}
      className="scene-properties"
      role="tabpanel"
      aria-labelledby={ariaLabelledBy}
      onSubmit={(event) => {
        event.preventDefault();
        void apply(new FormData(event.currentTarget));
      }}
    >
      <h3>{element?.elementId ?? t("noSelection")}</h3>
      {element?.kind === "text" ? (
        <label className="motion-field motion-field-wide">
          <span>{t("content")}</span>
          <input
            name="content"
            defaultValue={element.content ?? ""}
            disabled={!supportsProperty("content")}
            title={unsupportedTitle("content")}
          />
        </label>
      ) : null}
      {element ? (
        <>
          {(["x", "y", "width", "height"] as const).map((field) => (
            <label className="motion-field" key={field}>
              <span>{t(field)}</span>
              <input
                name={`box-${field}`}
                type="number"
                min={field === "width" || field === "height" ? 1 : undefined}
                defaultValue={element.box[field]}
                disabled={
                  field === "width" ||
                  field === "height" ||
                  !supportsProperty(field)
                }
                title={unsupportedTitle(field)}
              />
            </label>
          ))}
          <label className="motion-field motion-field-wide">
            <span>{t("keyframe")}</span>
            <select
              value={keyframeIndex}
              onChange={(event) => setKeyframeIndex(Number(event.target.value))}
            >
              {element.keyframes.map((item, index) => (
                <option key={item.frame} value={index}>
                  {t("frame", { frame: item.frame })}
                </option>
              ))}
            </select>
          </label>
          {keyframe ? (
            <>
              <label className="motion-field">
                <span>{t("scale")}</span>
                <input
                  name="scale"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={
                    isKeyframeV2(keyframe)
                      ? (keyframe.scaleX ?? 1)
                      : (keyframe.scale ?? 1)
                  }
                  disabled={!supportsProperty("scale")}
                  title={unsupportedTitle("scale")}
                />
              </label>
              <label className="motion-field">
                <span>{t("opacity")}</span>
                <input
                  name="opacity"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue={keyframe.opacity ?? 1}
                  disabled={!supportsProperty("opacity")}
                  title={unsupportedTitle("opacity")}
                />
              </label>
              <label className="motion-field">
                <span>{t("offsetX")}</span>
                <input
                  name="keyframe-x"
                  type="number"
                  defaultValue={keyframe.x ?? 0}
                  disabled={!supportsProperty("x")}
                  title={unsupportedTitle("x")}
                />
              </label>
              <label className="motion-field">
                <span>{t("offsetY")}</span>
                <input
                  name="keyframe-y"
                  type="number"
                  defaultValue={keyframe.y ?? 0}
                  disabled={!supportsProperty("y")}
                  title={unsupportedTitle("y")}
                />
              </label>
              <label className="motion-field motion-field-wide">
                <span>{t("easing")}</span>
                <select
                  name="ease"
                  defaultValue={keyframe.ease}
                  disabled={!supportsProperty("easing")}
                  title={unsupportedTitle("easing")}
                >
                  {["linear", "easeIn", "easeOut", "easeInOut"].map((ease) => (
                    <option key={ease}>{ease}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <button
            className="button button-primary motion-field-wide"
            type="submit"
            disabled={disabled}
          >
            {busy ? t("applying") : t("applyProperties")}
          </button>
        </>
      ) : null}
    </form>
  );
}
