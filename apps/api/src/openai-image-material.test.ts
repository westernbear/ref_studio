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
import { updateMaterialProviderSettings } from "./material-provider-settings.js";
import { openApiDatabase } from "./durable-state.js";

const withDb = (
  fn: (db: ReturnType<typeof openApiDatabase>) => void,
): void => {
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
  buffer.set(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    0,
  );
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
