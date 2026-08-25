"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";
import { Panel } from "./Primitives";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google (Gemini)" },
  { value: "xai", label: "xAI (Grok)" },
  { value: "openai-compatible", label: "OpenAI-compatible (custom)" },
] as const;

type Props = {
  readonly providerKind: string;
  readonly model: string;
  readonly baseUrl: string | null;
  readonly enabled: boolean;
  readonly hasApiKey: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export function AiProviderSettingsForm({
  providerKind: initialProviderKind,
  model: initialModel,
  baseUrl: initialBaseUrl,
  enabled: initialEnabled,
  hasApiKey,
  updatedAt,
  updatedBy,
}: Props) {
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
        setStatus(`Save failed: ${errorCode(body) || `HTTP_${response.status}`}.`);
        return;
      }
      setApiKey("");
      setStatus("Settings saved.");
      router.refresh();
    } catch {
      setStatus("The connection was interrupted. Retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <div className="ai-settings-status" data-landmark="ai-settings-status">
        <span
          className={enabled ? "status-chip is-live" : "status-chip"}
          aria-label={enabled ? "Provider enabled" : "Provider disabled"}
        >
          {enabled ? "Enabled" : "Disabled"}
        </span>
        <dl className="detail-grid ai-settings-summary">
          <div>
            <dt>Provider</dt>
            <dd>
              {PROVIDERS.find((option) => option.value === initialProviderKind)
                ?.label ?? initialProviderKind}
            </dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{initialModel || "Not set"}</dd>
          </div>
          <div>
            <dt>API key</dt>
            <dd>{hasApiKey ? "Configured" : "Not set"}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>
              {updatedAt.includes("T")
                ? updatedAt.replace("T", " ").slice(0, 19)
                : updatedAt}{" "}
              by {updatedBy}
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
          Provider
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
        <label>
          Model
          <input
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="e.g. gpt-4o, claude-sonnet-5, grok-4.6"
            required
          />
        </label>
        {providerKind === "openai-compatible" ? (
          <label>
            Base URL
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
          API key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              hasApiKey
                ? "Enter to replace — leave blank to keep existing key"
                : "Enter API key"
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
          Enabled
        </label>
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
        <p aria-live="polite">{status}</p>
      </form>
    </Panel>
  );
}
