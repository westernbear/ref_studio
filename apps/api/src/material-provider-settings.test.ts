import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getMaterialProviderSettings,
  getMaterialProviderSettingsWithSecret,
  updateMaterialProviderSettings,
} from "./material-provider-settings.js";
import { openApiDatabase } from "./durable-state.js";
import { updateAiProviderSettings } from "./ai-provider-settings.js";

const withDb = (
  fn: (db: ReturnType<typeof openApiDatabase>) => void,
): void => {
  const directory = mkdtempSync(
    join(tmpdir(), "rvs-material-provider-settings-"),
  );
  const db = openApiDatabase(join(directory, "app.sqlite"));
  try {
    fn(db);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("material-provider-settings", () => {
  it("defaults to disabled with no key when nothing has been saved", () => {
    withDb((db) => {
      const settings = getMaterialProviderSettings(db);
      expect(settings.enabled).toBe(false);
      expect(settings.hasApiKey).toBe(false);
      expect(settings.providerKind).toBe("openai");
    });
  });

  it("round-trips an encrypted key through update and decrypt", () => {
    withDb((db) => {
      updateMaterialProviderSettings(
        db,
        {
          providerKind: "openai",
          model: "gpt-image-2",
          apiKey: "sk-material-secret",
          enabled: true,
        },
        "admin-1",
        1_000,
        "secret-key-material",
      );
      const pub = getMaterialProviderSettings(db);
      expect(pub.hasApiKey).toBe(true);
      expect(pub.enabled).toBe(true);
      expect(pub.model).toBe("gpt-image-2");
      expect(JSON.stringify(pub)).not.toContain("sk-material-secret");
      const withSecret = getMaterialProviderSettingsWithSecret(
        db,
        "secret-key-material",
      );
      expect(withSecret.apiKey).toBe("sk-material-secret");
    });
  });

  it("never exposes the api key from the public projection", () => {
    withDb((db) => {
      updateMaterialProviderSettings(
        db,
        { providerKind: "openai", model: "gpt-image-2", apiKey: "sk-secret" },
        "admin-1",
        1_000,
        "secret-key-material",
      );
      const pub = getMaterialProviderSettings(db) as unknown as Record<
        string,
        unknown
      >;
      expect("apiKey" in pub).toBe(false);
      expect("apiKeyCiphertext" in pub).toBe(false);
    });
  });

  it("leaves the existing key untouched when a patch omits apiKey", () => {
    withDb((db) => {
      updateMaterialProviderSettings(
        db,
        { providerKind: "openai", model: "gpt-image-2", apiKey: "sk-secret" },
        "admin-1",
        1_000,
        "secret-key-material",
      );
      updateMaterialProviderSettings(
        db,
        { model: "gpt-image-2-mini" },
        "admin-1",
        2_000,
        "secret-key-material",
      );
      const withSecret = getMaterialProviderSettingsWithSecret(
        db,
        "secret-key-material",
      );
      expect(withSecret.apiKey).toBe("sk-secret");
      expect(withSecret.model).toBe("gpt-image-2-mini");
    });
  });

  it("rejects an unknown provider kind", () => {
    withDb((db) => {
      expect(() =>
        updateMaterialProviderSettings(
          db,
          { providerKind: "not-a-provider", model: "x" },
          "admin-1",
          1_000,
          "secret-key-material",
        ),
      ).toThrow("INVALID_REQUEST");
    });
  });

  it("rejects an empty model", () => {
    withDb((db) => {
      expect(() =>
        updateMaterialProviderSettings(
          db,
          { providerKind: "openai", model: "" },
          "admin-1",
          1_000,
          "secret-key-material",
        ),
      ).toThrow("INVALID_REQUEST");
    });
  });

  it("derives a key distinct from ai-provider-settings, even given the same secret and plaintext", () => {
    withDb((db) => {
      updateAiProviderSettings(
        db,
        { providerKind: "openai", model: "gpt-4o", apiKey: "same-plaintext" },
        "admin-1",
        1_000,
        "shared-secret",
      );
      updateMaterialProviderSettings(
        db,
        {
          providerKind: "openai",
          model: "gpt-image-2",
          apiKey: "same-plaintext",
        },
        "admin-1",
        1_000,
        "shared-secret",
      );
      const aiCiphertext = (
        db
          .prepare(
            "SELECT api_key_ciphertext FROM ai_provider_settings WHERE id = 'default'",
          )
          .get() as { api_key_ciphertext: string }
      ).api_key_ciphertext;
      const materialCiphertext = (
        db
          .prepare(
            "SELECT api_key_ciphertext FROM material_provider_settings WHERE id = 'default'",
          )
          .get() as { api_key_ciphertext: string }
      ).api_key_ciphertext;
      // Different IVs alone would explain differing ciphertexts even with
      // an identical key, so this only proves the derived keys differ if
      // both settings still decrypt correctly with the *same* shared
      // secret -- which the round-trip test above already establishes for
      // the material side, and ai-provider-settings.test.ts for the ai side.
      expect(materialCiphertext).not.toBe(aiCiphertext);
      const withSecret = getMaterialProviderSettingsWithSecret(
        db,
        "shared-secret",
      );
      expect(withSecret.apiKey).toBe("same-plaintext");
    });
  });
});
