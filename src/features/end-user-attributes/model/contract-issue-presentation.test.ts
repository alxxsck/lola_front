import { describe, expect, it } from "vitest";
import type {
  AttributeContractDraftFieldDto,
  AttributeContractIssueResponseDto,
} from "@/shared/api/generated/models";
import { createContractField } from "./contract-domain";
import { presentContractIssues } from "./contract-issue-presentation";

const field: AttributeContractDraftFieldDto = {
  ...createContractField(10),
  definitionId: "definition-loyalty",
  key: "loyaltyLevel",
  label: "Уровень лояльности",
  purpose: "Собирать сегменты по уровню лояльности",
};

function backendIssue(
  code: string,
  overrides: Partial<AttributeContractIssueResponseDto> = {},
): AttributeContractIssueResponseDto {
  return {
    code,
    compatibility: "CONDITIONAL",
    definitionId: field.definitionId,
    message: `Technical backend message for ${code}`,
    severity: "WARNING",
    ...overrides,
  };
}

describe("contract issue presentation", () => {
  it.each([
    ["ATTRIBUTE_PURPOSE_REQUIRED", "Укажите назначение", "Для чего нужно это поле?"],
    ["ATTRIBUTE_REQUIREMENT_CHANGED", "Изменилась обязательность", "передавать поле"],
    ["ATTRIBUTE_REQUIRED_WARN_ADDED", "Поле стало желательным", "предупреждение"],
    ["ATTRIBUTE_REQUIRED_ENFORCED_ADDED", "Поле стало обязательным", "отклоняться"],
    ["ATTRIBUTE_EXPOSURE_BROADENED", "Поле стало доступно", "раздел"],
    ["ATTRIBUTE_CONSTRAINTS_CHANGED", "Изменились допустимые значения", "данные"],
    ["ATTRIBUTE_LIFECYCLE_CHANGED", "Изменился статус поля", "связанные настройки"],
  ])("maps backend code %s to actionable Russian copy", (code, title, detail) => {
    const [result] = presentContractIssues([backendIssue(code)], [field]);

    expect(result).toMatchObject({
      title: expect.stringContaining(title),
      detail: expect.stringContaining(detail),
      fieldIdentity: "definition-loyalty",
      actionLabel: "Проверить поле",
    });
    expect(JSON.stringify(result)).not.toContain("Technical backend message");
  });

  it("resolves a field by definition id, backend field key, or local path", () => {
    const results = presentContractIssues(
      [
        backendIssue("ATTRIBUTE_CONSTRAINTS_CHANGED"),
        backendIssue("ATTRIBUTE_LIFECYCLE_CHANGED", {
          definitionId: undefined,
          field: "loyaltyLevel",
        }),
        {
          code: "DEPRECATION_PLAN_REQUIRED",
          path: "fields.0.lifecycle",
          message: "local message",
          severity: "warning",
        },
      ],
      [field],
    );

    expect(results).toHaveLength(3);
    expect(results.every((issue) => issue.fieldIdentity === field.definitionId)).toBe(
      true,
    );
  });

  it("deduplicates the local and backend form of the same purpose error", () => {
    const results = presentContractIssues(
      [
        {
          code: "PURPOSE_REQUIRED",
          path: "fields.0.purpose",
          message: "local message",
          severity: "error",
        },
        backendIssue("ATTRIBUTE_PURPOSE_REQUIRED", {
          message:
            "A purpose is required for PERSONAL/SENSITIVE or exposed Attributes",
          severity: "ERROR",
        }),
      ],
      [field],
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      severity: "error",
      actionLabel: "Исправить поле",
    });
  });

  it("uses a safe Russian fallback for a new unknown backend code", () => {
    const [result] = presentContractIssues(
      [backendIssue("ATTRIBUTE_NEW_SERVER_RULE", { severity: "ERROR" })],
      [field],
    );

    expect(result).toMatchObject({
      title: "Проверьте настройки поля «Уровень лояльности».",
      detail: expect.stringContaining("ATTRIBUTE_NEW_SERVER_RULE"),
      actionLabel: "Исправить поле",
    });
    expect(JSON.stringify(result)).not.toContain("Technical backend message");
  });
});
