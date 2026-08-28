import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import {
  getMaterialProviderSettingsWithSecret,
  updateMaterialProviderSettings,
} from "./material-provider-settings.js";
import {
  CODEX_IMAGE_MODEL,
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
  constructor(message: string) {
    super(message);
    this.name = "MaterialProviderError";
    // The token only, so callers matching on `code` are unaffected by a
    // detail appended to the message.
    this.code = message.split(":")[0] ?? message;
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
    // The console's model, when it names one -- the picker offers only
    // models this path can actually run, so an operator who chose one gets
    // that one, and the provenance says which.
    const codexModel = settings.model || CODEX_IMAGE_MODEL;
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
      // Carries what the provider said. A bare token cost this repository
      // a live debugging session to learn the endpoint had been answering
      // "Input must be a list" the whole time.
      throw new MaterialProviderError(
        cause instanceof CodexOAuthError
          ? `MATERIAL_GENERATION_FAILED: ${cause.message}`
          : "MATERIAL_GENERATION_FAILED",
      );
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
