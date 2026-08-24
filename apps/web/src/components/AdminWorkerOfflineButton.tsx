"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";

type Props = {
  readonly workerId: string;
  readonly disabled: boolean;
};

export function AdminWorkerOfflineButton({ workerId, disabled }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const markOffline = async () => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/workers/${encodeURIComponent(workerId)}/offline`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": requestId(),
            "x-correlation-id": `cor_${requestId()}`,
          },
          body: JSON.stringify({
            confirmItemId: workerId,
            reason: "Worker marked offline from the admin console",
          }),
        },
      );
      const body: unknown = await response.json().catch((error) => {
        if (error instanceof Error) return null;
        throw error;
      });
      if (!response.ok) {
        setStatus(
          `Worker update failed: ${errorCode(body) || `HTTP_${response.status}`}.`,
        );
        return;
      }
      setStatus("Worker marked offline. Refreshing live state.");
      router.refresh();
    } catch (error) {
      if (error instanceof Error)
        setStatus("The connection was interrupted. Retry.");
      else throw error;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-action" data-landmark="worker-action">
      <button
        className="button"
        type="button"
        disabled={busy || disabled}
        onClick={() => void markOffline()}
      >
        {busy ? "Marking offline..." : "Mark offline"}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
