import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell.vue";
import { useAuthStore } from "@/features/auth/auth.store";

describe("AppShell", () => {
  it("opens personal security settings from the profile menu", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Оператор",
      },
      projects: [],
      project: null,
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/overview", component: { template: "<div />" } },
        { path: "/settings/security", component: { template: "<div />" } },
      ],
    });
    await router.push("/overview");
    await router.isReady();
    const wrapper = mount(AppShell, {
      global: {
        plugins: [pinia, router],
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          Avatar: { template: "<span />" },
          Menu: {
            props: ["model"],
            template:
              '<div><button v-for="item in model" :key="item.label" type="button" @click="item.command?.()">{{ item.label }}</button></div>',
          },
          Tag: { template: "<span />" },
        },
      },
    });

    const securityButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Безопасность");
    expect(securityButton).toBeDefined();
    await securityButton!.trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/settings/security");
  });

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
        effectivePermissionCodes: [
          "project.settings.read",
          "project.notifications.read",
          "project.profile_contract.read",
          "project.profiles.read",
          "project.knowledge.read",
          "project.ui_registry.read",
          "project.event_catalog.read",
          "project.event_logs.read",
          "project.actions.read",
          "project.ai_proposals.read",
          "project.scenarios.read",
          "project.segments.read",
          "project.scenario_runs.read",
          "project.end_users.read",
          "project.conversations.read",
        ],
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
      navigationLinks: 17,
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
      routes: [
        { path: "/platform/cms-users", component: { template: "<div />" } },
      ],
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

  it("shows Project administrators only with the exact selected-Project read Permission", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Оператор",
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
        effectivePermissionCodes: ["project.members.read"],
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

    expect(wrapper.text()).toContain("Администраторы");
    expect(wrapper.text()).not.toContain("Роли");

    auth.project!.effectivePermissionCodes = ["project.roles.read"];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain("Администраторы");
    expect(wrapper.text()).toContain("Роли");
  });

  it("does not expose authoring navigation from a legacy role without Permissions", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Оператор",
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
        effectivePermissionCodes: [],
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

    expect(wrapper.text()).not.toContain("База знаний");
    expect(wrapper.text()).not.toContain("Предложения Lola");
    expect(wrapper.text()).not.toContain("Журнал событий");
    expect(wrapper.text()).not.toContain("Интеграции");
  });
});
