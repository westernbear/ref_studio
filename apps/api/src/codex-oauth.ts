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
// The model that carries the request. It is a *responses* model, not an
// image one: the top-level `model` names who is being asked, and the image
// model rides in the tool. Sending the image model here is refused --
// "The 'gpt-image-2' model is not supported when using Codex with a
// ChatGPT account" -- which is what the whole path failed with until this
// was measured against the live endpoint.
export const CODEX_RESPONSES_MODEL =
  process.env["RVS_CODEX_RESPONSES_MODEL"] || "gpt-5.4";

// The image model the Responses image_generation tool runs when the
// console names none. It is a fallback, not a constant: the console's model
// field was ignored on this path, so an operator could pick a model and
// watch a different one produce the asset -- and the picker offering
// choices that changed nothing was worse than no picker.
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
  constructor(message: string) {
    super(message);
    this.name = "CodexOAuthError";
    // The token only, so callers matching on `code` are unaffected by a
    // detail appended to the message.
    this.code = message.split(":")[0] ?? message;
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
// The image arrives in a `response.output_item.done` event, on the item's
// `result`. Not on the finished response object: that one is delivered
// last and has the base64 stripped out of it, so reading only the final
// `response.completed` -- which is what this did -- found a completed
// generation with no image in it and reported CODEX_IMAGE_MISSING for a
// call that had worked.
//
// Scans every event rather than trusting one event name, and falls back to
// a whole-body parse for a non-streaming reply.
export const readGeneratedImageFromStream = (
  contentType: string,
  body: string,
): string => {
  // The body is read for what it is, not for what a header says it is.
  // Branching on content-type sent a real event stream down the JSON path
  // -- fifty-seven seconds of generation reported as
  // CODEX_RESPONSE_MALFORMED -- because the endpoint does not label it the
  // way the branch expected. contentType is kept only as a tiebreak for a
  // body that is neither.
  void contentType;
  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    let event: { item?: { result?: unknown } };
    try {
      event = JSON.parse(payload) as { item?: { result?: unknown } };
    } catch {
      // One unparseable event is not the whole stream.
      continue;
    }
    const result = event.item?.result;
    if (typeof result === "string" && result.length > 0) return result;
  }
  // No `data:` events carried one. Either this was a non-streaming reply,
  // or the stream really had no image in it -- try it as one JSON object
  // before saying so.
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new CodexOAuthError(
      body.includes("data:")
        ? "CODEX_IMAGE_MISSING"
        : "CODEX_RESPONSE_MALFORMED",
    );
  }
  return readGeneratedImage(parsed);
};

// The non-streaming shape: an output item carrying the base64. Scanned for
// rather than indexed, because the model's own message items share the
// list and their order is not guaranteed.
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
  readonly model?: string;
  readonly request?: CodexFetch;
}): Promise<CodexImageResult> {
  const request = params.request ?? defaultCodexFetch;
  // Every line of this shape was measured against the live endpoint, which
  // refuses each mistake with a different 400:
  //   model      -- a responses model; the image model here is refused
  //   input      -- "Input must be a list", so a message list, not a string
  //   store      -- "Store must be set to false"
  //   background -- "Transparent background is not supported for this
  //                 model". Asking for it fails the call, and the default
  //                 output is RGBA anyway (colour type 6), which is what
  //                 the pipeline needs. So it is simply not asked for, and
  //                 openai-image-material.ts still checks rather than
  //                 trusts.
  //   size       -- accepted and then ignored; a 1024x1536 request came
  //                 back 1254x1254. Sent regardless, because it costs
  //                 nothing and may start being honoured; the renderer
  //                 draws the image into its box either way.
  const body = JSON.stringify({
    model: CODEX_RESPONSES_MODEL,
    store: false,
    stream: true,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: params.prompt }],
      },
    ],
    tools: [
      {
        type: "image_generation",
        model: params.model || CODEX_IMAGE_MODEL,
        size: params.size,
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
  if (response.status !== 200) {
    // The endpoint's own words. Discarding them left a bare status code
    // to debug an undocumented protocol with -- the exact blindness this
    // codebase keeps paying for. Bounded and single-line: it is vendor
    // text that ends up in a log and on a page.
    const detail = (await response.text())
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 300);
    throw new CodexOAuthError(
      `CODEX_REQUEST_FAILED_${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return {
    b64: readGeneratedImageFromStream(
      response.contentType,
      await response.text(),
    ),
    ...(refreshedAuth ? { refreshedAuth } : {}),
  };
}
