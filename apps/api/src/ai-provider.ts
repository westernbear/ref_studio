import { createAlibaba } from "@ai-sdk/alibaba";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createBaseten } from "@ai-sdk/baseten";
import { createCerebras } from "@ai-sdk/cerebras";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFireworks } from "@ai-sdk/fireworks";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createHuggingFace } from "@ai-sdk/huggingface";
import { createMistral } from "@ai-sdk/mistral";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAI } from "@ai-sdk/openai";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";
import type { AiProviderKind } from "./ai-provider-settings.js";

export type AiModelSettings = {
  readonly providerKind: AiProviderKind;
  readonly model: string;
  readonly baseUrl: string | null;
  readonly apiKey: string;
};

// Plain switch over the direct providers this repo supports -- each
// authenticates with that vendor's own native API key, no third-party
// aggregator account (Vercel AI Gateway, OpenRouter, etc.) in the loop --
// plus one OpenAI-compatible catch-all for anything not listed (a
// self-hosted proxy, a vendor not yet added here, etc). Not a plugin/
// factory system, per YAGNI -- just a switch.
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
    case "groq":
      return createGroq({ apiKey: settings.apiKey })(settings.model);
    case "mistral":
      return createMistral({ apiKey: settings.apiKey })(settings.model);
    case "cohere":
      return createCohere({ apiKey: settings.apiKey })(settings.model);
    case "deepseek":
      return createDeepSeek({ apiKey: settings.apiKey })(settings.model);
    case "cerebras":
      return createCerebras({ apiKey: settings.apiKey })(settings.model);
    case "perplexity":
      return createPerplexity({ apiKey: settings.apiKey })(settings.model);
    case "fireworks":
      return createFireworks({ apiKey: settings.apiKey })(settings.model);
    case "togetherai":
      return createTogetherAI({ apiKey: settings.apiKey })(settings.model);
    case "deepinfra":
      return createDeepInfra({ apiKey: settings.apiKey })(settings.model);
    case "baseten":
      return createBaseten({ apiKey: settings.apiKey })(settings.model);
    case "huggingface":
      return createHuggingFace({ apiKey: settings.apiKey })(settings.model);
    case "moonshotai":
      return createMoonshotAI({ apiKey: settings.apiKey })(settings.model);
    case "alibaba":
      return createAlibaba({ apiKey: settings.apiKey })(settings.model);
    case "openai-compatible":
      return createOpenAI(
        settings.baseUrl
          ? { apiKey: settings.apiKey, baseURL: settings.baseUrl }
          : { apiKey: settings.apiKey },
      )(settings.model);
  }
}
