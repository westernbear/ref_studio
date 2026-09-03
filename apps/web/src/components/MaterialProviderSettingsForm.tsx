"use client";

import { useTranslations } from "next-intl";
import { isCodex, ProviderSettingsForm } from "./ProviderSettingsForm";

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

type Props = {
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
  providerKind,
  model,
  enabled,
  hasApiKey,
  videoBaseUrl,
  model3dBaseUrl,
  updatedAt,
  updatedBy,
}: Props) {
  const t = useTranslations("MaterialProviderSettingsForm");
  return (
    <ProviderSettingsForm
      namespace="MaterialProviderSettingsForm"
      statusLandmark="material-settings-status"
      formLandmark="material-settings-form"
      providers={PROVIDERS}
      models={models}
      modelsReason={modelsReason}
      providerKind={providerKind}
      model={model}
      enabled={enabled}
      hasApiKey={hasApiKey}
      updatedAt={updatedAt}
      updatedBy={updatedBy}
      providerLabelKey="imageProvider"
      modelPlaceholder={(kind) => (isCodex(kind) ? "gpt-5.4" : "gpt-image-2")}
      target="material"
      savePath="/api/admin/material-provider-settings"
      extraSummary={[
        { label: t("videoService"), value: videoBaseUrl || t("notSet") },
        { label: t("model3dService"), value: model3dBaseUrl || t("notSet") },
      ]}
      extraSectionTitle={t("selfHostedSection")}
      extraSectionHint={t("selfHostedSectionHint")}
      extraFields={[
        {
          name: "videoBaseUrl",
          label: t("videoService"),
          initialValue: videoBaseUrl ?? "",
          placeholder: "http://wan-alpha:8000",
          placement: "footer",
        },
        {
          name: "model3dBaseUrl",
          label: t("model3dService"),
          initialValue: model3dBaseUrl ?? "",
          placeholder: "http://hi3dgen:8000",
          placement: "footer",
        },
      ]}
      formHeader={
        <>
          <h3>{t("imageSection")}</h3>
          <p className="field-hint">{t("imageSectionHint")}</p>
        </>
      }
      buildSaveBody={({ extras }) => ({
        // Sent even when empty: an empty string is how the console says
        // "this deployment has no such service", which is a real setting
        // and not the same as leaving the field alone.
        videoBaseUrl: (extras.videoBaseUrl ?? "").trim(),
        model3dBaseUrl: (extras.model3dBaseUrl ?? "").trim(),
      })}
    />
  );
}
