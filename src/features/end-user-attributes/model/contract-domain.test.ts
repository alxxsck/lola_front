import { describe, expect, it } from "vitest";

import {
  createContractField,
  parseAllowedValues,
  validateContractDocument,
} from "./contract-domain";

describe("Attribute Contract draft", () => {
  it("creates a policy-safe optional field", () => {
    expect(createContractField(10)).toMatchObject({
      lifecycle: "ACTIVE",
      position: 10,
      requirement: "OPTIONAL",
      policies: {
        adminRead: true,
        aiRead: false,
        audienceRead: false,
        clientRead: false,
        exportRead: false,
        indexPolicy: "NONE",
        templateRead: false,
      },
    });
  });

  it("reports duplicate keys and dangerous client exposure", () => {
    const first = {
      ...createContractField(10),
      key: "risk_score",
      label: "Risk score",
      classification: "SENSITIVE" as const,
      policies: { ...createContractField(10).policies, clientRead: true },
    };
    const issues = validateContractDocument({
      fields: [first, { ...first, position: 20 }],
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["DUPLICATE_KEY", "SENSITIVE_CLIENT_READ"]),
    );
  });

  it("keeps DECIMAL enum precision and parses scalar constraints by declared type", () => {
    expect(
      parseAllowedValues("DECIMAL", "9007199254740993.1200\n0.10"),
    ).toEqual(["9007199254740993.1200", "0.10"]);
    expect(parseAllowedValues("INTEGER", "1\n42")).toEqual([1, 42]);
    expect(() => parseAllowedValues("BOOLEAN", "maybe")).toThrow(
      "true или false",
    );
  });
});
