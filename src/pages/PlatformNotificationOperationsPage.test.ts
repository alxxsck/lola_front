import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PrimeVue from "primevue/config";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import PlatformNotificationOperationsPage from "./PlatformNotificationOperationsPage.vue";

const api = vi.hoisted(() => ({
  health: vi.fn(),
  deliveries: vi.fn(),
  integrations: vi.fn(),
  replay: vi.fn(),
  quarantine: vi.fn(),
}));

vi.mock(
  "@/features/notification-operations/api/notification-operations.api",
  () => ({ notificationOperationsApi: api }),
);

const projectId = "00000000-0000-4000-8000-000000000010";
const deliveryId = "00000000-0000-4000-8000-000000000020";

async function mountPage(operate = true) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.$patch({
    restored: true,
    phase: "AUTHENTICATED",
    user: {
      id: "operator-1",
      email: "operator@example.com",
      name: "Оператор",
      platformPermissionCodes: [
        "platform.notifications.operations.read",
        ...(operate ? ["platform.notifications.operations.operate"] : []),
      ],
    },
    project: null,
    projects: [],
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/platform/notification-operations",
        name: "platform-notification-operations",
        component: PlatformNotificationOperationsPage,
      },
      {
        path: "/settings/security",
        name: "security-settings",
        component: { template: "<div>security</div>" },
      },
      {
        path: "/login",
        name: "login",
        component: { template: "<div>login</div>" },
      },
    ],
  });
  await router.push("/platform/notification-operations");
  await router.isReady();
  const wrapper = mount(RouterView, {
    global: { plugins: [pinia, router, PrimeVue] },
  });
  await flushPromises();
  return { auth, router, wrapper };
}

describe("Platform notification operations page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.health.mockResolvedValue({
      observedAt: "2026-07-23T10:00:00.000Z",
      queues: [],
      permanentCount: 1,
      ambiguousCount: 2,
      suppressedCount: 3,
      deadLetterCount: 4,
      providers: [{ channel: "SLACK_WEBHOOK", state: "HEALTHY" }],
      telegramProductAdmission: [],
      retention: {
        notificationPayloadBacklog: 1,
        personalContentBacklog: 2,
        broadcastContentBacklog: 3,
        linkSecretBacklog: 4,
        operationalEvidenceBacklog: 5,
        lastSuccessfulBatchAt: null,
      },
    });
    api.deliveries.mockResolvedValue({
      items: [
        {
          id: deliveryId,
          projectId,
          channel: "SLACK_WEBHOOK",
          status: "DEAD_LETTER",
          errorCategory: "TRANSIENT",
          attemptCount: 3,
          operationsVersion: 2,
          replayEligibility: "ELIGIBLE_KNOWN_NOT_ACCEPTED",
          contentAvailable: false,
          createdAt: "2026-07-23T09:00:00.000Z",
          updatedAt: "2026-07-23T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    api.integrations.mockResolvedValue({
      items: [
        {
          integrationId: "00000000-0000-4000-8000-000000000030",
          kind: "SLACK_DESTINATION",
          projectId,
          status: "ACTIVE",
          version: 4,
          maskedIdentity: "Slack •••• 000030",
          quarantineAllowed: true,
        },
      ],
      nextCursor: null,
    });
    api.replay.mockResolvedValue({
      id: deliveryId,
      projectId,
      channel: "SLACK_WEBHOOK",
      status: "PENDING",
      errorCategory: "OTHER",
      attemptCount: 3,
      operationsVersion: 3,
      replayEligibility: "INELIGIBLE_STATE",
      contentAvailable: false,
      createdAt: "",
      updatedAt: "",
    });
  });

  it("renders safe Platform health and keeps operations read-only without operate", async () => {
    const { wrapper } = await mountPage(false);

    expect(wrapper.text()).toContain("Доставка и восстановление");
    expect(wrapper.text()).toContain("Retention · только просмотр");
    expect(wrapper.text()).toContain(deliveryId);
    expect(wrapper.text()).not.toContain("Вернуть в очередь");
    expect(wrapper.text()).not.toContain("Карантин");
    expect(JSON.stringify(wrapper.html())).not.toMatch(
      /webhookUrl|botToken|telegramUserId|recipientId|recipientEmail|providerRef/i,
    );
  });

  it("scrubs rows and redirects when read permission is lost", async () => {
    const { auth, router, wrapper } = await mountPage();
    expect(wrapper.text()).toContain(deliveryId);

    auth.user!.platformPermissionCodes = [
      "platform.notifications.operations.operate",
    ];
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("security-settings");
    expect(wrapper.text()).not.toContain(deliveryId);
  });

  it("shows fresh login without replaying a denied command", async () => {
    api.replay.mockRejectedValue({
      status: 428,
      code: "REAUTHENTICATION_REQUIRED",
      message: "unsafe backend text",
    });
    const { auth, router, wrapper } = await mountPage();
    const logout = vi.spyOn(auth, "logout").mockResolvedValue();

    await wrapper
      .get(`button[aria-label="Повторить доставку ${deliveryId}"]`)
      .trigger("click");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get(".confirm-button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Требуется свежий вход с MFA");
    expect(wrapper.text()).not.toContain("unsafe backend text");
    expect(api.replay).toHaveBeenCalledOnce();
    await wrapper
      .get('[data-action="notification-operations-fresh-login"]')
      .trigger("click");
    await flushPromises();

    expect(logout).toHaveBeenCalledOnce();
    expect(router.currentRoute.value).toMatchObject({
      name: "login",
      query: { redirect: "/platform/notification-operations" },
    });
    expect(api.replay).toHaveBeenCalledOnce();
  });

  it("leaves the protected route after fresh-login even when server logout fails", async () => {
    api.replay.mockRejectedValue({
      status: 428,
      code: "REAUTHENTICATION_REQUIRED",
    });
    const { auth, router, wrapper } = await mountPage();
    vi.spyOn(auth, "logout").mockRejectedValue(new Error("offline"));

    await wrapper
      .get(`button[aria-label="Повторить доставку ${deliveryId}"]`)
      .trigger("click");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get(".confirm-button").trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-action="notification-operations-fresh-login"]')
      .trigger("click");
    await flushPromises();

    expect(router.currentRoute.value).toMatchObject({
      name: "login",
      query: { redirect: "/platform/notification-operations" },
    });
    expect(api.replay).toHaveBeenCalledOnce();
  });
});
