"use client";

import { useState } from "react";
import { requestId } from "../lib/upload-client";

type Props = {
  readonly kind: "audit" | "receipt";
  readonly tenantId?: string | undefined;
};

const errorCode = (value: unknown): string => {
  if (!value || typeof value !== "object") return "";
  const error = Reflect.get(value, "error");
  if (!error || typeof error !== "object") return "";
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : "";
};

export function AdminExportButton({ kind, tenantId }: Props) {
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
          `Export failed: ${errorCode(body) || `HTTP_${response.status}`}.`,
        );
        return;
      }
      const result = body && typeof body === "object" ? body : {};
      setStatus(
        `Export ${String(Reflect.get(result, "exportId"))} is ${String(
          Reflect.get(result, "state"),
        ).toLowerCase()}.`,
      );
    } catch {
      setStatus("The connection was interrupted. Retry.");
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
        {busy ? "Creating export..." : "Create JSONL export"}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
