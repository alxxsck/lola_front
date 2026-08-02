import { describe, expect, it } from "vitest";
import {
  addDecimalStrings,
  compareDecimalStrings,
  decimalRatio,
  formatDecimalMoney,
  parseDecimalString,
} from "./decimal-money";

describe("decimal money", () => {
  it("keeps canonical provider decimals as strings and rejects number coercion", () => {
    expect(parseDecimalString("9007199254740993.000000000001")).toBe(
      "9007199254740993.000000000001",
    );
    expect(parseDecimalString(0.1)).toBeUndefined();
  });

  it("adds and compares decimal strings without floating-point arithmetic", () => {
    expect(addDecimalStrings(["0.1", "0.2", "0.000000000001"])).toBe(
      "0.300000000001",
    );
    expect(
      compareDecimalStrings(
        "9007199254740993.000000000001",
        "9007199254740993",
      ),
    ).toBe(1);
    expect(compareDecimalStrings("0.0100", "0.01")).toBe(0);
  });

  it("formats money and derives bounded chart ratios without parsing a decimal to Number", () => {
    expect(formatDecimalMoney("0.0012", "usd")).toBe("< 0,01 $");
    expect(
      formatDecimalMoney("0.013200000000", "usd", {
        maximumFractionDigits: 6,
      }),
    ).toBe("0,0132 $");
    expect(decimalRatio("0.2", "0.3")).toBeCloseTo(2 / 3, 6);
    expect(decimalRatio("2", "1")).toBe(1);
  });
});
