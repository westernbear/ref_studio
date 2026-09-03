import type Database from "better-sqlite3";
import { parseCodexAuth } from "./codex-oauth.js";
import { decryptSecret, encryptSecret } from "./secret-cipher.js";

export const AI_PROVIDER_KINDS = [
  "openai",
  "anthropic",
  "google",
  "xai",
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
  "openai-compatible",
  // Not a vendor with its own key: the credential is the whole of
  // ~/.codex/auth.json and the model runs on the operator's ChatGPT
  // subscription. See codex-chat.ts.
  "codex-oauth",
] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export type AiProviderSettingsPublic = {
  readonly providerKind: AiProviderKind;
  readonly model: string;
  readonly baseUrl: string | null;
  readonly enabled: boolean;
  readonly hasApiKey: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

type Row = {
  provider_kind: AiProviderKind;
  model: string;
  base_url: string | null;
  api_key_ciphertext: string | null;
  enabled: number;
  updated_at: string;
  updated_by: string;
};

const DEFAULT_SETTINGS: AiProviderSettingsPublic = {
  providerKind: "openai",
  model: "",
  baseUrl: null,
  enabled: false,
  hasApiKey: false,
  updatedAt: new Date(0).toISOString(),
  updatedBy: "system",
};

const SETTINGS_SALT = "rvs-ai-provider-settings";

const toPublic = (row: Row): AiProviderSettingsPublic => ({
  providerKind: row.provider_kind,
  model: row.model,
  baseUrl: row.base_url,
  enabled: row.enabled === 1,
  hasApiKey: row.api_key_ciphertext !== null,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});

const readRow = (db: Database.Database): Row | undefined =>
  db
    .prepare(
      `SELECT provider_kind, model, base_url, api_key_ciphertext, enabled, updated_at, updated_by
         FROM ai_provider_settings WHERE id = 'default'`,
    )
    .get() as Row | undefined;

export function getAiProviderSettings(
  db: Database.Database,
): AiProviderSettingsPublic {
  const row = readRow(db);
  return row ? toPublic(row) : DEFAULT_SETTINGS;
}

export function getAiProviderSettingsWithSecret(
  db: Database.Database,
  secretKey: string,
): AiProviderSettingsPublic & { readonly apiKey: string | null } {
  const row = readRow(db);
  if (!row) return { ...DEFAULT_SETTINGS, apiKey: null };
  return {
    ...toPublic(row),
    apiKey: row.api_key_ciphertext
      ? decryptSecret(row.api_key_ciphertext, secretKey, SETTINGS_SALT)
      : null,
  };
}

export type AiProviderSettingsPatch = {
  readonly providerKind?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly enabled?: boolean;
};

export function updateAiProviderSettings(
  db: Database.Database,
  patch: AiProviderSettingsPatch,
  actor: string,
  now: number,
  secretKey: string,
): AiProviderSettingsPublic {
  const existing = readRow(db);
  const providerKind = (patch.providerKind ??
    existing?.provider_kind ??
    DEFAULT_SETTINGS.providerKind) as string;
  if (!(AI_PROVIDER_KINDS as readonly string[]).includes(providerKind))
    throw new Error("INVALID_REQUEST");
  const model = patch.model ?? existing?.model ?? "";
  if (model.length < 1 || model.length > 200)
    throw new Error("INVALID_REQUEST");
  const baseUrl =
    patch.baseUrl !== undefined ? patch.baseUrl : (existing?.base_url ?? null);
  if (providerKind === "openai-compatible") {
    if (!baseUrl) throw new Error("INVALID_REQUEST");
    try {
      new URL(baseUrl);
    } catch {
      throw new Error("INVALID_REQUEST");
    }
  } else if (baseUrl) throw new Error("INVALID_REQUEST");
  const enabled = patch.enabled ?? existing?.enabled === 1;
  // A pasted auth.json that does not parse would otherwise be stored
  // happily and only fail at the first job, hours later and somewhere else.
  if (
    providerKind === "codex-oauth" &&
    patch.apiKey &&
    patch.apiKey.length > 0
  ) {
    try {
      parseCodexAuth(patch.apiKey);
    } catch {
      throw new Error("INVALID_REQUEST");
    }
  }
  const apiKeyCiphertext =
    patch.apiKey && patch.apiKey.length > 0
      ? encryptSecret(patch.apiKey, secretKey, SETTINGS_SALT)
      : (existing?.api_key_ciphertext ?? null);
  const updatedAt = new Date(now).toISOString();
  db.prepare(
    `INSERT INTO ai_provider_settings
       (id, provider_kind, model, base_url, api_key_ciphertext, enabled, updated_at, updated_by)
     VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider_kind = excluded.provider_kind,
       model = excluded.model,
       base_url = excluded.base_url,
       api_key_ciphertext = excluded.api_key_ciphertext,
       enabled = excluded.enabled,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).run(
    providerKind,
    model,
    baseUrl,
    apiKeyCiphertext,
    enabled ? 1 : 0,
    updatedAt,
    actor,
  );
  return getAiProviderSettings(db);
}
