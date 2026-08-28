"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";
import { ModelField } from "./ModelField";
import { Panel } from "./Primitives";

// The 2D image generator is a vendor with a key; the video and 3D
// generators are services this deployment runs itself, on the worker's own
// private network, with no credential. All three are set here because all
// three answer the same question -- where does a generated asset come
// from -- and because the two self-hosted ones used to live in worker
// environment variables, which meant a shell on each worker host to change
// one and no way to see from the console whether either was configured.
const PROVIDERS = [
  { value: "openai", label: "OpenAI (API key)" },
  { value: "codex-oauth", label: "Codex (ChatGPT OAuth)" },
] as const;
// codex-oauth's secret is not a key but the whole of ~/.codex/auth.json, so
// the field is a textarea and says so. Everything else about the section is
// identical, because it is the same generator either way.
const isCodex = (kind: string) => kind === "codex-oauth";

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
  readonly enabled: boolean;
  readonly hasApiKey: boolean;
  readonly videoBaseUrl: string | null;
  readonly model3dBaseUrl: string | null;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export function MaterialProviderSettingsForm({
  models,
  modelsReason,
  providerKind: initialProviderKind,
  model: initialModel,
  enabled: initialEnabled,
  hasApiKey,
  videoBaseUrl: initialVideoBaseUrl,
  model3dBaseUrl: initialModel3dBaseUrl,
  updatedAt,
  updatedBy,
}: Props) {
  const t = useTranslations("MaterialProviderSettingsForm");
  const router = useRouter();
  const [providerKind, setProviderKind] = useState(initialProviderKind);
  const [model, setModel] = useState(initialModel);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [videoBaseUrl, setVideoBaseUrl] = useState(initialVideoBaseUrl ?? "");
  const [model3dBaseUrl, setModel3dBaseUrl] = useState(
    initialModel3dBaseUrl ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/material-provider-settings", {
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
          ...(apiKey ? { apiKey } : {}),
          enabled,
          // Sent even when empty: an empty string is how the console says
          // "this deployment has no such service", which is a real setting
          // and not the same as leaving the field alone.
          videoBaseUrl: videoBaseUrl.trim(),
          model3dBaseUrl: model3dBaseUrl.trim(),
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
      <div
        className="ai-settings-status"
        data-landmark="material-settings-status"
      >
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
            <dt>{t("imageProvider")}</dt>
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
            <dt>
              {isCodex(initialProviderKind) ? t("codexAuthJson") : t("apiKey")}
            </dt>
            <dd>{hasApiKey ? t("configured") : t("notSet")}</dd>
          </div>
          <div>
            <dt>{t("videoService")}</dt>
            <dd>{initialVideoBaseUrl || t("notSet")}</dd>
          </div>
          <div>
            <dt>{t("model3dService")}</dt>
            <dd>{initialModel3dBaseUrl || t("notSet")}</dd>
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
        data-landmark="material-settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3>{t("imageSection")}</h3>
        <p className="field-hint">{t("imageSectionHint")}</p>
        <label>
          {t("imageProvider")}
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
          placeholder="gpt-image-2"
          label={t("model")}
          namespace="MaterialProviderSettingsForm"
        />
        <label>
          {isCodex(providerKind) ? t("codexAuthJson") : t("apiKey")}
          {isCodex(providerKind) ? (
            <textarea
              rows={4}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                hasApiKey
                  ? t("codexAuthJsonReplacePlaceholder")
                  : t("codexAuthJsonEnterPlaceholder")
              }
              autoComplete="off"
              spellCheck={false}
            />
          ) : (
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
          )}
        </label>
        {isCodex(providerKind) ? (
          <p className="field-hint">{t("codexAuthJsonHint")}</p>
        ) : null}
        <label className="ai-settings-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          {t("enabled")}
        </label>

        <h3>{t("selfHostedSection")}</h3>
        <p className="field-hint">{t("selfHostedSectionHint")}</p>
        <label>
          {t("videoService")}
          <input
            type="text"
            value={videoBaseUrl}
            onChange={(event) => setVideoBaseUrl(event.target.value)}
            placeholder="http://wan-alpha:8000"
          />
        </label>
        <label>
          {t("model3dService")}
          <input
            type="text"
            value={model3dBaseUrl}
            onChange={(event) => setModel3dBaseUrl(event.target.value)}
            placeholder="http://hi3dgen:8000"
          />
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
