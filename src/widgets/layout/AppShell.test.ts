import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell.vue";
import { useAuthStore } from "@/features/auth/auth.store";

function project(
  id: string,
  name: string,
  effectivePermissionCodes: string[] = [],
) {
  return {
    id,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    status: "ACTIVE" as const,
    supportedLocales: ["ru"],
    effectivePermissionCodes,
  };
}

function authenticateWithProjects(
  auth: ReturnType<typeof useAuthStore>,
  projects: ReturnType<typeof project>[],
) {
  auth.$patch({
    phase: "AUTHENTICATED",
    user: {
      id: "operator-1",
      email: "operator@example.com",
      name: "Оператор",
    },
    projects,
    project: projects[0] ?? null,
    supportEnabled: true,
  });
}

const projectMenuStub = {
  props: ["model"],
  template: `
    <div>
      <template v-for="group in model" :key="group.label">
        <div v-for="item in group.items ?? []" :key="item.label">
          <button
            type="button"
            :aria-label="'Переключить на проект ' + item.label"
            @click="item.command?.()"
          >{{ group.label }}: {{ item.label }}</button>
          <button
            v-if="item.openInNewTab"
            type="button"
            :aria-label="'Открыть проект ' + item.label + ' в новой вкладке'"
            @click.stop="item.openInNewTab()"
          >Открыть в новой вкладке</button>
        </div>
      </template>
    </div>
  `,
};

function mountProjectMenu(pinia: Pinia, router: Router) {
  return mount(AppShell, {
    global: {
      plugins: [pinia, router],
      stubs: {
        Button: { template: '<button type="button"><slot /></button>' },
        Avatar: { template: "<span />" },
        Menu: projectMenuStub,
        Tag: { template: "<span />" },
      },
    },
  });
}

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows Reporting navigation only to an exact aggregate reader", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [
      project("project-1", "Project One", ["project.analytics.read"]),
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/overview", component: { template: "<div />" } },
        { path: "/reports", component: { template: "<div />" } },
      ],
    });
    await router.push("/overview");
    await router.isReady();
    const wrapper = mountProjectMenu(pinia, router);

    expect(wrapper.find('a[href="/reports"]').text()).toContain("Отчёты");

    auth.project!.effectivePermissionCodes = [];
    await wrapper.vm.$nextTick();
    expect(wrapper.find('a[href="/reports"]').exists()).toBe(false);
  });

  it("shows Support navigation only when deployment availability and IAM allow it", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [
      project("project-1", "Project One", ["project.conversations.read"]),
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/overview", component: { template: "<div />" } }],
    });
    await router.push("/overview");
    await router.isReady();

    const wrapper = mountProjectMenu(pinia, router);
    await flushPromises();

    expect(wrapper.text()).toContain("Поддержка");
    wrapper.unmount();

    auth.supportEnabled = false;
    const disabled = mountProjectMenu(pinia, router);
    await flushPromises();

    expect(disabled.text()).not.toContain("Поддержка");
    disabled.unmount();
  });

  it("links a Cases-only operator to the exact canonical inbox mode", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [
      project("project-1", "Project One", ["project.cases.read"]),
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/overview", component: { template: "<div />" } }],
    });
    await router.push("/overview");
    await router.isReady();

    const wrapper = mountProjectMenu(pinia, router);
    await flushPromises();

    const supportLink = wrapper
      .findAll(".sidebar-scroll nav a")
      .find((link) => link.text().includes("Рабочее место"));
    expect(supportLink?.attributes("href")).toBe("/support/inbox?mode=cases");
  });

  it("keeps a clicked Support destination active while its route guard resolves", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [
      project("project-1", "Project One", [
        "project.conversations.read",
        "project.support.workspace.use",
      ]),
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/overview", component: { template: "<div />" } },
        { path: "/support/inbox", component: { template: "<div />" } },
      ],
    });
    let releaseSupportNavigation: () => void = () => undefined;
    const supportNavigation = new Promise<void>((resolve) => {
      releaseSupportNavigation = resolve;
    });
    router.beforeEach((to) =>
      to.path === "/support/inbox" ? supportNavigation.then(() => true) : true,
    );
    await router.push("/overview");
    await router.isReady();
    const wrapper = mountProjectMenu(pinia, router);
    await flushPromises();
    const supportLink = wrapper
      .findAll(".sidebar-scroll nav a")
      .find((link) => link.text().trim() === "Рабочее место");
    expect(supportLink).toBeDefined();

    await supportLink!.trigger("click");

    expect(router.currentRoute.value.path).toBe("/overview");
    expect(supportLink!.classes()).toContain("active");

    releaseSupportNavigation();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/support/inbox");
    expect(supportLink!.classes()).toContain("active");
  });

  it("uses the compact application rail on the Support workspace route", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [
      project("project-1", "Project One", [
        "project.conversations.read",
        "project.support.workspace.use",
      ]),
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/support/inbox",
          component: { template: "<div />" },
          meta: { supportWorkspacePresentation: true },
        },
      ],
    });
    await router.push("/support/inbox");
    await router.isReady();

    const wrapper = mountProjectMenu(pinia, router);

    expect(wrapper.get(".shell").classes()).toContain(
      "shell--sidebar-collapsed",
    );
    expect(wrapper.get(".sidebar").attributes("aria-label")).toBe(
      "Основная навигация CMS",
    );

    await wrapper
      .get('button[aria-label="Развернуть боковое меню"]')
      .trigger("click");
    expect(wrapper.get(".shell").classes()).not.toContain(
      "shell--sidebar-collapsed",
    );
  });

  it("lets a desktop user collapse and restore the sidebar from every page", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [project("project-1", "Project One")]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/overview", component: { template: "<div />" } }],
    });
    await router.push("/overview");
    await router.isReady();

    let wrapper = mountProjectMenu(pinia, router);

    expect(wrapper.get(".shell").classes()).not.toContain(
      "shell--sidebar-collapsed",
    );
    const collapse = wrapper.get('button[aria-label="Свернуть боковое меню"]');
    await collapse.trigger("click");

    expect(wrapper.get(".shell").classes()).toContain(
      "shell--sidebar-collapsed",
    );
    expect(localStorage.getItem("retenive-cms-sidebar-collapsed-v1")).toBe(
      "true",
    );
    expect(
      wrapper
        .get('button[aria-label="Развернуть боковое меню"]')
        .attributes("aria-expanded"),
    ).toBeUndefined();

    wrapper.unmount();
    wrapper = mountProjectMenu(pinia, router);
    expect(wrapper.get(".shell").classes()).toContain(
      "shell--sidebar-collapsed",
    );

    await wrapper
      .get('button[aria-label="Развернуть боковое меню"]')
      .trigger("click");
    expect(wrapper.get(".shell").classes()).not.toContain(
      "shell--sidebar-collapsed",
    );
    expect(localStorage.getItem("retenive-cms-sidebar-collapsed-v1")).toBe(
      "false",
    );
  });

  it("opens personal security settings from the profile menu", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      supportEnabled: true,
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

  it("switches the current tab to another available Project from the profile menu", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [
      project("project-1", "Project One"),
      project("project-2", "Project Two"),
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/overview", component: { template: "<div />" } },
        { path: "/scenarios", component: { template: "<div />" } },
      ],
    });
    await router.push("/scenarios");
    await router.isReady();
    const wrapper = mountProjectMenu(pinia, router);

    const switchButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Переключить проект: Project Two");
    expect(switchButton).toBeDefined();
    await switchButton!.trigger("click");
    await flushPromises();

    expect(auth.project?.id).toBe("project-2");
    expect(sessionStorage.getItem("retenive-cms-selected-project-v1")).toBe(
      "project-2",
    );
    expect(router.currentRoute.value.path).toBe("/overview");
  });

  it("opens a Project from its row action without switching the current tab", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [
      project("project-1", "Project One"),
      project("project-2", "Project Two"),
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/overview", component: { template: "<div />" } },
        { path: "/support/inbox", component: { template: "<div />" } },
      ],
    });
    await router.push("/overview");
    await router.isReady();
    const setItem = vi.fn();
    const replace = vi.fn();
    const openedTab = {
      sessionStorage: { setItem },
      opener: window,
      location: { replace },
    };
    const open = vi
      .spyOn(window, "open")
      .mockReturnValue(openedTab as unknown as Window);
    const wrapper = mountProjectMenu(pinia, router);

    const openButton = wrapper
      .findAll("button")
      .find(
        (button) =>
          button.attributes("aria-label") ===
          "Открыть проект Project Two в новой вкладке",
      );
    expect(openButton).toBeDefined();
    await openButton!.trigger("click");

    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(setItem).toHaveBeenCalledWith(
      "retenive-cms-selected-project-v1",
      "project-2",
    );
    expect(openedTab.opener).toBeNull();
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/\/overview$/));
    expect(replace.mock.calls[0]?.[0]).not.toContain("project-2");
    expect(auth.project?.id).toBe("project-1");
  });

  it("keeps navigation and account controls in separate sidebar regions", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      supportEnabled: true,
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
        assistantName: "Retenive",
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
          "project.ai_analyses.read",
          "project.ai_operations.read",
          "project.scenarios.read",
          "project.segments.read",
          "project.scenario_runs.read",
          "project.end_users.read",
          "project.conversations.read",
          "project.support.lead_control.read",
          "project.support.sla.read",
          "project.support.external_work.inbox_read",
          "project.support.external_work.manage",
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
    await flushPromises();

    expect({
      navigationLinks: wrapper.findAll(".sidebar-scroll nav a").length,
      profileFieldsLink: wrapper
        .findAll(".sidebar-scroll nav a")
        .find((link) => link.text().includes("Поля профиля"))
        ?.attributes("href"),
      supportWorkspaceLink: wrapper
        .findAll(".sidebar-scroll nav a")
        .find((link) => link.text().includes("Рабочее место"))
        ?.attributes("href"),
      supportControlLink: wrapper
        .findAll(".sidebar-scroll nav a")
        .find((link) => link.text().includes("Операционный обзор"))
        ?.attributes("href"),
      supportNotificationsLink: wrapper
        .find('a[href="/support/settings/notifications"]')
        .attributes("href"),
      externalWorkLink: wrapper
        .findAll(".sidebar-scroll nav a")
        .find((link) => link.text().includes("Внешние задачи"))
        ?.attributes("href"),
      externalSettingsLink: wrapper
        .find('a[href="/support/settings/integrations"]')
        .attributes("href"),
      themeSwitchVisible: wrapper.find(".theme-switch").exists(),
      profileInFooter: wrapper
        .find(".sidebar-footer .sidebar-profile")
        .exists(),
      modeInFooter: wrapper.find(".sidebar-footer .sidebar-note").exists(),
      analysesVisible: wrapper.text().includes("AI-анализы"),
      operationsVisible: wrapper.text().includes("Журнал AI"),
    }).toEqual({
      navigationLinks: 24,
      profileFieldsLink: "/profile-fields",
      supportWorkspaceLink: "/support/inbox",
      supportControlLink: "/support/control",
      supportNotificationsLink: "/support/settings/notifications",
      externalWorkLink: "/support/external-work",
      externalSettingsLink: "/support/settings/integrations",
      themeSwitchVisible: true,
      profileInFooter: true,
      modeInFooter: true,
      analysesVisible: true,
      operationsVisible: true,
    });
  });

  it("keeps every Support destination together under one navigation group", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [
      project("project-1", "Project One", [
        "project.conversations.read",
        "project.support.lead_control.read",
        "project.case_intelligence.read",
        "project.support.sla.read",
        "project.support.macros.manage",
        "project.support.external_work.inbox_read",
        "project.support.external_work.manage",
      ]),
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/overview", component: { template: "<div />" } }],
    });
    await router.push("/overview");
    await router.isReady();

    const wrapper = mountProjectMenu(pinia, router);
    await flushPromises();

    const supportGroup = wrapper.get('[data-navigation-group="support"]');
    const supportLinks = supportGroup.findAll("a");

    expect(supportGroup.get('[role="heading"]').text()).toContain("Поддержка");
    expect(supportGroup.find('a[href="/support"]').exists()).toBe(false);
    expect(supportLinks.map((link) => link.text().trim())).toEqual([
      "Рабочее место",
      "Операционный обзор",
      "Категории и правила",
      "Передача оператору",
      "Календарь и SLA",
      "Шаблоны ответов",
      "Уведомления",
      "Внешние задачи",
      "Интеграции",
    ]);
    expect(
      supportLinks.every((link) => link.classes().includes("nav-item--nested")),
    ).toBe(true);

    const toggle = supportGroup.get(
      'button[aria-label="Развернуть раздел «Поддержка»"]',
    );
    const disclosure = supportGroup.get(".nav-group-disclosure");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(disclosure.classes()).toContain("nav-group-disclosure--collapsed");
    expect(disclosure.attributes("aria-hidden")).toBe("true");
    expect(disclosure.attributes()).toHaveProperty("inert");

    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(disclosure.classes()).not.toContain(
      "nav-group-disclosure--collapsed",
    );
    expect(disclosure.attributes("aria-hidden")).toBe("false");
    expect(disclosure.attributes()).not.toHaveProperty("inert");
  });

  it("shows a non-clickable Support heading when only a nested setting is allowed", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    authenticateWithProjects(auth, [
      project("project-1", "Project One", ["project.support.macros.manage"]),
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/overview", component: { template: "<div />" } }],
    });
    await router.push("/overview");
    await router.isReady();

    const wrapper = mountProjectMenu(pinia, router);
    await flushPromises();

    expect(
      wrapper.get('[role="heading"][aria-label="Поддержка"]').text(),
    ).toContain("Поддержка");
    expect(wrapper.find('a[href="/support/inbox"]').exists()).toBe(false);
    expect(
      wrapper.get('a[href="/support/settings/macros"]').classes(),
    ).toContain("nav-item--nested");
  });

  it("shows Integrations to a product-integration reader without notification access", async () => {
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
        assistantName: "Retenive",
        systemPrompt: "",
        voiceInstructions: "",
        settings: {},
        effectivePermissionCodes: ["project.integrations.read"],
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

    const projectSection = wrapper.get('[role="heading"][aria-label="Проект"]');
    const integrationsLink = wrapper.get('a[href="/settings/integrations"]');

    expect(projectSection.text()).toContain("Проект");
    expect(integrationsLink.classes()).toContain("nav-item--nested");
  });

  it("groups project access pages under Project and highlights only the current page", async () => {
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
        assistantName: "Retenive",
        systemPrompt: "",
        voiceInstructions: "",
        settings: {},
        effectivePermissionCodes: [
          "project.settings.read",
          "project.members.read",
          "project.roles.read",
          "project.notifications.read",
        ],
      },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/project", component: { template: "<div />" } },
        {
          path: "/settings/integrations",
          component: { template: "<div />" },
        },
        { path: "/project/memberships", component: { template: "<div />" } },
        { path: "/project/roles", component: { template: "<div />" } },
      ],
    });
    await router.push("/project/memberships");
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

    const projectLink = wrapper.get('a[href="/project"]');
    const integrationsLink = wrapper.get('a[href="/settings/integrations"]');
    const administratorsLink = wrapper.get('a[href="/project/memberships"]');
    const rolesLink = wrapper.get('a[href="/project/roles"]');

    expect(integrationsLink.classes()).toContain("nav-item--nested");
    expect(administratorsLink.classes()).toContain("nav-item--nested");
    expect(rolesLink.classes()).toContain("nav-item--nested");
    expect(projectLink.text()).toBe("Настройки");
    expect(projectLink.classes()).toContain("nav-item--nested");
    expect(projectLink.classes()).not.toContain("active");
    expect(administratorsLink.classes()).toContain("active");
    expect(rolesLink.classes()).not.toContain("active");

    const projectGroup = wrapper.get('[data-navigation-group="project"]');
    expect(projectGroup.get('[role="heading"]').text()).toContain("Проект");
    expect(projectGroup.find('a[href="/project-section"]').exists()).toBe(
      false,
    );
    const toggle = projectGroup.get(
      'button[aria-label="Свернуть раздел «Проект»"]',
    );
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("false");
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

  it("shows the AI cost-control workspace to cost readers or allowance operators", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    const selected = project("project-1", "Project One", [
      "project.ai_costs.read",
    ]);
    authenticateWithProjects(auth, [selected]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/overview", component: { template: "<div />" } },
        { path: "/ai-costs", component: { template: "<div />" } },
      ],
    });
    await router.push("/ai-costs");
    await router.isReady();
    const wrapper = mountProjectMenu(pinia, router);

    expect(wrapper.get('a[href="/ai-costs"]').text()).toBe("Расходы AI");
    expect(wrapper.get('a[href="/ai-costs"]').classes()).toContain("active");

    auth.project!.effectivePermissionCodes = ["project.ai_allowance.read"];
    await wrapper.vm.$nextTick();
    expect(wrapper.get('a[href="/ai-costs"]').text()).toBe("Расходы AI");

    auth.project!.effectivePermissionCodes = [];
    await wrapper.vm.$nextTick();
    expect(wrapper.find('a[href="/ai-costs"]').exists()).toBe(false);
  });

  it("shows delivery recovery only to the exact Platform reader", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Оператор",
        platformPermissionCodes: ["platform.notifications.operations.read"],
      },
      project: null,
      projects: [],
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/platform/notification-operations",
          component: { template: "<div />" },
        },
      ],
    });
    await router.push("/platform/notification-operations");
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

    expect(
      wrapper.findAll(".sidebar-scroll nav a").map((link) => link.text()),
    ).toEqual(["Доставка и восстановление"]);

    auth.user!.platformPermissionCodes = [
      "platform.notifications.operations.operate",
    ];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain("Доставка и восстановление");
  });

  it("shows AI pricing only to the exact Platform reader", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Оператор",
        platformPermissionCodes: ["platform.ai_pricing.read"],
      },
      project: null,
      projects: [],
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/platform/ai-pricing",
          component: { template: "<div />" },
        },
      ],
    });
    await router.push("/platform/ai-pricing");
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

    expect(
      wrapper.findAll(".sidebar-scroll nav a").map((link) => link.text()),
    ).toEqual(["Тарифы AI"]);

    auth.user!.platformPermissionCodes = ["platform.ai_pricing.write"];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain("Тарифы AI");
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
        assistantName: "Retenive",
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

    const navigation = wrapper.get(".sidebar-scroll nav");
    expect(
      navigation.find('[role="heading"][aria-label="Проект"]').exists(),
    ).toBe(true);
    expect(navigation.find('a[href="/project"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Администраторы");
    expect(wrapper.text()).not.toContain("Роли");

    auth.project!.effectivePermissionCodes = ["project.roles.read"];
    await wrapper.vm.$nextTick();
    expect(
      navigation.find('[role="heading"][aria-label="Проект"]').exists(),
    ).toBe(true);
    expect(navigation.find('a[href="/project"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Администраторы");
    expect(wrapper.text()).toContain("Роли");
  });

  it("does not expose authoring navigation from a role-shaped value without Permissions", async () => {
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
        assistantName: "Retenive",
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
    expect(wrapper.text()).not.toContain("Предложения Retenive");
    expect(wrapper.text()).not.toContain("AI-анализы");
    expect(wrapper.text()).not.toContain("Журнал AI");
    expect(wrapper.text()).not.toContain("Журнал событий");
    expect(wrapper.text()).not.toContain("Интеграции");
  });

  it("shows Telegram broadcasts only to an exact broadcast reader", async () => {
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
        assistantName: "Retenive",
        systemPrompt: "",
        voiceInstructions: "",
        settings: {},
        effectivePermissionCodes: ["project.telegram.broadcasts.read"],
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

    expect(wrapper.text()).toContain("Telegram-рассылки");
    auth.project!.effectivePermissionCodes = [
      "project.telegram.broadcasts.draft",
    ];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain("Telegram-рассылки");
  });
});
