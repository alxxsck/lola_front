import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EventsPage from "./EventsPage.vue";

const mocks = vi.hoisted(() => ({
  listDefinitions: vi.fn(),
  createDefinition: vi.fn(),
  getUsage: vi.fn(),
  updatePolicy: vi.fn(),
  getContract: vi.fn(),
  toast: vi.fn(),
  confirm: vi.fn(),
  routerPush: vi.fn(),
  guardDirty: null as { value: boolean } | null,
  auth: null as null | {
    project: { id: string; effectivePermissionCodes: string[] } | null;
    user: { role: "OWNER" };
  },
  routeQuery: null as null | Record<string, string>,
}));

vi.mock("@/features/auth/auth.store", async () => {
  const { reactive } = await import("vue");
  mocks.auth ??= reactive({
    project: {
      id: "project-1",
      effectivePermissionCodes: ["project.event_catalog.write"],
    },
    user: { role: "OWNER" as const },
  });
  return { useAuthStore: () => mocks.auth };
});

vi.mock("@/shared/api/repository/event-catalog", () => ({
  eventCatalogRepository: {
    listDefinitions: mocks.listDefinitions,
    createDefinition: mocks.createDefinition,
    getUsage: mocks.getUsage,
    updatePolicy: mocks.updatePolicy,
  },
}));

vi.mock("@/shared/api/repository/scenario-authoring", () => ({
  scenarioAuthoringRepository: { getContract: mocks.getContract },
}));

vi.mock("vue-router", async () => {
  const { reactive } = await import("vue");
  mocks.routeQuery ??= reactive({});
  return {
    useRoute: () => ({ query: mocks.routeQuery }),
    useRouter: () => ({ push: mocks.routerPush }),
  };
});

vi.mock("primevue/useconfirm", () => ({
  useConfirm: () => ({ require: (options: unknown) => mocks.confirm(options) }),
}));
vi.mock("primevue/usetoast", () => ({
  useToast: () => ({ add: mocks.toast }),
}));
vi.mock("@/shared/lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: (dirty: { value: boolean }) => {
    mocks.guardDirty = dirty;
    return { confirmDiscard: () => true };
  },
}));

const existingEvent = {
  definitionKeyId: "event-key-1",
  projectId: "project-1",
  code: "deposit.succeeded",
  lifecycle: "ACTIVE" as const,
  lifecycleVersion: 1,
  lifecycleUpdatedAt: "2026-07-20T10:00:00.000Z",
  metadata: {
    name: "Успешный депозит",
    description: "Деньги зачислены",
    concurrencyToken: "2026-07-20T10:00:00.000Z",
  },
  policy: {
    version: 1,
    updatedAt: "2026-07-20T10:00:00.000Z",
    enabled: true,
    clientIngestible: false,
    countsAsActivity: true,
  },
  currentSchema: {
    revisionId: "event-1",
    revisionNumber: 2,
    payloadSchema: {
      type: "object",
      properties: { amount: { type: "integer" } },
    },
    publishedAt: "2026-07-20T10:00:00.000Z",
  },
  origin: "CUSTOM" as const,
  readOnly: false,
};

function mountPage() {
  return shallowMount(EventsPage, {
    global: {
      stubs: {
        Dialog: {
          props: ["visible"],
          template: '<div v-if="visible"><slot /><slot name="footer" /></div>',
        },
        Message: { template: "<div><slot /></div>" },
      },
    },
  });
}

describe("EventsPage event editor journey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    mocks.auth!.project = {
      id: "project-1",
      effectivePermissionCodes: ["project.event_catalog.write"],
    };
    for (const key of Object.keys(mocks.routeQuery!))
      delete mocks.routeQuery![key];
    mocks.listDefinitions.mockResolvedValue([existingEvent]);
    mocks.getContract.mockResolvedValue({ revision: "catalog-1", events: [] });
    mocks.createDefinition.mockResolvedValue(existingEvent);
  });

  it("guides creation through four business steps instead of one technical form", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.find('button-stub[label="Новое событие"]').trigger("click");

    expect(
      wrapper
        .findAll(".event-steps button strong")
        .map((label) => label.text()),
    ).toEqual(["Смысл", "Данные", "Пример", "Изменения"]);
    expect(wrapper.find('button-stub[label="Далее"]').exists()).toBe(true);
    expect(wrapper.find('button-stub[label="Создать событие"]').exists()).toBe(
      false,
    );
  });

  it("opens the Event Definition workspace by stable identity instead of editing mixed lifecycle concerns", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper
      .find('button-stub[aria-label="Редактировать Успешный депозит"]')
      .trigger("click");

    expect(mocks.routerPush).toHaveBeenCalledWith({
      name: "event-definition-workspace",
      params: { definitionKeyId: "event-key-1" },
    });
    expect(mocks.createDefinition).not.toHaveBeenCalled();
  });

  it("asks before leaving unapplied technical JSON changes", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.find('button-stub[label="Новое событие"]').trigger("click");
    await wrapper.findAll(".event-steps button")[1]!.trigger("click");
    wrapper
      .getComponent({ name: "EventPayloadStudio" })
      .vm.$emit("technical-draft-change", true);
    await wrapper.vm.$nextTick();
    expect(mocks.guardDirty?.value).toBe(true);
    await wrapper.findAll(".event-steps button")[2]!.trigger("click");

    expect(wrapper.find(".event-steps button.active strong").text()).toBe(
      "Данные",
    );
    const confirmation = mocks.confirm.mock.calls[0]?.[0] as {
      header: string;
      accept: () => void;
    };
    expect(confirmation.header).toBe("Отменить изменения JSON?");
    confirmation.accept();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".event-steps button.active strong").text()).toBe(
      "Пример",
    );
  });

  it("keeps the user on the meaning step until required business fields are complete", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.find('button-stub[label="Новое событие"]').trigger("click");
    await wrapper.find('button-stub[label="Далее"]').trigger("click");

    expect(wrapper.find("#event-name-error").text()).toContain(
      "понятное название",
    );
    expect(wrapper.find(".event-steps button.active strong").text()).toBe(
      "Смысл",
    );
    expect(mocks.createDefinition).not.toHaveBeenCalled();
  });

  it("shows loading and empty list states", async () => {
    mocks.listDefinitions.mockReturnValue(new Promise(() => {}));
    const loadingWrapper = mountPage();

    expect(loadingWrapper.findAll(".events-list .event-card")).toHaveLength(4);
    loadingWrapper.unmount();

    mocks.listDefinitions.mockResolvedValue([]);
    const emptyWrapper = mountPage();
    await flushPromises();

    expect(emptyWrapper.get(".empty").text()).toContain(
      "Каталог событий пока пуст",
    );
  });

  it("shows an empty search result", async () => {
    const wrapper = mountPage();
    await flushPromises();

    wrapper
      .getComponent({ name: "InputText" })
      .vm.$emit("update:modelValue", "несуществующее событие");
    await wrapper.vm.$nextTick();

    expect(wrapper.get(".empty").text()).toContain("События не найдены");
  });

  it("puts system events first and explains their lock without a managed badge", async () => {
    mocks.listDefinitions.mockResolvedValue([
      existingEvent,
      {
        ...existingEvent,
        definitionKeyId: "definition-system",
        code: "lola.became_offline",
        metadata: {
          ...existingEvent.metadata,
          name: "Пользователь стал офлайн",
          description: "Пользователь отключился от Lola",
        },
        origin: "LOLA_MANAGED",
        readOnly: true,
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    const cards = wrapper.findAll(".event-card");
    expect(cards[0]?.find("h2").text()).toBe("Пользователь стал офлайн");
    expect(cards[0]?.find(".system-description").text()).toBe(
      "Пользователь отключился от Lola",
    );
    expect(cards[0]?.get(".system-lock").attributes("aria-label")).toBe(
      "Почему событие нельзя изменить",
    );
    expect(cards[0]?.get('[role="tooltip"]').text()).toContain(
      "техническое имя и схема данных задаются системой",
    );
    expect(cards[0]?.text()).not.toContain("Lola managed");
    expect(cards[0]?.text()).not.toContain("stable identity");
    await cards[0]
      ?.get('button-stub[aria-label="Просмотреть Пользователь стал офлайн"]')
      .trigger("click");
    expect(mocks.routerPush).toHaveBeenCalledWith({
      name: "event-definition-workspace",
      params: { definitionKeyId: "definition-system" },
    });
  });

  it("labels inactive custom events without making the card or its actions look disabled", async () => {
    mocks.listDefinitions.mockResolvedValue([
      { ...existingEvent, policy: { ...existingEvent.policy, enabled: false } },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    const card = wrapper.get(".event-card");
    expect(card.classes()).toContain("inactive");
    expect(card.classes()).not.toContain("disabled");
    expect(card.get(".event-status").text()).toBe("Выключено");
    expect(
      wrapper.getComponent({ name: "ToggleSwitch" }).attributes("disabled"),
    ).toBe("false");
    expect(
      card
        .find('button-stub[aria-label="Редактировать Успешный депозит"]')
        .exists(),
    ).toBe(true);
    expect(
      card.find('button-stub[aria-label="Удалить Успешный депозит"]').exists(),
    ).toBe(false);
  });

  it("shows a load error and retries successfully", async () => {
    mocks.listDefinitions
      .mockReset()
      .mockRejectedValueOnce(new Error("Сбой каталога"))
      .mockResolvedValue([]);
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Сбой каталога");

    await wrapper
      .findAll('button-stub[label="Повторить"]')[0]!
      .trigger("click");
    await flushPromises();

    expect(mocks.listDefinitions).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain("Сбой каталога");
  });

  it("loads the Archive projection and keeps lifecycle mutations in the workspace", async () => {
    mocks.routeQuery!.lifecycle = "ARCHIVED";
    mocks.listDefinitions.mockResolvedValue([
      {
        ...existingEvent,
        lifecycle: "ARCHIVED",
        readOnly: true,
        policy: { ...existingEvent.policy, enabled: false },
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    expect(mocks.listDefinitions).toHaveBeenCalledWith("project-1", "ARCHIVED");
    expect(wrapper.get(".event-status").text()).toBe("В архиве");
    expect(wrapper.find('button-stub[label="Новое событие"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.getComponent({ name: "ToggleSwitch" }).attributes("disabled"),
    ).toBe("true");
  });

  it("ignores a stale Active response after switching to Archive", async () => {
    let resolveActive!: (value: Array<typeof existingEvent>) => void;
    const active = new Promise<Array<typeof existingEvent>>((resolve) => {
      resolveActive = resolve;
    });
    const archived = {
      ...existingEvent,
      definitionKeyId: "archived-key",
      code: "old.event",
      lifecycle: "ARCHIVED" as const,
      metadata: { ...existingEvent.metadata, name: "Архивное событие" },
      policy: { ...existingEvent.policy, enabled: false },
      readOnly: true,
    };
    mocks.listDefinitions
      .mockReset()
      .mockImplementation((_projectId, state) =>
        state === "ARCHIVED" ? Promise.resolve([archived]) : active,
      );
    const wrapper = mountPage();
    await flushPromises();

    mocks.routeQuery!.lifecycle = "ARCHIVED";
    await flushPromises();
    resolveActive([existingEvent]);
    await flushPromises();

    expect(wrapper.text()).toContain("Архивное событие");
    expect(wrapper.text()).not.toContain("Успешный депозит");
  });

  it("reloads for a new Project and ignores the previous Project response", async () => {
    let resolveFirst!: (value: Array<typeof existingEvent>) => void;
    const first = new Promise<Array<typeof existingEvent>>((resolve) => {
      resolveFirst = resolve;
    });
    const second = {
      ...existingEvent,
      definitionKeyId: "project-2-key",
      projectId: "project-2",
      code: "project.two.event",
      metadata: { ...existingEvent.metadata, name: "Событие проекта 2" },
    };
    mocks.listDefinitions
      .mockReset()
      .mockImplementation((projectId) =>
        projectId === "project-2" ? Promise.resolve([second]) : first,
      );
    const wrapper = mountPage();
    await flushPromises();

    mocks.auth!.project = {
      id: "project-2",
      effectivePermissionCodes: ["project.event_catalog.write"],
    };
    await flushPromises();
    resolveFirst([existingEvent]);
    await flushPromises();

    expect(mocks.listDefinitions).toHaveBeenLastCalledWith(
      "project-2",
      "ACTIVE",
    );
    expect(wrapper.text()).toContain("Событие проекта 2");
    expect(wrapper.text()).not.toContain("Успешный депозит");
  });

  it("copies the event contract directly from its card", async () => {
    mocks.listDefinitions.mockResolvedValue([
      {
        ...existingEvent,
        currentSchema: {
          ...existingEvent.currentSchema,
          payloadSchema: {
            type: "object",
            properties: {
              amount: { type: "integer", description: "Сумма в центах" },
              note: { type: "string" },
            },
            required: ["amount"],
          },
        },
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    await wrapper
      .get(
        'button-stub[aria-label="Скопировать контракт события Успешный депозит"]',
      )
      .trigger("click");

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "| `eventCode` | `string` | обязательно | `deposit.succeeded` |",
      ),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "| `payload.amount` | `integer` | обязательно | Сумма в центах |",
      ),
    );
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "Контракт события скопирован" }),
    );
  });
});
