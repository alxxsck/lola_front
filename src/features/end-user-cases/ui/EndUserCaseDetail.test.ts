import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { EndUserCaseDetailBundle } from "../api/end-user-cases-repository";
import EndUserCaseDetail from "./EndUserCaseDetail.vue";

const detail = {
  case: {
    id: "case-1",
    projectSequence: "48",
    version: 2,
    type: "PROBLEM_RESOLUTION",
    groupCode: "PAYMENTS",
    suggestedGroup: null,
    title: "Не поступил депозит",
    goal: "Получить депозит",
    summary: "Провайдер ещё обрабатывает платёж.",
    status: "WAITING_SYSTEM",
    availableStatuses: ["IN_PROGRESS", "WAITING_ADMIN", "RESOLVED"],
    resolution: {
      assessment: "LIKELY_RESOLVED",
      source: "AI_INFERENCE",
      confidence: "0.780",
    },
    impact: "HIGH",
    urgency: "HIGH",
    priority: "URGENT",
    prioritySource: "PLATFORM_RULE",
    initialTone: "CONCERNED",
    currentTone: "CALM",
    toneTrend: "IMPROVING",
    primaryLanguage: "ru",
    languages: ["ru"],
    channels: ["TEXT", "VOICE"],
    endUser: { id: "user-1", externalId: "customer-42" },
    assignee: null,
    messageCount: 1,
    firstObservedAt: "2026-07-26T09:00:00.000Z",
    lastActivityAt: "2026-07-26T10:00:00.000Z",
    waitingSince: "2026-07-26T09:30:00.000Z",
    resolvedAt: null,
    reopenedAt: null,
    aggregationDirtyAt: null,
    nextAggregationAt: null,
    degradedReason: null,
    createdAt: "2026-07-26T09:00:00.000Z",
    updatedAt: "2026-07-26T10:00:00.000Z",
    endUserRecontactCount: 1,
    workSummary: {
      aiCapabilities: [
        {
          actionTypeCode: "check_deposit",
          invocationCount: 2,
          succeeded: 1,
          failed: 1,
          lastInvokedAt: "2026-07-26T09:40:00.000Z",
        },
      ],
      cmsParticipation: {
        messageCount: 1,
        actionCount: 1,
        firstParticipatedAt: "2026-07-26T09:30:00.000Z",
      },
      blockers: ["provider_pending"],
      limitations: ["Нет ETA провайдера"],
    },
  },
  messages: {
    items: [
      {
        relation: "PRIMARY",
        relevance: "1",
        linkedBy: "ROUTER",
        linkedAt: "2026-07-26T09:00:00.000Z",
        message: {
          id: "message-1",
          threadId: "thread-1",
          role: "USER",
          text: "<script>bad()</script> Где депозит?",
          status: "COMPLETED",
          createdAt: "2026-07-26T09:00:00.000Z",
          metadata: {},
        },
      },
    ],
    nextCursor: "cursor-2",
  },
  timeline: { events: [], revisions: [] },
  escalations: { items: [] },
};

const selectStub = {
  props: ["options", "placeholder"],
  emits: ["update:modelValue"],
  template:
    '<button data-test="status-select" @click="$emit(\'update:modelValue\', options[0].value)">{{ placeholder }}: {{ options.map((option) => option.label).join(", ") }}</button>',
};

describe("EndUserCaseDetail", () => {
  it("organizes the case into overview, actions and tabbed related context", async () => {
    const wrapper = mount(EndUserCaseDetail, {
      attachTo: document.body,
      props: {
        value: detail as never,
        loading: false,
        canManage: true,
      },
      global: {
        stubs: {
          Button: {
            props: ["label"],
            template: "<button>{{ label }}</button>",
          },
          Message: { template: "<div><slot /></div>" },
          Select: selectStub,
          Skeleton: true,
          RouterLink: {
            props: ["to"],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.get("#case-overview-title").text()).toBe("Обзор");
    expect(wrapper.get("#case-actions-title").text()).toBe("Действия");
    expect(wrapper.get('[data-test="status-select"]').text()).toContain(
      "Изменить статус: Взять в работу",
    );
    expect(wrapper.get('[data-test="status-select"]').text()).not.toContain(
      "Нужен администратор",
    );
    await wrapper.get('[data-test="status-select"]').trigger("click");
    expect(wrapper.emitted("requestTransition")?.[0]).toEqual(["IN_PROGRESS"]);
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain(
      "Связанные сообщения",
    );
    expect(wrapper.find("#case-messages-panel").exists()).toBe(true);
    await wrapper
      .get("#case-messages-tab")
      .trigger("keydown", { key: "ArrowRight" });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(wrapper.get("#case-history-tab").attributes("aria-selected")).toBe(
      "true",
    );
    expect(document.activeElement?.id).toBe("case-history-tab");

    const nextCase = structuredClone(detail);
    nextCase.case.id = "case-2";
    await wrapper.setProps({ value: nextCase as never });

    expect(wrapper.get("#case-messages-tab").attributes("aria-selected")).toBe(
      "true",
    );
    wrapper.unmount();
  });

  it("distinguishes likely resolution, renders linked evidence safely and uses backend actions", async () => {
    const wrapper = mount(EndUserCaseDetail, {
      props: {
        value: detail as never,
        loading: false,
        canManage: true,
        canAssign: true,
        canReadEndUser: true,
        canReadConversation: true,
      },
      global: {
        stubs: {
          Button: {
            props: ["label"],
            emits: ["click"],
            template: "<button @click=\"$emit('click')\">{{ label }}</button>",
          },
          Message: { template: "<div><slot /></div>" },
          Select: selectStub,
          Skeleton: true,
          RouterLink: {
            props: ["to"],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
        },
      },
    });
    expect(wrapper.text()).toContain("Вероятно решено — требует подтверждения");
    expect(wrapper.text()).toContain("<script>bad()</script> Где депозит?");
    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.text()).toContain("Подтвердить решение");
    expect(wrapper.text()).toContain("Проверка депозита");
    expect(wrapper.text()).toContain("1 успешно");
    expect(wrapper.text()).toContain("Нет ETA провайдера");
    expect(wrapper.text()).toContain("Возвраты к цели");
    expect(wrapper.text()).toContain("Открыть диалог");
    expect(wrapper.text()).toContain("Текст, Голос");
    expect(wrapper.text()).toContain("Обеспокоен → Спокоен");
    expect(wrapper.text()).not.toContain("check_deposit");
    expect(wrapper.text()).not.toContain("CONCERNED");
    expect(wrapper.html()).toContain("conversationId");
    await wrapper.get('[data-status="RESOLVED"]').trigger("click");
    expect(wrapper.emitted("requestTransition")?.[0]).toEqual(["RESOLVED"]);
  });

  it("keeps active specialist work out of generic status and assignment controls", async () => {
    const value = structuredClone(detail) as unknown as EndUserCaseDetailBundle;
    value.case.status = "WAITING_ADMIN";
    value.case.activeEscalation = {
      id: "escalation-1",
      status: "REQUESTED",
      source: "END_USER_REQUEST",
      reasonCode: "SUPPORT_REQUEST",
      requestedAt: "2026-07-26T10:00:00.000Z",
      claimant: null,
      claimedAt: null,
    };
    value.escalations.items = [
      {
        id: "escalation-1",
        caseId: "case-1",
        occurrenceNumber: 1,
        version: 1,
        status: "REQUESTED",
        source: "END_USER_REQUEST",
        reasonCode: "SUPPORT_REQUEST",
        summary: "Пользователь явно попросил специалиста.",
        requester: { type: "END_USER", id: "user-1" },
        requestedAt: "2026-07-26T10:00:00.000Z",
        claimant: null,
        claimedAt: null,
        closedBy: null,
        closeReason: null,
        closedAt: null,
        cancelledBy: null,
        cancellationReason: null,
        cancelledAt: null,
        notificationEventId: "notification-1",
        createdAt: "2026-07-26T10:00:00.000Z",
        updatedAt: "2026-07-26T10:00:00.000Z",
      },
    ];
    const wrapper = mount(EndUserCaseDetail, {
      props: {
        value,
        loading: false,
        canManage: true,
        canAssign: true,
      },
      global: {
        stubs: {
          Button: {
            props: ["label"],
            emits: ["click"],
            template: "<button @click=\"$emit('click')\">{{ label }}</button>",
          },
          Message: { template: "<div><slot /></div>" },
          Select: selectStub,
          Skeleton: true,
          RouterLink: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Ожидает специалиста");
    expect(wrapper.text()).not.toContain("Назначение");
    expect(wrapper.find('[data-test="status-select"]').exists()).toBe(false);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Взять в работу")!
      .trigger("click");
    expect(wrapper.emitted("requestEscalationAction")?.[0]).toEqual(["CLAIM"]);
  });

  it("offers bounded continuation instead of loading the entire chat", async () => {
    const wrapper = mount(EndUserCaseDetail, {
      props: {
        value: detail as never,
        loading: false,
        messagesLoading: false,
      },
      global: {
        stubs: {
          Button: {
            props: ["label"],
            emits: ["click"],
            template: "<button @click=\"$emit('click')\">{{ label }}</button>",
          },
          Message: { template: "<div><slot /></div>" },
          Select: selectStub,
          Skeleton: true,
          RouterLink: true,
        },
      },
    });

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Показать ещё сообщения")!
      .trigger("click");
    expect(wrapper.emitted("loadMoreMessages")).toHaveLength(1);
  });

  it("does not expose a full-dialog link with profile permission alone", () => {
    const wrapper = mount(EndUserCaseDetail, {
      props: {
        value: detail as never,
        loading: false,
        canReadEndUser: true,
        canReadConversation: false,
      },
      global: {
        stubs: {
          Button: true,
          Message: { template: "<div><slot /></div>" },
          Skeleton: true,
          RouterLink: {
            props: ["to"],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).not.toContain("Открыть диалог");
    expect(wrapper.text()).toContain("Диалог thread-1");
  });

  it("renders loading, retryable error and empty selection states", async () => {
    const stubs = {
      Button: {
        props: ["label"],
        emits: ["click"],
        template: "<button @click=\"$emit('click')\">{{ label }}</button>",
      },
      Message: { template: "<div><slot /></div>" },
      Skeleton: { template: "<span>loading</span>" },
      RouterLink: true,
    };
    const loading = mount(EndUserCaseDetail, {
      props: { value: null, loading: true },
      global: { stubs },
    });
    expect(loading.attributes("aria-label")).toBeUndefined();
    expect(loading.text()).toContain("loading");

    const failed = mount(EndUserCaseDetail, {
      props: { value: null, loading: false, error: "Не удалось загрузить" },
      global: { stubs },
    });
    expect(failed.text()).toContain("Не удалось загрузить");
    await failed.get("button").trigger("click");
    expect(failed.emitted("retry")).toHaveLength(1);

    const empty = mount(EndUserCaseDetail, {
      props: { value: null, loading: false },
      global: { stubs },
    });
    expect(empty.text()).toContain("Выберите обращение");
  });

  it("groups channel evidence with explicit gaps and emits every correction action", async () => {
    const value = structuredClone(detail) as unknown as EndUserCaseDetailBundle;
    value.case.mergedIntoCaseId = "case-main";
    value.case.degradedReason = "BUDGET";
    value.case.summary = "";
    value.case.channels = [];
    const workSummary = value.case.workSummary!;
    workSummary.aiCapabilities = [];
    workSummary.cmsParticipation = {
      messageCount: 0,
      actionCount: 0,
      firstParticipatedAt: undefined,
    };
    workSummary.blockers = [];
    workSummary.limitations = [];
    value.messages.items = [
      value.messages.items[0]!,
      {
        ...value.messages.items[0]!,
        relation: "SUPPORTING",
        message: {
          ...value.messages.items[0]!.message,
          id: "message-2",
          role: "ASSISTANT",
          text: "Проверяю",
          createdAt: "2026-07-26T09:10:01.000Z",
        },
      },
      {
        ...value.messages.items[0]!,
        relation: "SUPPORTING",
        message: {
          ...value.messages.items[0]!.message,
          id: "message-3",
          role: "ADMIN",
          text: "Подключился администратор",
          createdAt: "2026-07-26T09:11:00.000Z",
          metadata: [] as never,
        },
      },
    ];
    value.timeline.events = [
      {
        id: "event-1",
        type: "ASSIGNED",
        caseVersion: 2,
        projectSequence: "3",
        payload: {},
        createdAt: "2026-07-26T09:12:00.000Z",
      },
    ];
    const wrapper = mount(EndUserCaseDetail, {
      props: {
        value: value as never,
        loading: false,
        canManage: true,
        canAssign: true,
        error: "Последнее действие не выполнено",
      },
      global: {
        stubs: {
          Button: {
            props: ["label"],
            emits: ["click"],
            template: "<button @click=\"$emit('click')\">{{ label }}</button>",
          },
          Message: { template: "<div><slot /></div>" },
          Select: selectStub,
          Skeleton: true,
          RouterLink: {
            props: ["to"],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain("основным обращением");
    expect(wrapper.text()).toContain("Анализ временно отстаёт");
    expect(wrapper.text()).toContain("Сводка ещё формируется");
    expect(wrapper.text()).toContain("Каналы: не определены");
    expect(wrapper.text()).toContain("Инструменты Lola ещё не использовались");
    expect(wrapper.text()).toContain("Часть диалога не относится");
    expect(wrapper.text()).toContain("Администратор");
    await wrapper.get("#case-history-tab").trigger("click");
    expect(wrapper.text()).toContain("Назначен исполнитель");
    expect(wrapper.text()).not.toContain("ASSIGNED");
    await wrapper.get("#case-messages-tab").trigger("click");

    for (const [label, event] of [
      ["Назначение", "requestAssignment"],
      ["Исправить классификацию", "requestClassification"],
      ["Объединить", "requestMerge"],
      ["Разделить", "requestSplit"],
    ] as const) {
      await wrapper
        .findAll("button")
        .find((button) => button.text() === label)!
        .trigger("click");
      expect(wrapper.emitted(event)).toHaveLength(1);
    }
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Исключить")!
      .trigger("click");
    expect(wrapper.emitted("requestUnlink")?.[0]).toEqual(["message-1"]);
  });

  it("renders scoped context without navigation when related read permissions are absent", async () => {
    const wrapper = mount(EndUserCaseDetail, {
      props: {
        value: detail as never,
        loading: false,
        canReadEndUser: false,
        canReadConversation: false,
      },
      global: {
        stubs: {
          Button: true,
          Message: { template: "<div><slot /></div>" },
          Skeleton: true,
          RouterLink: {
            props: ["to"],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
        },
      },
    });
    expect(wrapper.text()).toContain("customer-42");
    expect(wrapper.html()).not.toContain('"users"');
    expect(wrapper.text()).not.toContain("Открыть диалог");
  });
});
