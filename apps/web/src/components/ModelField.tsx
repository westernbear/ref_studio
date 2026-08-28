"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

// Picking the model, for both provider settings forms.
//
// This started as a <datalist> on the text input, which was the same as not
// shipping it: a datalist gives no visible affordance at all -- no arrow,
// nothing -- and only offers anything once you click into the field and
// start typing. A list you have to already know is there is not a list.
//
// So: a real select when the provider gave us models, with two things that
// keep it from being a downgrade on the text box it replaces.
//
//  - The saved model is always an option, even when the provider did not
//    list it. Otherwise a select would quietly display some other model as
//    though it were the setting, which is worse than a text box.
//  - "Type a name" is always the last option. A model released this
//    morning is in no listing yet, and an operator who knows the name must
//    not be blocked by a list that has not caught up.
//
// With no models -- no key saved yet, or a provider that will not list --
// it is the text box it always was, plus a line saying which of those it
// is, so an empty picker never reads as "this provider has no models".
const CUSTOM = "__custom__";

export function ModelField({
  models,
  modelsReason,
  model,
  onModelChange,
  placeholder,
  label,
  namespace,
}: {
  readonly models: readonly string[];
  readonly modelsReason: string | null;
  readonly model: string;
  // Named onModelChange, not onChange: Next flags an `on*` prop on a
  // "use client" entry component as a possible Server Action.
  readonly onModelChange: (model: string) => void;
  readonly placeholder: string;
  readonly label: string;
  // Which messages block to read the hints from, so the two forms can word
  // them for their own provider.
  readonly namespace: "AiProviderSettingsForm" | "MaterialProviderSettingsForm";
}) {
  const t = useTranslations(namespace);
  // Starts open as free text when there is nothing to pick from, or when
  // the saved value is a name someone typed.
  const [typing, setTyping] = useState(false);

  if (models.length === 0)
    return (
      <>
        <label>
          {label}
          <input
            type="text"
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            placeholder={placeholder}
            required
          />
        </label>
        <p className="field-hint">
          {modelsReason === "NO_API_KEY"
            ? t("modelsNeedKey")
            : t("modelsUnavailable")}
        </p>
      </>
    );

  const options =
    models.includes(model) || !model ? models : [model, ...models];
  return (
    <>
      <label>
        {label}
        <select
          value={typing ? CUSTOM : model}
          onChange={(event) => {
            if (event.target.value === CUSTOM) {
              setTyping(true);
              return;
            }
            setTyping(false);
            onModelChange(event.target.value);
          }}
        >
          {model ? null : <option value="">{t("modelChoose")}</option>}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={CUSTOM}>{t("modelCustom")}</option>
        </select>
      </label>
      {typing ? (
        <label>
          {t("modelCustomLabel")}
          <input
            type="text"
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            placeholder={placeholder}
            autoFocus
            required
          />
        </label>
      ) : null}
    </>
  );
}
