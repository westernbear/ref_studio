import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAiProviderSettings,
  getAiProviderSettingsWithSecret,
  updateAiProviderSettings,
} from "./ai-provider-settings.js";
import { openApiDatabase } from "./durable-state.js";

const withDb = (fn: (db: ReturnType<typeof openApiDatabase>) => void): void => {
  const directory = mkdtempSync(join(tmpdir(), "rvs-ai-provider-settings-"));
  const db = openApiDatabase(join(directory, "app.sqlite"));
  try {
    fn(db);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("ai-provider-settings", () => {
  it("defaults to disabled with no key when nothing has been saved", () => {
    withDb((db) => {
      const settings = getAiProviderSettings(db);
      expect(settings.enabled).toBe(false);
      expect(settings.hasApiKey).toBe(false);
    });
  });

  it("round-trips an encrypted key through update and decrypt", () => {
    withDb((db) => {
      updateAiProviderSettings(
        db,
        {
          providerKind: "openai",
          model: "gpt-4o",
          apiKey: "sk-secret",
          enabled: true,
        },
        "admin-1",
        1_000,
        "secret-key-material",
      );
      const pub = getAiProviderSettings(db);
      expect(pub.hasApiKey).toBe(true);
      expect(pub.enabled).toBe(true);
      expect(pub.model).toBe("gpt-4o");
      expect(JSON.stringify(pub)).not.toContain("sk-secret");
      const withSecret = getAiProviderSettingsWithSecret(
        db,
        "secret-key-material",
      );
      expect(withSecret.apiKey).toBe("sk-secret");
    });
  });

  it("never exposes the api key from the public projection", () => {
    withDb((db) => {
      updateAiProviderSettings(
        db,
        { providerKind: "openai", model: "gpt-4o", apiKey: "sk-secret" },
        "admin-1",
        1_000,
        "secret-key-material",
      );
      const pub = getAiProviderSettings(db) as unknown as Record<
        string,
        unknown
      >;
      expect("apiKey" in pub).toBe(false);
      expect("apiKeyCiphertext" in pub).toBe(false);
    });
  });

  it("leaves the existing key untouched when a patch omits apiKey", () => {
    withDb((db) => {
      updateAiProviderSettings(
        db,
        { providerKind: "openai", model: "gpt-4o", apiKey: "sk-secret" },
        "admin-1",
        1_000,
        "secret-key-material",
      );
      updateAiProviderSettings(
        db,
        { model: "gpt-4o-mini" },
        "admin-1",
        2_000,
        "secret-key-material",
      );
      const withSecret = getAiProviderSettingsWithSecret(
        db,
        "secret-key-material",
      );
      expect(withSecret.apiKey).toBe("sk-secret");
      expect(withSecret.model).toBe("gpt-4o-mini");
    });
  });

  it("accepts every direct provider kind, each with its own native api key", () => {
    withDb((db) => {
      for (const providerKind of [
        "groq",
        "mistral",
        "cohere",
        "deepseek",
        "cerebras",
        "perplexity",
        "fireworks",
        "togetherai",
        "deepinfra",
        "baseten",
        "huggingface",
        "moonshotai",
        "alibaba",
      ]) {
        const result = updateAiProviderSettings(
          db,
          { providerKind, model: "some-model", apiKey: `${providerKind}-key` },
          "admin-1",
          1_000,
          "secret-key-material",
        );
        expect(result.providerKind).toBe(providerKind);
      }
    });
  });

  it("rejects an unknown provider kind", () => {
    withDb((db) => {
      expect(() =>
        updateAiProviderSettings(
          db,
          { providerKind: "not-a-provider", model: "x" },
          "admin-1",
          1_000,
          "secret-key-material",
        ),
      ).toThrow("INVALID_REQUEST");
    });
  });

  it("requires a baseUrl for openai-compatible and rejects it for direct providers", () => {
    withDb((db) => {
      expect(() =>
        updateAiProviderSettings(
          db,
          { providerKind: "openai-compatible", model: "x" },
          "admin-1",
          1_000,
          "secret-key-material",
        ),
      ).toThrow("INVALID_REQUEST");
      expect(() =>
        updateAiProviderSettings(
          db,
          {
            providerKind: "openai",
            model: "x",
            baseUrl: "https://example.invalid",
          },
          "admin-1",
          1_000,
          "secret-key-material",
        ),
      ).toThrow("INVALID_REQUEST");
      expect(() =>
        updateAiProviderSettings(
          db,
          {
            providerKind: "openai-compatible",
            model: "x",
            baseUrl: "https://example.invalid/v1",
          },
          "admin-1",
          1_000,
          "secret-key-material",
        ),
      ).not.toThrow();
    });
  });
  // The credential is a whole auth.json, not a key, so it is the one
  // provider whose secret can be checked before it is stored -- and a paste
  // that does not parse would otherwise only fail at the first job.
  it("accepts codex-oauth and rejects an auth.json that does not parse", () => {
    withDb((db) => {
      expect(() =>
        updateAiProviderSettings(
          db,
          {
            providerKind: "codex-oauth",
            model: "gpt-5.1-codex",
            apiKey: "not json",
          },
          "admin-1",
          1_000,
          "secret-key-material",
        ),
      ).toThrow("INVALID_REQUEST");
      const saved = updateAiProviderSettings(
        db,
        {
          providerKind: "codex-oauth",
          model: "gpt-5.1-codex",
          apiKey: JSON.stringify({
            tokens: { access_token: "a", refresh_token: "r" },
          }),
          enabled: true,
        },
        "admin-1",
        1_000,
        "secret-key-material",
      );
      expect(saved.providerKind).toBe("codex-oauth");
      expect(saved.hasApiKey).toBe(true);
    });
  });
});
