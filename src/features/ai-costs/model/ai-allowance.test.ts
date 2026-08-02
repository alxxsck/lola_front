import { describe, expect, it } from "vitest";
import { parseAllowanceUsd, parseSignedDecimal } from "./ai-allowance";

describe("AI allowance exact USD values", () => {
  it("accepts the backend Decimal(24,12) boundary without Number coercion", () => {
    expect(parseAllowanceUsd("999999999999.123456789012")).toBe(
      "999999999999.123456789012",
    );
    expect(parseSignedDecimal("-0.000000000001")).toBe("-0.000000000001");
  });

  it("rejects exponent notation, excess precision, excess magnitude and negative grant inputs", () => {
    expect(parseAllowanceUsd("1e-9")).toBeUndefined();
    expect(parseAllowanceUsd("0.1234567890123")).toBeUndefined();
    expect(parseAllowanceUsd("1000000000000")).toBeUndefined();
    expect(parseAllowanceUsd("-1")).toBeUndefined();
  });
});
