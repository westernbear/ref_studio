import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { getAiProviderSettingsWithSecret } from "./ai-provider-settings.js";
import { createAiModel } from "./ai-provider.js";

const TranslationSchema = z.object({
  translatedText: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
});
export type Translation = z.infer<typeof TranslationSchema>;
export type TranslatedField = Readonly<{
  translatedText: string;
  translationProvider: string;
  translationSourceHash: string;
  translationConfidence: number;
}>;

// Narrow view of `generateObject`, mirrors apps/api/src/safety-check.ts and
// apps/api/src/refine-prompt.ts so tests can inject a fake.
export type GenerateTranslation = (options: {
  readonly model: LanguageModel;
  readonly schema: typeof TranslationSchema;
  readonly prompt: string;
}) => Promise<{ readonly object: Translation }>;

// Enrichment, not a gate -- the opposite of safety-check.ts's fail-closed
// stance. An unconfigured provider or a failed call just means no
// translation is attached yet; evidence keeps flowing either way.
export async function translateEvidenceText(params: {
  readonly text: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly db: Database.Database;
  readonly aiSecretKey: string;
  readonly generate?: GenerateTranslation;
}): Promise<TranslatedField | null> {
  const settings = getAiProviderSettingsWithSecret(
    params.db,
    params.aiSecretKey,
  );
  if (!settings.enabled || !settings.apiKey) return null;
  try {
    const model = createAiModel({
      providerKind: settings.providerKind,
      model: settings.model,
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
    });
    const generate =
      params.generate ?? (generateObject as unknown as GenerateTranslation);
    const generated = await generate({
      model,
      schema: TranslationSchema,
      prompt: `Translate this ${params.sourceLocale} text to ${params.targetLocale}. Reply with only the translation, no commentary.\n\n${params.text}`,
    });
    return {
      translatedText: generated.object.translatedText,
      translationProvider: settings.providerKind,
      translationSourceHash: createHash("sha256")
        .update(params.text)
        .digest("hex"),
      translationConfidence: generated.object.confidence,
    };
  } catch {
    return null;
  }
}

const OTHER_LOCALE: Readonly<Record<string, string>> = {
  "ko-KR": "en-US",
  "en-US": "ko-KR",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Best-effort: walks the raw evidence bundle's text-word/subtitle owners and
// attaches a translation into the other supported locale, mutating each
// owner object in place. track_text() in pipeline.py already caps candidate
// text owners at 20, so this needs no separate limit here.
export async function enrichEvidenceTranslations(
  evidence: Record<string, unknown>,
  db: Database.Database,
  aiSecretKey: string,
  generate?: GenerateTranslation,
): Promise<void> {
  const sceneInput = evidence["sceneInput"];
  const owners = isRecord(sceneInput) ? sceneInput["owners"] : null;
  if (!Array.isArray(owners)) return;
  for (const owner of owners) {
    if (!isRecord(owner)) continue;
    const kind = owner["kind"];
    const content = owner["content"];
    const sourceLocale = owner["sourceLocale"];
    if (
      (kind !== "text-word" && kind !== "subtitle") ||
      typeof content !== "string" ||
      typeof sourceLocale !== "string" ||
      !(sourceLocale in OTHER_LOCALE)
    )
      continue;
    const translated = await translateEvidenceText({
      text: content,
      sourceLocale,
      targetLocale: OTHER_LOCALE[sourceLocale] ?? "en-US",
      db,
      aiSecretKey,
      ...(generate ? { generate } : {}),
    });
    if (!translated) continue;
    owner["translatedText"] = translated.translatedText;
    owner["translationProvider"] = translated.translationProvider;
    owner["translationSourceHash"] = translated.translationSourceHash;
    owner["translationConfidence"] = translated.translationConfidence;
  }
}
