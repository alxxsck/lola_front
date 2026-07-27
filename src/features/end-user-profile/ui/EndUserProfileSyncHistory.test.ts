import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EndUserProfileSyncHistory from "./EndUserProfileSyncHistory.vue";

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
}));

vi.mock("@/features/end-user-profile/api/end-user-profile-repository", () => ({
  endUserProfileRepository: {
    history: mocks.history,
  },
}));

const appliedAttempt = {
  id: "attempt-1",
  receivedAt: "2026-07-27T12:00:00.000Z",
  observedAt: "2026-07-27T11:59:59.000Z",
  source: "PROFILE_SYNC",
  credentialId: "credential-1",
  outcome: "APPLIED",
  status: "APPLIED",
  declaredContractRevision: 5,
  activeContractRevision: 5,
  sourceSequence: "19",
  previousProfileVersion: "4",
  resultProfileVersion: "5",
  submittedFields: [
    {
      definitionId: "definition-name",
      key: "name",
      label: "Имя",
    },
  ],
  removedFields: [
    {
      definitionId: "definition-country",
      key: "country",
      label: "Страна",
    },
  ],
  issues: [],
  snapshotBytes: 31,
  durationMs: 4,
  idempotencyConflictCount: 0,
} as const;

function mountHistory() {
  return mount(EndUserProfileSyncHistory, {
    props: {
      projectId: "project-1",
      endUserId: "user-1",
    },
    global: {
      stubs: {
        Button: {
          props: ["label", "loading"],
          emits: ["click"],
          template:
            '<button type="button" :disabled="loading" @click="$emit(\'click\')">{{ label }}<slot /></button>',
        },
        Drawer: {
          props: ["visible"],
          emits: ["update:visible"],
          template:
            '<aside v-if="visible"><slot name="header" /><slot /></aside>',
        },
        Message: { template: "<div><slot /></div>" },
        Skeleton: { template: "<span />" },
        Tag: {
          props: ["value"],
          template: "<span>{{ value }}</span>",
        },
      },
    },
  });
}

describe("история синхронизации профиля", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.history.mockResolvedValue({
      items: [appliedAttempt],
      nextCursor: null,
    });
  });

  it("по запросу открывает переход версии и состав переданных и удалённых полей", async () => {
    const wrapper = mountHistory();

    expect(mocks.history).not.toHaveBeenCalled();
    await wrapper
      .get('button[aria-label="Открыть историю профиля"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.history).toHaveBeenCalledWith("project-1", "user-1", {
      limit: 25,
    });
    expect(wrapper.text()).toContain("Версия 4");
    expect(wrapper.text()).toContain("Версия 5");
    expect(wrapper.text()).toContain("Передано");
    expect(wrapper.text()).toContain("Имя");
    expect(wrapper.text()).toContain("Удалено");
    expect(wrapper.text()).toContain("Страна");
    expect(wrapper.text()).toContain(
      "Передано — поля, пришедшие в этой попытке",
    );
  });

  it("добавляет более раннюю страницу по opaque cursor и не дублирует попытки", async () => {
    mocks.history
      .mockResolvedValueOnce({
        items: [appliedAttempt],
        nextCursor: "opaque-page-2",
      })
      .mockResolvedValueOnce({
        items: [
          appliedAttempt,
          {
            ...appliedAttempt,
            id: "attempt-2",
            receivedAt: "2026-07-27T11:00:00.000Z",
            previousProfileVersion: "3",
            resultProfileVersion: "4",
          },
        ],
        nextCursor: null,
      });
    const wrapper = mountHistory();
    await wrapper
      .get('button[aria-label="Открыть историю профиля"]')
      .trigger("click");
    await flushPromises();

    await wrapper
      .get('button[aria-label="Загрузить более ранние"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.history).toHaveBeenLastCalledWith("project-1", "user-1", {
      limit: 25,
      cursor: "opaque-page-2",
    });
    expect(wrapper.findAll(".history-attempt")).toHaveLength(2);
    expect(wrapper.text()).toContain("Версия 3");
  });

  it("объясняет отклонённую попытку кодами ошибок без значений профиля", async () => {
    mocks.history.mockResolvedValueOnce({
      items: [
        {
          ...appliedAttempt,
          id: "attempt-rejected",
          outcome: "REJECTED_INVALID",
          status: "REJECTED_INVALID",
          previousProfileVersion: "5",
          resultProfileVersion: "5",
          issues: [
            {
              code: "ATTRIBUTE_TYPE_INVALID",
              definitionId: "definition-name",
            },
          ],
        },
      ],
      nextCursor: null,
    });
    const wrapper = mountHistory();
    await wrapper
      .get('button[aria-label="Открыть историю профиля"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Отклонено");
    expect(wrapper.text()).toContain("Ошибки синхронизации");
    expect(wrapper.text()).toContain("ATTRIBUTE_TYPE_INVALID");
    expect(wrapper.text()).not.toContain("Алексей");
  });

  it("повторяет именно упавшую cursor-страницу и сохраняет уже загруженную историю", async () => {
    mocks.history
      .mockResolvedValueOnce({
        items: [appliedAttempt],
        nextCursor: "opaque-page-2",
      })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        items: [
          {
            ...appliedAttempt,
            id: "attempt-2",
            previousProfileVersion: "3",
            resultProfileVersion: "4",
          },
        ],
        nextCursor: null,
      });
    const wrapper = mountHistory();
    await wrapper
      .get('button[aria-label="Открыть историю профиля"]')
      .trigger("click");
    await flushPromises();
    await wrapper
      .get('button[aria-label="Загрузить более ранние"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".history-attempt")).toHaveLength(1);
    await wrapper.get('button[aria-label="Повторить"]').trigger("click");
    await flushPromises();

    expect(mocks.history).toHaveBeenLastCalledWith("project-1", "user-1", {
      limit: 25,
      cursor: "opaque-page-2",
    });
    expect(wrapper.findAll(".history-attempt")).toHaveLength(2);
  });

  it("показывает пустое состояние и позволяет повторить начальный запрос", async () => {
    mocks.history
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const wrapper = mountHistory();
    await wrapper
      .get('button[aria-label="Открыть историю профиля"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Не удалось загрузить историю профиля");
    expect(wrapper.find(".history-timeline").exists()).toBe(false);
    await wrapper.get('button[aria-label="Повторить"]').trigger("click");
    await flushPromises();

    expect(mocks.history).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("История пока пуста");
  });
});
