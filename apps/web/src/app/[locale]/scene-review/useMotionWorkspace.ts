"use client";

import type {
  MotionDeliverablesV1,
  MotionSceneSnapshotV1,
  SceneOperationBatchV1,
} from "@rvs/contracts/motion";
import { useEffect, useState } from "react";
import {
  isTerminalJobState,
  parseJobProgress,
  type JobProgress,
} from "../../../lib/job-progress";
import {
  getMotionDeliverables,
  getMotionScene,
  MotionWorkspaceApiError,
  patchMotionScene,
  refineMotionScene,
  renderMotionScene,
  rollbackMotionScene,
} from "./motion-workspace-api";

export type WorkspaceMessage =
  | Readonly<{ id: string; role: "assistant"; text: string }>
  | Readonly<{ id: string; role: "user"; text: string }>
  | Readonly<{ id: string; role: "operation"; text: string }>
  | Readonly<{ id: string; role: "error"; text: string }>;

type Props = Readonly<{
  initialJob: JobProgress;
  initialScene: MotionSceneSnapshotV1;
  initialDeliverables: MotionDeliverablesV1;
  locale: string;
  initializedMessage: string;
}>;

const message = (
  role: WorkspaceMessage["role"],
  text: string,
): WorkspaceMessage => ({ id: crypto.randomUUID(), role, text });

const queued = (job: JobProgress): JobProgress => ({
  ...job,
  state: "QUEUED",
  progressPhase: "prepare",
  progressStage: "scene-patch",
  progressFraction: 0,
  framesProcessed: null,
  framesTotal: null,
});

export function useMotionWorkspace({
  initialJob,
  initialScene,
  initialDeliverables,
  locale,
  initializedMessage,
}: Props) {
  const [job, setJob] = useState(initialJob);
  const [scene, setScene] = useState(initialScene);
  const [deliverables, setDeliverables] = useState(initialDeliverables);
  const [messages, setMessages] = useState<readonly WorkspaceMessage[]>([
    {
      id: "workspace-initialized",
      role: "assistant",
      text: initializedMessage,
    },
  ]);
  const [undoStack, setUndoStack] = useState<readonly number[]>([]);
  const [busy, setBusy] = useState(false);

  const add = (next: WorkspaceMessage): void =>
    setMessages((current) => [...current, next]);

  const fail = (error: unknown): void => {
    const code =
      error instanceof MotionWorkspaceApiError
        ? error.code
        : "NETWORK_INTERRUPTED";
    add(message("error", code));
  };

  useEffect(() => {
    if (isTerminalJobState(job.state)) return undefined;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/v1/jobs/${encodeURIComponent(initialJob.id)}`,
          { credentials: "include", cache: "no-store" },
        );
        if (!response.ok) {
          if (active) add(message("error", `HTTP_${response.status}`));
          return;
        }
        const body: unknown = await response.json().catch(() => null);
        const parsed = parseJobProgress(body);
        if (!active || !parsed) return;
        setJob(parsed);
        if (isTerminalJobState(parsed.state)) {
          const [nextScene, nextDeliverables] = await Promise.all([
            getMotionScene(initialJob.id),
            getMotionDeliverables(initialJob.id),
          ]);
          if (active) {
            setScene(nextScene);
            setDeliverables(nextDeliverables);
          }
        }
      } catch {
        if (active) add(message("error", "NETWORK_INTERRUPTED"));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [initialJob.id, job.state]);

  const applyOperations = async (
    operations: SceneOperationBatchV1["operations"],
    eventText: string,
  ): Promise<void> => {
    if (busy || operations.length === 0) return;
    setBusy(true);
    try {
      const previousVersion = scene.version;
      const next = await patchMotionScene(initialJob.id, scene, operations);
      setUndoStack((current) => [...current, previousVersion]);
      setScene(next);
      setJob((current) => queued(current));
      add(message("operation", eventText));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const refine = async (prompt: string): Promise<void> => {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    add(message("user", trimmed));
    setBusy(true);
    try {
      const previousVersion = scene.version;
      const result = await refineMotionScene(
        initialJob.id,
        scene,
        trimmed,
        locale,
      );
      const next = await getMotionScene(initialJob.id);
      setUndoStack((current) => [...current, previousVersion]);
      setScene(next);
      setJob((current) => queued(current));
      const beats = result.changedBeatIds.join(", ");
      add(
        message(
          "assistant",
          beats ? `${result.summary} (${beats})` : result.summary,
        ),
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (
    version: number,
    eventText: string,
  ): Promise<void> => {
    if (busy || version === scene.version) return;
    setBusy(true);
    try {
      const previousVersion = scene.version;
      const next = await rollbackMotionScene(initialJob.id, scene, version);
      setUndoStack((current) => [...current, previousVersion]);
      setScene(next);
      setJob((current) => queued(current));
      add(message("operation", eventText));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (eventText: string): Promise<void> => {
    const target = undoStack.at(-1);
    if (target === undefined || busy) return;
    setBusy(true);
    try {
      const next = await rollbackMotionScene(initialJob.id, scene, target);
      setUndoStack((current) => current.slice(0, -1));
      setScene(next);
      setJob((current) => queued(current));
      add(message("operation", eventText));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const render = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await renderMotionScene(initialJob.id, scene);
      setJob((current) => queued(current));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  return {
    job,
    scene,
    deliverables,
    messages,
    busy,
    canUndo: undoStack.length > 0,
    applyOperations,
    refine,
    rollback,
    undo,
    render,
  } as const;
}
