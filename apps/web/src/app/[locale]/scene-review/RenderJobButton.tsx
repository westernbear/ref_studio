"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorCode } from "../../../lib/api-error";
import { useRouter } from "../../../i18n/navigation";

export function RenderJobButton({
  jobId,
  etag,
}: {
  readonly jobId: string;
  readonly etag: string;
}) {
  const t = useTranslations("RenderJobButton");
  const router = useRouter();
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
          code === "APPROVAL_REQUIRED" ? t("stillVerifying") : t("jobChanged"),
        );
        return;
      }
      router.refresh();
    } catch {
      setError(t("connectionInterrupted"));
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
        {submitting ? t("queuing") : t("queueFinalRender")}
      </button>
      <p className="review-action-status" aria-live="polite">
        {error}
      </p>
    </div>
  );
}
