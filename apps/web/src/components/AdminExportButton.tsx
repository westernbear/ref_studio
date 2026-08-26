"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";

type Props = {
  readonly kind: "audit" | "receipt";
  readonly tenantId?: string | undefined;
};

export function AdminExportButton({ kind, tenantId }: Props) {
  const t = useTranslations("AdminButtons.export");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const createExport = async () => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(`/api/admin/${kind}-exports`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestId(),
          "x-correlation-id": `cor_${requestId()}`,
        },
        body: JSON.stringify({
          format: "jsonl",
          reason: `${kind} export requested from the admin console`,
          ...(tenantId ? { tenantId } : {}),
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus(
          t("failed", { code: errorCode(body) || `HTTP_${response.status}` }),
        );
        return;
      }
      const result = body && typeof body === "object" ? body : {};
      setStatus(
        t("created", {
          id: String(Reflect.get(result, "exportId")),
          state: String(Reflect.get(result, "state")).toLowerCase(),
        }),
      );
    } catch {
      setStatus(t("connectionInterrupted"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-action" data-landmark="export-action">
      <button
        className="button button-primary"
        type="button"
        disabled={busy}
        onClick={() => void createExport()}
      >
        {busy ? t("busy") : t("action")}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
