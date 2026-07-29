import { describe, expect, it } from "vitest";
import {
  eventQueryPolicyHardLimitViolations,
  eventQueryPolicyImpact,
  eventPolicyState,
  flattenSchemaFields,
  schemaTypeToSemanticType,
} from "./event-query-policy";

describe("event query policy presentation", () => {
  it("flattens only typed leaf fields and never exposes arbitrary object paths", () => {
    const fields = flattenSchemaFields({
      type: "object",
      properties: {
        amount: { type: "number" },
        payment: {
          type: "object",
          properties: {
            currency: { type: "string" },
            secret: { type: "object" },
          },
        },
      },
    });

    expect(fields).toEqual([
      { path: "amount", schemaType: "number" },
      { path: "payment.currency", schemaType: "string" },
    ]);
    expect(fields.some((field) => field.path === "payment.secret")).toBe(false);
  });

  it("derives conservative semantic defaults from schema types", () => {
    expect(schemaTypeToSemanticType("integer")).toBe("INTEGER");
    expect(schemaTypeToSemanticType("number")).toBe("DECIMAL");
    expect(schemaTypeToSemanticType("boolean")).toBe("BOOLEAN");
    expect(schemaTypeToSemanticType("string")).toBe("STRING");
  });

  it("distinguishes disabled, draft, published and invalid definitions", () => {
    const draftItem = { stableCode: "deposit.completed" };
    expect(eventPolicyState("game.started", [], [], [])).toBe("disabled");
    expect(eventPolicyState("deposit.completed", [draftItem], [], [])).toBe(
      "draft",
    );
    expect(
      eventPolicyState("deposit.completed", [draftItem], [draftItem], []),
    ).toBe("published");
    expect(
      eventPolicyState(
        "deposit.completed",
        [draftItem],
        [draftItem],
        [{ location: "items[0].safeFields[0]" }],
      ),
    ).toBe("invalid");
  });

  it("summarizes publish impact without exposing schema payloads", () => {
    const existing = {
      stableCode: "deposit.completed",
      descriptionForAI: "Депозит",
      allowedModes: ["SUMMARY" as const],
      maxInteractiveLookbackHours: 24,
      maxVerificationLookbackHours: 24,
      safeFields: [],
    };
    expect(
      eventQueryPolicyImpact(
        { enabled: false, items: [existing] },
        {
          enabled: true,
          items: [
            { ...existing, descriptionForAI: "Успешный депозит" },
            { ...existing, stableCode: "game.started" },
          ],
        },
      ),
    ).toEqual({
      enabledChanged: true,
      addedEvents: 1,
      changedEvents: 1,
      removedEvents: 0,
    });
  });

  it("blocks documents that exceed platform hard limits before publish", () => {
    const item = {
      stableCode: "deposit.completed",
      descriptionForAI: "Депозит",
      allowedModes: ["SUMMARY" as const],
      maxInteractiveLookbackHours: 24,
      maxVerificationLookbackHours: 24,
      safeFields: [],
    };
    const violations = eventQueryPolicyHardLimitViolations({
      enabled: true,
      items: Array.from({ length: 51 }, (_, index) => ({
        ...item,
        stableCode: `event.${index}`,
      })),
    });
    expect(violations).toEqual(["Не более 50 типов событий в одной политике."]);
  });
});
