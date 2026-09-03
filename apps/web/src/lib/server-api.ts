import { headers } from "next/headers";
import { internalApiUrl } from "../app/api/auth-proxy";
import { field, text } from "./api-values";

export type ApiResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly code: string };

export { field, numberValue, text } from "./api-values";
export const when = (value: unknown): string => {
  const raw = text(value, "");
  return raw.includes("T") ? raw.replace("T", " ").slice(0, 16) : text(value);
};
export const items = (body: unknown): readonly unknown[] => {
  const rows = field(body, "items");
  return Array.isArray(rows) ? rows : [];
};
export const isAuthProblem = (code: string): boolean =>
  ["AUTHENTICATION_REQUIRED", "CSRF_REQUIRED", "CSRF_ORIGIN_INVALID"].includes(
    code,
  );

export async function liveApiGet(path: string): Promise<ApiResult> {
  const incoming = await headers();
  const requestHeaders = new Headers();
  const cookie = incoming.get("cookie");
  if (cookie) requestHeaders.set("cookie", cookie);
  requestHeaders.set(
    "origin",
    process.env.RVS_EXPECTED_ORIGIN || "http://localhost:3100",
  );
  requestHeaders.set("x-csrf-token", "web-proxy");
  try {
    const response = await fetch(internalApiUrl(path), {
      cache: "no-store",
      headers: requestHeaders,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      return {
        ok: false,
        code: text(
          field(field(body, "error"), "code"),
          `HTTP_${response.status}`,
        ),
      };
    return { ok: true, body };
  } catch {
    return { ok: false, code: "NETWORK_INTERRUPTED" };
  }
}
