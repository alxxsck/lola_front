import type {
  AttributeContractDraftFieldDto,
  AttributeContractIssueResponseDto,
} from "@/shared/api/generated/models";
import type { ContractDraftIssue } from "./contract-domain";

export type ContractIssueInput =
  | ContractDraftIssue
  | AttributeContractIssueResponseDto;

export interface ContractIssuePresentation {
  key: string;
  code: string;
  severity: "error" | "warning";
  title: string;
  detail: string;
  fieldIdentity?: string;
  actionLabel?: "Исправить поле" | "Проверить поле";
}

type IssueCopy = {
  title: string;
  detail: string;
};

type CopyBuilder = (fieldName: string) => IssueCopy;

const issueCopy: Record<string, CopyBuilder> = {
  PURPOSE_REQUIRED: (field) => ({
    title: `Укажите назначение поля «${field}».`,
    detail:
      "Откройте поле и заполните «Для чего нужно это поле?». Это обязательно для персональных, чувствительных и доступных другим разделам данных.",
  }),
  ATTRIBUTE_REQUIREMENT_CHANGED: (field) => ({
    title: `Изменилась обязательность поля «${field}».`,
    detail:
      "Проверьте, сможет ли продукт передавать поле в новом режиме, затем повторите проверку.",
  }),
  ATTRIBUTE_REQUIRED_WARN_ADDED: (field) => ({
    title: `Поле стало желательным: «${field}».`,
    detail:
      "Профиль будет принят без значения, но Lola покажет предупреждение. Убедитесь, что продукт начнёт передавать поле.",
  }),
  ATTRIBUTE_REQUIRED_ENFORCED_ADDED: (field) => ({
    title: `Поле стало обязательным: «${field}».`,
    detail:
      "Профили без значения будут отклоняться. Сначала обновите передачу данных, затем публикуйте изменения.",
  }),
  ATTRIBUTE_EXPOSURE_BROADENED: (field) => ({
    title: `Поле стало доступно в новых разделах: «${field}».`,
    detail:
      "Проверьте, каким разделам действительно нужны эти данные и соответствует ли им категория поля.",
  }),
  ATTRIBUTE_CONSTRAINTS_CHANGED: (field) => ({
    title: `Изменились допустимые значения поля «${field}».`,
    detail:
      "Проверьте, что уже передаваемые данные соответствуют новым ограничениям.",
  }),
  ATTRIBUTE_LIFECYCLE_CHANGED: (field) => ({
    title: `Изменился статус поля «${field}».`,
    detail:
      "Проверьте связанные настройки и убедитесь, что поле больше нигде не требуется.",
  }),
  INVALID_KEY: (field) => ({
    title: `Исправьте ключ поля «${field}».`,
    detail:
      "Ключ должен начинаться со строчной латинской буквы и содержать только буквы, цифры или знак подчёркивания.",
  }),
  LABEL_REQUIRED: () => ({
    title: "Укажите название поля.",
    detail: "Откройте поле и заполните «Название поля».",
  }),
  DUPLICATE_KEY: (field) => ({
    title: `Ключ поля «${field}» уже используется.`,
    detail: "Откройте поле и задайте уникальный ключ.",
  }),
  SENSITIVE_CLIENT_READ: (field) => ({
    title: `Чувствительное поле «${field}» доступно во фронтенде.`,
    detail:
      "Отключите передачу во фронтенд или отдельно проверьте, что доступ к этим данным безопасен.",
  }),
  DEPRECATION_PLAN_REQUIRED: (field) => ({
    title: `Для поля «${field}» не задан план отключения.`,
    detail: "Укажите поле-замену или дату завершения использования.",
  }),
};

function canonicalCode(code: string) {
  return code === "ATTRIBUTE_PURPOSE_REQUIRED" ? "PURPOSE_REQUIRED" : code;
}

function issueSeverity(issue: ContractIssueInput): "error" | "warning" {
  return issue.severity === "ERROR" || issue.severity === "error"
    ? "error"
    : "warning";
}

function issuePath(issue: ContractIssueInput) {
  return "path" in issue ? issue.path : issue.field;
}

function fieldForIssue(
  issue: ContractIssueInput,
  fields: AttributeContractDraftFieldDto[],
) {
  if ("definitionId" in issue && issue.definitionId) {
    const byId = fields.find(
      (field) => field.definitionId === issue.definitionId,
    );
    if (byId) return byId;
  }

  const path = issuePath(issue);
  const index = path?.match(/^fields\.(\d+)/)?.[1];
  if (index !== undefined) return fields[Number(index)];
  if (!path) return undefined;
  return fields.find(
    (field) =>
      field.definitionId === path || field.key === path || field.label === path,
  );
}

function fallbackCopy(fieldName: string | undefined, code: string): IssueCopy {
  return {
    title: fieldName
      ? `Проверьте настройки поля «${fieldName}».`
      : "Проверка структуры полей не пройдена.",
    detail: fieldName
      ? `Откройте поле, проверьте обязательные настройки и повторите проверку. Код: ${code}.`
      : `Повторите проверку. Если ошибка останется, передайте поддержке код ${code}.`,
  };
}

export function presentContractIssues(
  issues: ContractIssueInput[],
  fields: AttributeContractDraftFieldDto[],
): ContractIssuePresentation[] {
  const result = new Map<string, ContractIssuePresentation>();

  for (const issue of issues) {
    const code = canonicalCode(issue.code);
    const field = fieldForIssue(issue, fields);
    const backendDefinitionId =
      "definitionId" in issue ? issue.definitionId : undefined;
    const fieldName =
      field?.label || field?.key || backendDefinitionId || issuePath(issue);
    const fieldIdentity =
      field?.definitionId || field?.key || backendDefinitionId;
    const severity = issueSeverity(issue);
    const key = `${code}:${fieldIdentity || issuePath(issue) || "contract"}`;
    const copy = issueCopy[code]?.(fieldName || "Без названия") ??
      fallbackCopy(fieldName, issue.code);
    const presentation: ContractIssuePresentation = {
      key,
      code: issue.code,
      severity,
      ...copy,
      ...(fieldIdentity
        ? {
            fieldIdentity,
            actionLabel:
              severity === "error" ? "Исправить поле" : "Проверить поле",
          }
        : {}),
    };

    const existing = result.get(key);
    if (!existing || existing.severity === "warning") result.set(key, presentation);
  }

  return [...result.values()];
}
