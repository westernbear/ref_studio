type SignInPath = "/admin/sign-in" | "/sign-in";

const DEFAULT_INTERNAL_API_URL = "http://127.0.0.1:3200";

const expectedOrigin = (): string =>
  process.env.RVS_EXPECTED_ORIGIN || "http://localhost:3100";

const originFailure = (): Response =>
  Response.json(
    {
      error: {
        code: "CSRF_ORIGIN_INVALID",
        message: "The request could not be completed.",
      },
    },
    { status: 403 },
  );

const hasTrustedOrigin = (request: Request): boolean =>
  request.headers.get("origin") === expectedOrigin();

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
  const origin = expectedOrigin();
  if (!hasTrustedOrigin(request)) return originFailure();
  const response = await fetch(internalApiUrl(path), {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      origin,
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
  if (!hasTrustedOrigin(request)) return originFailure();
  const headers = new Headers({
    origin: expectedOrigin(),
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
  if (!["GET", "HEAD"].includes(request.method) && !hasTrustedOrigin(request))
    return originFailure();
  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-range",
    "cookie",
    "idempotency-key",
    "if-match",
    "range",
    "x-chunk-sha256",
    "x-correlation-id",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("origin", expectedOrigin());
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
  const cookie = forwardedSetCookie(response.headers.get("set-cookie"));
  const receivedBytes = response.headers.get("x-received-bytes");
  for (const name of [
    "accept-ranges",
    "content-disposition",
    "content-length",
    "content-range",
    "content-type",
  ]) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
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

export async function proxyAdmin(
  request: Request,
  path: readonly string[],
): Promise<Response> {
  const target = path.join("/");
  if (
    request.method !== "POST" ||
    !["audit-exports", "receipt-exports"].includes(target)
  )
    return Response.json(
      { error: { code: "RESOURCE_NOT_FOUND", message: "Not found." } },
      { status: 404 },
    );
  if (!hasTrustedOrigin(request)) return originFailure();
  const headers = new Headers({
    "content-type": request.headers.get("content-type") ?? "application/json",
    origin: expectedOrigin(),
    "x-csrf-token": "web-proxy",
  });
  for (const name of ["cookie", "idempotency-key", "x-correlation-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await fetch(internalApiUrl(`/admin/${target}`), {
    method: "POST",
    headers,
    body: await request.arrayBuffer(),
    redirect: "manual",
  });
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}
