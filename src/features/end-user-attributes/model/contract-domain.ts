import type {
  AttributeContractDocumentDto,
  AttributeContractDraftFieldDto,
} from "@/shared/api/generated/models";

export interface ContractDraftIssue {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
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
      throw new Error("BOOLEAN enum принимает только true или false.");
    return values.map((value) => value === "true");
  }
  if (valueType === "INTEGER") {
    const integers = values.map(Number);
    if (integers.some((value) => !Number.isSafeInteger(value)))
      throw new Error("INTEGER enum принимает только безопасные целые числа.");
    return integers;
  }
  return values;
}

export function validateContractDocument(
  document: AttributeContractDocumentDto,
): ContractDraftIssue[] {
  const issues: ContractDraftIssue[] = [];
  const keys = new Set<string>();
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
    if (field.classification === "SENSITIVE" && field.policies.clientRead)
      issues.push({
        code: "SENSITIVE_CLIENT_READ",
        path: `${path}.policies.clientRead`,
        message:
          "Sensitive-поле нельзя отдавать browser-клиенту без отдельного security review.",
        severity: "warning",
      });
    if (field.policies.aiRead && !field.purpose?.trim())
      issues.push({
        code: "AI_PURPOSE_REQUIRED",
        path: `${path}.purpose`,
        message: "Для AI-доступа зафиксируйте цель использования.",
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
        message: "Укажите replacement или дату sunset.",
        severity: "warning",
      });
  });
  return issues;
}
