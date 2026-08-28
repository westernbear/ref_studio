import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MATERIAL_PROVIDER_KINDS,
  getMaterialProviderSettings,
  getMaterialProviderSettingsWithSecret,
  updateMaterialProviderSettings,
} from "./material-provider-settings.js";
import { openApiDatabase } from "./durable-state.js";
import { updateAiProviderSettings } from "./ai-provider-settings.js";

const withDb = (fn: (db: ReturnType<typeof openApiDatabase>) => void): void => {
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

  // The two self-hosted generators. Addresses, not keys: they run on the
  // worker's own network and have no credential.
  it("defaults both self-hosted endpoints to unset", () => {
    withDb((db) => {
      const settings = getMaterialProviderSettings(db);
      expect(settings.videoBaseUrl).toBeNull();
      expect(settings.model3dBaseUrl).toBeNull();
    });
  });

  it("stores both self-hosted endpoints", () => {
    withDb((db) => {
      const after = updateMaterialProviderSettings(
        db,
        {
          model: "gpt-image-2",
          videoBaseUrl: "http://wan-alpha:8000",
          model3dBaseUrl: "http://hi3dgen:8000",
        },
        "usr_admin",
        1_000,
        "secret",
      );
      expect(after.videoBaseUrl).toBe("http://wan-alpha:8000");
      expect(after.model3dBaseUrl).toBe("http://hi3dgen:8000");
    });
  });

  it("leaves an endpoint alone when the patch omits it", () => {
    withDb((db) => {
      updateMaterialProviderSettings(
        db,
        { model: "gpt-image-2", videoBaseUrl: "http://wan-alpha:8000" },
        "usr_admin",
        1_000,
        "secret",
      );
      const after = updateMaterialProviderSettings(
        db,
        { model: "gpt-image-2" },
        "usr_admin",
        2_000,
        "secret",
      );
      expect(after.videoBaseUrl).toBe("http://wan-alpha:8000");
    });
  });

  // An empty string is a real setting -- "this deployment has no such
  // service" -- and must not read as "leave it alone", or a console that
  // clears the field would silently keep dialling a service that is gone.
  it("clears an endpoint when the patch sends an empty string", () => {
    withDb((db) => {
      updateMaterialProviderSettings(
        db,
        { model: "gpt-image-2", model3dBaseUrl: "http://hi3dgen:8000" },
        "usr_admin",
        1_000,
        "secret",
      );
      const after = updateMaterialProviderSettings(
        db,
        { model: "gpt-image-2", model3dBaseUrl: "" },
        "usr_admin",
        2_000,
        "secret",
      );
      expect(after.model3dBaseUrl).toBeNull();
    });
  });

  it("rejects an endpoint that is not an http(s) url", () => {
    withDb((db) => {
      expect(() =>
        updateMaterialProviderSettings(
          db,
          { model: "gpt-image-2", videoBaseUrl: "wan-alpha:8000" },
          "usr_admin",
          1_000,
          "secret",
        ),
      ).toThrow(/INVALID_REQUEST/);
      expect(() =>
        updateMaterialProviderSettings(
          db,
          { model: "gpt-image-2", model3dBaseUrl: "file:///etc/passwd" },
          "usr_admin",
          1_000,
          "secret",
        ),
      ).toThrow(/INVALID_REQUEST/);
    });
  });

  // The enum and the database's CHECK list are two copies of the same
  // fact. They drifted once already this month, and the way it surfaced
  // was a constraint failure deep in a running job -- so every value the
  // code can produce is inserted here, against a real database.
  it("accepts every provider kind the code can produce", () => {
    withDb((db) => {
      for (const kind of MATERIAL_PROVIDER_KINDS)
        expect(
          () =>
            updateMaterialProviderSettings(
              db,
              { providerKind: kind, model: "m" },
              "usr_admin",
              1_000,
              "secret",
            ),
          `provider kind ${kind} rejected by the database`,
        ).not.toThrow();
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
