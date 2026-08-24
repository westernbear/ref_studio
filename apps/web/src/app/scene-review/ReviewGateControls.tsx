"use client";

import { useState } from "react";
import { errorCode } from "../../lib/api-error";

type Decision = "APPROVED" | "REJECTED";

type Props = {
  readonly jobId: string;
  readonly attempt: number;
  readonly gate: "T1" | "T2" | "T3" | "T4" | "T5";
  readonly predecessorReceiptId: string | null;
  readonly evidenceDigest: string;
  readonly irDigest: string;
  readonly runtimeDigest: string;
  readonly releaseBaselineDigest: string;
  readonly artifactRefs: readonly string[];
};

export function ReviewGateControls(props: Props) {
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [error, setError] = useState("");

  const decide = async (decision: Decision) => {
    setSubmitting(decision);
    setError("");
    try {
      const response = await fetch("/api/v1/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: props.jobId,
          attempt: props.attempt,
          gate: props.gate,
          decision,
          predecessorReceiptId: props.predecessorReceiptId,
          evidenceDigest: props.evidenceDigest,
          irDigest: props.irDigest,
          runtimeDigest: props.runtimeDigest,
          releaseBaselineDigest: props.releaseBaselineDigest,
          reason: `${props.gate} ${decision.toLowerCase()} in scene review`,
          artifactRefs: props.artifactRefs,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = errorCode(body);
        setError(
          code === "ROLE_NOT_PERMITTED"
            ? "This account cannot review this job."
            : code === "STALE_APPROVAL_UNSAFE"
              ? "The evidence changed. Refresh before reviewing again."
              : `Review decision failed: ${code || `HTTP_${response.status}`}.`,
        );
        return;
      }
      window.location.reload();
    } catch {
      setError("The connection was interrupted. Retry.");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="review-actions" data-landmark="gate-action">
      <button
        className="button button-primary"
        type="button"
        disabled={submitting !== null}
        onClick={() => void decide("APPROVED")}
      >
        {submitting === "APPROVED" ? "Approving..." : `Approve ${props.gate}`}
      </button>
      <button
        className="button"
        type="button"
        disabled={submitting !== null}
        onClick={() => void decide("REJECTED")}
      >
        {submitting === "REJECTED" ? "Rejecting..." : `Reject ${props.gate}`}
      </button>
      <p className="review-action-status" aria-live="polite">
        {error}
      </p>
    </div>
  );
}
