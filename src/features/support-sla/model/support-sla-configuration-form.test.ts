import { describe, expect, it } from "vitest";
import {
  createEmptySupportSlaConfigurationForm,
  createSupportSlaConfigurationForm,
  serializeSupportSlaConfiguration,
} from "./support-sla-configuration-form";

describe("Support SLA configuration form", () => {
  it("splits an overnight interval into adjacent ISO weekdays", () => {
    const form = createEmptySupportSlaConfigurationForm();
    form.timeZone = "Europe/Madrid";
    form.weekly[0]!.intervals.push({ id: "monday-night", start: "22:00", end: "02:00" });
    form.rules[0]!.atRiskRemainingPercent = 20;
    form.rules[0]!.targetsMinutes = {
      firstHumanResponse: 60,
      nextHumanResponse: 120,
      resolution: 480,
    };

    const result = serializeSupportSlaConfiguration(form);

    expect(result.issues).toEqual([]);
    expect(result.configuration?.calendar.weekly).toEqual([
      { isoWeekday: 1, intervals: [{ startMinute: 1320, endMinute: 1440 }] },
      { isoWeekday: 2, intervals: [{ startMinute: 0, endMinute: 120 }] },
      { isoWeekday: 3, intervals: [] },
      { isoWeekday: 4, intervals: [] },
      { isoWeekday: 5, intervals: [] },
      { isoWeekday: 6, intervals: [] },
      { isoWeekday: 7, intervals: [] },
    ]);
  });

  it("rejects an invalid timezone and a conditioned fallback rule", () => {
    const form = createEmptySupportSlaConfigurationForm();
    form.timeZone = "Madrid local time";
    form.weekly[0]!.intervals.push({ id: "workday", start: "09:00", end: "18:00" });
    form.rules[0]!.priorities = ["URGENT"];
    form.rules[0]!.atRiskRemainingPercent = 20;
    form.rules[0]!.targetsMinutes = {
      firstHumanResponse: 60,
      nextHumanResponse: 120,
      resolution: 480,
    };

    const result = serializeSupportSlaConfiguration(form);

    expect(result.configuration).toBeNull();
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["TIME_ZONE_INVALID", "FALLBACK_CONDITIONED"]),
    );
  });

  it("hydrates a published configuration without sharing mutable arrays", () => {
    const configuration = {
      calendar: {
        timeZone: "Europe/Madrid",
        weekly: [{ isoWeekday: 1, intervals: [{ startMinute: 540, endMinute: 1080 }] }],
        exceptions: [{ localDate: "2026-12-25", intervals: [] }],
      },
      policy: {
        rules: [
          {
            code: "DEFAULT",
            order: 0,
            when: {},
            targets: {
              firstHumanResponseBusinessSeconds: 3600,
              nextHumanResponseBusinessSeconds: 7200,
              resolutionBusinessSeconds: 28_800,
            },
            atRiskRemainingPercent: 25,
            pause: {
              firstHumanResponseStatuses: [],
              nextHumanResponseStatuses: ["WAITING_END_USER" as const],
              resolutionStatuses: ["WAITING_SYSTEM" as const],
            },
          },
        ],
      },
    };

    const form = createSupportSlaConfigurationForm(configuration);
    form.weekly[0]!.intervals[0]!.start = "10:00";

    expect(configuration.calendar.weekly[0]!.intervals[0]!.startMinute).toBe(540);
    expect(form.rules[0]!.targetsMinutes).toEqual({
      firstHumanResponse: 60,
      nextHumanResponse: 120,
      resolution: 480,
    });
    expect(form.exceptions[0]).toMatchObject({ localDate: "2026-12-25", intervals: [] });
  });
});
