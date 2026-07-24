import { describe, expect, it } from "vitest";
import {
  formatAdmissionSummary,
  formatQuietHoursPreview,
  importanceClassPresentation,
} from "./scenario-admission.model";

describe("Scenario Admission presentation", () => {
  it("renders exact global limits without rounding seconds", () => {
    expect(
      formatAdmissionSummary({
        maxStartsPerLocalDay: 3,
        maxStartsPerVisit: 2,
        minimumIntervalSeconds: 3600,
      }),
    ).toBe(
      "Не более 3 запусков за локальные сутки, не более 2 за один визит, пауза не меньше 1 часа.",
    );
    expect(
      formatAdmissionSummary({
        maxStartsPerLocalDay: null,
        maxStartsPerVisit: null,
        minimumIntervalSeconds: 90,
      }),
    ).toContain("1 мин 30 сек");
  });

  it("keeps a cross-midnight Quiet Hours interval explicit", () => {
    expect(formatQuietHoursPreview("22:00", "08:00")).toBe(
      "С 22:00 до полуночи и с полуночи до 08:00.",
    );
    expect(formatQuietHoursPreview("00:00", "08:00")).toBe(
      "С 00:00 включительно до 08:00.",
    );
  });

  it("falls back safely for future importance classes", () => {
    expect(importanceClassPresentation("SECURITY").title).toBe("Безопасность");
    expect(importanceClassPresentation("FUTURE_CLASS").title).toBe(
      "Новый тип — обновите интерфейс",
    );
  });
});
