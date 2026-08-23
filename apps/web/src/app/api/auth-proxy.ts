type SignInPath = "/admin/sign-in" | "/sign-in";

const DEFAULT_INTERNAL_API_URL = "http://127.0.0.1:3200";

export function signInProxyUrl(path: SignInPath): string {
  return new URL(
    path,
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
  const response = await fetch(signInProxyUrl(path), {
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
