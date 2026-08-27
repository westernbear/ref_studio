import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { getMaterialProviderSettingsWithSecret } from "./material-provider-settings.js";

// The API-side half of the image material seam: apps/worker cannot reach
// OpenAI directly (see docker-compose.yml -- worker-internal is `internal:
// true`, so only api-relay bridges out, and it proxies solely to this API),
// so the vendor call happens here, where the encrypted key lives, and the
// worker asks for finished bytes over the relay it already trusts.
//
// gpt-image-2 is GA, but transparent background is documented (as of this
// writing) as a preview capability layered on top of it -- so a refusal or
// an opaque result is treated as this provider failing outright, never as
// "close enough to composite". There is no fallback and no placeholder:
// same fail-closed stance as safety-check.ts.
export class MaterialProviderError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "MaterialProviderError";
    this.code = code;
  }
}

export type GeneratedImageMaterial = Readonly<{
  bytes: Uint8Array;
  contentType: "image/png";
  provenance: Readonly<{
    tool: string;
    prompt: string;
    seed?: number;
    sha256: string;
  }>;
}>;

// Narrow view of the vendor call, injectable for tests -- mirrors
// safety-check.ts's GenerateSafetyVerdict and translate-evidence.ts's
// GenerateTranslation. No test may ever reach the real network through
// this seam.
export type GenerateImage = (options: {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
  readonly size: "1024x1024" | "1536x1024" | "1024x1536";
}) => Promise<{
  // Base64-encoded image bytes, exactly as the vendor returned them.
  readonly b64: string;
}>;

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

const defaultGenerateImage: GenerateImage = async ({
  apiKey,
  model,
  prompt,
  size,
}) => {
  const response = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      background: "transparent",
      output_format: "png",
    }),
  });
  if (!response.ok) throw new Error(`OPENAI_IMAGE_REQUEST_FAILED_${response.status}`);
  const body = (await response.json()) as {
    readonly data?: readonly { readonly b64_json?: string }[];
  };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("OPENAI_IMAGE_RESPONSE_EMPTY");
  return { b64 };
};

// Picks the closest of the three sizes the Images API accepts (no arbitrary
// dimensions) to the scene canvas's aspect ratio, so a portrait or
// landscape canvas doesn't get material generated for the wrong shape.
export const sizeForCanvas = (
  canvas: Readonly<{ width: number; height: number }>,
): "1024x1024" | "1536x1024" | "1024x1536" => {
  const ratio = canvas.width / canvas.height;
  if (ratio > 1.1) return "1536x1024";
  if (ratio < 0.9) return "1024x1536";
  return "1024x1024";
};

// PNG signature (8 bytes) + IHDR chunk: 4-byte length, 4-byte type "IHDR",
// 4-byte width, 4-byte height, 1-byte bit depth, then 1-byte colour type at
// offset 25. Colour type 4 (greyscale+alpha) and 6 (RGBA) carry an alpha
// channel; 0, 2 and 3 never do. Reading this header is enough to tell
// whether the vendor actually honoured `background: "transparent"` --
// decoding the whole image is not needed for that question. Plain
// Uint8Array indexing throughout, not Buffer methods: see node-shims.d.ts's
// deliberately narrow Buffer type.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const pngHasAlpha = (bytes: Uint8Array): boolean => {
  if (bytes.byteLength < 26) return false;
  for (const [index, expected] of PNG_SIGNATURE.entries())
    if (bytes[index] !== expected) return false;
  const chunkType = String.fromCharCode(
    bytes[12] ?? 0,
    bytes[13] ?? 0,
    bytes[14] ?? 0,
    bytes[15] ?? 0,
  );
  if (chunkType !== "IHDR") return false;
  const colorType = bytes[25];
  return colorType === 4 || colorType === 6;
};

export async function generateImageMaterial(params: {
  readonly db: Database.Database;
  readonly aiSecretKey: string;
  readonly prompt: string;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly generate?: GenerateImage;
}): Promise<GeneratedImageMaterial> {
  const settings = getMaterialProviderSettingsWithSecret(
    params.db,
    params.aiSecretKey,
  );
  if (!settings.enabled || !settings.apiKey)
    throw new MaterialProviderError("MATERIAL_PROVIDER_NOT_CONFIGURED");
  const generate = params.generate ?? defaultGenerateImage;
  let result: Awaited<ReturnType<GenerateImage>>;
  try {
    result = await generate({
      apiKey: settings.apiKey,
      model: settings.model,
      prompt: params.prompt,
      size: sizeForCanvas(params.canvas),
    });
  } catch {
    throw new MaterialProviderError("MATERIAL_GENERATION_FAILED");
  }
  const bytes = Buffer.from(result.b64, "base64");
  // A refusal (empty bytes) and an opaque result (no alpha channel) are the
  // same failure from this pipeline's point of view: neither is material
  // this seam may hand back as "generated with a transparent background".
  if (bytes.byteLength === 0 || !pngHasAlpha(bytes))
    throw new MaterialProviderError("MATERIAL_TRANSPARENCY_UNAVAILABLE");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    contentType: "image/png",
    provenance: {
      // The vendor's images endpoint does not echo back a per-response
      // model snapshot, so the identifier is the admin-configured model
      // string -- pinning it to a dated snapshot (rather than a rolling
      // alias) is how an operator gets a reproducible `tool` value.
      tool: `openai:${settings.model}`,
      prompt: params.prompt,
      sha256,
    },
  };
}
