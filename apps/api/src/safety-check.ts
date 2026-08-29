import { readFile } from "node:fs/promises";
import type Database from "better-sqlite3";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { aiModelFromSettings } from "./ai-model-from-settings.js";

const SafetyVerdictSchema = z.object({
  safe: z.boolean(),
  reason: z.string().min(1).max(500),
});
export type SafetyVerdict = z.infer<typeof SafetyVerdictSchema>;

// A narrow view of `generateObject` -- just what this check needs -- so
// tests can inject a fake without satisfying the SDK's full generic
// overload signature (mirrors the pattern in apps/api/src/refine-prompt.ts).
export type GenerateSafetyVerdict = (options: {
  readonly model: LanguageModel;
  readonly schema: typeof SafetyVerdictSchema;
  readonly messages: readonly {
    readonly role: "user";
    readonly content: readonly (
      | { readonly type: "text"; readonly text: string }
      | { readonly type: "image"; readonly image: string }
    )[];
  }[];
}) => Promise<{ readonly object: SafetyVerdict }>;

const SAFETY_PROMPT =
  "You are a content-safety reviewer for a video delivery pipeline. Look at this single frame sampled from a finished render. Decide whether it is safe to deliver to a general audience: no explicit sexual content, no extreme violence or gore, and nothing else inappropriate for general delivery. Respond with whether it is safe and a short reason.";

// This is a fail-closed gate, the opposite of refine-prompt.ts's
// planProposals: an unconfigured provider or a failed AI call must never be
// treated as "safe" -- both resolve to safe:false so delivery stays blocked
// until a real verdict says otherwise.
export async function runSafetyCheck(params: {
  readonly imagePath: string;
  readonly db: Database.Database;
  readonly aiSecretKey: string;
  readonly generate?: GenerateSafetyVerdict;
}): Promise<SafetyVerdict> {
  try {
    const model = aiModelFromSettings(params.db, params.aiSecretKey);
    if (!model) return { safe: false, reason: "AI_PROVIDER_NOT_CONFIGURED" };
    const image = Buffer.from(await readFile(params.imagePath));
    const imageBase64: string = image.toString("base64");
    const generate =
      params.generate ?? (generateObject as unknown as GenerateSafetyVerdict);
    const generated = await generate({
      model,
      schema: SafetyVerdictSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SAFETY_PROMPT },
            { type: "image", image: imageBase64 },
          ],
        },
      ],
    });
    return generated.object;
  } catch {
    return { safe: false, reason: "SAFETY_CHECK_FAILED" };
  }
}
