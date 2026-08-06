import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import type { SupportRoutingOffer } from "@/features/support-routing-offers/api/support-routing-offer-source";
import SupportRoutingOffers from "./SupportRoutingOffers.vue";

const offer: SupportRoutingOffer = {
  assignmentId: "assignment-1",
  caseId: "case-1",
  assignmentVersion: 3,
  actionEtag: '"so1.current.signature"',
  offerToken: "opaque-routing-offer-token",
  expiresAt: "2026-08-06T10:15:00.000Z",
};

function render(offers: SupportRoutingOffer[] = [offer]) {
  return mount(SupportRoutingOffers, {
    props: {
      offers,
      loading: false,
      changingOfferId: null,
      error: "",
      unknownOutcome: false,
      lastOutcome: null,
      canRetry: false,
    },
    global: {
      plugins: [PrimeVue],
      stubs: {
        Dialog: {
          props: ["visible"],
          template: "<div v-if=\"visible\"><slot /><slot name=\"footer\" /></div>",
        },
      },
    },
  });
}

describe("SupportRoutingOffers", () => {
  it("renders the server deadline without exposing capability or internal routing identifiers", () => {
    const wrapper = render();

    expect(wrapper.text()).toContain("Новое назначение");
    expect(wrapper.text()).toContain("Подтвердите или отклоните предложение");
    expect(wrapper.html()).not.toContain("opaque-routing-offer-token");
    expect(wrapper.html()).not.toContain("so1.current.signature");
    expect(wrapper.html()).not.toContain("case-1");
  });

  it("requires a confirmation before declining and emits the exact offer action", async () => {
    const wrapper = render();

    await wrapper.get("button[aria-label='Отклонить']").trigger("click");
    expect(wrapper.text()).toContain("Предложение вернётся в серверный routing-процесс");
    await wrapper.get("button[aria-label='Подтвердить отказ']").trigger("click");

    expect(wrapper.emitted("action")).toEqual([["assignment-1", "DECLINE"]]);
  });

  it("keeps a no-offer state explicit instead of fabricating a queue assignment", () => {
    const wrapper = render([]);

    expect(wrapper.text()).toContain("Активных предложений сейчас нет.");
    expect(wrapper.find(".routing-offers__list").exists()).toBe(false);
  });
});
