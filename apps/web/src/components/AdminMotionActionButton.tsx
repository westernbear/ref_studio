"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";

type Props = {
  readonly path: string;
  readonly tenantId: string;
  readonly label: string;
  readonly busyLabel: string;
  readonly successMessage: string;
  readonly failureMessage: string;
  readonly reason: string;
};

export function AdminMotionActionButton({
  path,
  tenantId,
  label,
  busyLabel,
  successMessage,
  failureMessage,
  reason,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const run = async () => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(`/api/admin${path}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestId(),
          "x-correlation-id": `cor_${requestId()}`,
        },
        body: JSON.stringify({ reason, tenantId }),
      });
      const body: unknown = await response.json().catch((error) => {
        if (error instanceof Error) return null;
        throw error;
      });
      if (!response.ok) {
        setStatus(
          `${failureMessage}: ${errorCode(body) || `HTTP_${response.status}`}`,
        );
        return;
      }
      setStatus(successMessage);
      router.refresh();
    } catch (error) {
      if (error instanceof Error) setStatus(failureMessage);
      else throw error;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="export-action" data-landmark="motion-admin-action">
      <button
        className="button"
        type="button"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? busyLabel : label}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
