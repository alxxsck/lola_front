import type {
  AttributeContractDraftFieldDto,
  AttributeSemanticRole,
  AttributeValueType,
} from "@/shared/api/generated/models";

export type ProfileFieldKind = "CUSTOM" | AttributeSemanticRole;

export interface ProfileFieldPreset {
  value: ProfileFieldKind;
  label: string;
  hint: string;
  icon: string;
  key?: string;
  valueType?: AttributeValueType;
}

export interface PresetSuggestedIdentity {
  label?: string;
  key?: string;
}

export const profileFieldPresets: readonly ProfileFieldPreset[] = [
  {
    value: "CUSTOM",
    label: "Обычное поле",
    hint: "Для любого значения без специальной роли в Lola.",
    icon: "pi-box",
  },
  {
    value: "DISPLAY_NAME",
    label: "Имя пользователя",
    hint: "Основное имя для интерфейса и персонализации.",
    icon: "pi-user",
    key: "displayName",
    valueType: "STRING",
  },
  {
    value: "EMAIL",
    label: "Электронная почта",
    hint: "Основной email пользователя.",
    icon: "pi-envelope",
    key: "email",
    valueType: "STRING",
  },
  {
    value: "COUNTRY",
    label: "Страна",
    hint: "Основная страна в двухбуквенном формате: ES, RU.",
    icon: "pi-globe",
    key: "country",
    valueType: "COUNTRY_CODE",
  },
  {
    value: "CURRENCY",
    label: "Валюта",
    hint: "Основная валюта в трёхбуквенном формате: EUR, RUB.",
    icon: "pi-wallet",
    key: "currency",
    valueType: "CURRENCY_CODE",
  },
  {
    value: "LOCALE",
    label: "Язык контента",
    hint: "Определяет язык сообщений сценария для пользователя.",
    icon: "pi-language",
    key: "locale",
    valueType: "STRING",
  },
] as const;

export function profileFieldPreset(
  kind: ProfileFieldKind | null | undefined,
): ProfileFieldPreset {
  return (
    profileFieldPresets.find((preset) => preset.value === (kind ?? "CUSTOM")) ??
    profileFieldPresets[0]!
  );
}

export function applyProfileFieldPreset(
  field: AttributeContractDraftFieldDto,
  kind: ProfileFieldKind,
  previousSuggestion: PresetSuggestedIdentity | null = null,
): PresetSuggestedIdentity | null {
  const next = profileFieldPreset(kind);

  if (next.value === "CUSTOM") {
    field.semanticRole = null;
    return previousSuggestion;
  }

  if (
    !field.label.trim() ||
    (previousSuggestion?.label && field.label === previousSuggestion.label)
  )
    field.label = next.label;
  if (
    !field.key.trim() ||
    (previousSuggestion?.key && field.key === previousSuggestion.key)
  )
    field.key = next.key ?? "";
  field.valueType = next.valueType ?? field.valueType;
  field.semanticRole = next.value;
  return { label: next.label, key: next.key };
}
