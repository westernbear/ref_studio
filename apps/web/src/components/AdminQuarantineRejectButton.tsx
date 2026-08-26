"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";

type Props = {
  readonly itemId: string;
  readonly tenantId: string;
  readonly version: string;
};

export function AdminQuarantineRejectButton({
  itemId,
  tenantId,
  version,
}: Props) {
  const t = useTranslations("AdminButtons.quarantineReject");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const reject = async () => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/quarantine/${encodeURIComponent(itemId)}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": requestId(),
            "x-correlation-id": `cor_${requestId()}`,
            "if-match": version,
          },
          body: JSON.stringify({
            reason: "Quarantine retained from the admin console",
            confirmTenantId: tenantId,
            confirmItemId: itemId,
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
    <div className="export-action" data-landmark="quarantine-action">
      <button
        className="button"
        type="button"
        disabled={busy}
        onClick={() => void reject()}
      >
        {busy ? t("busy") : t("action")}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
