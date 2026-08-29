import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import type Database from "better-sqlite3";
import {
  getMaterialProviderSettingsWithSecret,
  updateMaterialProviderSettings,
} from "./material-provider-settings.js";
import {
  CodexOAuthError,
  generateCodexImage,
  parseCodexAuth,
  type CodexAuth,
} from "./codex-oauth.js";

// Writes a rotated credential straight back to the settings row. Not part
// of the admin console's update path: this is the system refreshing its own
// token, not an operator changing a setting, so it records no audit event
// and touches nothing else on the row.
const persistRefreshedCodexAuth = (
  db: Database.Database,
  aiSecretKey: string,
  auth: CodexAuth,
): void => {
  updateMaterialProviderSettings(
    db,
    { apiKey: JSON.stringify(auth) },
    "system:codex-refresh",
    Date.now(),
    aiSecretKey,
  );
};

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
  if (!response.ok)
    throw new Error(`OPENAI_IMAGE_REQUEST_FAILED_${response.status}`);
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
// channel; 0, 2 and 3 never do. Plain Uint8Array indexing throughout, not
// Buffer methods: see node-shims.d.ts's deliberately narrow Buffer type.
//
// The header alone used to be the whole check, on the reasoning that an
// alpha channel is what `background: "transparent"` produces. It is not: a
// fully opaque image is routinely encoded as RGBA, and the Codex backend
// rejects the transparent-background request outright while still answering
// with colour type 6. So the header passed and the renderer composited a
// solid rectangle over the scene. The pixels decide now, and the header is
// only the cheap way to stop early.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const be32 = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] ?? 0) << 24) |
  ((bytes[at + 1] ?? 0) << 16) |
  ((bytes[at + 2] ?? 0) << 8) |
  (bytes[at + 3] ?? 0);
const chunkTypeAt = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(
    bytes[at] ?? 0,
    bytes[at + 1] ?? 0,
    bytes[at + 2] ?? 0,
    bytes[at + 3] ?? 0,
  );

// Paeth, from the PNG spec. Named rather than inlined because it is the one
// filter whose result is not obvious from reading it.
const paeth = (left: number, above: number, corner: number): number => {
  const estimate = left + above - corner;
  const dLeft = Math.abs(estimate - left);
  const dAbove = Math.abs(estimate - above);
  const dCorner = Math.abs(estimate - corner);
  if (dLeft <= dAbove && dLeft <= dCorner) return left;
  return dAbove <= dCorner ? above : corner;
};

// True as soon as one pixel is not fully opaque. Fails closed: a PNG this
// cannot decode -- 16-bit, interlaced, a broken chunk stream -- is answered
// no, so the job stops by name instead of shipping a picture nobody checked.
const hasTransparentPixel = (bytes: Uint8Array, colorType: number): boolean => {
  const width = be32(bytes, 16);
  const height = be32(bytes, 20);
  if (bytes[24] !== 8 || bytes[28] !== 0) return false;
  if (width < 1 || height < 1) return false;
  const parts: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.byteLength; ) {
    const length = be32(bytes, at);
    const type = chunkTypeAt(bytes, at + 4);
    const from = at + 8;
    if (from + length > bytes.byteLength) return false;
    if (type === "IDAT") parts.push(bytes.subarray(from, from + length));
    if (type === "IEND") break;
    at = from + length + 4;
  }
  if (parts.length === 0) return false;
  let pixels: Uint8Array;
  try {
    pixels = inflateSync(Buffer.concat(parts.map((part) => Buffer.from(part))));
  } catch {
    return false;
  }
  const channels = colorType === 6 ? 4 : 2;
  const stride = width * channels;
  if (pixels.byteLength < (stride + 1) * height) return false;
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  let read = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = pixels[read] ?? 0;
    read += 1;
    for (let index = 0; index < stride; index += 1) {
      const raw = pixels[read + index] ?? 0;
      const left = index >= channels ? (current[index - channels] ?? 0) : 0;
      const above = previous[index] ?? 0;
      const corner = index >= channels ? (previous[index - channels] ?? 0) : 0;
      const value =
        filter === 0
          ? raw
          : filter === 1
            ? raw + left
            : filter === 2
              ? raw + above
              : filter === 3
                ? raw + ((left + above) >> 1)
                : filter === 4
                  ? raw + paeth(left, above, corner)
                  : -1;
      if (value < 0) return false;
      current[index] = value & 0xff;
    }
    read += stride;
    for (let index = channels - 1; index < stride; index += channels)
      if ((current[index] ?? 255) < 255) return true;
    previous.set(current);
  }
  return false;
};

export const pngHasAlpha = (bytes: Uint8Array): boolean => {
  if (bytes.byteLength < 33) return false;
  for (const [index, expected] of PNG_SIGNATURE.entries())
    if (bytes[index] !== expected) return false;
  if (chunkTypeAt(bytes, 12) !== "IHDR") return false;
  const colorType = bytes[25];
  if (colorType !== 4 && colorType !== 6) return false;
  return hasTransparentPixel(bytes, colorType);
};

export async function generateImageMaterial(params: {
  readonly db: Database.Database;
  readonly aiSecretKey: string;
  readonly prompt: string;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly generate?: GenerateImage;
  readonly generateCodex?: typeof generateCodexImage;
}): Promise<GeneratedImageMaterial> {
  const settings = getMaterialProviderSettingsWithSecret(
    params.db,
    params.aiSecretKey,
  );
  if (!settings.enabled || !settings.apiKey)
    throw new MaterialProviderError("MATERIAL_PROVIDER_NOT_CONFIGURED");
  const size = sizeForCanvas(params.canvas);
  // Two ways to authenticate the same generator. The platform key path is
  // the supported one; codex-oauth spends a ChatGPT subscription instead
  // and carries its own caveats (see codex-oauth.ts). They differ only in
  // how the bytes are obtained -- the transparency check, the hashing and
  // the provenance below are common to both, because "did we actually get
  // compositable material" is the same question either way.
  let result: Awaited<ReturnType<GenerateImage>>;
  let tool: string;
  if (settings.providerKind === "codex-oauth") {
    // The console's model. The picker offers what the account's registry
    // lists, which on this path is a Codex model hosting the
    // image_generation tool -- there is no image model to fall back to.
    const codexModel = settings.model;
    tool = `codex-oauth:${codexModel}`;
    let generated: Awaited<ReturnType<typeof generateCodexImage>>;
    try {
      generated = await (params.generateCodex ?? generateCodexImage)({
        auth: parseCodexAuth(settings.apiKey),
        prompt: params.prompt,
        size,
        model: codexModel,
      });
    } catch (cause) {
      // A malformed or revoked credential is not the same failure as a
      // model that would not draw the thing, and an operator can only fix
      // the first -- so it keeps its own name instead of collapsing into
      // MATERIAL_GENERATION_FAILED.
      if (
        cause instanceof CodexOAuthError &&
        cause.code === "CODEX_AUTH_MALFORMED"
      )
        throw new MaterialProviderError("MATERIAL_PROVIDER_NOT_CONFIGURED");
      throw new MaterialProviderError("MATERIAL_GENERATION_FAILED");
    }
    // Access tokens last hours. A refresh that is not written back means
    // every subsequent asset pays for another one, and the rotated refresh
    // token is lost the moment the old one stops working.
    if (generated.refreshedAuth)
      persistRefreshedCodexAuth(
        params.db,
        params.aiSecretKey,
        generated.refreshedAuth,
      );
    result = { b64: generated.b64 };
  } else {
    tool = `openai:${settings.model}`;
    const generate = params.generate ?? defaultGenerateImage;
    try {
      result = await generate({
        apiKey: settings.apiKey,
        model: settings.model,
        prompt: params.prompt,
        size,
      });
    } catch {
      throw new MaterialProviderError("MATERIAL_GENERATION_FAILED");
    }
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
      // alias) is how an operator gets a reproducible `tool` value. The
      // codex-oauth path names its own model instead: the console's `model`
      // field addresses the responses model there, not the image one.
      tool,
      prompt: params.prompt,
      sha256,
    },
  };
}
