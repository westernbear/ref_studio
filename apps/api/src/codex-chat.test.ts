import { describe, expect, it } from "vitest";
import {
  CODEX_RESPONSES_URL,
  CodexOAuthError,
  parseCodexAuth,
  type CodexAuth,
  type CodexFetch,
} from "./codex-oauth.js";
import { codexChatBody, createCodexFetch } from "./codex-chat.js";

const auth = () =>
  parseCodexAuth(
    JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        id_token: "id",
        access_token: "access-one",
        refresh_token: "refresh-one",
        account_id: "acct-1",
      },
    }),
  );

const streamed = (response: unknown) =>
  [
    `data: ${JSON.stringify({ type: "response.created", response: { output: [] } })}`,
    `data: ${JSON.stringify({ type: "response.completed", response })}`,
    "data: [DONE]",
    "",
  ].join("\n");

const reply = (
  status: number,
  body: string,
  contentType = "text/event-stream",
) => ({ status, contentType, text: async () => body });

const refreshReply = () =>
  reply(
    200,
    JSON.stringify({
      access_token: "access-two",
      refresh_token: "refresh-two",
    }),
    "application/json",
  );

const post = (
  fetchImpl: CodexFetch,
  persist?: (next: CodexAuth) => void,
  body = JSON.stringify({ model: "gpt-5.1-codex", input: [] }),
) =>
  createCodexFetch({
    auth: auth(),
    request: fetchImpl,
    ...(persist ? { persist } : {}),
  })(CODEX_RESPONSES_URL, { method: "POST", body });

describe("codex chat body", () => {
  it("forces the two fields the backend has no other setting for", () => {
    const rewritten = JSON.parse(
      codexChatBody(JSON.stringify({ model: "m", stream: false, store: true })),
    ) as Record<string, unknown>;
    expect(rewritten).toMatchObject({ model: "m", stream: true, store: false });
  });

  it("disables strict schema validation for optional structured-output fields", () => {
    const rewritten = JSON.parse(
      codexChatBody(
        JSON.stringify({
          text: {
            format: {
              type: "json_schema",
              strict: true,
              schema: { type: "object" },
            },
          },
        }),
      ),
    );
    expect(rewritten).toMatchObject({
      text: { format: { type: "json_schema", strict: false } },
    });
  });

  it("names a body it cannot read", () => {
    expect(() => codexChatBody("not json")).toThrow(CodexOAuthError);
  });
});

describe("codex chat transport", () => {
  it("sends the Codex client's headers and collapses the stream to JSON", async () => {
    const seen: { url?: string; headers?: Record<string, string> } = {};
    const response = await post(async (url, init) => {
      seen.url = url;
      seen.headers = { ...init.headers };
      return reply(200, streamed({ output: [{ type: "message" }] }));
    });
    expect(seen.url).toBe(CODEX_RESPONSES_URL);
    expect(seen.headers).toMatchObject({
      authorization: "Bearer access-one",
      "chatgpt-account-id": "acct-1",
      "OpenAI-Beta": "responses=experimental",
      originator: "codex_cli_rs",
    });
    expect(seen.headers?.session_id).toBeTruthy();
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ output: [{ type: "message" }] });
  });

  it("refreshes on 401, persists the rotation, and retries once", async () => {
    const persisted: CodexAuth[] = [];
    const calls: string[] = [];
    const response = await post(
      async (url) => {
        calls.push(url);
        if (url === CODEX_RESPONSES_URL)
          return calls.filter((entry) => entry === CODEX_RESPONSES_URL)
            .length === 1
            ? reply(401, "")
            : reply(200, streamed({ output: [] }));
        return refreshReply();
      },
      (next) => persisted.push(next),
    );
    expect(response.status).toBe(200);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.tokens.access_token).toBe("access-two");
    expect(calls.filter((entry) => entry === CODEX_RESPONSES_URL)).toHaveLength(
      2,
    );
  });

  // A bare status told us nothing across three separate 400s; the body is
  // the only part of the rejection that names what the backend disliked.
  it("carries the rejection body into the error", async () => {
    await expect(
      post(async () =>
        reply(400, JSON.stringify({ error: { message: "unsupported tool" } })),
      ),
    ).rejects.toThrow(/CODEX_REQUEST_FAILED_400: .*unsupported tool/u);
  });

  it("gives up on a second 401", async () => {
    await expect(
      post(async (url) =>
        url === CODEX_RESPONSES_URL ? reply(401, "") : refreshReply(),
      ),
    ).rejects.toThrow("CODEX_REQUEST_FAILED_401");
  });
});
