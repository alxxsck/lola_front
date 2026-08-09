import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "@/features/auth/auth.store";
import { supportNotificationsSource } from "@/features/support-notifications/api/support-notifications-source";
import SupportNotificationSettingsPage from "./SupportNotificationSettingsPage.vue";

const browserState = vi.hoisted(() => ({
  value: {
    permission: "DEFAULT",
    locallySubscribed: false,
    requiresInstalledApp: false,
    endpoint: null as string | null,
    applicationServerKey: null as string | null,
    permissionRecoveryPath: null as string | null,
    unsupportedMessage: null as string | null,
  },
}));

vi.mock("@/features/support-notifications/api/support-notifications-source", () => ({
  supportNotificationsSource: {
    readAdmission: vi.fn().mockResolvedValue({
      rolloutState: "ATTENTION_ENABLED",
      rolloutRevision: "0123456789abcdef",
      evaluatedAt: "2026-08-09T10:00:00.000Z",
      activeSubscriptionCount: 0,
      capabilities: {
        assignedToMe: "AVAILABLE",
        attention: "AVAILABLE",
        deviceRegistration: "AVAILABLE",
        deepLinkResolve: "AVAILABLE",
      },
      applicationServerKey: "public-key",
      applicationServerKeyRevision: "fedcba9876543210",
    }),
    readPreferences: vi.fn().mockResolvedValue([
      { topic: "SUPPORT_CASE_ATTENTION", channel: "BROWSER_PUSH", subscribed: false, source: "DEFAULT", version: null },
      { topic: "SUPPORT_CASE_ASSIGNED_TO_ME", channel: "BROWSER_PUSH", subscribed: true, source: "DEFAULT", version: null },
    ]),
    listDevices: vi.fn().mockResolvedValue([]),
    updatePreference: vi.fn(),
    registerDevice: vi.fn(),
    revokeDevice: vi.fn(),
    resolveDeepLink: vi.fn(),
  },
}));

vi.mock("@/features/support-notifications/model/browser-push-adapter", () => ({
  createBrowserPushAdapter: () => ({
    state: vi.fn(async () => ({ ...browserState.value })),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

describe("SupportNotificationSettingsPage", () => {
  let pinia: ReturnType<typeof createPinia>;
  beforeEach(() => {
    vi.clearAllMocks();
    browserState.value = {
      permission: "DEFAULT",
      locallySubscribed: false,
      requiresInstalledApp: false,
      endpoint: null,
      applicationServerKey: null,
      permissionRecoveryPath: null,
      unsupportedMessage: null,
    };
    pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      user: { id: "operator-1", email: "operator@example.test" },
      project: {
        id: "project-1",
        name: "Lucky Stars",
        effectivePermissionCodes: ["project.support.assignments.self_manage"],
      },
      projects: [],
    });
  });

  it("renders the three-layer readiness and only the two published topics", async () => {
    const wrapper = mount(SupportNotificationSettingsPage, {
      global: {
        plugins: [pinia],
        stubs: {
          Button: { template: "<button><slot />{{ label }}</button>", props: ["label"] },
          Message: { template: "<div><slot /></div>" },
          Skeleton: { template: "<div />" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
          ToggleSwitch: { template: "<input type='checkbox' />" },
        },
      },
    });
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Подписка этого браузера"),
    );

    expect(wrapper.text()).toContain("Подписка этого браузера");
    expect(wrapper.text()).toContain("Регистрация на сервере");
    expect(wrapper.text()).toContain("Обращения, требующие внимания");
    expect(wrapper.text()).toContain("Назначенные мне обращения");
    expect(wrapper.text()).not.toContain("Все новые обращения");
    expect(wrapper.findAll("input[type='checkbox']")).toHaveLength(2);
  });

  it("purges and reloads when the effective notification authority changes in place", async () => {
    const wrapper = mount(SupportNotificationSettingsPage, {
      global: {
        plugins: [pinia],
        stubs: {
          Button: { template: "<button><slot />{{ label }}</button>", props: ["label"] },
          Message: { template: "<div><slot /></div>" },
          Skeleton: { template: "<div />" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
          ToggleSwitch: { template: "<input type='checkbox' />" },
        },
      },
    });
    await vi.waitFor(() => expect(supportNotificationsSource.readAdmission).toHaveBeenCalled());
    const calls = vi.mocked(supportNotificationsSource.readAdmission).mock.calls.length;

    const auth = useAuthStore();
    auth.project!.effectivePermissionCodes = ["project.support.lead_control.read"];

    await vi.waitFor(() =>
      expect(supportNotificationsSource.readAdmission).toHaveBeenCalledTimes(calls + 1),
    );
    expect(wrapper.text()).toContain("Уведомления поддержки");
  });

  it.each([
    {
      name: "denied permission",
      state: {
        permission: "DENIED",
        requiresInstalledApp: false,
        permissionRecoveryPath: "Chrome/Edge: значок настроек сайта → «Уведомления» → «Разрешить».",
        unsupportedMessage: null,
      },
      expected: "Chrome/Edge: значок настроек сайта",
    },
    {
      name: "unsupported browser",
      state: {
        permission: "UNSUPPORTED",
        requiresInstalledApp: false,
        permissionRecoveryPath: null,
        unsupportedMessage: "Этот режим не поддерживает Web Push. Обновите браузер.",
      },
      expected: "Этот режим не поддерживает Web Push",
    },
    {
      name: "non-installed iPadOS app",
      state: {
        permission: "UNSUPPORTED",
        requiresInstalledApp: true,
        permissionRecoveryPath: null,
        unsupportedMessage: "Web Push недоступен.",
      },
      expected: "сначала добавьте Retenive CMS на экран «Домой»",
    },
  ])("renders an actionable recovery for $name", async ({ state, expected }) => {
    browserState.value = { ...browserState.value, ...state };
    const wrapper = mount(SupportNotificationSettingsPage, {
      global: {
        plugins: [pinia],
        stubs: {
          Button: { template: "<button><slot />{{ label }}</button>", props: ["label"] },
          Message: { template: "<div><slot /></div>" },
          Skeleton: { template: "<div />" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
          ToggleSwitch: { template: "<input type='checkbox' />" },
        },
      },
    });

    await vi.waitFor(() => expect(wrapper.text()).toContain(expected));
  });

  it("explains why browser permission cannot be requested while device registration is disabled", async () => {
    vi.mocked(supportNotificationsSource.readAdmission).mockResolvedValueOnce({
      rolloutState: "DISABLED",
      rolloutRevision: "0123456789abcdef",
      evaluatedAt: "2026-08-09T10:00:00.000Z",
      activeSubscriptionCount: 0,
      capabilities: {
        assignedToMe: "DISABLE_ONLY",
        attention: "UNAVAILABLE",
        deviceRegistration: "UNAVAILABLE",
        deepLinkResolve: "UNAVAILABLE",
      },
      applicationServerKey: null,
      applicationServerKeyRevision: null,
    });
    const wrapper = mount(SupportNotificationSettingsPage, {
      global: {
        plugins: [pinia],
        stubs: {
          Button: {
            template: '<button :disabled="disabled"><slot />{{ label }}</button>',
            props: ["label", "disabled"],
          },
          Message: { template: "<div><slot /></div>" },
          Skeleton: { template: "<div />" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
          ToggleSwitch: { template: "<input type='checkbox' />" },
        },
      },
    });

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain(
        "Проект пока не принимает новые подключения браузеров",
      ),
    );
    expect(wrapper.get("button[disabled]").text()).toContain(
      "Подключить этот браузер",
    );
  });
});
