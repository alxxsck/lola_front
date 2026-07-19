import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIProposalBadge from "./AIProposalBadge.vue";

describe("AIProposalBadge", () => {
  it.each([
    [0, ""],
    [1, "1"],
    [99, "99"],
    [100, "99+"],
  ])("renders the unread count %s", (count, label) => {
    const wrapper = mount(AIProposalBadge, { props: { count } });
    expect(wrapper.text()).toBe(label);
    expect(wrapper.find("span").exists()).toBe(count > 0);
    if (count > 0)
      expect(wrapper.get("span").attributes("aria-label")).toBe(
        `${count} непрочитанных предложений Lola`,
      );
  });
});
