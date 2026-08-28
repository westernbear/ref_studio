import { describe, expect, it } from "vitest";
import {
  CODEX_CLIENT_ID,
  CODEX_IMAGE_MODEL,
  CODEX_RESPONSES_URL,
  CODEX_TOKEN_URL,
  CodexOAuthError,
  generateCodexImage,
  parseCodexAuth,
  CODEX_RESPONSES_MODEL,
  readGeneratedImage,
  readGeneratedImageFromStream,
  refreshCodexAuth,
  type CodexFetch,
} from "./codex-oauth.js";

const auth = () =>
  parseCodexAuth(
    JSON.stringify({
      auth_mode: "chatgpt",
      OPENAI_API_KEY: null,
      tokens: {
        id_token: "id",
        access_token: "access-one",
        refresh_token: "refresh-one",
        account_id: "acct-1",
      },
      last_refresh: "2026-08-19T06:56:09.801Z",
    }),
  );

// The real stream: the image rides on an output_item.done event, and the
// final response.completed has the base64 stripped out of it -- measured
// against the live endpoint, and the reason reading only the last response
// object reported CODEX_IMAGE_MISSING for calls that had worked.
const streamed = (result: string | null) =>
  [
    `data: ${JSON.stringify({ type: "response.created", response: { output: [] } })}`,
    ...(result === null
      ? []
      : [
          `data: ${JSON.stringify({ type: "response.output_item.done", item: { type: "image_generation_call", result } })}`,
        ]),
    `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [{ type: "image_generation_call" }] } })}`,
    "data: [DONE]",
    "",
  ].join("\n");

const reply = (
  status: number,
  body: string,
  contentType = "text/event-stream",
) => ({ status, contentType, text: async () => body });

describe("codex credentials", () => {
  it("reads the shape the Codex CLI writes", () => {
    expect(auth().tokens.account_id).toBe("acct-1");
  });

  it("refuses anything that is not that shape, by name", () => {
    for (const raw of [
      "not json",
      "{}",
      JSON.stringify({ tokens: { access_token: "a" } }),
      JSON.stringify({ OPENAI_API_KEY: "sk-test" }),
    ])
      expect(() => parseCodexAuth(raw)).toThrow(/CODEX_AUTH_MALFORMED/);
  });
});

describe("codex token refresh", () => {
  it("posts the refresh grant to the token endpoint", async () => {
    const seen: { url?: string; body?: string } = {};
    const request: CodexFetch = async (url, init) => {
      seen.url = url;
      seen.body = init.body;
      return reply(
        200,
        JSON.stringify({ access_token: "access-two" }),
        "application/json",
      );
    };
    const refreshed = await refreshCodexAuth(auth(), request);
    expect(seen.url).toBe(CODEX_TOKEN_URL);
    expect(JSON.parse(seen.body ?? "{}")).toEqual({
      client_id: CODEX_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: "refresh-one",
    });
    expect(refreshed.tokens.access_token).toBe("access-two");
  });

  // OpenAI returns a rotated refresh token on some refreshes and omits it
  // on others. Overwriting it with undefined would destroy the credential
  // on the very refresh that succeeded.
  it("keeps the existing refresh token when the response omits one", async () => {
    const request: CodexFetch = async () =>
      reply(
        200,
        JSON.stringify({ access_token: "access-two" }),
        "application/json",
      );
    expect((await refreshCodexAuth(auth(), request)).tokens.refresh_token).toBe(
      "refresh-one",
    );
  });

  it("takes a rotated refresh token when the response carries one", async () => {
    const request: CodexFetch = async () =>
      reply(
        200,
        JSON.stringify({
          access_token: "access-two",
          refresh_token: "refresh-two",
        }),
        "application/json",
      );
    expect((await refreshCodexAuth(auth(), request)).tokens.refresh_token).toBe(
      "refresh-two",
    );
  });

  it("fails by name when the endpoint refuses", async () => {
    const request: CodexFetch = async () => reply(400, "nope", "text/plain");
    await expect(refreshCodexAuth(auth(), request)).rejects.toThrow(
      /CODEX_REFRESH_FAILED/,
    );
  });
});

describe("reading the image out of the stream", () => {
  it("takes it from the output_item.done event", () => {
    expect(
      readGeneratedImageFromStream("text/event-stream", streamed("AAA")),
    ).toBe("AAA");
  });

  // The finished response object is delivered last and has the base64
  // stripped out. Reading only that -- which is what this did -- found a
  // completed generation with no image in it.
  it("does not give up because the final response object has no image", () => {
    expect(
      readGeneratedImageFromStream("text/event-stream", streamed("BBB")),
    ).toBe("BBB");
  });

  it("also reads a plain JSON body, if the endpoint answers that way", () => {
    const body = JSON.stringify({
      output: [{ type: "image_generation_call", result: "CCC" }],
    });
    expect(readGeneratedImageFromStream("application/json", body)).toBe("CCC");
  });

  it("finds the image past output items that are not one", () => {
    const body = JSON.stringify({
      output: [
        { type: "reasoning", summary: [] },
        { type: "message", content: [{ type: "output_text", text: "here" }] },
        { type: "image_generation_call", result: "DDD" },
      ],
    });
    expect(readGeneratedImage(JSON.parse(body))).toBe("DDD");
  });

  it("fails by name when the stream carries no image", () => {
    expect(() =>
      readGeneratedImageFromStream("text/event-stream", streamed(null)),
    ).toThrow(/CODEX_IMAGE_MISSING/);
  });

  it("fails by name on a body that is not JSON at all", () => {
    expect(() =>
      readGeneratedImageFromStream("application/json", "<html>login</html>"),
    ).toThrow(/CODEX_RESPONSE_MALFORMED/);
  });
});

describe("generating an image", () => {
  it("asks the codex endpoint in the shape it actually accepts", async () => {
    const seen: {
      url?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {};
    const request: CodexFetch = async (url, init) => {
      seen.url = url;
      seen.headers = { ...init.headers };
      seen.body = init.body;
      return reply(200, streamed("DDD"));
    };
    const result = await generateCodexImage({
      auth: auth(),
      prompt: "a gold glow",
      size: "1024x1536",
      request,
    });
    expect(result.b64).toBe("DDD");
    expect(result.refreshedAuth).toBeUndefined();
    expect(seen.url).toBe(CODEX_RESPONSES_URL);
    expect(seen.headers?.authorization).toBe("Bearer access-one");
    expect(seen.headers?.["chatgpt-account-id"]).toBe("acct-1");
    const body = JSON.parse(seen.body ?? "{}");
    // The responses model carries the request; the image model rides in
    // the tool. Sending the image model at the top level is refused --
    // "The 'gpt-image-2' model is not supported when using Codex with a
    // ChatGPT account" -- which is what this whole path failed with.
    expect(body.model).toBe(CODEX_RESPONSES_MODEL);
    expect(body.store).toBe(false);
    // "Input must be a list", says the endpoint to a bare string.
    expect(body.input).toEqual([
      { role: "user", content: [{ type: "input_text", text: "a gold glow" }] },
    ]);
    expect(body.tools).toEqual([
      {
        type: "image_generation",
        model: CODEX_IMAGE_MODEL,
        size: "1024x1536",
        output_format: "png",
      },
    ]);
    // Asking for a transparent background fails the call on this model,
    // and the default output is RGBA anyway.
    expect(JSON.stringify(body)).not.toContain("background");
  });

  // Access tokens last hours, so a stale one is the normal case, not an
  // edge case. Refreshing and retrying once is what makes an unattended
  // deployment keep working past its first afternoon.
  it("refreshes and retries once on a 401, and reports the new credential", async () => {
    const tokens: string[] = [];
    let refreshes = 0;
    const request: CodexFetch = async (url, init) => {
      if (url === CODEX_TOKEN_URL) {
        refreshes += 1;
        return reply(
          200,
          JSON.stringify({ access_token: "access-two" }),
          "application/json",
        );
      }
      tokens.push(init.headers["authorization"] ?? "");
      return tokens.length === 1
        ? reply(401, "expired", "text/plain")
        : reply(200, streamed("EEE"));
    };
    const result = await generateCodexImage({
      auth: auth(),
      prompt: "a gold glow",
      size: "1024x1024",
      request,
    });
    expect(result.b64).toBe("EEE");
    expect(refreshes).toBe(1);
    expect(tokens).toEqual(["Bearer access-one", "Bearer access-two"]);
    // Handed back so the caller can persist it -- a refresh that is not
    // written back means paying for another one on every asset.
    expect(result.refreshedAuth?.tokens.access_token).toBe("access-two");
  });

  it("gives up after a second 401 rather than refreshing forever", async () => {
    let refreshes = 0;
    const request: CodexFetch = async (url) => {
      if (url === CODEX_TOKEN_URL) {
        refreshes += 1;
        return reply(
          200,
          JSON.stringify({ access_token: "access-two" }),
          "application/json",
        );
      }
      return reply(401, "revoked", "text/plain");
    };
    await expect(
      generateCodexImage({
        auth: auth(),
        prompt: "x",
        size: "1024x1024",
        request,
      }),
    ).rejects.toThrow(/CODEX_REQUEST_FAILED_401/);
    expect(refreshes).toBe(1);
  });

  it("names the status when the endpoint refuses for another reason", async () => {
    const request: CodexFetch = async () =>
      reply(429, "slow down", "text/plain");
    await expect(
      generateCodexImage({
        auth: auth(),
        prompt: "x",
        size: "1024x1024",
        request,
      }),
    ).rejects.toThrow(/CODEX_REQUEST_FAILED_429/);
  });

  it("throws a CodexOAuthError, so callers can tell it apart", async () => {
    const request: CodexFetch = async () => reply(500, "boom", "text/plain");
    await expect(
      generateCodexImage({
        auth: auth(),
        prompt: "x",
        size: "1024x1024",
        request,
      }),
    ).rejects.toBeInstanceOf(CodexOAuthError);
  });
});
