import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it, vi } from "vitest";
import type { SupportAssignmentOffer } from "@/features/support-case-assignment/api/support-assignment-source";
import SupportAssignmentOfferTray from "./SupportAssignmentOfferTray.vue";

function controller(offers: SupportAssignmentOffer[]) {
  return {
    offers: ref(offers),
    offerLoading: ref(false),
    offerChangingId: ref<string | null>(null),
    offerError: ref(""),
    offerUnknownOutcome: ref(false),
    offerCanRetry: computed(() => false),
    expireOffers: vi.fn(),
    loadOffers: vi.fn(),
    actOnOffer: vi.fn(),
    retryUnknownOfferOutcome: vi.fn(),
  };
}

describe("SupportAssignmentOfferTray", () => {
  it("keeps private offers globally actionable without rendering capabilities", async () => {
    const assignment = controller([
      {
        assignmentId: "offer-assignment-1",
        caseId: "case-2",
        assignmentVersion: 6,
        expiresAt: "2099-08-08T12:00:00.000Z",
        actionEtag: '"so1.private"',
        offerToken: "opaque-routing-offer-token",
      },
    ]);
    const wrapper = mount(SupportAssignmentOfferTray, {
      props: { controller: assignment as never },
      global: { plugins: [PrimeVue] },
    });

    await wrapper
      .get("button[aria-label='Принять предложение назначения']")
      .trigger("click");

    expect(assignment.actOnOffer).toHaveBeenCalledWith(
      "offer-assignment-1",
      "ACCEPT",
    );
    expect(wrapper.text()).toContain("Предложение из очереди");
    expect(wrapper.html()).not.toContain("opaque-routing-offer-token");
    expect(wrapper.html()).not.toContain("so1.private");
  });

  it("does not reserve workspace height when there is no offer state", () => {
    const wrapper = mount(SupportAssignmentOfferTray, {
      props: { controller: controller([]) as never },
      global: { plugins: [PrimeVue] },
    });

    expect(wrapper.html()).toBe("<!--v-if-->");
  });

  it("does not move the workspace while an empty offer check is pending", async () => {
    const assignment = controller([]);
    assignment.offerLoading.value = true;
    const wrapper = mount(SupportAssignmentOfferTray, {
      props: { controller: assignment as never },
      global: { plugins: [PrimeVue] },
    });

    expect(wrapper.html()).toBe("<!--v-if-->");
  });

  it("removes an expired offer from the action surface without a click", () => {
    const wrapper = mount(SupportAssignmentOfferTray, {
      props: {
        controller: controller([
          {
            assignmentId: "expired-assignment",
            caseId: "case-expired",
            assignmentVersion: 2,
            expiresAt: "2000-01-01T00:00:00.000Z",
            actionEtag: '"so1.expired"',
            offerToken: "expired-private-token",
          },
        ]) as never,
      },
      global: { plugins: [PrimeVue] },
    });

    expect(wrapper.html()).toBe("<!--v-if-->");
  });
});
