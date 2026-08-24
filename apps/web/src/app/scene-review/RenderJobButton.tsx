"use client";

import { useState } from "react";
import { errorCode } from "../../lib/api-error";

export function RenderJobButton({
  jobId,
  etag,
}: {
  readonly jobId: string;
  readonly etag: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const launch = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/jobs/${encodeURIComponent(jobId)}/render`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `render-${jobId}-${Date.now()}`,
            "if-match": etag,
          },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const code = errorCode(body);
        setError(
          code === "ROLE_NOT_PERMITTED"
            ? "An organization owner or admin must queue the final render."
            : code === "APPROVAL_REQUIRED"
              ? "T4 approval is required before the final render."
              : "This job changed or is not ready. Refresh and review it again.",
        );
        return;
      }
      window.location.assign(`/progress?jobId=${encodeURIComponent(jobId)}`);
    } catch {
      setError("The connection was interrupted. Retry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="review-actions">
      <button
        className="button button-primary"
        type="button"
        disabled={submitting}
        onClick={() => void launch()}
      >
        {submitting ? "Queuing render..." : "Queue Final Render"}
      </button>
      <p className="review-action-status" aria-live="polite">
        {error}
      </p>
    </div>
  );
}
