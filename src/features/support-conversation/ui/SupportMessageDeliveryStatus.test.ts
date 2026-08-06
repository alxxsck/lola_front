import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SupportMessageDeliveryStatus from "./SupportMessageDeliveryStatus.vue";

describe("SupportMessageDeliveryStatus", () => {
  it("labels a pending receipt as accepted rather than delivered", () => {
    const wrapper = mount(SupportMessageDeliveryStatus, {
      props: { status: "PENDING" },
    });

    expect(wrapper.text()).toContain("Принято, ожидает доставки");
    expect(wrapper.text()).not.toContain("Доставлено");
  });

  it("marks failed delivery as an error rather than a success status", () => {
    const wrapper = mount(SupportMessageDeliveryStatus, {
      props: { status: "FAILED" },
    });

    expect(wrapper.attributes("role")).toBe("alert");
    expect(wrapper.classes()).toContain("delivery-status--danger");
  });
});
