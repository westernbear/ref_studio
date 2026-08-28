import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateImageMaterial,
  MaterialProviderError,
  pngHasAlpha,
  sizeForCanvas,
} from "./openai-image-material.js";
import {
  getMaterialProviderSettingsWithSecret,
  updateMaterialProviderSettings,
} from "./material-provider-settings.js";
import { openApiDatabase } from "./durable-state.js";

const withDb = (fn: (db: ReturnType<typeof openApiDatabase>) => void): void => {
  const directory = mkdtempSync(join(tmpdir(), "rvs-openai-image-material-"));
  const db = openApiDatabase(join(directory, "app.sqlite"));
  try {
    fn(db);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
};

// Only the signature + IHDR header matter to pngHasAlpha/generateImageMaterial
// -- neither decodes pixel data -- so these fixtures are minimal, not valid,
// full PNGs.
const pngHeader = (colorType: number): Buffer => {
  const buffer = Buffer.alloc(33);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt8(8, 24); // bit depth
  buffer.writeUInt8(colorType, 25);
  return buffer;
};
const rgbaPng = pngHeader(6);
const rgbPng = pngHeader(2);

const enableProvider = (
  db: ReturnType<typeof openApiDatabase>,
  model = "gpt-image-2",
): void => {
  updateMaterialProviderSettings(
    db,
    { providerKind: "openai", model, apiKey: "sk-test", enabled: true },
    "admin-1",
    1_000,
    "secret-key-material",
  );
};

const CODEX_AUTH = JSON.stringify({
  auth_mode: "chatgpt",
  tokens: {
    access_token: "access-one",
    refresh_token: "refresh-one",
    account_id: "acct-1",
  },
});

const enableCodexProvider = (
  db: ReturnType<typeof openApiDatabase>,
  authJson = CODEX_AUTH,
): void => {
  updateMaterialProviderSettings(
    db,
    {
      providerKind: "codex-oauth",
      model: "gpt-5",
      apiKey: authJson,
      enabled: true,
    },
    "admin-1",
    1_000,
    "secret-key-material",
  );
};

describe("sizeForCanvas", () => {
  it("picks landscape, portrait and square by aspect ratio", () => {
    expect(sizeForCanvas({ width: 1920, height: 1080 })).toBe("1536x1024");
    expect(sizeForCanvas({ width: 1080, height: 1920 })).toBe("1024x1536");
    expect(sizeForCanvas({ width: 1024, height: 1024 })).toBe("1024x1024");
  });
});

describe("pngHasAlpha", () => {
  it("is true for RGBA (color type 6) and grey+alpha (color type 4)", () => {
    expect(pngHasAlpha(rgbaPng)).toBe(true);
    expect(pngHasAlpha(pngHeader(4))).toBe(true);
  });

  it("is false for RGB, indexed, greyscale, and garbage bytes", () => {
    expect(pngHasAlpha(rgbPng)).toBe(false);
    expect(pngHasAlpha(pngHeader(3))).toBe(false);
    expect(pngHasAlpha(pngHeader(0))).toBe(false);
    expect(pngHasAlpha(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(pngHasAlpha(new Uint8Array())).toBe(false);
  });
});

describe("generateImageMaterial", () => {
  const canvas = { width: 1080, height: 1920 };

  it("fails closed when the provider is not configured", async () => {
    await withDb(async (db) => {
      await expect(
        generateImageMaterial({
          db,
          aiSecretKey: "secret-key-material",
          prompt: "a dark studio backdrop",
          canvas,
        }),
      ).rejects.toThrow(MaterialProviderError);
    });
  });

  it("fails closed when configured but disabled", async () => {
    await withDb(async (db) => {
      updateMaterialProviderSettings(
        db,
        { providerKind: "openai", model: "gpt-image-2", apiKey: "sk-test" },
        "admin-1",
        1_000,
        "secret-key-material",
      );
      const error = await generateImageMaterial({
        db,
        aiSecretKey: "secret-key-material",
        prompt: "x",
        canvas,
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(MaterialProviderError);
      expect((error as MaterialProviderError).code).toBe(
        "MATERIAL_PROVIDER_NOT_CONFIGURED",
      );
    });
  });

  it("fails closed when the vendor call throws", async () => {
    await withDb(async (db) => {
      enableProvider(db);
      const error = await generateImageMaterial({
        db,
        aiSecretKey: "secret-key-material",
        prompt: "x",
        canvas,
        generate: async () => {
          throw new Error("network down");
        },
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(MaterialProviderError);
      expect((error as MaterialProviderError).code).toBe(
        "MATERIAL_GENERATION_FAILED",
      );
    });
  });

  it("fails closed on a refusal (empty bytes) rather than compositing nothing", async () => {
    await withDb(async (db) => {
      enableProvider(db);
      const error = await generateImageMaterial({
        db,
        aiSecretKey: "secret-key-material",
        prompt: "x",
        canvas,
        generate: async () => ({ b64: "" }),
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(MaterialProviderError);
      expect((error as MaterialProviderError).code).toBe(
        "MATERIAL_TRANSPARENCY_UNAVAILABLE",
      );
    });
  });

  it("fails closed on an opaque image instead of compositing a rectangle", async () => {
    await withDb(async (db) => {
      enableProvider(db);
      const error = await generateImageMaterial({
        db,
        aiSecretKey: "secret-key-material",
        prompt: "x",
        canvas,
        generate: async () => ({ b64: rgbPng.toString("base64") }),
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(MaterialProviderError);
      expect((error as MaterialProviderError).code).toBe(
        "MATERIAL_TRANSPARENCY_UNAVAILABLE",
      );
    });
  });

  it("returns transparent PNG bytes with matching provenance on success", async () => {
    await withDb(async (db) => {
      enableProvider(db, "gpt-image-2-2026-01-01");
      let sawSize: string | undefined;
      const material = await generateImageMaterial({
        db,
        aiSecretKey: "secret-key-material",
        prompt: "a dark studio backdrop",
        canvas,
        generate: async (options) => {
          sawSize = options.size;
          expect(options.apiKey).toBe("sk-test");
          expect(options.model).toBe("gpt-image-2-2026-01-01");
          expect(options.prompt).toBe("a dark studio backdrop");
          return { b64: rgbaPng.toString("base64") };
        },
      });
      expect(sawSize).toBe("1024x1536");
      expect(material.contentType).toBe("image/png");
      expect(material.bytes).toEqual(rgbaPng);
      expect(material.provenance).toEqual({
        tool: "openai:gpt-image-2-2026-01-01",
        prompt: "a dark studio backdrop",
        sha256: createHash("sha256").update(rgbaPng).digest("hex"),
      });
      expect(material.provenance.seed).toBeUndefined();
    });
  });
});

// The second way to authenticate the same generator: a ChatGPT
// subscription instead of a platform key. Everything after the bytes
// arrive -- the transparency check, the hash, the provenance -- is shared,
// because "did we get compositable material" is the same question.
describe("the codex-oauth path", () => {
  it("generates through the codex seam and names it in provenance", async () => {
    await withDb(async (db) => {
      enableCodexProvider(db);
      let sawSize: string | undefined;
      const material = await generateImageMaterial({
        db,
        aiSecretKey: "secret-key-material",
        prompt: "a gold ambient glow",
        canvas,
        generate: async () => {
          throw new Error("the platform key path must not run");
        },
        generateCodex: async (options) => {
          sawSize = options.size;
          expect(options.auth.tokens.access_token).toBe("access-one");
          expect(options.prompt).toBe("a gold ambient glow");
          return { b64: rgbaPng.toString("base64") };
        },
      });
      expect(sawSize).toBe("1024x1536");
      // Names the image model, not the console's `model` field -- that one
      // addresses the responses model on this path.
      expect(material.provenance.tool).toBe("codex-oauth:gpt-image-2");
      expect(material.bytes).toEqual(rgbaPng);
    });
  });

  // Access tokens last hours. A refresh that is not written back means
  // paying for another one on every asset, and losing the rotated refresh
  // token the moment the old one stops working.
  it("writes a refreshed credential back to the settings row", async () => {
    await withDb(async (db) => {
      enableCodexProvider(db);
      await generateImageMaterial({
        db,
        aiSecretKey: "secret-key-material",
        prompt: "a gold ambient glow",
        canvas,
        generateCodex: async (options) => ({
          b64: rgbaPng.toString("base64"),
          refreshedAuth: {
            ...options.auth,
            tokens: { ...options.auth.tokens, access_token: "access-two" },
          },
        }),
      });
      const stored = getMaterialProviderSettingsWithSecret(
        db,
        "secret-key-material",
      );
      expect(JSON.parse(stored.apiKey ?? "{}").tokens.access_token).toBe(
        "access-two",
      );
      // Only the credential moved. Nothing else on the row is the system's
      // to change while refreshing its own token.
      expect(stored.providerKind).toBe("codex-oauth");
      expect(stored.enabled).toBe(true);
      expect(stored.model).toBe("gpt-5");
    });
  });

  it("leaves the credential alone when nothing was refreshed", async () => {
    await withDb(async (db) => {
      enableCodexProvider(db);
      await generateImageMaterial({
        db,
        aiSecretKey: "secret-key-material",
        prompt: "x",
        canvas,
        generateCodex: async () => ({ b64: rgbaPng.toString("base64") }),
      });
      expect(
        getMaterialProviderSettingsWithSecret(db, "secret-key-material").apiKey,
      ).toBe(CODEX_AUTH);
    });
  });

  // A credential that is not a credential is something an operator can go
  // and fix; a model that would not draw the thing is not. They must not
  // arrive as the same failure.
  it("reports an unusable credential as not configured, not as a failed generation", async () => {
    await withDb(async (db) => {
      enableCodexProvider(db, "not an auth.json");
      await expect(
        generateImageMaterial({
          db,
          aiSecretKey: "secret-key-material",
          prompt: "x",
          canvas,
          generateCodex: async () => {
            throw new Error("must not be called");
          },
        }),
      ).rejects.toThrow(/MATERIAL_PROVIDER_NOT_CONFIGURED/);
    });
  });

  it("fails closed when the codex call throws", async () => {
    await withDb(async (db) => {
      enableCodexProvider(db);
      await expect(
        generateImageMaterial({
          db,
          aiSecretKey: "secret-key-material",
          prompt: "x",
          canvas,
          generateCodex: async () => {
            throw new Error("CODEX_REQUEST_FAILED_429");
          },
        }),
      ).rejects.toThrow(/MATERIAL_GENERATION_FAILED/);
    });
  });

  it("still refuses an opaque image on this path too", async () => {
    await withDb(async (db) => {
      enableCodexProvider(db);
      await expect(
        generateImageMaterial({
          db,
          aiSecretKey: "secret-key-material",
          prompt: "x",
          canvas,
          generateCodex: async () => ({ b64: rgbPng.toString("base64") }),
        }),
      ).rejects.toThrow(/MATERIAL_TRANSPARENCY_UNAVAILABLE/);
    });
  });
});
