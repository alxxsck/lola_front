import { describe, expect, it } from "vitest";
import {
  eventQueryPolicyItemFromConfiguration,
  eventQueryPolicyItemApply,
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

  it("parses server-owned per-Event configuration and builds an atomic apply command", () => {
    const item = eventQueryPolicyItemFromConfiguration("deposit.completed", {
      stableCode: "deposit.completed",
      descriptionForAI: "Факт успешного депозита",
      allowedModes: ["SUMMARY"],
      maxInteractiveLookbackHours: 168,
      maxVerificationLookbackHours: 720,
      safeFields: [],
    });
    expect(item?.stableCode).toBe("deposit.completed");
    expect(
      eventQueryPolicyItemApply(item!, false, true, "eq-item-v1.token"),
    ).toEqual({
      concurrencyToken: "eq-item-v1.token",
      enabled: false,
      endUserConversationEnabled: true,
      descriptionForAI: "Факт успешного депозита",
      allowedModes: ["SUMMARY"],
      maxInteractiveLookbackHours: 168,
      maxVerificationLookbackHours: 720,
      safeFields: [],
    });
    expect(
      eventQueryPolicyItemFromConfiguration("deposit.completed", {
        descriptionForAI: "Broken",
        allowedModes: [],
      }),
    ).toBeNull();
  });
});
