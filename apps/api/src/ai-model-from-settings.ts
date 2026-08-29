import {
  getAiProviderSettingsWithSecret,
  updateAiProviderSettings,
} from "./ai-provider-settings.js";
import { createAiModel } from "./ai-provider.js";
import type Database from "better-sqlite3";
import type { LanguageModel } from "ai";

// The six call sites that need a model all had the same eight lines copied
// into them. They are here once now, because codex-oauth added a seventh
// thing to remember -- where a rotated token gets written back -- and six
// copies of that is six chances to forget it.
//
// Returns null rather than throwing, because "no provider configured" means
// something different in each caller: a job failure in author-scene and
// patch-scene, a fail-closed verdict in safety-check, null in
// translate-evidence, a heuristic in refine-prompt. That policy stays where
// it belongs.
export function aiModelFromSettings(
  db: Database.Database,
  aiSecretKey: string,
): LanguageModel | null {
  const settings = getAiProviderSettingsWithSecret(db, aiSecretKey);
  if (!settings.enabled || !settings.apiKey) return null;
  return createAiModel({
    providerKind: settings.providerKind,
    model: settings.model,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    // Only codex-oauth ever calls this. No audit event: a token rotating on
    // schedule is not an operator changing a setting, and an audit log full
    // of them hides the changes that are. Mirrors persistRefreshedCodexAuth
    // in openai-image-material.ts.
    persistCodexAuth: (auth) =>
      void updateAiProviderSettings(
        db,
        { apiKey: JSON.stringify(auth) },
        "system:codex-refresh",
        Date.now(),
        aiSecretKey,
      ),
  });
}
