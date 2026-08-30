const SECRET_KEY =
  /^(authorization|cookie|token|signature|secret|password|api[_-]?key|upload[_-]?auth|raw[_-]?query|prompt|query)$/i;
const SENSITIVE_FRAGMENT =
  /(Bearer\s+[A-Za-z0-9\-._~+/]+=*|-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----)/g;
const PATH_FRAGMENT =
  /(\/(?:Users|home|var|tmp|private|opt)\/[^\s"']+|[A-Za-z]:\\[^\s"']+)/g;
const AEP_FRAGMENT = /([^\s"'/\\]+\.aep)/gi;

export type RedactedValue =
  | string
  | number
  | boolean
  | null
  | readonly RedactedValue[]
  | { readonly [key: string]: RedactedValue };

const redactString = (value: string): string =>
  value
    .replace(SENSITIVE_FRAGMENT, "[redacted]")
    .replace(PATH_FRAGMENT, "[redacted-path]")
    .replace(AEP_FRAGMENT, "[redacted.aep]");

export const redactSensitive = (value: unknown): RedactedValue => {
  if (value === null || typeof value === "number" || typeof value === "boolean")
    return value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value))
    return value.map((entry) => redactSensitive(entry));
  if (typeof value === "object") {
    const out: Record<string, RedactedValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key)
        ? "[redacted]"
        : redactSensitive(entry);
    }
    return out;
  }
  return "[redacted]";
};
