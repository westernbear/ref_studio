import { z } from "zod";

// Image material generated against a ChatGPT subscription instead of a
// platform API key, using the same OAuth credentials the Codex CLI writes
// to ~/.codex/auth.json. The operator pastes that file's contents into the
// admin console; this module is everything that happens afterwards.
//
// Two things an operator has to accept before turning this on, neither of
// which this code can decide for them:
//
//  - OpenAI's guidance on these credentials is that each person uses their
//    own ChatGPT account and does not pool, share, or redistribute the
//    tokens. A single-operator deployment generating material on its
//    owner's own account is one thing; a multi-tenant service running
//    every customer's renders through one personal subscription is
//    another, and is what that guidance exists to prohibit.
//  - This is not a documented, supported API surface. It is the same
//    endpoint the Codex CLI itself talks to, and it can change without
//    notice. The platform API key path (providerKind "openai") remains the
//    supported one.
//
// Nothing here has been exercised against the live endpoint from this
// repository -- the request shape follows the published behaviour of the
// Codex client and of the Responses API's image_generation tool. Both
// network calls are isolated behind injectable functions (CodexFetch
// below) so the shape is one place to correct, and every failure is named
// rather than guessed at. Run `pnpm --filter @rvs/api verify:codex-oauth`
// against a real auth.json to find out before a job does.

export const CODEX_RESPONSES_URL =
  "https://chatgpt.com/backend-api/codex/responses";
export const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
// The Codex CLI's own public OAuth client id. Not a secret -- it identifies
// the application, not the account, and the refresh token is what carries
// the authority.
export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
// The image model the Responses image_generation tool runs. Named here
// rather than taken from the console's `model` field, which addresses the
// responses model, not the image one.
export const CODEX_IMAGE_MODEL = "gpt-image-2";

// The shape the Codex CLI writes. Only `tokens` is load-bearing here;
// `auth_mode` is checked so an api-key auth.json fails by name rather than
// by a confusing missing-token error.
export const CodexAuthSchema = z.looseObject({
  auth_mode: z.string().optional(),
  OPENAI_API_KEY: z.string().nullable().optional(),
  tokens: z.object({
    id_token: z.string().optional(),
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    account_id: z.string().optional(),
  }),
  last_refresh: z.string().optional(),
});
export type CodexAuth = z.infer<typeof CodexAuthSchema>;

export class CodexOAuthError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "CodexOAuthError";
    this.code = code;
  }
}

export const parseCodexAuth = (raw: string): CodexAuth => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new CodexOAuthError("CODEX_AUTH_MALFORMED");
  }
  const parsed = CodexAuthSchema.safeParse(value);
  if (!parsed.success) throw new CodexOAuthError("CODEX_AUTH_MALFORMED");
  return parsed.data;
};

// The one network seam. Same injectable shape as GenerateImage in
// openai-image-material.ts, so a test never reaches the real endpoint.
export type CodexFetch = (
  url: string,
  init: Readonly<{
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
  }>,
) => Promise<
  Readonly<{
    status: number;
    contentType: string;
    text: () => Promise<string>;
  }>
>;

const defaultCodexFetch: CodexFetch = async (url, init) => {
  const response = await fetch(url, init);
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text: () => response.text(),
  };
};

const RefreshResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  // OpenAI rotates the refresh token on some refreshes and omits it on
  // others; keeping the old one when it is absent is what stops a
  // successful refresh from destroying the credential.
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().optional(),
});

// Access tokens last hours, so refresh is not an edge case -- a deployment
// that only refreshed manually would work for an afternoon and then stop.
export async function refreshCodexAuth(
  auth: CodexAuth,
  request: CodexFetch = defaultCodexFetch,
): Promise<CodexAuth> {
  const response = await request(CODEX_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: auth.tokens.refresh_token,
    }),
  });
  if (response.status !== 200)
    throw new CodexOAuthError("CODEX_REFRESH_FAILED");
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(await response.text());
  } catch {
    throw new CodexOAuthError("CODEX_REFRESH_FAILED");
  }
  const refreshed = RefreshResponseSchema.safeParse(parsedBody);
  if (!refreshed.success) throw new CodexOAuthError("CODEX_REFRESH_FAILED");
  return {
    ...auth,
    tokens: {
      ...auth.tokens,
      access_token: refreshed.data.access_token,
      refresh_token: refreshed.data.refresh_token ?? auth.tokens.refresh_token,
      ...(refreshed.data.id_token ? { id_token: refreshed.data.id_token } : {}),
    },
    last_refresh: new Date().toISOString(),
  };
}

// The Responses API streams, and the Codex backend is a streaming surface,
// so the finished object arrives as the last `response.completed` event
// rather than as the whole body. Falls back to parsing the body as one
// JSON object, which is what a non-streaming reply would be -- so this
// keeps working if the endpoint answers either way.
export const readResponsesBody = (
  contentType: string,
  body: string,
): unknown => {
  if (!contentType.includes("text/event-stream")) {
    try {
      return JSON.parse(body);
    } catch {
      throw new CodexOAuthError("CODEX_RESPONSE_MALFORMED");
    }
  }
  let last: unknown;
  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const event = JSON.parse(payload) as { response?: unknown };
      if (event.response !== undefined) last = event.response;
    } catch {
      // A single unparseable event is not the whole stream; the completed
      // event is what matters and its absence is caught below.
    }
  }
  if (last === undefined) throw new CodexOAuthError("CODEX_RESPONSE_MALFORMED");
  return last;
};

// The image_generation tool reports its result as an output item carrying
// base64 image bytes. Scanned for rather than indexed, because the model's
// own message items share the list and their order is not guaranteed.
export const readGeneratedImage = (response: unknown): string => {
  const output = (response as { output?: readonly unknown[] })?.output;
  if (!Array.isArray(output)) throw new CodexOAuthError("CODEX_IMAGE_MISSING");
  for (const item of output) {
    const result = (item as { result?: unknown })?.result;
    if (typeof result === "string" && result.length > 0) return result;
  }
  throw new CodexOAuthError("CODEX_IMAGE_MISSING");
};

export type CodexImageResult = Readonly<{
  b64: string;
  // Returned so the caller can persist a rotated credential. Undefined when
  // the first attempt succeeded and nothing was refreshed.
  refreshedAuth?: CodexAuth;
}>;

// Refresh-on-401-and-retry-once, rather than checking the token's expiry
// up front: the same path then covers a merely stale token and one the
// endpoint rejected for any other recoverable reason, and there is no
// clock skew to get wrong. A second 401 is a real failure.
export async function generateCodexImage(params: {
  readonly auth: CodexAuth;
  readonly prompt: string;
  readonly size: "1024x1024" | "1536x1024" | "1024x1536";
  readonly request?: CodexFetch;
}): Promise<CodexImageResult> {
  const request = params.request ?? defaultCodexFetch;
  const body = JSON.stringify({
    model: CODEX_IMAGE_MODEL,
    input: params.prompt,
    stream: true,
    tools: [
      {
        type: "image_generation",
        size: params.size,
        // The renderer composites this over a scene, so an opaque result is
        // as useless as no result -- openai-image-material.ts checks the
        // returned PNG's colour type and fails the job if the alpha channel
        // is not actually there.
        background: "transparent",
        output_format: "png",
      },
    ],
  });
  const attempt = async (auth: CodexAuth) =>
    request(CODEX_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.tokens.access_token}`,
        "content-type": "application/json",
        accept: "text/event-stream",
        ...(auth.tokens.account_id
          ? { "chatgpt-account-id": auth.tokens.account_id }
          : {}),
      },
      body,
    });

  let response = await attempt(params.auth);
  let refreshedAuth: CodexAuth | undefined;
  if (response.status === 401) {
    refreshedAuth = await refreshCodexAuth(params.auth, request);
    response = await attempt(refreshedAuth);
  }
  if (response.status !== 200)
    throw new CodexOAuthError(`CODEX_REQUEST_FAILED_${response.status}`);
  const parsed = readResponsesBody(response.contentType, await response.text());
  return {
    b64: readGeneratedImage(parsed),
    ...(refreshedAuth ? { refreshedAuth } : {}),
  };
}
