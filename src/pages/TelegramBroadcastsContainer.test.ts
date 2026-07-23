import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import TelegramBroadcastsPage from "./TelegramBroadcastsPage.vue";

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

vi.mock(
  "@/features/telegram-broadcasts/api/telegram-broadcasts.api",
  () => ({ telegramBroadcastsApi: api }),
);

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
        path: "/telegram/broadcasts",
        name: "telegram-broadcasts",
        component: TelegramBroadcastsPage,
      },
      {
        path: "/telegram/broadcasts/:broadcastId",
        name: "telegram-broadcast-detail",
        component: { template: "<div>detail</div>" },
      },
      {
        path: "/overview",
        name: "overview",
        component: { template: "<div>overview</div>" },
      },
    ],
  });
  await router.push("/telegram/broadcasts");
  await router.isReady();
  const wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        Dialog: {
          props: ["visible"],
          emits: ["update:visible"],
          template:
            '<section v-if="visible" role="dialog"><button data-test="close-dialog" @click="$emit(\'update:visible\', false)">close</button><slot /></section>',
        },
      },
    },
  });
  await flushPromises();
  return { auth, router, wrapper };
}

describe("TelegramBroadcastsPage container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue({ items: [], nextCursor: null, total: 0 });
  });

  it("guards ordinary navigation but scrubs the create draft on a Project switch", async () => {
    const { auth, router, wrapper } = await mountRoute();
    await wrapper.get('[data-action="create"]').trigger("click");
    await wrapper.get("#broadcast-title").setValue("Черновик");
    await wrapper.get("#broadcast-text").setValue("Несохранённый текст");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    await wrapper.get('[data-test="close-dialog"]').trigger("click");
    expect(confirm).toHaveBeenCalled();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    await router.push("/overview");
    expect(router.currentRoute.value.name).toBe("telegram-broadcasts");

    auth.project = { ...auth.project!, id: "project-2", name: "Project Two" };
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);

    await wrapper.get('[data-action="create"]').trigger("click");
    expect(
      (wrapper.get("#broadcast-title").element as HTMLInputElement).value,
    ).toBe("");
    expect(
      (wrapper.get("#broadcast-text").element as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it.each(["read", "draft"] as const)(
    "scrubs the create draft when %s permission is lost",
    async (permission) => {
      const { auth, wrapper } = await mountRoute();
      await wrapper.get('[data-action="create"]').trigger("click");
      await wrapper.get("#broadcast-text").setValue("Секретный черновик");

      auth.project = {
        ...auth.project!,
        effectivePermissionCodes:
          permission === "read"
            ? ["project.telegram.broadcasts.draft"]
            : ["project.telegram.broadcasts.read"],
      };
      await flushPromises();

      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    },
  );

  it("scrubs the create draft on logout", async () => {
    const { auth, wrapper } = await mountRoute();
    await wrapper.get('[data-action="create"]').trigger("click");
    await wrapper.get("#broadcast-text").setValue("Секретный черновик");

    auth.$patch({
      phase: "ANONYMOUS",
      user: null,
      project: null,
    });
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
});
