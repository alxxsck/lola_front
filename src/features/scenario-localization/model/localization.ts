import type {
  ScenarioLocalizationCatalogResponseDto,
  ScenarioLocalizationPolicyDto,
} from "@/shared/api/generated/models";

export type LocalizedText = Record<string, string>;

export function defaultLocalizationPolicy(): ScenarioLocalizationPolicyDto {
  return { version: 1, mode: "ALL_PROJECT_LOCALES", locales: [] };
}

export function requiredLocales(
  catalog: ScenarioLocalizationCatalogResponseDto,
  policy: ScenarioLocalizationPolicyDto,
): string[] {
  return policy.mode === "ALL_PROJECT_LOCALES"
    ? catalog.locales.map(({ code }) => code)
    : policy.locales;
}

export function localizedValue(value: unknown, defaultLocale: string): LocalizedText {
  if (typeof value === "string") return { [defaultLocale]: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function targetLocalesForTranslation(input: {
  catalog: ScenarioLocalizationCatalogResponseDto;
  policy: ScenarioLocalizationPolicyDto;
  sourceLocale: string;
  value: LocalizedText;
  supportedTargetLocales: string[];
  includeFilled?: boolean;
}): string[] {
  const supported = new Set(input.supportedTargetLocales);
  return requiredLocales(input.catalog, input.policy).filter(
    (locale) =>
      locale !== input.sourceLocale &&
      supported.has(locale) &&
      (input.includeFilled || !input.value[locale]?.trim()),
  );
}

export interface TranslationValueSnapshot {
  sourceText: string;
  targetText: string;
  sourceLocale: string;
  targetLocale: string;
}

export function resolveLocalizedContent(
  value: unknown,
  requestedLocale: string,
  defaultLocale: string,
): { text: string; contentLocale: string; fallbackReason: string | null } {
  const localized = localizedValue(value, defaultLocale);
  const requested = localized[requestedLocale]?.trim();
  if (requested)
    return {
      text: localized[requestedLocale]!,
      contentLocale: requestedLocale,
      fallbackReason: null,
    };
  return {
    text: localized[defaultLocale] ?? "",
    contentLocale: defaultLocale,
    fallbackReason:
      requestedLocale === defaultLocale
        ? "Основной вариант не заполнен"
        : `Вариант ${requestedLocale} не заполнен — используется основной язык`,
  };
}

export function applyTranslationResult(input: {
  current: LocalizedText;
  snapshot: TranslationValueSnapshot;
  translatedText: string;
}): {
  outcome: "APPLIED" | "STALE_SOURCE" | "TARGET_CONFLICT";
  value: LocalizedText;
} {
  if ((input.current[input.snapshot.sourceLocale] ?? "") !== input.snapshot.sourceText)
    return { outcome: "STALE_SOURCE", value: input.current };
  if ((input.current[input.snapshot.targetLocale] ?? "") !== input.snapshot.targetText)
    return { outcome: "TARGET_CONFLICT", value: input.current };
  return {
    outcome: "APPLIED",
    value: {
      ...input.current,
      [input.snapshot.targetLocale]: input.translatedText,
    },
  };
}

export function localizedPath(
  catalog: ScenarioLocalizationCatalogResponseDto,
  actionType: string,
  fieldKey: string,
) {
  return catalog.paths.find(
    (descriptor) =>
      descriptor.actionType === actionType &&
      descriptor.path === `config.${fieldKey}`,
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeLocalizedActionContent<T extends object>(
  actions: T[],
  catalog: ScenarioLocalizationCatalogResponseDto,
): T[] {
  const visit = (action: Record<string, unknown>) => {
    const type = typeof action.type === "string" ? action.type : "";
    const config = record(action.config);
    for (const descriptor of catalog.paths.filter(
      (candidate) => candidate.actionType === type,
    )) {
      if (descriptor.path === "config.options[].label") {
        if (Array.isArray(config.options)) {
          config.options = config.options.map((option) => {
            const item = record(option);
            return {
              ...item,
              label: localizedValue(item.label, catalog.defaultLocale),
            };
          });
        }
        continue;
      }
      const match = descriptor.path.match(/^config\.([^.]+)$/);
      if (match) {
        const key = match[1]!;
        config[key] = localizedValue(config[key], catalog.defaultLocale);
      }
    }
    if (Array.isArray(config.reminders)) {
      config.reminders = config.reminders.map((reminder) => {
        const item = record(reminder);
        return {
          ...item,
          actions: Array.isArray(item.actions)
            ? item.actions.map((nested) => visit(record(nested)))
            : item.actions,
        };
      });
    }
    action.config = config;
    return action;
  };
  const plainActions = JSON.parse(JSON.stringify(actions)) as T[];
  return plainActions.map((action) =>
    visit(action as Record<string, unknown>) as T,
  );
}
