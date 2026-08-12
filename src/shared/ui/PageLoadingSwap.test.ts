import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PageLoadingSwap from "./PageLoadingSwap.vue";

describe("PageLoadingSwap", () => {
  it("exposes one loading layer and swaps it for content after readiness", async () => {
    const wrapper = mount(PageLoadingSwap, {
      props: { loading: true },
      slots: {
        loading: '<div data-testid="loading">Loading</div>',
        default: '<div data-testid="content">Content</div>',
      },
    });

    expect(wrapper.attributes("aria-busy")).toBe("true");
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(false);

    await wrapper.setProps({ loading: false });

    expect(wrapper.attributes("aria-busy")).toBe("false");
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true);
  });
});
