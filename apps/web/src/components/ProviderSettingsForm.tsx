"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { errorCode } from "../lib/api-error";
import { requestId } from "../lib/upload-client";
import { ModelField } from "./ModelField";

export const isCodex = (kind: string) => kind === "codex-oauth";

type ProviderOption = {
  readonly value: string;
  readonly label: string;
};

type ExtraField = {
  readonly name: string;
  readonly label: string;
  readonly initialValue: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly placement: "afterModel" | "footer";
  readonly showWhen?: (providerKind: string) => boolean;
};

type ExtraSummary = {
  readonly label: string;
  readonly value: string;
};

type CoreState = {
  readonly providerKind: string;
  readonly model: string;
  readonly apiKey: string;
  readonly enabled: boolean;
  readonly extras: Readonly<Record<string, string>>;
};

type Props = {
  readonly namespace: "AiProviderSettingsForm" | "MaterialProviderSettingsForm";
  readonly statusLandmark: string;
  readonly formLandmark: string;
  readonly providers: readonly ProviderOption[];
  readonly models: readonly string[];
  readonly modelsReason: string | null;
  readonly providerKind: string;
  readonly model: string;
  readonly enabled: boolean;
  readonly hasApiKey: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly providerLabelKey: "provider" | "imageProvider";
  readonly modelPlaceholder: (kind: string) => string;
  readonly target: "ai" | "material";
  readonly savePath: string;
  readonly extraSummary?: readonly ExtraSummary[];
  readonly extraFields?: readonly ExtraField[];
  readonly formHeader?: ReactNode;
  readonly extraSectionTitle?: string;
  readonly extraSectionHint?: string;
  readonly buildModelsBody?: (state: CoreState) => Record<string, unknown>;
  readonly buildSaveBody?: (state: CoreState) => Record<string, unknown>;
};

export function ProviderSettingsForm({
  namespace,
  statusLandmark,
  formLandmark,
  providers,
  models: initialModels,
  modelsReason: initialModelsReason,
  providerKind: initialProviderKind,
  model: initialModel,
  enabled: initialEnabled,
  hasApiKey,
  updatedAt,
  updatedBy,
  providerLabelKey,
  modelPlaceholder,
  target,
  savePath,
  extraSummary,
  extraFields,
  formHeader,
  extraSectionTitle,
  extraSectionHint,
  buildModelsBody,
  buildSaveBody,
}: Props) {
  const t = useTranslations(namespace);
  const router = useRouter();
  const extraInitial = Object.fromEntries(
    (extraFields ?? []).map((field) => [field.name, field.initialValue]),
  );
  const [providerKind, setProviderKind] = useState(initialProviderKind);
  const [model, setModel] = useState(initialModel);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [extras, setExtras] = useState(extraInitial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  // The list that arrived with the page is the *saved* provider's. Change
  // the provider in the form and it is the wrong list -- so refetch, with
  // the provider (and the key, if one has been typed) the form now holds.
  // The saved key belongs to the previous provider, so without sending the
  // new one this would just fail with the old credentials.
  const [liveModels, setLiveModels] = useState(initialModels);
  const [liveModelsReason, setLiveModelsReason] = useState(initialModelsReason);
  const firstRender = useRef(true);
  const core = (): CoreState => ({
    providerKind,
    model,
    apiKey,
    enabled,
    extras,
  });

  useEffect(() => {
    if (firstRender.current) {
      // The server already fetched this list for the saved settings; doing
      // it again on mount would be a second call for the same answer.
      firstRender.current = false;
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/admin/provider-models", {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "idempotency-key": requestId(),
            "x-correlation-id": `cor_${requestId()}`,
          },
          body: JSON.stringify({
            target,
            providerKind,
            ...(apiKey ? { apiKey } : {}),
            ...buildModelsBody?.(core()),
          }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setLiveModels([]);
          setLiveModelsReason("UNAVAILABLE");
          return;
        }
        const listed = (body as { models?: unknown })?.models;
        setLiveModels(
          Array.isArray(listed) ? listed.map((item) => String(item)) : [],
        );
        setLiveModelsReason(
          typeof (body as { reason?: unknown })?.reason === "string"
            ? (body as { reason: string }).reason
            : null,
        );
      } catch {
        // An aborted request is the next keystroke, not a failure.
        if (!controller.signal.aborted) {
          setLiveModels([]);
          setLiveModelsReason("UNAVAILABLE");
        }
      }
    })();
    return () => controller.abort();
    // apiKey is deliberately not a dependency: refetching on every
    // keystroke of a pasted key would be a request per character. It is
    // read when the provider changes, and the list refreshes again after a
    // save, which is when a new key becomes the saved one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerKind]);

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch(savePath, {
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
          ...buildSaveBody?.(core()),
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

  const renderExtraField = (field: ExtraField) => {
    if (field.showWhen && !field.showWhen(providerKind)) return null;
    return (
      <label key={field.name}>
        {field.label}
        <input
          type="text"
          value={extras[field.name] ?? ""}
          onChange={(event) =>
            setExtras((current) => ({
              ...current,
              [field.name]: event.target.value,
            }))
          }
          placeholder={field.placeholder}
          required={field.required}
        />
      </label>
    );
  };

  const afterModelFields = (extraFields ?? []).filter(
    (field) => field.placement === "afterModel",
  );
  const footerFields = (extraFields ?? []).filter(
    (field) => field.placement === "footer",
  );

  return (
    <section className="panel">
      <div className="ai-settings-status" data-landmark={statusLandmark}>
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
            <dt>{t(providerLabelKey)}</dt>
            <dd>
              {providers.find((option) => option.value === initialProviderKind)
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
          {extraSummary?.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
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
        data-landmark={formLandmark}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {formHeader}
        <label>
          {t(providerLabelKey)}
          <select
            value={providerKind}
            onChange={(event) => setProviderKind(event.target.value)}
          >
            {providers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <ModelField
          models={liveModels}
          modelsReason={liveModelsReason}
          model={model}
          onModelChange={setModel}
          placeholder={modelPlaceholder(providerKind)}
          label={t("model")}
          namespace={namespace}
        />
        {afterModelFields.map(renderExtraField)}
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
        {footerFields.length > 0 ? (
          <>
            {extraSectionTitle ? <h3>{extraSectionTitle}</h3> : null}
            {extraSectionHint ? (
              <p className="field-hint">{extraSectionHint}</p>
            ) : null}
            {footerFields.map(renderExtraField)}
          </>
        ) : null}
        <button
          className="button button-primary"
          type="submit"
          disabled={saving}
        >
          {saving ? t("saving") : t("saveSettings")}
        </button>
        <p aria-live="polite">{status}</p>
      </form>
    </section>
  );
}
