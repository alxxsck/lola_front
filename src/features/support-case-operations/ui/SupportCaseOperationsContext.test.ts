import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SupportRoutingContext,
  SupportSlaContext,
} from "@/features/support-workspace/api/support-workspace-source";
import SupportCaseOperationsContext from "./SupportCaseOperationsContext.vue";

const sla: SupportSlaContext = {
  rolloutState: "SHADOW",
  occurrenceState: "ACTIVE",
  clocks: [
    {
      kind: "FIRST_HUMAN_RESPONSE",
      timing: "RUNNING",
      risk: "AT_RISK",
      outcome: "OPEN",
      pauseReason: null,
      targetBusinessSeconds: 7_200,
      consumedBusinessMs: 1_800_000,
      remainingBusinessMs: 5_400_000,
      currentDeadlineAt: "2026-08-08T12:00:00.000Z",
      breachedAt: null,
      metAt: null,
    },
  ],
};

const routing: SupportRoutingContext = {
  state: "AVAILABLE",
  reasonCode: "CAPACITY_GAP",
  assignmentState: "UNASSIGNED",
  mode: "LIVE_PROPOSAL",
  outcome: "CAPACITY_GAP",
  queue: { code: "PAYMENTS", name: "Приоритетные платежи" },
  candidateCount: 4,
  eligibleCandidateCount: 0,
  exclusions: { CAPACITY_EXHAUSTED: 3, SKILL_REQUIRED: 1 },
  evaluatedAt: "2026-08-08T10:00:00.000Z",
  candidatesTruncated: false,
  reservation: null,
  fallback: {
    state: "SCHEDULED",
    candidateAttempt: 2,
    availableAt: "2026-08-08T10:05:00.000Z",
  },
};

afterEach(() => vi.useRealTimers());

describe("SupportCaseOperationsContext", () => {
  it("shows honest shadow SLA and routing eligibility without opaque identifiers", () => {
    const wrapper = mount(SupportCaseOperationsContext, {
      props: {
        caseId: "case-1",
        sla,
        routing,
        reservationReconcileAttempt: 0,
        reservationReconcileInFlight: false,
      },
    });

    expect(wrapper.text()).toContain("SLA и маршрутизация");
    expect(wrapper.text()).toContain("Теневой прогноз");
    expect(wrapper.text()).toContain("Первый ответ");
    expect(wrapper.text()).toContain("Под риском");
    expect(wrapper.text()).toContain("1 ч 30 мин");
    expect(wrapper.text()).toContain("Приоритетные платежи");
    expect(wrapper.text()).toContain("0 из 4 подходят");
    expect(wrapper.text()).toContain("Нет ёмкости ·3");
    expect(wrapper.text()).toContain("Не хватает навыка ·1");
    expect(wrapper.text()).not.toContain("PAYMENTS");
  });

  it("purges routing detail when the server redacts it", async () => {
    const wrapper = mount(SupportCaseOperationsContext, {
      props: {
        caseId: "case-1",
        sla,
        routing,
        reservationReconcileAttempt: 0,
        reservationReconcileInFlight: false,
      },
    });

    await wrapper.setProps({ routing: { state: "REDACTED" } });

    expect(wrapper.text()).toContain("Маршрутизация скрыта");
    expect(wrapper.text()).not.toContain("Приоритетные платежи");
  });

  it("requests an authoritative reconcile when a reservation reaches expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:00:00.000Z"));
    const wrapper = mount(SupportCaseOperationsContext, {
      props: {
        caseId: "case-1",
        sla,
        routing: {
          ...routing,
          assignmentState: "RESERVED",
          reservation: {
            expiresAt: "2026-08-08T10:00:01.000Z",
            capacityWeightUnits: 100,
          },
        },
        reservationReconcileAttempt: 0,
        reservationReconcileInFlight: false,
      },
    });

    await vi.advanceTimersByTimeAsync(1_001);

    expect(wrapper.emitted("reconcile")).toHaveLength(1);
    expect(wrapper.emitted("reconcile")?.[0]).toEqual([
      "2026-08-08T10:00:01.000Z",
    ]);
    expect(wrapper.text()).toContain("Проверяем актуальность");

    await wrapper.setProps({ reservationReconcileInFlight: true });
    expect(wrapper.text()).toContain("Проверяем актуальность");

    await wrapper.setProps({
      reservationReconcileAttempt: 1,
      reservationReconcileInFlight: false,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(wrapper.emitted("reconcile")).toHaveLength(2);

    await wrapper.setProps({ reservationReconcileAttempt: 3 });

    expect(wrapper.text()).not.toContain("Проверяем актуальность");
    expect(wrapper.text()).toContain("Нужно обновить статус");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(wrapper.emitted("reconcile")).toHaveLength(2);
  });
});
