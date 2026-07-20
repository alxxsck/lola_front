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
    ["ATTRIBUTE_PURPOSE_REQUIRED", "Укажите назначение"],
    ["ATTRIBUTE_REQUIREMENT_CHANGED", "Изменилась обязательность"],
    ["ATTRIBUTE_REQUIRED_WARN_ADDED", "Поле стало желательным"],
    ["ATTRIBUTE_REQUIRED_ENFORCED_ADDED", "Поле стало обязательным"],
    ["ATTRIBUTE_EXPOSURE_BROADENED", "Поле стало доступно"],
    ["ATTRIBUTE_CONSTRAINTS_CHANGED", "Изменились допустимые значения"],
    ["ATTRIBUTE_LIFECYCLE_CHANGED", "Изменился статус поля"],
  ])("keeps the local title for backend code %s and shows its message", (code, title) => {
    const [result] = presentContractIssues([backendIssue(code)], [field]);

    expect(result).toMatchObject({
      title: expect.stringContaining(title),
      detail: `Technical backend message for ${code}`,
      fieldIdentity: "definition-loyalty",
      actionLabel: "Проверить поле",
    });
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

  it("trims a backend message and falls back to local detail when it is blank", () => {
    const [withMessage] = presentContractIssues(
      [
        backendIssue("ATTRIBUTE_CONSTRAINTS_CHANGED", {
          message: "  Проверьте формат уже переданных значений.  ",
        }),
      ],
      [field],
    );
    const [withoutMessage] = presentContractIssues(
      [backendIssue("ATTRIBUTE_CONSTRAINTS_CHANGED", { message: "   " })],
      [field],
    );

    expect(withMessage.detail).toBe("Проверьте формат уже переданных значений.");
    expect(withoutMessage.detail).toBe(
      "Проверьте, что уже передаваемые данные соответствуют новым ограничениям.",
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
            "Укажите назначение персонального или доступного разделам поля.",
          severity: "ERROR",
        }),
      ],
      [field],
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      code: "ATTRIBUTE_PURPOSE_REQUIRED",
      severity: "error",
      detail:
        "Укажите назначение персонального или доступного разделам поля.",
      actionLabel: "Исправить поле",
    });
  });

  it("uses a safe Russian title and backend detail for a new unknown code", () => {
    const [result] = presentContractIssues(
      [backendIssue("ATTRIBUTE_NEW_SERVER_RULE", { severity: "ERROR" })],
      [field],
    );

    expect(result).toMatchObject({
      title: "Проверьте настройки поля «Уровень лояльности».",
      detail: "Technical backend message for ATTRIBUTE_NEW_SERVER_RULE",
      actionLabel: "Исправить поле",
    });
  });
});
