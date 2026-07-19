import { describe, expect, it } from "vitest";

import { formatProfileValue, profileValueStateLabel } from "./profile-value";

describe("Current Profile value formatting", () => {
  it("preserves DECIMAL strings and DATE calendar values exactly", () => {
    expect(
      formatProfileValue({ type: "DECIMAL", value: "9007199254740993.1200" }),
    ).toBe("9007199254740993.1200");
    expect(formatProfileValue({ type: "DATE", value: "2026-07-19" })).toBe(
      "19.07.2026",
    );
  });

  it("does not invent values for unavailable fields", () => {
    expect(profileValueStateLabel("MISSING")).toBe("Не передано");
    expect(profileValueStateLabel("DENIED")).toBe("Скрыто политикой");
  });
});
