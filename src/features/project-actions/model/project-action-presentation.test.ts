import { describe, expect, it } from "vitest";
import { actionExecutorLabel } from "./project-action-presentation";

describe("actionExecutorLabel", () => {
  it("uses the Case escalation and retired executor vocabulary", () => {
    expect(actionExecutorLabel("CASE_ESCALATION")).toBe("Эскалация обращения");
    expect(actionExecutorLabel("RETIRED")).toBe("Выведено из эксплуатации");
    expect(actionExecutorLabel("PROPOSAL")).toBe("Способ выполнения не указан");
  });
});
