import { describe, expect, it } from "vitest";
import {
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
});
