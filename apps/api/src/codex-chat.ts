import { randomUUID } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import {
  CODEX_BASE_URL,
  CodexOAuthError,
  codexRequestFailed,
  codexHeaders,
  defaultCodexFetch,
  readResponsesBody,
  refreshCodexAuth,
} from "./codex-oauth.js";
import type { CodexAuth, CodexFetch } from "./codex-oauth.js";
import type { LanguageModel } from "ai";

// The chat half of the same ChatGPT-subscription credential the image
// provider already uses (codex-oauth.ts). Nothing new is authenticated
// here: `codex login` writes ~/.codex/auth.json, the operator pastes it
// into the admin console, and the refresh grant keeps it alive.
//
// The whole adapter is a fetch wrapper because the Codex backend speaks the
// plain Responses API at ${CODEX_BASE_URL}/responses -- which is exactly
// what @ai-sdk/openai's default model factory posts to. So the provider is
// createOpenAI with a different baseURL, and this file only has to fix the
// three ways that endpoint differs from api.openai.com:
//
//  - it answers SSE and nothing else, so `stream: true` is forced and the
//    stream is collapsed back into the single JSON body the caller asked
//    for;
//  - it refuses server-side persistence, so `store: false` is forced;
//  - it wants the Codex client's own headers, shared with the image path
//    via codexHeaders().
//
// ponytail: only the non-streaming path is implemented, because every
// caller in this repo is generateObject. Give it a real ReadableStream
// passthrough the day something calls streamText.

export type PersistCodexAuth = (auth: CodexAuth) => void;

// Exported for the test: the body rewrite is the part most likely to drift
// when the AI SDK changes what it sends.
export const codexChatBody = (raw: string): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CodexOAuthError("CODEX_REQUEST_MALFORMED");
  }
  if (typeof parsed !== "object" || parsed === null)
    throw new CodexOAuthError("CODEX_REQUEST_MALFORMED");
  const body = Object.assign({}, parsed, { store: false, stream: true });
  const text = Reflect.get(parsed, "text");
  if (typeof text !== "object" || text === null) return JSON.stringify(body);
  const format = Reflect.get(text, "format");
  if (
    typeof format !== "object" ||
    format === null ||
    Reflect.get(format, "type") !== "json_schema"
  )
    return JSON.stringify(body);
  return JSON.stringify(
    Object.assign({}, body, {
      text: Object.assign({}, text, {
        format: Object.assign({}, format, { strict: false }),
      }),
    }),
  );
};

// Refresh-on-401-and-retry-once, the same policy generateCodexImage uses
// and for the same reason: no clock to skew, and one path covers both a
// stale token and any other recoverable rejection.
export function createCodexFetch(params: {
  readonly auth: CodexAuth;
  readonly persist?: PersistCodexAuth;
  readonly request?: CodexFetch;
}): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  const request = params.request ?? defaultCodexFetch;
  // One session id per model instance, which is one per job -- the backend
  // uses it to keep a conversation on its own cached path.
  const sessionId = randomUUID();
  let auth = params.auth;
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = codexChatBody(typeof init?.body === "string" ? init.body : "");
    const attempt = () =>
      request(url, {
        method: "POST",
        headers: codexHeaders(auth, sessionId),
        body,
      });
    let response = await attempt();
    if (response.status === 401) {
      auth = await refreshCodexAuth(auth, request);
      params.persist?.(auth);
      response = await attempt();
    }
    if (response.status !== 200)
      throw await codexRequestFailed(response);
    const parsed = readResponsesBody(
      response.contentType,
      await response.text(),
    );
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

export function createCodexChatModel(params: {
  readonly auth: CodexAuth;
  readonly model: string;
  readonly persist?: PersistCodexAuth;
  readonly request?: CodexFetch;
}): LanguageModel {
  return createOpenAI({
    // Carried so the SDK does not refuse to build a request for want of a
    // key; the real credential goes on in codexHeaders().
    apiKey: params.auth.tokens.access_token,
    baseURL: CODEX_BASE_URL,
    fetch: createCodexFetch(params),
  })(params.model);
}
