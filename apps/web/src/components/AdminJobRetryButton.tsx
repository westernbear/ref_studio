"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";

type Props = {
  readonly jobId: string;
  readonly etag: string;
};

export function AdminJobRetryButton({ jobId, etag }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const retry = async () => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/jobs/${encodeURIComponent(jobId)}/retry`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": requestId(),
            "x-correlation-id": `cor_${requestId()}`,
            "if-match": etag,
          },
          body: JSON.stringify({
            reason: "Job retried from the admin console",
          }),
        },
      );
      const body: unknown = await response.json().catch((error) => {
        if (error instanceof Error) return null;
        throw error;
      });
      if (!response.ok) {
        setStatus(
          `Retry failed: ${errorCode(body) || `HTTP_${response.status}`}.`,
        );
        return;
      }
      setStatus("Retry requested. Refreshing live state.");
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
    <div className="export-action" data-landmark="job-action">
      <button
        className="button"
        type="button"
        disabled={busy}
        onClick={() => void retry()}
      >
        {busy ? "Retrying..." : "Retry"}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
