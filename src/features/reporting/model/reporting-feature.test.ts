import { describe, expect, it } from "vitest";
import { reportingMvpEnabledFromEnv } from "./reporting-feature";

describe("Reporting MVP feature switch", () => {
  it("is available by default only for tests and explicit mock development", () => {
    expect(reportingMvpEnabledFromEnv(undefined, "test", "api")).toBe(true);
    expect(reportingMvpEnabledFromEnv(undefined, "development", "mock")).toBe(
      true,
    );
    expect(reportingMvpEnabledFromEnv(undefined, "production", "api")).toBe(
      false,
    );
  });

  it("supports an explicit rollback switch", () => {
    expect(reportingMvpEnabledFromEnv("false", "test", "mock")).toBe(false);
    expect(reportingMvpEnabledFromEnv("true", "production", "api")).toBe(
      true,
    );
  });
});
