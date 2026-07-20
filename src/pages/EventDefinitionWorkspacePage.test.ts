import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EventDefinitionWorkspacePage from "./EventDefinitionWorkspacePage.vue";

const mocks = vi.hoisted(() => ({
  getDefinition: vi.fn(),
  getHealth: vi.fn(),
  updateMetadata: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    project: { id: "project-1" },
    user: { role: "OWNER" },
  }),
}));

vi.mock("@/shared/api/repository/event-catalog", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/shared/api/repository/event-catalog")
  >()),
  eventCatalogRepository: {
    getDefinition: mocks.getDefinition,
    getHealth: mocks.getHealth,
    updateMetadata: mocks.updateMetadata,
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { definitionKeyId: "event-key-1" } }),
  useRouter: () => ({ push: mocks.push }),
}));

const workspace = {
  definitionKeyId: "event-key-1",
  code: "deposit.succeeded",
  metadata: {
    name: "Успешный депозит",
    description: "Деньги зачислены на счёт",
    concurrencyToken: "2026-07-20T10:00:00.000Z",
  },
  policy: {
    version: 3,
    updatedAt: "2026-07-19T10:00:00.000Z",
    enabled: true,
    clientIngestible: false,
    countsAsActivity: true,
  },
  currentSchema: {
    revisionId: "revision-4",
    revisionNumber: 4,
    payloadSchema: {
      type: "object",
      properties: { amount: { type: "integer" } },
    },
  },
  origin: "CUSTOM" as const,
  readOnly: false,
};

describe("EventDefinitionWorkspacePage Overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDefinition.mockResolvedValue(workspace);
    mocks.getHealth.mockResolvedValue({
      consumers: [],
      activeWaits: [],
      drafts: [],
    });
    mocks.updateMetadata.mockResolvedValue({
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      metadata: {
        name: "Депозит завершён",
        description: null,
        concurrencyToken: "2026-07-20T11:00:00.000Z",
      },
      currentRevisionId: "revision-4",
      metadataChanged: true,
      schemaRevisionUnchanged: true,
    });
  });

  it("shows stable producer identity separately from read-only Lola revision metadata", async () => {
    const wrapper = mount(EventDefinitionWorkspacePage);
    await flushPromises();

    expect(mocks.getDefinition).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
    );
    expect(wrapper.get('[data-test="event-code"]').text()).toBe(
      "deposit.succeeded",
    );
    expect(wrapper.get('[data-test="schema-revision"]').text()).toContain("v4");
    expect(
      wrapper.get('[data-test="producer-contract-hint"]').text(),
    ).toContain("eventCode + payload");
    expect(wrapper.get('[data-test="producer-contract-hint"]').text()).toMatch(
      /номер версии схемы передавать не нужно/i,
    );
    expect(wrapper.find('input[name="code"]').exists()).toBe(false);
    expect(wrapper.find('input[name="revision"]').exists()).toBe(false);
  });

  it("uses Russian product copy and switches every visible workspace tab", async () => {
    const wrapper = mount(EventDefinitionWorkspacePage);
    await flushPromises();

    expect(wrapper.text()).not.toMatch(
      /Event Definition|Overview|Ingestion Policy|Schema Revisions|Usage \/ Health|Display metadata|Current published schema|Stable event code|Product backend|payload schema|producer contract/,
    );
    expect(wrapper.get('[data-test="overview-section"]').isVisible()).toBe(
      true,
    );

    await wrapper
      .get('button[role="tab"][data-section="policy"]')
      .trigger("click");
    expect(wrapper.get('[data-test="policy-section"]').isVisible()).toBe(true);

    await wrapper
      .get('button[role="tab"][data-section="schema"]')
      .trigger("click");
    expect(wrapper.get('[data-test="schema-section"]').isVisible()).toBe(true);

    await wrapper
      .get('button[role="tab"][data-section="usage"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-test="usage-section"]').isVisible()).toBe(true);
    expect(mocks.getHealth).toHaveBeenCalledWith("project-1", "event-key-1");
  });

  it("saves rename and description through metadata command without changing the schema revision", async () => {
    const wrapper = mount(EventDefinitionWorkspacePage);
    await flushPromises();

    await wrapper.get("#event-overview-name").setValue("Депозит завершён");
    await wrapper.get("#event-overview-description").setValue("");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.updateMetadata).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      {
        name: "Депозит завершён",
        description: null,
        expectedUpdatedAt: "2026-07-20T10:00:00.000Z",
      },
    );
    expect(wrapper.get('[role="status"]').text()).toContain(
      "Ревизия схемы не изменилась",
    );
    expect(wrapper.get('[data-test="schema-revision"]').text()).toContain("v4");
  });

  it("keeps unsaved metadata visible and never shows success when the mutation fails", async () => {
    mocks.updateMetadata.mockRejectedValue(
      new Error("Конфликт: данные уже изменены"),
    );
    const wrapper = mount(EventDefinitionWorkspacePage);
    await flushPromises();

    await wrapper
      .get("#event-overview-name")
      .setValue("Моё локальное название");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get("#event-overview-name").element).toHaveProperty(
      "value",
      "Моё локальное название",
    );
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Конфликт: данные уже изменены",
    );
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it("rejects an inconsistent mutation response instead of showing generic success", async () => {
    mocks.updateMetadata.mockResolvedValue({
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      metadata: {
        name: "Unexpected response",
        description: null,
        concurrencyToken: "2026-07-20T11:00:00.000Z",
      },
      currentRevisionId: "revision-5",
      metadataChanged: true,
      schemaRevisionUnchanged: false,
    });
    const wrapper = mount(EventDefinitionWorkspacePage);
    await flushPromises();

    await wrapper.get("#event-overview-name").setValue("Локальное название");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "нарушает правило сохранения без новой версии схемы",
    );
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it("does not send an unsafe mutation when the read contract omits metadata concurrency evidence", async () => {
    mocks.getDefinition.mockResolvedValue({
      ...workspace,
      metadata: { ...workspace.metadata, concurrencyToken: null },
    });
    const wrapper = mount(EventDefinitionWorkspacePage);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Сервер не предоставил данные",
    );
    expect(wrapper.get("#event-overview-name").attributes("readonly")).toBe("");
    expect(
      wrapper.get("#event-overview-description").attributes("readonly"),
    ).toBe("");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.updateMetadata).not.toHaveBeenCalled();
    expect(wrapper.get("button[type=submit]").attributes("disabled")).toBe("");
  });
});
