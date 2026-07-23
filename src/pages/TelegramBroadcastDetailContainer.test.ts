import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import type { TelegramBroadcast } from "@/features/telegram-broadcasts/model/telegram-broadcast";
import TelegramBroadcastDetailPage from "./TelegramBroadcastDetailPage.vue";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  updateDraft: vi.fn(),
  preview: vi.fn(),
  testSend: vi.fn(),
  approve: vi.fn(),
  start: vi.fn(),
  schedule: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  listDeliveries: vi.fn(),
}));

vi.mock("@/features/telegram-broadcasts/api/telegram-broadcasts.api", () => ({
  telegramBroadcastsApi: api,
}));

const detail: TelegramBroadcast = {
  id: "broadcast-1",
  projectId: "project-1",
  title: "Июльское обновление",
  status: "DRAFT",
  version: 1,
  revision: {
    id: "revision-1",
    revisionNumber: 1,
    contentHash:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    text: "Исходный текст",
    contentAvailable: true,
    createdAt: "2026-07-23T09:00:00.000Z",
  },
  content: { text: "Исходный текст" },
  audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
  approval: null,
  latestTest: null,
  recipientCount: 0,
  scheduledAt: null,
  progress: {
    total: 0,
    pending: 0,
    sending: 0,
    sent: 0,
    retryWait: 0,
    outcomeUnknown: 0,
    failedPermanent: 0,
    suppressedLink: 0,
    suppressedConsent: 0,
    suppressedInstallation: 0,
    cancelled: 0,
  },
  allowedActions: ["EDIT", "PREVIEW", "TEST_SEND"],
  createdAt: "2026-07-23T09:00:00.000Z",
  updatedAt: "2026-07-23T10:00:00.000Z",
};

async function mountRoute() {
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
        "project.telegram.broadcasts.read",
        "project.telegram.broadcasts.draft",
      ],
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/telegram/broadcasts/:broadcastId",
        name: "telegram-broadcast-detail",
        component: TelegramBroadcastDetailPage,
      },
      {
        path: "/telegram/broadcasts",
        name: "telegram-broadcasts",
        component: { template: "<div>list</div>" },
      },
      {
        path: "/overview",
        name: "overview",
        component: { template: "<div>overview</div>" },
      },
      {
        path: "/login",
        name: "login",
        component: { template: "<div>login</div>" },
      },
    ],
  });
  await router.push("/telegram/broadcasts/broadcast-1");
  await router.isReady();
  const wrapper = mount(RouterView, {
    global: { plugins: [pinia, router] },
  });
  await flushPromises();
  return { auth, wrapper, router };
}

describe("TelegramBroadcastDetailPage container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(structuredClone(detail));
    api.listDeliveries.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  it("keeps a dirty draft across hide/show and blocks route leave", async () => {
    const { wrapper, router } = await mountRoute();
    const textarea = wrapper.get("#broadcast-text");
    await textarea.setValue("Несохранённый текст");

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(
      (wrapper.get("#broadcast-text").element as HTMLTextAreaElement).value,
    ).toBe("Несохранённый текст");

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(
      (wrapper.get("#broadcast-text").element as HTMLTextAreaElement).value,
    ).toBe("Несохранённый текст");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await router.push("/overview");

    expect(confirm).toHaveBeenCalledWith(
      "Есть несохранённые изменения Telegram-рассылки. Покинуть страницу?",
    );
    expect(router.currentRoute.value.name).toBe("telegram-broadcast-detail");
  });

  it("scrubs a dirty draft without prompting when the Project changes", async () => {
    const { auth, wrapper } = await mountRoute();
    await wrapper.get("#broadcast-text").setValue("Секретный черновик");
    const confirm = vi.spyOn(window, "confirm");

    auth.project = { ...auth.project!, id: "project-2", name: "Project Two" };
    await flushPromises();

    expect(wrapper.text()).not.toContain("Секретный черновик");
    expect(confirm).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenLastCalledWith(
      "project-2",
      "broadcast-1",
      expect.any(Object),
    );
  });

  it("scrubs a dirty draft and redirects without prompting after read permission loss", async () => {
    const { auth, router, wrapper } = await mountRoute();
    await wrapper.get("#broadcast-text").setValue("Секретный черновик");
    const confirm = vi.spyOn(window, "confirm");

    auth.project = {
      ...auth.project!,
      effectivePermissionCodes: ["project.telegram.broadcasts.draft"],
    };
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("overview");
    expect(wrapper.text()).not.toContain("Секретный черновик");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("scrubs a dirty draft without prompting after draft permission loss", async () => {
    const { auth, wrapper } = await mountRoute();
    await wrapper.get("#broadcast-text").setValue("Секретный черновик");
    const confirm = vi.spyOn(window, "confirm");

    auth.project = {
      ...auth.project!,
      effectivePermissionCodes: ["project.telegram.broadcasts.read"],
    };
    await flushPromises();

    expect(wrapper.text()).not.toContain("Секретный черновик");
    expect(wrapper.get("#broadcast-text").attributes("disabled")).toBeDefined();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("scrubs a dirty draft without prompting on logout", async () => {
    const { auth, wrapper } = await mountRoute();
    await wrapper.get("#broadcast-text").setValue("Секретный черновик");
    const confirm = vi.spyOn(window, "confirm");

    auth.$patch({ phase: "ANONYMOUS", user: null, project: null });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Секретный черновик");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("offers a fresh login after 428 and never replays the lifecycle command", async () => {
    api.get.mockResolvedValue({
      ...detail,
      status: "APPROVED",
      version: 2,
      allowedActions: ["START"],
    });
    api.start.mockRejectedValue({
      status: 428,
      code: "REAUTHENTICATION_REQUIRED",
    });
    const { auth, router, wrapper } = await mountRoute();
    auth.project = {
      ...auth.project!,
      effectivePermissionCodes: [
        "project.telegram.broadcasts.read",
        "project.telegram.broadcasts.operate",
      ],
    };
    await flushPromises();
    const logout = vi.spyOn(auth, "logout").mockResolvedValue();

    await wrapper.get('[data-action="start"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Требуется свежий вход с MFA");
    expect(api.start).toHaveBeenCalledOnce();
    await wrapper.get('[data-action="broadcast-fresh-login"]').trigger("click");
    await flushPromises();

    expect(logout).toHaveBeenCalledOnce();
    expect(router.currentRoute.value).toMatchObject({
      name: "login",
      query: { redirect: "/telegram/broadcasts/broadcast-1" },
    });
    expect(api.start).toHaveBeenCalledOnce();
  });
});
