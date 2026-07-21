import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell.vue";
import { useAuthStore } from "@/features/auth/auth.store";

describe("AppShell", () => {
  it("keeps navigation and account controls in separate sidebar regions", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Оператор",
        role: "OWNER",
        platformPermissionCodes: ["platform.cms_users.read"],
      },
      project: {
        id: "project-1",
        name: "Project One",
        slug: "project-one",
        status: "ACTIVE",
        publicKey: "public",
        defaultLocale: "ru",
        supportedLocales: ["ru"],
        assistantName: "Lola",
        systemPrompt: "",
        voiceInstructions: "",
        settings: {},
      },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/overview", component: { template: "<div />" } }],
    });
    await router.push("/overview");
    await router.isReady();

    const wrapper = mount(AppShell, {
      global: {
        plugins: [pinia, router],
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
      profileFieldsLink: wrapper
        .findAll(".sidebar-scroll nav a")
        .find((link) => link.text().includes("Поля профиля"))
        ?.attributes("href"),
      themeSwitchVisible: wrapper.find(".theme-switch").exists(),
      profileInFooter: wrapper
        .find(".sidebar-footer .sidebar-profile")
        .exists(),
      modeInFooter: wrapper.find(".sidebar-footer .sidebar-note").exists(),
    }).toEqual({
      navigationLinks: 16,
      profileFieldsLink: "/profile-fields",
      themeSwitchVisible: true,
      profileInFooter: true,
      modeInFooter: true,
    });
  });

  it("shows a projectless Platform Operator only the available control-plane navigation", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Оператор",
        platformPermissionCodes: ["platform.cms_users.read"],
      },
      project: null,
      projects: [],
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/platform/cms-users", component: { template: "<div />" } }],
    });
    await router.push("/platform/cms-users");
    await router.isReady();

    const wrapper = mount(AppShell, {
      global: {
        plugins: [pinia, router],
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          Avatar: { template: "<span />" },
          Menu: { template: "<div />" },
          Tag: { template: "<span />" },
        },
      },
    });

    const links = wrapper.findAll(".sidebar-scroll nav a");
    expect(links.map((link) => link.text())).toEqual(["CMS Users"]);
    expect(wrapper.text()).toContain("Управление платформой");
    expect(wrapper.text()).toContain("Platform Operator");
  });
});
