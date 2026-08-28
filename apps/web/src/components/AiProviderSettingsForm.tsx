"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";
import { ModelField } from "./ModelField";
import { Panel } from "./Primitives";

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
] as const;

type Props = {
  // What the provider says it has. Empty when there is no key yet, or when
  // the provider will not list -- `modelsReason` says which, and the field
  // stays free text either way: a model released this morning is in no
  // list, and a listing endpoint being down must not block configuring
  // anything.
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
  providerKind: initialProviderKind,
  model: initialModel,
  baseUrl: initialBaseUrl,
  enabled: initialEnabled,
  hasApiKey,
  updatedAt,
  updatedBy,
}: Props) {
  const t = useTranslations("AiProviderSettingsForm");
  const router = useRouter();
  const [providerKind, setProviderKind] = useState(initialProviderKind);
  const [model, setModel] = useState(initialModel);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/ai-provider-settings", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestId(),
          "x-correlation-id": `cor_${requestId()}`,
        },
        body: JSON.stringify({
          providerKind,
          model,
          ...(providerKind === "openai-compatible" ? { baseUrl } : {}),
          ...(apiKey ? { apiKey } : {}),
          enabled,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus(
          t("saveFailed", {
            code: errorCode(body) || `HTTP_${response.status}`,
          }),
        );
        return;
      }
      setApiKey("");
      setStatus(t("settingsSaved"));
      router.refresh();
    } catch {
      setStatus(t("connectionInterrupted"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <div className="ai-settings-status" data-landmark="ai-settings-status">
        <span
          className={enabled ? "status-chip is-live" : "status-chip"}
          aria-label={
            enabled
              ? t("providerEnabledAriaLabel")
              : t("providerDisabledAriaLabel")
          }
        >
          {enabled ? t("enabled") : t("disabled")}
        </span>
        <dl className="detail-grid ai-settings-summary">
          <div>
            <dt>{t("provider")}</dt>
            <dd>
              {PROVIDERS.find((option) => option.value === initialProviderKind)
                ?.label ?? initialProviderKind}
            </dd>
          </div>
          <div>
            <dt>{t("model")}</dt>
            <dd>{initialModel || t("notSet")}</dd>
          </div>
          <div>
            <dt>{t("apiKey")}</dt>
            <dd>{hasApiKey ? t("configured") : t("notSet")}</dd>
          </div>
          <div>
            <dt>{t("lastUpdated")}</dt>
            <dd>
              {updatedAt.includes("T")
                ? updatedAt.replace("T", " ").slice(0, 19)
                : updatedAt}{" "}
              {t("by", { name: updatedBy })}
            </dd>
          </div>
        </dl>
      </div>
      <form
        className="choice-form"
        data-landmark="ai-settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          {t("provider")}
          <select
            value={providerKind}
            onChange={(event) => setProviderKind(event.target.value)}
          >
            {PROVIDERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <ModelField
          models={models}
          modelsReason={modelsReason}
          model={model}
          onModelChange={setModel}
          placeholder="e.g. gpt-4o, claude-sonnet-5, grok-4.6"
          label={t("model")}
          namespace="AiProviderSettingsForm"
        />
        {providerKind === "openai-compatible" ? (
          <label>
            {t("baseUrl")}
            <input
              type="text"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              required
            />
          </label>
        ) : null}
        <label>
          {t("apiKey")}
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              hasApiKey
                ? t("apiKeyReplacePlaceholder")
                : t("apiKeyEnterPlaceholder")
            }
            autoComplete="off"
          />
        </label>
        <label className="ai-settings-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          {t("enabled")}
        </label>
        <button
          className="button button-primary"
          type="submit"
          disabled={saving}
        >
          {saving ? t("saving") : t("saveSettings")}
        </button>
        <p aria-live="polite">{status}</p>
      </form>
    </Panel>
  );
}
