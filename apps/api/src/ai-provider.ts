import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";
import type { AiProviderKind } from "./ai-provider-settings.js";

export type AiModelSettings = {
  readonly providerKind: AiProviderKind;
  readonly model: string;
  readonly baseUrl: string | null;
  readonly apiKey: string;
};

// Plain switch over the handful of direct providers this repo supports,
// plus one OpenAI-compatible catch-all (covers Groq/Mistral/DeepSeek/
// Together/OpenRouter/local Ollama/etc, which all speak the OpenAI chat
// completions wire format) -- not a plugin/factory system, per YAGNI.
export function createAiModel(settings: AiModelSettings): LanguageModel {
  switch (settings.providerKind) {
    case "openai":
      return createOpenAI({ apiKey: settings.apiKey })(settings.model);
    case "anthropic":
      return createAnthropic({ apiKey: settings.apiKey })(settings.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: settings.apiKey })(
        settings.model,
      );
    case "xai":
      return createXai({ apiKey: settings.apiKey })(settings.model);
    case "openai-compatible":
      return createOpenAI(
        settings.baseUrl
          ? { apiKey: settings.apiKey, baseURL: settings.baseUrl }
          : { apiKey: settings.apiKey },
      )(settings.model);
  }
}
