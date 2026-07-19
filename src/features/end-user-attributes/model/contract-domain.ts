import type {
  AttributeContractDocumentDto,
  AttributeContractDraftFieldDto,
} from "@/shared/api/generated/models";
import { canonicalLocale } from "@/shared/lib/locale";

export interface ContractDraftIssue {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

export function fieldNeedsPurpose(
  field: AttributeContractDraftFieldDto,
): boolean {
  return (
    field.classification === "PERSONAL" ||
    field.classification === "SENSITIVE" ||
    field.policies.adminRead ||
    field.policies.aiRead ||
    field.policies.audienceRead ||
    field.policies.clientRead ||
    field.policies.exportRead ||
    field.policies.templateRead ||
    field.policies.indexPolicy !== "NONE"
  );
}

export function createContractField(
  position = 0,
): AttributeContractDraftFieldDto {
  return {
    key: "",
    label: "",
    description: null,
    purpose: null,
    valueType: "STRING",
    lifecycle: "ACTIVE",
    classification: "INTERNAL",
    requirement: "OPTIONAL",
    position,
    constraints: {},
    policies: {
      adminRead: true,
      aiRead: false,
      audienceRead: false,
      clientRead: false,
      exportRead: false,
      indexPolicy: "NONE",
      templateRead: false,
    },
    replacementDefinitionId: null,
    sunsetAt: null,
    semanticRole: null,
  };
}

export function parseAllowedValues(
  valueType: AttributeContractDraftFieldDto["valueType"],
  input: string,
): Array<string | number | boolean> | undefined {
  const values = input
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.length) return undefined;
  if (valueType === "BOOLEAN") {
    if (values.some((value) => value !== "true" && value !== "false"))
      throw new Error("Для поля «Да или нет» введите true или false.");
    return values.map((value) => value === "true");
  }
  if (valueType === "INTEGER") {
    const integers = values.map(Number);
    if (integers.some((value) => !Number.isSafeInteger(value)))
      throw new Error("Укажите целые числа без дробной части.");
    return integers;
  }
  return values;
}

export function validateContractDocument(
  document: AttributeContractDocumentDto,
): ContractDraftIssue[] {
  const issues: ContractDraftIssue[] = [];
  const keys = new Set<string>();
  const localeFields = document.fields.filter(
    (field) => field.semanticRole === "LOCALE" && field.lifecycle === "ACTIVE",
  );
  if (localeFields.length > 1)
    issues.push({
      code: "LOCALE_SINGLETON",
      path: "fields",
      message: "В проекте может быть только одно активное поле языка контента.",
      severity: "error",
    });
  document.fields.forEach((field, index) => {
    const path = `fields.${index}`;
    if (!/^[a-z][a-zA-Z0-9_]{0,63}$/.test(field.key))
      issues.push({
        code: "INVALID_KEY",
        path: `${path}.key`,
        message:
          "Ключ начинается со строчной латинской буквы и содержит только буквы, цифры или _.",
        severity: "error",
      });
    if (!field.label.trim())
      issues.push({
        code: "LABEL_REQUIRED",
        path: `${path}.label`,
        message: "Укажите название поля.",
        severity: "error",
      });
    if (keys.has(field.key))
      issues.push({
        code: "DUPLICATE_KEY",
        path: `${path}.key`,
        message: `Ключ ${field.key} уже используется.`,
        severity: "error",
      });
    keys.add(field.key);
    if (field.semanticRole === "LOCALE") {
      if (field.valueType !== "STRING")
        issues.push({
          code: "LOCALE_STRING_REQUIRED",
          path: `${path}.valueType`,
          message: "Поле языка контента должно иметь тип «Текст».",
          severity: "error",
        });
      const values = field.constraints.allowedValues ?? [];
      const canonical = values.map((value) =>
        typeof value === "string" ? canonicalLocale(value) : null,
      );
      if (!values.length || values.length > 20 || canonical.some((value) => !value))
        issues.push({
          code: "LOCALE_VALUES_INVALID",
          path: `${path}.constraints.allowedValues`,
          message: "Добавьте от 1 до 20 корректных BCP 47 языков.",
          severity: "error",
        });
      const normalized = canonical.filter((value): value is string => Boolean(value));
      if (new Set(normalized).size !== normalized.length)
        issues.push({
          code: "LOCALE_DUPLICATE",
          path: `${path}.constraints.allowedValues`,
          message: "Один и тот же язык добавлен несколько раз.",
          severity: "error",
        });
      const defaultLocale = field.constraints.defaultLocale
        ? canonicalLocale(field.constraints.defaultLocale)
        : null;
      if (!defaultLocale || !normalized.includes(defaultLocale))
        issues.push({
          code: "LOCALE_DEFAULT_INVALID",
          path: `${path}.constraints.defaultLocale`,
          message: "Основной язык должен входить в список языков проекта.",
          severity: "error",
        });
    }
    if (field.classification === "SENSITIVE" && field.policies.clientRead)
      issues.push({
        code: "SENSITIVE_CLIENT_READ",
        path: `${path}.policies.clientRead`,
        message:
          "Чувствительное поле нельзя передавать в браузер без отдельной проверки доступа.",
        severity: "warning",
      });
    if (fieldNeedsPurpose(field) && !field.purpose?.trim())
      issues.push({
        code: "PURPOSE_REQUIRED",
        path: `${path}.purpose`,
        message: `Укажите назначение поля «${field.label || field.key || "Без названия"}»: где и зачем оно используется.`,
        severity: "error",
      });
    if (
      field.lifecycle === "DEPRECATED" &&
      !field.replacementDefinitionId &&
      !field.sunsetAt
    )
      issues.push({
        code: "DEPRECATION_PLAN_REQUIRED",
        path: `${path}.lifecycle`,
        message: "Укажите поле-замену или дату завершения использования.",
        severity: "warning",
      });
  });
  return issues;
}
