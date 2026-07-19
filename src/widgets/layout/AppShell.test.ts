import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell.vue";

describe("AppShell", () => {
  it("keeps navigation and account controls in separate sidebar regions", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/overview", component: { template: "<div />" } }],
    });
    await router.push("/overview");
    await router.isReady();

    const wrapper = mount(AppShell, {
      global: {
        plugins: [createPinia(), router],
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          Avatar: { template: "<span />" },
          Menu: { template: "<div />" },
          Tag: { template: "<span />" },
        },
      },
    });

    expect({
      navigationLinks: wrapper.findAll(".sidebar-scroll nav a").length,
      themeSwitchVisible: wrapper.find(".theme-switch").exists(),
      profileInFooter: wrapper
        .find(".sidebar-footer .sidebar-profile")
        .exists(),
      modeInFooter: wrapper.find(".sidebar-footer .sidebar-note").exists(),
    }).toEqual({
      navigationLinks: 12,
      themeSwitchVisible: true,
      profileInFooter: true,
      modeInFooter: true,
    });
  });
});
