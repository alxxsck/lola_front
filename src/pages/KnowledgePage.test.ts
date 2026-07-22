import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgePage from "./KnowledgePage.vue";

const mocks = vi.hoisted(() => ({
  listKnowledgeDocuments: vi.fn(),
  permissions: [
    "project.knowledge.read",
    "project.knowledge.write",
  ] as string[],
  authProject: {
    id: "project-1",
    name: "Lola",
    supportedLocales: ["ru"],
    defaultLocale: "ru",
  } as object,
  confirmClose: vi.fn(),
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    get project() {
      return {
        ...mocks.authProject,
        effectivePermissionCodes: mocks.permissions,
      };
    },
    user: { id: "user-1", email: "owner@lola.ai" },
  }),
}));

vi.mock("@/features/knowledge/knowledge.api", () => ({
  createKnowledgeText: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
  getKnowledgeDocument: vi.fn(),
  listKnowledgeDocuments: mocks.listKnowledgeDocuments,
  retryKnowledgeDocument: vi.fn(),
  uploadKnowledgeFile: vi.fn(),
}));

vi.mock("primevue/useconfirm", () => ({
  useConfirm: () => ({ require: vi.fn(), close: mocks.confirmClose }),
}));

vi.mock("primevue/usetoast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

vi.mock("@/shared/lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscard: vi.fn(() => true) }),
}));

function mountKnowledge() {
  return shallowMount(KnowledgePage, {
    global: {
      stubs: {
        Message: { template: "<div><slot /></div>" },
      },
    },
  });
}

describe("KnowledgePage states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listKnowledgeDocuments
      .mockReset()
      .mockResolvedValue({ items: [], nextCursor: null });
    mocks.permissions = ["project.knowledge.read", "project.knowledge.write"];
    mocks.authProject = {
      id: "project-1",
      name: "Lola",
      supportedLocales: ["ru"],
      defaultLocale: "ru",
    };
  });

  it("shows loading and then the empty state", async () => {
    const wrapper = mountKnowledge();

    expect(wrapper.findAll(".document-skeleton")).toHaveLength(5);

    await flushPromises();

    expect(wrapper.get(".documents-empty").text()).toContain(
      "Добавьте первый материал",
    );
  });

  it("shows a list error and retries", async () => {
    mocks.listKnowledgeDocuments
      .mockRejectedValueOnce(new Error("Сбой базы знаний"))
      .mockResolvedValue({ items: [], nextCursor: null });
    const wrapper = mountKnowledge();
    await flushPromises();

    expect(wrapper.text()).toContain("Сбой базы знаний");

    await wrapper.get('button-stub[label="Повторить"]').trigger("click");
    await flushPromises();

    expect(mocks.listKnowledgeDocuments).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain("Сбой базы знаний");
  });

  it("disables mutations without the write Permission", async () => {
    mocks.permissions = ["project.knowledge.read"];
    const wrapper = mountKnowledge();
    await flushPromises();

    expect(
      wrapper.get('button-stub[label="Добавить текст"]').attributes(),
    ).toHaveProperty("disabled");
    expect(
      wrapper.get('button-stub[label="Загрузить файлы"]').attributes(),
    ).toHaveProperty("disabled");
  });

  it("opens the text dialog with the write Permission", async () => {
    const wrapper = mountKnowledge();
    await flushPromises();

    await wrapper.get('button-stub[label="Добавить текст"]').trigger("click");

    expect(
      wrapper.get('dialog-stub[header="Добавить текст"]').attributes("visible"),
    ).toBe("true");
  });

  it("uses the bounded locale projection for a knowledge-only role", async () => {
    mocks.authProject = {
      id: "project-1",
      name: "Lola",
      supportedLocales: ["en", "es"],
      defaultLocale: "es",
    };
    const wrapper = mountKnowledge();
    await flushPromises();

    expect(mocks.listKnowledgeDocuments).toHaveBeenCalledWith(
      "project-1",
      { limit: 30 },
      expect.any(AbortSignal),
    );
    await wrapper.get('button-stub[label="Добавить текст"]').trigger("click");
    const state = wrapper.vm as unknown as {
      textLocale: string | null;
      localeOptions: Array<{ label: string; value: string }>;
    };
    expect(state.textLocale).toBe("es");
    expect(state.localeOptions).toEqual([
      { label: "English", value: "en" },
      { label: "Español", value: "es" },
    ]);
  });

  it("fails closed without a locale projection and never invents ru", async () => {
    mocks.authProject = { id: "project-1", name: "Lola" };
    const wrapper = mountKnowledge();
    await flushPromises();

    expect(mocks.listKnowledgeDocuments).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "Backend не вернул разрешённый каталог языков проекта.",
    );
    expect(
      wrapper.get('button-stub[label="Добавить текст"]').attributes(),
    ).toHaveProperty("disabled");
    expect(
      wrapper.get('button-stub[label="Загрузить файлы"]').attributes(),
    ).toHaveProperty("disabled");
  });
});
