import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import type { SupportAvailabilitySnapshot } from "@/features/support-availability/api/support-availability-source";
import SupportAvailabilityStatus from "./SupportAvailabilityStatus.vue";

const availability: SupportAvailabilitySnapshot = {
  operatorId: "operator-1",
  projectId: "project-1",
  declaredState: "AVAILABLE",
  effectiveState: "AVAILABLE",
  acceptsNewWork: true,
  effectiveUntil: null,
  leaseRenewedAt: "2026-08-06T10:00:00.000Z",
  leaseUntil: null,
  reasonCode: "SHIFT_START",
  source: "SELF",
  transitionedAt: "2026-08-06T10:00:00.000Z",
  version: 1,
};

function render(canManage = true) {
  return mount(SupportAvailabilityStatus, {
    props: {
      availability,
      loading: false,
      changing: false,
      error: "",
      canManage,
      unknownOutcome: false,
      needsReconcile: false,
      canRetryAfterReconcile: false,
      draft: null,
    },
    global: { plugins: [PrimeVue] },
  });
}

describe("SupportAvailabilityStatus", () => {
  it("labels the server status and does not infer availability from the browser", () => {
    const wrapper = render();

    expect(wrapper.text()).toContain("Доступен");
    expect(wrapper.text()).toContain("Получаете новые обращения");
    expect(wrapper.text()).toContain("Вы выбрали");
    expect(wrapper.text()).not.toContain("online presence");
  });

  it("emits an explicit state change with a reason", async () => {
    const wrapper = render();
    const selects = wrapper.findAll("select");
    await selects[0]!.setValue("AWAY");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("change")).toEqual([
      [{ state: "AWAY", reasonCode: "BREAK", hardDurationSeconds: 900 }],
    ]);
  });

  it("does not mount mutation controls when the parent withholds self-manage authority", () => {
    const wrapper = render(false);

    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.text()).toContain("Получаете новые обращения");
  });
});
