import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIProposalBadge from "./AIProposalBadge.vue";

describe("AIProposalBadge", () => {
  it.each([
    [0, "", ""],
    [1, "1", "1 непрочитанное предложение Lola"],
    [99, "99", "99 непрочитанных предложений Lola"],
    [100, "99+", "100 непрочитанных предложений Lola"],
  ])("renders the unread count %s", (count, label, ariaLabel) => {
    const wrapper = mount(AIProposalBadge, { props: { count } });
    expect(wrapper.text()).toBe(label);
    expect(wrapper.find("span").exists()).toBe(count > 0);
    if (count > 0)
      expect(wrapper.get("span").attributes("aria-label")).toBe(ariaLabel);
  });
});
