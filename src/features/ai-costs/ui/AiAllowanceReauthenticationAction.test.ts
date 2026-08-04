import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AiAllowanceReauthenticationAction from "./AiAllowanceReauthenticationAction.vue";

describe("AiAllowanceReauthenticationAction", () => {
  it("emits one fresh-login request and locks the action while navigation is pending", async () => {
    const wrapper = mount(AiAllowanceReauthenticationAction, {
      props: { required: true },
    });
    const button = wrapper.get('[data-testid="allowance-fresh-login"]');

    await button.trigger("click");
    await button.trigger("click");

    expect(wrapper.emitted("fresh-login")).toEqual([[]]);
    expect(button.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("не будут повторены автоматически");
  });

  it("resets the one-click guard only after the requirement is cleared", async () => {
    const wrapper = mount(AiAllowanceReauthenticationAction, {
      props: { required: true },
    });
    await wrapper.get("button").trigger("click");
    await wrapper.setProps({ required: false });
    await wrapper.setProps({ required: true });
    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("fresh-login")).toEqual([[], []]);
  });
});
