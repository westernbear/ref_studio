"use client";

import { useTranslations } from "next-intl";
import { ProviderSettingsForm } from "./ProviderSettingsForm";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google (Gemini)" },
  { value: "xai", label: "xAI (Grok)" },
  { value: "groq", label: "Groq" },
  { value: "mistral", label: "Mistral" },
  { value: "cohere", label: "Cohere" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "cerebras", label: "Cerebras" },
  { value: "perplexity", label: "Perplexity" },
  { value: "fireworks", label: "Fireworks" },
  { value: "togetherai", label: "Together AI" },
  { value: "deepinfra", label: "DeepInfra" },
  { value: "baseten", label: "Baseten" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "moonshotai", label: "Moonshot AI" },
  { value: "alibaba", label: "Alibaba" },
  { value: "openai-compatible", label: "OpenAI-compatible (custom)" },
  { value: "codex-oauth", label: "Codex (ChatGPT OAuth)" },
] as const;

type Props = {
  readonly models: readonly string[];
  readonly modelsReason: string | null;
  readonly providerKind: string;
  readonly model: string;
  readonly baseUrl: string | null;
  readonly enabled: boolean;
  readonly hasApiKey: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export function AiProviderSettingsForm({
  models,
  modelsReason,
  providerKind,
  model,
  baseUrl,
  enabled,
  hasApiKey,
  updatedAt,
  updatedBy,
}: Props) {
  const t = useTranslations("AiProviderSettingsForm");
  return (
    <ProviderSettingsForm
      namespace="AiProviderSettingsForm"
      statusLandmark="ai-settings-status"
      formLandmark="ai-settings-form"
      providers={PROVIDERS}
      models={models}
      modelsReason={modelsReason}
      providerKind={providerKind}
      model={model}
      enabled={enabled}
      hasApiKey={hasApiKey}
      updatedAt={updatedAt}
      updatedBy={updatedBy}
      providerLabelKey="provider"
      modelPlaceholder={() => "e.g. gpt-4o, claude-sonnet-5, grok-4.6"}
      target="ai"
      savePath="/api/admin/ai-provider-settings"
      extraFields={[
        {
          name: "baseUrl",
          label: t("baseUrl"),
          initialValue: baseUrl ?? "",
          placeholder: "https://api.example.com/v1",
          required: true,
          placement: "afterModel",
          showWhen: (kind) => kind === "openai-compatible",
        },
      ]}
      buildModelsBody={({ extras }) => ({
        baseUrl: (extras.baseUrl ?? "").trim(),
      })}
      buildSaveBody={({ providerKind: kind, extras }) =>
        kind === "openai-compatible" ? { baseUrl: extras.baseUrl ?? "" } : {}
      }
    />
  );
}
