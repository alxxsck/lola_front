import { describe, expect, it } from "vitest";
import {
  eventQueryPeriodOptions,
  eventQueryTimeRange,
} from "./event-query-range";

describe("event query ranges", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("keeps presets inside the policy bound and exposes an exact policy maximum", () => {
    expect(eventQueryPeriodOptions({ maxHours: 48, now })).toEqual([
      { value: "LAST_24_HOURS", label: "24 часа", hours: 24 },
      { value: "POLICY_MAX", label: "48 ч. (лимит политики)", hours: 48 },
    ]);
    expect(eventQueryTimeRange("POLICY_MAX", 48, now)).toEqual({
      kind: "EXPLICIT",
      from: "2026-07-27T12:00:00.000Z",
      to: "2026-07-29T12:00:00.000Z",
    });
  });

  it("includes the current Case window only when it is within the verification bound", () => {
    expect(
      eventQueryPeriodOptions({
        maxHours: 168,
        now,
        caseCreatedAt: "2026-07-28T12:00:00.000Z",
      })[0],
    ).toEqual({
      value: "CURRENT_CASE_WINDOW",
      label: "С открытия обращения",
      hours: 24,
    });
    expect(
      eventQueryPeriodOptions({
        maxHours: 12,
        now,
        caseCreatedAt: "2026-07-28T12:00:00.000Z",
      }).some((option) => option.value === "CURRENT_CASE_WINDOW"),
    ).toBe(false);
  });
});
