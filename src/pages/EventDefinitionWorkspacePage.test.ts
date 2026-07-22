import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";
import EventDefinitionWorkspacePage from "./EventDefinitionWorkspacePage.vue";

const mocks = vi.hoisted(() => ({
  auth: null as null | {
    project: { id: string; effectivePermissionCodes: string[] } | null;
    user: { role: "OWNER" | "ADMIN" } | null;
  },
  route: null as null | { params: { definitionKeyId: string } },
  getDefinition: vi.fn(),
  getUsage: vi.fn(),
  updatePolicy: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  hardDelete: vi.fn(),
  listDefinitions: vi.fn(),
  updateMetadata: vi.fn(),
  push: vi.fn(),
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

vi.mock("@/shared/api/repository/event-catalog", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/shared/api/repository/event-catalog")
  >()),
  eventCatalogRepository: {
    getDefinition: mocks.getDefinition,
    getUsage: mocks.getUsage,
    updatePolicy: mocks.updatePolicy,
    archive: mocks.archive,
    restore: mocks.restore,
    hardDelete: mocks.hardDelete,
    listDefinitions: mocks.listDefinitions,
    updateMetadata: mocks.updateMetadata,
  },
}));

vi.mock("vue-router", async () => {
  const { reactive } = await import("vue");
  mocks.route ??= reactive({ params: { definitionKeyId: "event-key-1" } });
  return {
    useRoute: () => mocks.route,
    useRouter: () => ({ push: mocks.push }),
  };
});

const workspace = {
  definitionKeyId: "event-key-1",
  projectId: "project-1",
  code: "deposit.succeeded",
  lifecycle: "ACTIVE" as const,
  lifecycleVersion: 2,
  lifecycleUpdatedAt: "2026-07-20T10:00:00.000Z",
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
    publishedAt: "2026-07-20T09:00:00.000Z",
  },
  origin: "CUSTOM" as const,
  readOnly: false,
};

function mountWorkspace() {
  return mount(EventDefinitionWorkspacePage, {
    global: {
      stubs: {
        RouterLink: { template: "<a><slot /></a>" },
        Dialog: {
          props: ["visible", "header"],
          template:
            '<section v-if="visible" class="dialog-stub"><h2>{{ header }}</h2><slot /><footer><slot name="footer" /></footer></section>',
        },
        EventDefinitionHistory: {
          template: '<button type="button">История</button>',
        },
      },
    },
  });
}

function button(
  wrapper: ReturnType<typeof mountWorkspace>,
  label: string,
  last = false,
) {
  const matches = wrapper
    .findAll("button")
    .filter((item) => item.text() === label);
  const found = last ? matches.at(-1) : matches[0];
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

describe("EventDefinitionWorkspacePage Overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth!.project = {
      id: "project-1",
      effectivePermissionCodes: ["project.event_catalog.write"],
    };
    mocks.auth!.user = { role: "OWNER" };
    mocks.route!.params.definitionKeyId = "event-key-1";
    mocks.getDefinition.mockResolvedValue(workspace);
    mocks.getUsage.mockResolvedValue({
      definitionKeyId: "event-key-1",
      evaluatedAt: "2026-07-20T10:00:00.000Z",
      lifecycleVersion: 2,
      policyVersion: 3,
      eventLogs: { exists: false },
      scenarios: { total: 0, items: [], truncated: false },
      scenarioDraftDependencyCount: 0,
      publishedScenarioRevisionCount: 0,
      activeWaitCount: 0,
      canArchive: true,
      canDelete: true,
      archiveBlockers: [],
      deleteBlockers: [],
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
    mocks.updatePolicy.mockResolvedValue(workspace);
    mocks.archive.mockResolvedValue({
      ...workspace,
      lifecycle: "ARCHIVED",
      policy: { ...workspace.policy, enabled: false },
    });
    mocks.restore.mockResolvedValue({
      ...workspace,
      lifecycle: "ACTIVE",
      policy: { ...workspace.policy, enabled: false },
    });
    mocks.listDefinitions.mockImplementation(
      async (_projectId: string, lifecycle: "ACTIVE" | "ARCHIVED") =>
        lifecycle === "ARCHIVED"
          ? [
              {
                ...workspace,
                lifecycle: "ARCHIVED",
                policy: { ...workspace.policy, enabled: false },
              },
            ]
          : [],
    );
  });

  it("shows stable producer identity separately from read-only Lola revision metadata", async () => {
    const wrapper = mountWorkspace();
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
    const wrapper = mountWorkspace();
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
    expect(mocks.getUsage).toHaveBeenCalledWith("project-1", "event-key-1");
  });

  it("saves rename and description through metadata command without changing the schema revision", async () => {
    const wrapper = mountWorkspace();
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
    const wrapper = mountWorkspace();
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
    const wrapper = mountWorkspace();
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
    const wrapper = mountWorkspace();
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

  it("ignores a stale definition response after the route changes", async () => {
    let resolveFirst!: (value: typeof workspace) => void;
    const first = new Promise<typeof workspace>((resolve) => {
      resolveFirst = resolve;
    });
    const secondWorkspace = {
      ...workspace,
      definitionKeyId: "event-key-2",
      code: "withdrawal.succeeded",
      metadata: { ...workspace.metadata, name: "Успешный вывод" },
    };
    mocks.getDefinition
      .mockReset()
      .mockImplementation((_projectId, key) =>
        key === "event-key-1" ? first : Promise.resolve(secondWorkspace),
      );
    const wrapper = mountWorkspace();
    await flushPromises();

    mocks.route!.params.definitionKeyId = "event-key-2";
    await flushPromises();
    resolveFirst(workspace);
    await flushPromises();

    expect(wrapper.get('[data-test="event-code"]').text()).toBe(
      "withdrawal.succeeded",
    );
    expect(wrapper.text()).not.toContain("Успешный депозит");
  });

  it("archives only after fresh usage and proves both catalog projections before navigating", async () => {
    const wrapper = mountWorkspace();
    await flushPromises();

    await button(wrapper, "Архивировать").trigger("click");
    await flushPromises();
    expect(mocks.getUsage).toHaveBeenCalledWith("project-1", "event-key-1");
    await button(wrapper, "Архивировать", true).trigger("click");
    await flushPromises();

    expect(mocks.archive).toHaveBeenCalledWith("project-1", "event-key-1", {
      expectedLifecycleVersion: 2,
      expectedPolicyVersion: 3,
      reason: undefined,
    });
    expect(mocks.listDefinitions).toHaveBeenCalledWith("project-1", "ACTIVE");
    expect(mocks.listDefinitions).toHaveBeenCalledWith("project-1", "ARCHIVED");
    expect(mocks.push).toHaveBeenCalledWith({
      name: "events",
      query: { lifecycle: "ARCHIVED" },
    });
  });

  it("discards a completed archive mutation after the route changes", async () => {
    let resolveArchive!: () => void;
    const pendingArchive = new Promise<void>((resolve) => {
      resolveArchive = resolve;
    });
    const secondWorkspace = {
      ...workspace,
      definitionKeyId: "event-key-2",
      code: "withdrawal.succeeded",
      metadata: { ...workspace.metadata, name: "Успешный вывод" },
    };
    mocks.archive.mockReturnValue(pendingArchive);
    mocks.getDefinition.mockImplementation((_projectId, key) =>
      Promise.resolve(key === "event-key-2" ? secondWorkspace : workspace),
    );
    const wrapper = mountWorkspace();
    await flushPromises();

    await button(wrapper, "Архивировать").trigger("click");
    await flushPromises();
    await button(wrapper, "Архивировать", true).trigger("click");
    mocks.route!.params.definitionKeyId = "event-key-2";
    await flushPromises();
    resolveArchive();
    await flushPromises();

    expect(wrapper.get('[data-test="event-code"]').text()).toBe(
      "withdrawal.succeeded",
    );
    expect(mocks.listDefinitions).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("warns about Scenario impact before disabling and verifies a newer policy version", async () => {
    mocks.getUsage.mockResolvedValue({
      ...(await mocks.getUsage()),
      scenarios: { total: 2, items: [], truncated: false },
    });
    mocks.getDefinition
      .mockReset()
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce({
        ...workspace,
        policy: { ...workspace.policy, enabled: false, version: 4 },
      });
    const wrapper = mountWorkspace();
    await flushPromises();
    await wrapper
      .get('button[role="tab"][data-section="policy"]')
      .trigger("click");
    await button(wrapper, "Выключить приём").trigger("click");
    await flushPromises();

    expect(wrapper.get(".dialog-stub").text()).toContain(
      "Связано сценариев: 2",
    );
    await button(wrapper, "Выключить приём", true).trigger("click");
    await flushPromises();
    expect(mocks.updatePolicy).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      expect.objectContaining({ enabled: false, expectedVersion: 3 }),
    );
    expect(wrapper.get('[role="status"]').text()).toContain("выключен");
  });

  it("refetches after a stale archive preflight conflict and never navigates", async () => {
    mocks.archive.mockRejectedValue(new ApiError(409, "Conflict"));
    const wrapper = mountWorkspace();
    await flushPromises();
    await button(wrapper, "Архивировать").trigger("click");
    await flushPromises();
    await button(wrapper, "Архивировать", true).trigger("click");
    await flushPromises();

    expect(mocks.getDefinition).toHaveBeenCalledTimes(2);
    expect(mocks.getUsage).toHaveBeenCalledTimes(4);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain("Conflict");
  });

  it("renders server blockers and never calls archive when usage denies it", async () => {
    mocks.getUsage.mockResolvedValue({
      definitionKeyId: "event-key-1",
      evaluatedAt: "now",
      lifecycleVersion: 2,
      policyVersion: 3,
      eventLogs: { exists: false },
      scenarios: {
        total: 1,
        items: [
          {
            scenarioId: "scenario-1",
            name: "VIP депозит",
            status: "DRAFT",
            usages: ["TRIGGER"],
          },
        ],
        truncated: false,
      },
      scenarioDraftDependencyCount: 1,
      publishedScenarioRevisionCount: 0,
      activeWaitCount: 1,
      canArchive: false,
      canDelete: false,
      archiveBlockers: ["SCENARIO_DEPENDENCIES"],
      deleteBlockers: ["SCENARIO_DEPENDENCIES"],
    });
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(
      button(wrapper, "Архивировать").attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.get(".lifecycle-blocker-summary").text()).toContain(
      "Сценарий: VIP депозит",
    );
    expect(wrapper.get(".lifecycle-blocker-summary").text()).toContain(
      "Активные ожидания: 1",
    );
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("requires code and reason, then hard-deletes with usage OCC and verifies list absence", async () => {
    const wrapper = mountWorkspace();
    await flushPromises();
    await button(wrapper, "Удалить").trigger("click");
    await flushPromises();

    const deleteButton = button(wrapper, "Удалить навсегда");
    expect(deleteButton.attributes("disabled")).toBeDefined();
    await wrapper.get("#event-delete-reason").setValue("Создано по ошибке");
    await wrapper
      .get("#event-delete-confirmation")
      .setValue("deposit.succeeded");
    await deleteButton.trigger("click");
    await flushPromises();

    expect(mocks.hardDelete).toHaveBeenCalledWith("project-1", "event-key-1", {
      expectedLifecycleVersion: 2,
      expectedPolicyVersion: 3,
      reason: "Создано по ошибке",
    });
    expect(mocks.listDefinitions).toHaveBeenCalledWith("project-1", "ACTIVE");
    expect(mocks.push).toHaveBeenCalledWith({ name: "events", query: {} });
  });

  it("restores an archived definition but keeps ingestion disabled", async () => {
    mocks.getDefinition.mockResolvedValue({
      ...workspace,
      lifecycle: "ARCHIVED",
      readOnly: true,
      policy: { ...workspace.policy, enabled: false },
    });
    mocks.listDefinitions.mockResolvedValue([
      {
        ...workspace,
        lifecycle: "ACTIVE",
        policy: { ...workspace.policy, enabled: false },
      },
    ]);
    const wrapper = mountWorkspace();
    await flushPromises();
    await button(wrapper, "Восстановить").trigger("click");
    await flushPromises();

    expect(mocks.restore).toHaveBeenCalledWith("project-1", "event-key-1", {
      expectedLifecycleVersion: 2,
      reason: "Restored from CMS workspace",
    });
    expect(wrapper.text()).toContain(
      "Приём новых событий остаётся выключенным",
    );
    expect(wrapper.get('[data-test="lifecycle-state"]').text()).toBe(
      "Выключено",
    );
    await wrapper
      .get('button[role="tab"][data-section="schema"]')
      .trigger("click");
    expect(button(wrapper, "История").exists()).toBe(true);
  });

  it("keeps Lola-managed definitions read-only without lifecycle actions", async () => {
    mocks.getDefinition.mockResolvedValue({
      ...workspace,
      origin: "LOLA_MANAGED",
      readOnly: true,
    });
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(wrapper.text()).toContain("Управляется Lola · только чтение");
    expect(
      wrapper.findAll("button").some((item) => item.text() === "Архивировать"),
    ).toBe(false);
    expect(
      wrapper.findAll("button").some((item) => item.text() === "Удалить"),
    ).toBe(false);
  });
});
