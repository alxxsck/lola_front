import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import SupportCaseExternalWorkPane from "./SupportCaseExternalWorkPane.vue";

function controller(overrides: Record<string, unknown> = {}) {
  return {
    links: ref([]),
    commands: ref([]),
    createOptions: ref([
      {
        optionId: "option-1",
        connectionId: "connection-1",
        mappingRootId: "mapping-1",
        mappingRevisionId: "revision-1",
        formRevision: "form-1",
        destinationId: "support",
        destinationLabel: "Support Operations",
        formId: "incident",
        formLabel: "Incident",
        matchedBy: "RULE",
        allowedActions: ["CREATE"],
        fields: [],
      },
    ]),
    inboxItems: ref([]),
    timeline: ref([]),
    selectedLinkId: ref(null),
    selectedLink: ref(null),
    loading: ref(false),
    loadingTimeline: ref(false),
    mutating: ref(false),
    error: ref(""),
    validationError: ref(""),
    feedback: ref(null),
    createDraft: ref({
      optionId: "",
      title: "",
      body: "",
      audience: "INTERNAL",
      includeCaseTitle: false,
      includeCaseSummary: false,
      requesterEmail: "",
      requesterName: "",
      fieldValues: {},
    }),
    commentDraft: ref({
      body: "",
      audience: "INTERNAL",
      publicConfirmed: false,
    }),
    unknownAttempt: ref(false),
    hasPendingCommand: ref(false),
    newIntentBlocked: ref(false),
    acceptedReceipt: ref(null),
    scopeRevision: ref(0),
    load: vi.fn(),
    selectLink: vi.fn(),
    create: vi.fn(),
    comment: vi.fn(),
    refresh: vi.fn(),
    unlink: vi.fn(),
    replayUnknownAttempt: vi.fn(),
    reconcileCommand: vi.fn(),
    retryCommand: vi.fn(),
    refreshEvidence: vi.fn(),
    resolveCommand: vi.fn(),
    linkExisting: vi.fn(),
    copyTimelineMessage: vi.fn(),
    ...overrides,
  };
}

function render(current = controller()) {
  return mount(SupportCaseExternalWorkPane, {
    props: {
      controller: current as never,
      permissions: {
        read: true,
        create: true,
        commentInternal: true,
        commentPublic: true,
        readInternal: true,
        retry: true,
        resolveUnknown: true,
        inboxRead: true,
      },
    },
    global: {
      stubs: {
        Button: {
          props: ["label", "disabled"],
          emits: ["click"],
          template:
            '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
        },
        Dialog: {
          props: ["visible"],
          emits: ["update:visible"],
          template: '<div v-if="visible" class="dialog"><slot /></div>',
        },
        InputText: { template: "<input />" },
        Textarea: { template: "<textarea />" },
        Select: {
          props: ["options"],
          template:
            '<select><option v-for="option in options" :key="option.value">{{ option.label }}</option></select>',
        },
        Checkbox: { template: '<input type="checkbox" />' },
        Message: { template: '<div class="message"><slot /></div>' },
        Skeleton: { template: '<div class="skeleton" />' },
        Tag: { props: ["value"], template: "<span>{{ value }}</span>" },
      },
    },
  });
}

describe("Support Case External Work pane", () => {
  it("preserves Inspector geometry with a dedicated loading skeleton", () => {
    const wrapper = render(controller({ loading: ref(true) }));
    expect(wrapper.findAll(".skeleton").length).toBeGreaterThanOrEqual(4);
    expect(wrapper.get('[aria-busy="true"]')).toBeTruthy();
  });

  it("renders remote authority as external and never as Lola Case state", () => {
    const current = controller({
      links: ref([
        {
          linkId: "link-1",
          status: "ACTIVE",
          version: 2,
          item: {
            provider: "JSM",
            remoteKey: "SUP-731",
            summary: "Provider timeout",
            status: "IN_PROGRESS",
            assignee: { id: "agent-1", label: "Support lead" },
            team: { id: "support", label: "Support Operations" },
            freshness: "FRESH",
            lastRefreshedAt: "2026-08-09T10:00:00.000Z",
            remoteUrl: "https://jsm.example/SUP-731",
            allowedActions: [
              "OPEN_REMOTE",
              "VIEW_TIMELINE",
              "COMMENT_INTERNAL",
            ],
          },
        },
      ]),
    });
    const wrapper = render(current);

    expect(wrapper.text()).toContain("В JSM");
    expect(wrapper.text()).toContain("Статус во внешней системе");
    expect(wrapper.text()).toContain("Исполнитель во внешней системе");
    expect(wrapper.text()).not.toContain("Назначение Lola: Support lead");
  });

  it("makes safe context explicit and states that chat history is not copied", async () => {
    const wrapper = render();
    await wrapper.get('[data-testid="external-create-open"]').trigger("click");

    expect(wrapper.text()).toContain(
      "История чата не копируется автоматически",
    );
    expect(wrapper.text()).toContain("Тема обращения");
    expect(wrapper.text()).toContain("Краткий контекст обращения");
  });

  it("keeps external comments internal by default and asks for public confirmation", async () => {
    const current = controller({
      links: ref([
        {
          linkId: "link-1",
          status: "ACTIVE",
          version: 2,
          item: {
            provider: "HELPDESK",
            remoteKey: "2048",
            summary: "HelpDesk request",
            status: "OPEN",
            assignee: null,
            team: null,
            freshness: "FRESH",
            lastRefreshedAt: null,
            remoteUrl: null,
            allowedActions: [
              "VIEW_TIMELINE",
              "COMMENT_INTERNAL",
              "COMMENT_PUBLIC",
            ],
          },
        },
      ]),
      selectedLinkId: ref("link-1"),
    });
    const wrapper = render(current);
    await wrapper.get('[data-testid="external-link-link-1"]').trigger("click");

    expect(wrapper.text()).toContain("Внутренний");
    expect(wrapper.text()).toContain("Публичный");
    expect(wrapper.text()).toContain("явно подтвердить");
  });

  it("offers only intent-valid UNKNOWN resolutions", async () => {
    const current = controller({
      commands: ref([
        {
          commandId: "command-create",
          intent: "CREATE",
          status: "UNKNOWN",
          version: 4,
          createdAt: "2026-08-09T10:00:00.000Z",
          allowedActions: ["RESOLVE_UNKNOWN"],
        },
      ]),
    });
    const wrapper = render(current);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Разобрать UNKNOWN")!
      .trigger("click");

    expect(wrapper.text()).toContain("Связать найденный объект");
    expect(wrapper.text()).toContain("Подтвердить отсутствие доставки");
    expect(wrapper.text()).not.toContain("Подтвердить доставку");
    expect(wrapper.text()).not.toContain("Безопасный повтор");
  });

  it("closes local dialogs when authority scope changes", async () => {
    const current = controller();
    const wrapper = render(current);
    await wrapper.get('[data-testid="external-create-open"]').trigger("click");
    expect(wrapper.find(".dialog").exists()).toBe(true);

    current.scopeRevision.value += 1;
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".dialog").exists()).toBe(false);
  });
});
