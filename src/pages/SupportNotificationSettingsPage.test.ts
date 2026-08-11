import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "@/features/auth/auth.store";
import { supportNotificationsSource } from "@/features/support-notifications/api/support-notifications-source";
import SupportNotificationSettingsPage from "./SupportNotificationSettingsPage.vue";

enableAutoUnmount(afterEach);

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

vi.mock(
  "@/features/support-notifications/api/support-notifications-source",
  () => ({
    supportNotificationsSource: {
      readConfiguration: vi.fn().mockResolvedValue({
        evaluatedAt: "2026-08-09T10:00:00.000Z",
        activeSubscriptionCount: 0,
        capabilities: {
          newCases: "AVAILABLE",
          assignedToMe: "AVAILABLE",
          attention: "AVAILABLE",
          deviceRegistration: "AVAILABLE",
          deepLinkResolve: "AVAILABLE",
        },
        applicationServerKey: "public-key",
        applicationServerKeyRevision: "fedcba9876543210",
      }),
      readPreferences: vi.fn().mockResolvedValue([
        {
          topic: "SUPPORT_CASE_CREATED",
          channel: "BROWSER_PUSH",
          subscribed: false,
          source: "DEFAULT",
          version: null,
        },
        {
          topic: "SUPPORT_CASE_ATTENTION",
          channel: "BROWSER_PUSH",
          subscribed: false,
          source: "DEFAULT",
          version: null,
        },
        {
          topic: "SUPPORT_CASE_ASSIGNED_TO_ME",
          channel: "BROWSER_PUSH",
          subscribed: true,
          source: "DEFAULT",
          version: null,
        },
      ]),
      listDevices: vi.fn().mockResolvedValue([]),
      updatePreference: vi.fn(),
      registerDevice: vi.fn(),
      revokeDevice: vi.fn(),
      resolveDeepLink: vi.fn(),
    },
  }),
);

vi.mock(
  "@/features/support-case-notifications/api/support-case-notification-policy-source",
  () => ({
    supportCaseNotificationPolicySource: {
      read: vi.fn().mockResolvedValue({
        version: 1,
        effectiveStatus: "ACTIVE",
        current: {
          id: "revision-1",
          revisionNumber: 1,
          status: "PUBLISHED",
          mode: "IMMEDIATE",
          occurrences: ["CREATED"],
          conversationClasses: ["PRODUCT_PROBLEM"],
          topicCodes: [],
          minimumPriority: "NORMAL",
          recipientRule: "ALL_ELIGIBLE_SUBSCRIBERS",
          teamIds: [],
          channels: ["BROWSER_PUSH"],
          effectiveFrom: null,
          effectiveUntil: null,
          digestWindowMinutes: null,
          digestMaxItems: null,
          templateRevision: "support-case-created-v1",
          deepLinkTarget: "SUPPORT_OPERATOR_WORKSPACE",
          contentHash: "0".repeat(64),
          createdAt: "2026-08-11T10:00:00.000Z",
          publishedAt: "2026-08-11T10:00:00.000Z",
        },
        draft: null,
        restorableRevisions: [],
        allowedClasses: ["PRODUCT_PROBLEM", "PRODUCT_INQUIRY"],
        allowedPriorities: ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"],
        allowedChannels: ["BROWSER_PUSH"],
        allowedTopicCodes: [],
      }),
      readMetrics: vi.fn().mockResolvedValue({
        from: "2026-08-04T10:00:00.000Z",
        to: "2026-08-11T10:00:00.000Z",
        admittedOccurrences: 1,
        deliveries: 1,
        digests: 0,
        eligibleRecipients: 1,
        subscribedRecipients: 1,
        failures: 0,
        authorizationCancellations: 0,
        expiredPolicyCount: 0,
      }),
      listTeams: vi.fn().mockResolvedValue([]),
      preview: vi.fn(),
      saveDraft: vi.fn(),
      publish: vi.fn(),
      disable: vi.fn(),
      restore: vi.fn(),
      lookup: vi.fn(),
    },
  }),
);

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

  it("renders the three-layer readiness and the three independent personal topics", async () => {
    const wrapper = mount(SupportNotificationSettingsPage, {
      global: {
        plugins: [pinia],
        stubs: {
          Button: {
            template: "<button><slot />{{ label }}</button>",
            props: ["label"],
          },
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
    expect(wrapper.text()).toContain("Новые обращения");
    expect(wrapper.findAll("input[type='checkbox']")).toHaveLength(3);
  });

  it("shows the project policy equation only with the exact manage permission", async () => {
    const auth = useAuthStore();
    auth.project!.effectivePermissionCodes = [
      "project.support.assignments.self_manage",
      "project.support.notification_policy.manage",
    ];
    const wrapper = mount(SupportNotificationSettingsPage, {
      global: {
        plugins: [pinia],
        stubs: {
          Button: {
            template: "<button>{{ label }}</button>",
            props: ["label"],
          },
          Message: { template: "<div><slot /></div>" },
          Skeleton: { template: "<div />" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
          ToggleSwitch: { template: "<input type='checkbox' />" },
        },
      },
    });
    await vi.waitFor(() =>
      expect(wrapper.find(".policy-equation").exists()).toBe(true),
    );
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Личная подписка"));
    expect(wrapper.text()).toContain("Личная подписка");
    expect(
      wrapper.get("a[href='/support/settings/notifications/new-cases']").text(),
    ).toContain("Настроить политику");
  });

  it("does not invent personal delivery state for a policy-manage-only actor", async () => {
    const auth = useAuthStore();
    auth.project!.effectivePermissionCodes = [
      "project.support.notification_policy.manage",
    ];
    const wrapper = mount(SupportNotificationSettingsPage, {
      global: {
        plugins: [pinia],
        stubs: {
          Button: {
            template: "<button>{{ label }}</button>",
            props: ["label"],
          },
          Message: { template: "<div><slot /></div>" },
          Skeleton: { template: "<div />" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
          ToggleSwitch: { template: "<input type='checkbox' />" },
        },
      },
    });
    let equation = "";
    await vi.waitFor(() => {
      const node = wrapper.find(".policy-equation");
      expect(node.exists()).toBe(true);
      equation = node.text();
    });
    expect(equation).toContain("Недоступно для этой учётной записи");
    expect(equation).toContain("Не проверено");
    expect(equation).not.toContain("Личная подпискаВыключена");
  });

  it("purges and reloads when the effective notification authority changes in place", async () => {
    const wrapper = mount(SupportNotificationSettingsPage, {
      global: {
        plugins: [pinia],
        stubs: {
          Button: {
            template: "<button><slot />{{ label }}</button>",
            props: ["label"],
          },
          Message: { template: "<div><slot /></div>" },
          Skeleton: { template: "<div />" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
          ToggleSwitch: { template: "<input type='checkbox' />" },
        },
      },
    });
    await vi.waitFor(() =>
      expect(supportNotificationsSource.readConfiguration).toHaveBeenCalled(),
    );
    const calls = vi.mocked(supportNotificationsSource.readConfiguration).mock
      .calls.length;

    const auth = useAuthStore();
    auth.project!.effectivePermissionCodes = [
      "project.support.lead_control.read",
    ];

    await vi.waitFor(() =>
      expect(
        supportNotificationsSource.readConfiguration,
      ).toHaveBeenCalledTimes(calls + 1),
    );
    expect(wrapper.text()).toContain("Уведомления поддержки");
  });

  it.each([
    {
      name: "denied permission",
      state: {
        permission: "DENIED",
        requiresInstalledApp: false,
        permissionRecoveryPath:
          "Chrome/Edge: значок настроек сайта → «Уведомления» → «Разрешить».",
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
        unsupportedMessage:
          "Этот режим не поддерживает Web Push. Обновите браузер.",
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
  ])(
    "renders an actionable recovery for $name",
    async ({ state, expected }) => {
      browserState.value = { ...browserState.value, ...state };
      const wrapper = mount(SupportNotificationSettingsPage, {
        global: {
          plugins: [pinia],
          stubs: {
            Button: {
              template: "<button><slot />{{ label }}</button>",
              props: ["label"],
            },
            Message: { template: "<div><slot /></div>" },
            Skeleton: { template: "<div />" },
            Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
            ToggleSwitch: { template: "<input type='checkbox' />" },
          },
        },
      });

      await vi.waitFor(() => expect(wrapper.text()).toContain(expected));
    },
  );

  it("explains why browser permission cannot be requested while device registration is disabled", async () => {
    vi.mocked(
      supportNotificationsSource.readConfiguration,
    ).mockResolvedValueOnce({
      evaluatedAt: "2026-08-09T10:00:00.000Z",
      activeSubscriptionCount: 0,
      capabilities: {
        newCases: "UNAVAILABLE",
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
            template:
              '<button :disabled="disabled"><slot />{{ label }}</button>',
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
        "Регистрация новых браузеров временно недоступна",
      ),
    );
    expect(wrapper.get("button[disabled]").text()).toContain(
      "Подключить этот браузер",
    );
  });
});
