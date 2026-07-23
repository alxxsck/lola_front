import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { NotificationOperationsDelivery } from "../model/notification-operations";
import ExceptionalDeliveryTable from "./ExceptionalDeliveryTable.vue";

const delivery: NotificationOperationsDelivery = {
  id: "00000000-0000-4000-8000-000000000020",
  projectId: "00000000-0000-4000-8000-000000000010",
  channel: "SLACK_WEBHOOK",
  status: "DEAD_LETTER",
  errorCategory: "TRANSIENT",
  attemptCount: 3,
  operationsVersion: 2,
  replayEligibility: "ELIGIBLE_KNOWN_NOT_ACCEPTED",
  contentAvailable: false,
  createdAt: "2026-07-23T09:00:00.000Z",
  updatedAt: "2026-07-23T10:00:00.000Z",
};

describe("ExceptionalDeliveryTable", () => {
  it("offers replay only for exact eligibility and operate authority", async () => {
    const wrapper = mount(ExceptionalDeliveryTable, {
      props: {
        items: [
          delivery,
          {
            ...delivery,
            id: "00000000-0000-4000-8000-000000000021",
            replayEligibility: "INELIGIBLE_AMBIGUOUS",
          },
        ],
        permissions: { read: true, operate: true },
        nextCursor: null,
        loading: false,
      },
    });

    const buttons = wrapper.findAll(".action-button");
    expect(buttons).toHaveLength(1);
    expect(wrapper.text()).toContain("Нельзя: результат неоднозначен");
    await buttons[0]!.trigger("click");
    expect(wrapper.emitted("replay")).toEqual([[delivery.id]]);
  });

  it("keeps the same rows read-only without operate authority", () => {
    const wrapper = mount(ExceptionalDeliveryTable, {
      props: {
        items: [delivery],
        permissions: { read: true, operate: false },
        nextCursor: null,
        loading: false,
      },
    });

    expect(wrapper.find(".action-button").exists()).toBe(false);
    expect(wrapper.text()).toContain("Недоступно");
  });
});
