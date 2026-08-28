import { describe, expect, it } from "vitest";
import {
  ProviderModelsError,
  listProviderModels,
  type ModelsFetch,
} from "./provider-models.js";

const reply = (status: number, body: unknown): ReturnType<ModelsFetch> =>
  Promise.resolve({
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });

describe("listing a provider's models", () => {
  it("reads an OpenAI-shaped listing", async () => {
    let seen = { url: "", auth: "" };
    const fetchModels: ModelsFetch = (url, headers) => {
      seen = { url, auth: headers["authorization"] ?? "" };
      return reply(200, { data: [{ id: "gpt-5" }, { id: "gpt-4o" }] });
    };
    expect(
      await listProviderModels({
        providerKind: "openai",
        apiKey: "sk-test",
        baseUrl: null,
        fetch: fetchModels,
      }),
    ).toEqual(["gpt-4o", "gpt-5"]);
    expect(seen.url).toBe("https://api.openai.com/v1/models");
    expect(seen.auth).toBe("Bearer sk-test");
  });

  it("reads Anthropic's listing with its own auth header", async () => {
    let headers: Record<string, string> = {};
    const fetchModels: ModelsFetch = (_url, sent) => {
      headers = { ...sent };
      return reply(200, { data: [{ id: "claude-sonnet-5" }] });
    };
    expect(
      await listProviderModels({
        providerKind: "anthropic",
        apiKey: "sk-ant",
        baseUrl: null,
        fetch: fetchModels,
      }),
    ).toEqual(["claude-sonnet-5"]);
    expect(headers["x-api-key"]).toBe("sk-ant");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["authorization"]).toBeUndefined();
  });

  it("reads Google's listing and strips the models/ prefix", async () => {
    const fetchModels: ModelsFetch = () =>
      reply(200, {
        models: [
          {
            name: "models/gemini-3-flash-preview",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      });
    expect(
      await listProviderModels({
        providerKind: "google",
        apiKey: "key",
        baseUrl: null,
        fetch: fetchModels,
      }),
    ).toEqual(["gemini-3-flash-preview"]);
  });

  // The whole reason this file exists: gpt-image-2 in the AI provider's
  // model field produced "not supported for generateContent" eleven
  // minutes into a job, with nothing on screen. It must not be offered.
  it("leaves out models that cannot answer a generateContent call", async () => {
    const fetchModels: ModelsFetch = () =>
      reply(200, {
        models: [
          {
            name: "models/gemini-3-flash-preview",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gpt-image-2",
            supportedGenerationMethods: ["predict"],
          },
          { name: "models/embedding-001", supportedGenerationMethods: [] },
        ],
      });
    expect(
      await listProviderModels({
        providerKind: "google",
        apiKey: "key",
        baseUrl: null,
        requireTextGeneration: true,
        fetch: fetchModels,
      }),
    ).toEqual(["gemini-3-flash-preview"]);
  });

  // Hiding a usable model is the worse error, so silence from the provider
  // is treated as "it did not say", not as "it cannot".
  it("keeps a model that lists no methods at all", async () => {
    const fetchModels: ModelsFetch = () =>
      reply(200, { models: [{ name: "models/gemini-new" }] });
    expect(
      await listProviderModels({
        providerKind: "google",
        apiKey: "key",
        baseUrl: null,
        requireTextGeneration: true,
        fetch: fetchModels,
      }),
    ).toEqual(["gemini-new"]);
  });

  it("uses an explicit base url over the built-in one", async () => {
    let url = "";
    const fetchModels: ModelsFetch = (seen) => {
      url = seen;
      return reply(200, { data: [{ id: "local-model" }] });
    };
    await listProviderModels({
      providerKind: "openai-compatible",
      apiKey: "k",
      baseUrl: "https://llm.internal/v1/",
      fetch: fetchModels,
    });
    expect(url).toBe("https://llm.internal/v1/models");
  });

  // Not every provider has a listing endpoint, and that is not a failure
  // state -- the console falls back to typing a name, which is what it did
  // for all of them before.
  it("refuses by name for a provider with no known listing endpoint", async () => {
    await expect(
      listProviderModels({
        providerKind: "openai-compatible",
        apiKey: "k",
        baseUrl: null,
        fetch: () => reply(200, { data: [] }),
      }),
    ).rejects.toThrow(/PROVIDER_MODELS_UNSUPPORTED/);
  });

  it("names the status when the provider refuses", async () => {
    await expect(
      listProviderModels({
        providerKind: "openai",
        apiKey: "bad",
        baseUrl: null,
        fetch: () => reply(401, "unauthorized"),
      }),
    ).rejects.toThrow(/PROVIDER_MODELS_REQUEST_FAILED_401/);
  });

  it("names an unreadable body rather than returning nothing", async () => {
    await expect(
      listProviderModels({
        providerKind: "openai",
        apiKey: "k",
        baseUrl: null,
        fetch: () => reply(200, "<html>a proxy login page</html>"),
      }),
    ).rejects.toBeInstanceOf(ProviderModelsError);
  });

  it("sorts and de-duplicates, so the list does not reshuffle between loads", async () => {
    const fetchModels: ModelsFetch = () =>
      reply(200, {
        data: [{ id: "b" }, { id: "a" }, { id: "b" }, { id: "c" }],
      });
    expect(
      await listProviderModels({
        providerKind: "openai",
        apiKey: "k",
        baseUrl: null,
        fetch: fetchModels,
      }),
    ).toEqual(["a", "b", "c"]);
  });
});
