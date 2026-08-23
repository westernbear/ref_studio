type SignInPath = "/admin/sign-in" | "/sign-in";

const DEFAULT_INTERNAL_API_URL = "http://127.0.0.1:3200";

export function internalApiUrl(path: string, search = ""): string {
  return new URL(
    `${path}${search}`,
    process.env.RVS_INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      DEFAULT_INTERNAL_API_URL,
  ).toString();
}

export function forwardedSetCookie(cookie: string | null): string | null {
  if (!cookie) return null;
  if (process.env.RVS_INSECURE_COOKIES !== "true") return cookie;
  return cookie.replace(/;\s*Secure\b/iu, "");
}

export async function proxySignIn(
  request: Request,
  path: SignInPath,
): Promise<Response> {
  const response = await fetch(internalApiUrl(path), {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
    body: await request.text(),
    redirect: "manual",
  });
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const cookie = forwardedSetCookie(response.headers.get("set-cookie"));
  if (contentType) headers.set("content-type", contentType);
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(await response.text(), {
    status: response.status,
    headers,
  });
}

export async function proxyLogout(request: Request): Promise<Response> {
  const headers = new Headers({
    origin: process.env.RVS_EXPECTED_ORIGIN || "http://localhost:3100",
    "x-csrf-token": "web-proxy",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(internalApiUrl("/logout"), {
    method: "POST",
    headers,
    redirect: "manual",
  });
  const responseHeaders = new Headers();
  const setCookie = forwardedSetCookie(response.headers.get("set-cookie"));
  if (setCookie) responseHeaders.set("set-cookie", setCookie);
  return new Response(await response.text(), {
    status: response.status,
    headers: responseHeaders,
  });
}

const requestBody = async (
  request: Request,
): Promise<ArrayBuffer | undefined> =>
  request.method === "GET" || request.method === "HEAD"
    ? undefined
    : request.arrayBuffer();

export async function proxyV1(
  request: Request,
  path: readonly string[],
): Promise<Response> {
  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-range",
    "cookie",
    "idempotency-key",
    "if-match",
    "x-chunk-sha256",
    "x-correlation-id",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set(
    "origin",
    process.env.RVS_EXPECTED_ORIGIN || "http://localhost:3100",
  );
  headers.set("x-csrf-token", "web-proxy");

  const body = await requestBody(request);
  const response = await fetch(
    internalApiUrl(
      `/v1/${path.map(encodeURIComponent).join("/")}`,
      new URL(request.url).search,
    ),
    body
      ? {
          method: request.method,
          headers,
          body,
          redirect: "manual",
        }
      : {
          method: request.method,
          headers,
          redirect: "manual",
        },
  );
  const responseHeaders = new Headers();
  const contentType = response.headers.get("content-type");
  const cookie = forwardedSetCookie(response.headers.get("set-cookie"));
  const receivedBytes = response.headers.get("x-received-bytes");
  if (contentType) responseHeaders.set("content-type", contentType);
  if (cookie) responseHeaders.set("set-cookie", cookie);
  if (receivedBytes) responseHeaders.set("x-received-bytes", receivedBytes);
  const responseBody = [204, 205, 304].includes(response.status)
    ? null
    : await response.arrayBuffer();
  return new Response(responseBody, {
    status: response.status,
    headers: responseHeaders,
  });
}
