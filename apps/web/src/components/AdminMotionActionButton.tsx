"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";

export type AdminActionI18n =
  | "jobCancel"
  | "jobRetry"
  | "jobForceTerminate"
  | "quarantineRelease"
  | "quarantineReject"
  | "workerOffline"
  | "export";

type Props = {
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly tenantId?: string;
  readonly reason?: string;
  readonly landmark?: string;
  readonly disabled?: boolean;
  readonly buttonClassName?: string;
  readonly refresh?: boolean;
  readonly i18n?: AdminActionI18n;
  readonly label?: string;
  readonly busyLabel?: string;
  readonly successMessage?: string;
  readonly failureMessage?: string;
};

export function AdminMotionActionButton({
  path,
  body,
  headers,
  tenantId,
  reason,
  landmark = "motion-admin-action",
  disabled = false,
  buttonClassName = "button",
  refresh = true,
  i18n,
  label,
  busyLabel,
  successMessage,
  failureMessage,
}: Props) {
  const t = useTranslations("AdminButtons");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const copy = (key: string, values?: Readonly<Record<string, string>>) =>
    t(
      `${i18n}.${key}` as Parameters<typeof t>[0],
      values as Parameters<typeof t>[1],
    );

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
          ...headers,
        },
        body: JSON.stringify({
          ...(reason ? { reason } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...body,
        }),
      });
      const responseBody: unknown = await response.json().catch((error) => {
        if (error instanceof Error) return null;
        throw error;
      });
      if (!response.ok) {
        const code = errorCode(responseBody) || `HTTP_${response.status}`;
        setStatus(
          i18n ? copy("failed", { code }) : `${failureMessage}: ${code}`,
        );
        return;
      }
      if (i18n === "export") {
        const result =
          responseBody && typeof responseBody === "object" ? responseBody : {};
        setStatus(
          copy("created", {
            id: String(Reflect.get(result, "exportId")),
            state: String(Reflect.get(result, "state")).toLowerCase(),
          }),
        );
      } else {
        setStatus(i18n ? copy("requested") : (successMessage ?? ""));
      }
      if (refresh) router.refresh();
    } catch (error) {
      if (error instanceof Error)
        setStatus(i18n ? copy("connectionInterrupted") : (failureMessage ?? ""));
      else throw error;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-action" data-landmark={landmark}>
      <button
        className={buttonClassName}
        type="button"
        disabled={busy || disabled}
        onClick={() => void run()}
      >
        {busy
          ? i18n
            ? copy("busy")
            : busyLabel
          : i18n
            ? copy("action")
            : label}
      </button>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
