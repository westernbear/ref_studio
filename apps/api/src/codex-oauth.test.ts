import { describe, expect, it } from "vitest";
import {
  CODEX_CLIENT_ID,
  CODEX_CLIENT_VERSION,
  CODEX_MODELS_URL,
  CODEX_RESPONSES_URL,
  CODEX_TOKEN_URL,
  CodexOAuthError,
  generateCodexImage,
  listCodexModels,
  parseCodexAuth,
  readGeneratedImage,
  readResponsesBody,
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

describe("reading a streamed response", () => {
  it("takes the last response object out of the event stream", () => {
    const body = streamed({
      output: [{ type: "image_generation_call", result: "AAA" }],
    });
    expect(
      readGeneratedImage(readResponsesBody("text/event-stream", body)),
    ).toBe("AAA");
  });

  it("also reads a plain JSON body, if the endpoint answers that way", () => {
    const body = JSON.stringify({
      output: [{ type: "image_generation_call", result: "BBB" }],
    });
    expect(
      readGeneratedImage(readResponsesBody("application/json", body)),
    ).toBe("BBB");
  });

  // The model's own message items share the output list with the image
  // call, and their order is not guaranteed -- so the image is scanned for,
  // not indexed.
  it("finds the image past output items that are not one", () => {
    const body = streamed({
      output: [
        { type: "reasoning", summary: [] },
        { type: "message", content: [{ type: "output_text", text: "here" }] },
        { type: "image_generation_call", result: "CCC" },
      ],
    });
    expect(
      readGeneratedImage(readResponsesBody("text/event-stream", body)),
    ).toBe("CCC");
  });

  it("fails by name when the response carries no image", () => {
    const body = streamed({ output: [{ type: "message", content: [] }] });
    expect(() =>
      readGeneratedImage(readResponsesBody("text/event-stream", body)),
    ).toThrow(/CODEX_IMAGE_MISSING/);
  });

  it("fails by name on a stream with no response event", () => {
    expect(() =>
      readResponsesBody("text/event-stream", "data: [DONE]\n"),
    ).toThrow(/CODEX_RESPONSE_MALFORMED/);
  });
});

describe("generating an image", () => {
  it("asks the codex endpoint for a png of the given size", async () => {
    const seen: {
      url?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {};
    const request: CodexFetch = async (url, init) => {
      seen.url = url;
      seen.headers = { ...init.headers };
      seen.body = init.body;
      return reply(
        200,
        streamed({
          output: [{ type: "image_generation_call", result: "DDD" }],
        }),
      );
    };
    const result = await generateCodexImage({
      auth: auth(),
      model: "gpt-5.4",
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
    expect(body.model).toBe("gpt-5.4");
    // A list, not a bare string -- this backend refuses a string. And no
    // background: "transparent", which it also refuses.
    expect(body.input).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "a gold glow" }],
      },
    ]);
    expect(body.tools).toEqual([
      {
        type: "image_generation",
        size: "1024x1536",
        output_format: "png",
      },
    ]);
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
        : reply(
            200,
            streamed({
              output: [{ type: "image_generation_call", result: "EEE" }],
            }),
          );
    };
    const result = await generateCodexImage({
      auth: auth(),
      model: "gpt-5.4",
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
        model: "gpt-5.4",
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
        model: "gpt-5.4",
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
        model: "gpt-5.4",
        prompt: "x",
        size: "1024x1024",
        request,
      }),
    ).rejects.toBeInstanceOf(CodexOAuthError);
  });
});

// The registry is the Codex client's own, not the platform's /v1/models: a
// different endpoint answering { models: [{ slug }] }, listing what this
// subscription can run.
describe("codex model registry", () => {
  it("asks the registry and returns its slugs", async () => {
    const seen: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
    } = {};
    const request: CodexFetch = async (url, init) => {
      seen.url = url;
      seen.method = init.method;
      seen.headers = { ...init.headers };
      return reply(
        200,
        JSON.stringify({
          models: [{ slug: "gpt-5.5" }, { slug: "gpt-5.3-codex-spark" }],
        }),
        "application/json",
      );
    };
    const listed = await listCodexModels({ auth: auth(), request });
    expect(listed.models).toEqual(["gpt-5.5", "gpt-5.3-codex-spark"]);
    // client_version is required: without it the registry answers 400,
    // "Field required" on the query string.
    expect(seen.url).toBe(
      `${CODEX_MODELS_URL}?client_version=${CODEX_CLIENT_VERSION}`,
    );
    expect(seen.method).toBe("GET");
    expect(seen.headers).toMatchObject({
      authorization: "Bearer access-one",
      "chatgpt-account-id": "acct-1",
      accept: "application/json",
    });
    expect(listed.refreshedAuth).toBeUndefined();
  });

  it("refreshes on 401 and hands the rotated credential back to be stored", async () => {
    const calls: string[] = [];
    const request: CodexFetch = async (url) => {
      calls.push(url);
      if (url === CODEX_TOKEN_URL)
        return reply(
          200,
          JSON.stringify({
            access_token: "access-two",
            refresh_token: "refresh-two",
          }),
          "application/json",
        );
      return calls.filter((entry) => entry.startsWith(CODEX_MODELS_URL))
        .length === 1
        ? reply(401, "")
        : reply(
            200,
            JSON.stringify({ models: [{ slug: "gpt-5.5" }] }),
            "application/json",
          );
    };
    const listed = await listCodexModels({ auth: auth(), request });
    expect(listed.models).toEqual(["gpt-5.5"]);
    expect(listed.refreshedAuth?.tokens.refresh_token).toBe("refresh-two");
  });

  it("names a registry that answers something else", async () => {
    const request: CodexFetch = async () =>
      reply(200, JSON.stringify({ data: [] }), "application/json");
    await expect(listCodexModels({ auth: auth(), request })).rejects.toThrow(
      "CODEX_RESPONSE_MALFORMED",
    );
  });
});

// Both of these are what the live endpoint actually does, and both sent
// every response to CODEX_RESPONSE_MALFORMED or to an empty output before
// they were handled.
describe("reading what this backend actually streams", () => {
  it("reads a stream that arrives with no content-type at all", () => {
    expect(
      readResponsesBody(
        "",
        streamed({ output: [{ type: "message" }], status: "completed" }),
      ),
    ).toEqual({ output: [{ type: "message" }], status: "completed" });
  });

  it("puts back the output items that response.completed drops", () => {
    const item = {
      type: "message",
      content: [{ type: "output_text", text: "pong" }],
    };
    const body = [
      `data: ${JSON.stringify({ type: "response.output_item.done", item })}`,
      `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [] } })}`,
      "",
    ].join("\n");
    expect(readResponsesBody("", body)).toEqual({
      status: "completed",
      output: [item],
    });
  });
});
