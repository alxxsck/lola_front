import { describe, expect, it } from "vitest";
import {
  aiOperationActorLabel,
  aiOperationCategoryLabel,
  aiOperationChargedAccountLabel,
  aiOperationCostLabel,
  aiOperationStatusPresentation,
} from "./project-ai-operation-presentation";

describe("project AI operation presentation", () => {
  it("uses explicit actor roles instead of inferring them from nullable IDs", () => {
    expect(
      aiOperationActorLabel({
        type: "CMS_USER",
        id: "admin-1",
        displayName: "Анна",
      }),
    ).toBe("Анна");
    expect(aiOperationActorLabel({ type: "SYSTEM" })).toBe("Система Lola");
    expect(aiOperationActorLabel({ type: "END_USER", id: "user-1" })).toBe(
      "Пользователь user-1",
    );
  });

  it("keeps cost ownership distinct from data participation", () => {
    expect(aiOperationChargedAccountLabel("PROJECT_BUDGET")).toBe(
      "Бюджет проекта",
    );
    expect(aiOperationChargedAccountLabel("END_USER_ALLOWANCE")).toBe(
      "AI-лимит пользователя",
    );
  });

  it("formats stable status, category and monetary labels", () => {
    expect(aiOperationStatusPresentation("FAILED")).toEqual({
      label: "Ошибка",
      severity: "danger",
    });
    expect(aiOperationCategoryLabel("AI_ANALYSIS")).toBe("AI-анализ");
    expect(aiOperationCostLabel("0.0245")).toContain("$0.0245");
  });
});
