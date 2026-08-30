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
import {
  optimisticScene,
  queuedMotionJob,
  type WorkspaceMessage,
  workspaceMessage,
  workspaceViewState,
} from "./motion-workspace-model";
export type { WorkspaceMessage } from "./motion-workspace-model";

// allow: SIZE_OK — one transaction state machine must own optimistic rollback,
// ETag conflicts, immutable history, polling, and connection state atomically.

type Props = Readonly<{
  initialJob: JobProgress;
  initialScene: MotionSceneSnapshotV1;
  initialDeliverables: MotionDeliverablesV1;
  locale: string;
  initializedMessage: string;
}>;

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
  const [online, setOnline] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const add = (next: WorkspaceMessage): void =>
    setMessages((current) => [...current, next]);

  const fail = (error: unknown): void => {
    const code =
      error instanceof MotionWorkspaceApiError
        ? error.code
        : "NETWORK_INTERRUPTED";
    setErrorCode(code);
    add(workspaceMessage("error", code));
  };

  useEffect(() => {
    const update = (): void => setOnline(window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

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
          if (active) {
            setErrorCode(`HTTP_${response.status}`);
            add(workspaceMessage("error", `HTTP_${response.status}`));
          }
          return;
        }
        const body: unknown = await response.json().catch(() => null);
        const parsed = parseJobProgress(body);
        if (!active || !parsed) return;
        setErrorCode(null);
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
        if (active) {
          setErrorCode("NETWORK_INTERRUPTED");
          add(workspaceMessage("error", "NETWORK_INTERRUPTED"));
        }
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
    if (
      busy ||
      !online ||
      errorCode === "VERSION_CONFLICT" ||
      operations.length === 0
    )
      return;
    const previous = scene;
    const optimistic = optimisticScene(previous, operations);
    setBusy(true);
    setErrorCode(null);
    setScene(optimistic);
    try {
      const next = await patchMotionScene(initialJob.id, previous, operations);
      setUndoStack((current) => [...current, previous.version]);
      setScene(next);
      setJob((current) => queuedMotionJob(current));
      add(workspaceMessage("operation", eventText));
    } catch (error) {
      setScene(previous);
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const refine = async (prompt: string): Promise<void> => {
    const trimmed = prompt.trim();
    if (!trimmed || busy || !online || errorCode === "VERSION_CONFLICT") return;
    add(workspaceMessage("user", trimmed));
    setBusy(true);
    setErrorCode(null);
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
      setJob((current) => queuedMotionJob(current));
      const beats = result.changedBeatIds.join(", ");
      add(
        workspaceMessage(
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
    setErrorCode(null);
    try {
      const previousVersion = scene.version;
      const next = await rollbackMotionScene(initialJob.id, scene, version);
      setUndoStack((current) => [...current, previousVersion]);
      setScene(next);
      setJob((current) => queuedMotionJob(current));
      add(workspaceMessage("operation", eventText));
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
    setErrorCode(null);
    try {
      const next = await rollbackMotionScene(initialJob.id, scene, target);
      setUndoStack((current) => current.slice(0, -1));
      setScene(next);
      setJob((current) => queuedMotionJob(current));
      add(workspaceMessage("operation", eventText));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const render = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setErrorCode(null);
    try {
      await renderMotionScene(initialJob.id, scene);
      setJob((current) => queuedMotionJob(current));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const [nextScene, nextDeliverables] = await Promise.all([
        getMotionScene(initialJob.id),
        getMotionDeliverables(initialJob.id),
      ]);
      setScene(nextScene);
      setDeliverables(nextDeliverables);
      setErrorCode(null);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const viewState = workspaceViewState({
    state: job.state,
    progressFraction: job.progressFraction,
    busy,
    online,
    errorCode,
    scene,
    deliverableCount: deliverables.items.length,
  });

  return {
    job,
    scene,
    deliverables,
    messages,
    busy,
    viewState,
    errorCode,
    canUndo: undoStack.length > 0,
    applyOperations,
    refine,
    rollback,
    undo,
    render,
    refresh,
  } as const;
}
