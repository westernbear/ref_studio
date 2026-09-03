import type Database from "better-sqlite3";
import { decryptSecret, encryptSecret } from "./secret-cipher.js";

// Deliberately its own row, not a reuse of ai_provider_settings: a studio
// may well use one vendor for scene authoring (text) and a different one
// for generated image/video/font material. Only OpenAI is wired today --
// see openai-image-material.ts -- but the shape leaves room for more.
// "openai" authenticates with a platform API key; "codex-oauth" with the
// ChatGPT OAuth credentials the Codex CLI writes to ~/.codex/auth.json (see
// codex-oauth.ts, which carries what an operator has to accept before
// choosing it). Both put their secret in the same encrypted column -- one a
// key, the other the auth.json blob.
export const MATERIAL_PROVIDER_KINDS = ["openai", "codex-oauth"] as const;
export type MaterialProviderKind = (typeof MATERIAL_PROVIDER_KINDS)[number];

export type MaterialProviderSettingsPublic = {
  readonly providerKind: MaterialProviderKind;
  readonly model: string;
  readonly enabled: boolean;
  readonly hasApiKey: boolean;
  // The two self-hosted generators, addressed rather than keyed: they run
  // on the worker's own private network and have no credential. Null means
  // this deployment has no such service, and the matching material kind
  // then refuses by name. Unlike the 2D provider above, these are not a
  // prerequisite for the generate track -- a scene that asks for neither
  // video nor object-form material never touches them.
  readonly videoBaseUrl: string | null;
  readonly model3dBaseUrl: string | null;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

type Row = {
  provider_kind: MaterialProviderKind;
  model: string;
  api_key_ciphertext: string | null;
  enabled: number;
  video_base_url: string | null;
  model3d_base_url: string | null;
  updated_at: string;
  updated_by: string;
};

const DEFAULT_SETTINGS: MaterialProviderSettingsPublic = {
  providerKind: "openai",
  model: "",
  enabled: false,
  hasApiKey: false,
  videoBaseUrl: null,
  model3dBaseUrl: null,
  updatedAt: new Date(0).toISOString(),
  updatedBy: "system",
};

const SETTINGS_SALT = "rvs-material-provider-settings";

const toPublic = (row: Row): MaterialProviderSettingsPublic => ({
  providerKind: row.provider_kind,
  model: row.model,
  enabled: row.enabled === 1,
  hasApiKey: row.api_key_ciphertext !== null,
  videoBaseUrl: row.video_base_url,
  model3dBaseUrl: row.model3d_base_url,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});

const readRow = (db: Database.Database): Row | undefined =>
  db
    .prepare(
      `SELECT provider_kind, model, api_key_ciphertext, enabled, video_base_url, model3d_base_url, updated_at, updated_by
         FROM material_provider_settings WHERE id = 'default'`,
    )
    .get() as Row | undefined;

export function getMaterialProviderSettings(
  db: Database.Database,
): MaterialProviderSettingsPublic {
  const row = readRow(db);
  return row ? toPublic(row) : DEFAULT_SETTINGS;
}

export function getMaterialProviderSettingsWithSecret(
  db: Database.Database,
  secretKey: string,
): MaterialProviderSettingsPublic & { readonly apiKey: string | null } {
  const row = readRow(db);
  if (!row) return { ...DEFAULT_SETTINGS, apiKey: null };
  return {
    ...toPublic(row),
    apiKey: row.api_key_ciphertext
      ? decryptSecret(row.api_key_ciphertext, secretKey, SETTINGS_SALT)
      : null,
  };
}

export type MaterialProviderSettingsPatch = {
  readonly providerKind?: string;
  readonly model?: string;
  readonly apiKey?: string;
  readonly enabled?: boolean;
  // An empty string clears the endpoint (the console's way of saying "this
  // deployment has no such service"); undefined leaves it as it was.
  readonly videoBaseUrl?: string;
  readonly model3dBaseUrl?: string;
};

export function updateMaterialProviderSettings(
  db: Database.Database,
  patch: MaterialProviderSettingsPatch,
  actor: string,
  now: number,
  secretKey: string,
): MaterialProviderSettingsPublic {
  const existing = readRow(db);
  const providerKind = (patch.providerKind ??
    existing?.provider_kind ??
    DEFAULT_SETTINGS.providerKind) as string;
  if (!(MATERIAL_PROVIDER_KINDS as readonly string[]).includes(providerKind))
    throw new Error("INVALID_REQUEST");
  const model = patch.model ?? existing?.model ?? "";
  if (model.length < 1 || model.length > 200)
    throw new Error("INVALID_REQUEST");
  const enabled = patch.enabled ?? existing?.enabled === 1;
  const apiKeyCiphertext =
    patch.apiKey && patch.apiKey.length > 0
      ? encryptSecret(patch.apiKey, secretKey, SETTINGS_SALT)
      : (existing?.api_key_ciphertext ?? null);
  // An empty string clears the endpoint, a URL sets it, undefined leaves
  // it alone. Validated here rather than only in the console, because the
  // worker dials whatever this returns.
  const endpoint = (
    patch: string | undefined,
    existing: string | null | undefined,
  ): string | null => {
    if (patch === undefined) return existing ?? null;
    if (patch === "") return null;
    try {
      const url = new URL(patch);
      if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error("INVALID_REQUEST");
    } catch {
      throw new Error("INVALID_REQUEST");
    }
    return patch;
  };
  const videoBaseUrl = endpoint(patch.videoBaseUrl, existing?.video_base_url);
  const model3dBaseUrl = endpoint(
    patch.model3dBaseUrl,
    existing?.model3d_base_url,
  );
  const updatedAt = new Date(now).toISOString();
  db.prepare(
    `INSERT INTO material_provider_settings
       (id, provider_kind, model, api_key_ciphertext, enabled, video_base_url, model3d_base_url, updated_at, updated_by)
     VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider_kind = excluded.provider_kind,
       model = excluded.model,
       api_key_ciphertext = excluded.api_key_ciphertext,
       enabled = excluded.enabled,
       video_base_url = excluded.video_base_url,
       model3d_base_url = excluded.model3d_base_url,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).run(
    providerKind,
    model,
    apiKeyCiphertext,
    enabled ? 1 : 0,
    videoBaseUrl,
    model3dBaseUrl,
    updatedAt,
    actor,
  );
  return getMaterialProviderSettings(db);
}
