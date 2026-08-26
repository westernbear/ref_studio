"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";

type Props = {
  readonly jobId: string;
  readonly etag: string;
};

export function AdminJobCancelButton({ jobId, etag }: Props) {
  const t = useTranslations("AdminButtons.jobCancel");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const cancel = async () => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/jobs/${encodeURIComponent(jobId)}/cancel`,
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
            reason: "Job cancelled from the admin console",
          }),
        },
      );
      const body: unknown = await response.json().catch((error) => {
        if (error instanceof Error) return null;
        throw error;
      });
      if (!response.ok) {
        setStatus(
          t("failed", { code: errorCode(body) || `HTTP_${response.status}` }),
        );
        return;
      }
      setStatus(t("requested"));
      router.refresh();
    } catch (error) {
      if (error instanceof Error) setStatus(t("connectionInterrupted"));
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
        onClick={() => void cancel()}
      >
        {busy ? t("busy") : t("action")}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
