import { describe, expect, it } from "vitest";
import { endUserCaseEventLabel } from "./end-user-case-presentation";

describe("End User Case escalation event labels", () => {
  it.each([
    ["ADMIN_ATTENTION_REQUESTED", "Запрошена помощь администратора"],
    ["ADMIN_ATTENTION_CLAIMED", "Специалист взял обращение в работу"],
    ["ADMIN_ATTENTION_RELEASED", "Обращение возвращено в очередь специалистов"],
    ["ADMIN_ATTENTION_TRANSFERRED", "Обращение передано другому специалисту"],
    ["ADMIN_ATTENTION_CLOSED", "Помощь специалиста завершена"],
    ["ADMIN_ATTENTION_CANCELLED", "Запрос специалиста отменён"],
  ])("renders %s as readable lifecycle history", (event, label) => {
    expect(endUserCaseEventLabel(event)).toBe(label);
    expect(endUserCaseEventLabel(event)).not.toBe("Обращение обновлено");
  });
});
