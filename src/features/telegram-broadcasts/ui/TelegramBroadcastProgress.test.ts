import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TelegramBroadcastProgress from "./TelegramBroadcastProgress.vue";

describe("TelegramBroadcastProgress", () => {
  it("renders a localized safe terminal reason without raw code or identity", () => {
    const wrapper = mount(TelegramBroadcastProgress, {
      props: {
        progress: {
          total: 1,
          pending: 0,
          sending: 0,
          sent: 0,
          retryWait: 0,
          outcomeUnknown: 0,
          failedPermanent: 0,
          suppressedLink: 0,
          suppressedConsent: 1,
          suppressedInstallation: 0,
          cancelled: 0,
        },
        deliveries: [
          {
            id: "opaque-delivery-1",
            status: "SUPPRESSED_CONSENT",
            safeFailureCategory: "CONSENT_REVOKED",
            createdAt: "2026-07-23T10:00:00.000Z",
            finishedAt: "2026-07-23T10:00:01.000Z",
          },
        ],
        deliveryTotal: 1,
        nextDeliveryCursor: null,
        loading: false,
      },
    });

    const table = wrapper.get('[role="table"]');
    expect(table.text()).toContain("Причина");
    expect(table.text()).toContain("Явное согласие отозвано или устарело");
    expect(table.text()).not.toContain("CONSENT_REVOKED");
    expect(wrapper.text()).not.toMatch(/endUser|chatId|telegramUser/i);
  });
});
