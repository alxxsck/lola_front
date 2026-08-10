import { describe, expect, it } from "vitest";
import {
  formatBusinessDuration,
  routingReasonLabel,
  slaSignalLabel,
} from "./support-case-operations";

describe("support Case SLA and routing presentation", () => {
  it("formats server-owned business time without creating a live countdown", () => {
    expect(formatBusinessDuration(5_400_000)).toBe("1 ч 30 мин");
    expect(formatBusinessDuration(-90_000)).toBe("просрочено на 1 мин");
  });

  it("presents the authoritative SLA signal without release qualifiers", () => {
    expect(
      slaSignalLabel({
        state: "AVAILABLE",
        signalCode: "SLA_AT_RISK",
        kind: "FIRST_HUMAN_RESPONSE",
        timing: "RUNNING",
        risk: "AT_RISK",
        pauseReason: null,
        currentDeadlineAt: null,
        remainingBusinessMs: 900_000,
        computedAt: "2026-08-08T10:00:00.000Z",
      }),
    ).toBe("Риск первого ответа · 15 мин");
  });

  it("does not disguise degraded or stale routing as an assignment", () => {
    expect(routingReasonLabel("DEGRADED")).toBe(
      "Маршрутизация временно работает с ограничениями",
    );
    expect(routingReasonLabel("STALE_INPUT")).toBe(
      "Данные маршрутизации устарели",
    );
  });
});
