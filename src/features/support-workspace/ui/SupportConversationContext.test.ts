import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { ProfileProjectionResponseDto } from "@/shared/api/generated/models";
import type {
  SupportWorkspaceConversation,
  SupportWorkspaceSelection,
} from "@/features/support-workspace/api/support-workspace-source";
import SupportAssignmentRelease from "@/features/support-case-assignment/ui/SupportAssignmentRelease.vue";
import SupportConversationContext from "./SupportConversationContext.vue";

const conversation: SupportWorkspaceConversation = {
  id: "conversation-1",
  endUserId: "end-user-1",
  title: "Вопрос по возврату",
  status: "OPEN",
  createdAt: "2026-08-06T10:00:00.000Z",
  updatedAt: "2026-08-06T10:15:00.000Z",
  messageCount: 3,
  isCurrent: true,
  currentInteractionSessionCount: 1,
  lastMessageAt: "2026-08-06T10:15:00.000Z",
  readState: {
    conversationId: "conversation-1",
    lastReadOrdinal: 2,
    highestOrdinal: 3,
    firstUnreadOrdinal: 3,
    unreadMessageCount: 1,
    unreadCustomerMessageCount: 1,
    updatedAt: null,
  },
};

const selection: SupportWorkspaceSelection = {
  checkpoint: "42",
  capabilitiesRevision: "revision-1",
  actionRevisions: {},
  classificationOptions: [{ code: "BILLING", label: "Платежи и расчёты" }],
  capabilities: {
    assignCase: false,
    claimAssignment: false,
    escalateCase: false,
    manageCase: false,
    releaseAssignment: false,
    reply: false,
    replyWithoutTranslation: false,
    suspendAi: false,
    transferAssignment: false,
  },
  endUser: {
    id: "end-user-1",
    externalId: "raw-external-id-must-not-render",
    isGuest: false,
    createdAt: "2026-08-06T10:00:00.000Z",
    lastSeenAt: "2026-08-06T10:15:00.000Z",
    locale: "ru",
  },
  case: {
    id: "case-1",
    title: "Проверить возврат бонусов",
    status: "OPEN",
    priority: "HIGH",
    groupCode: "billing",
    projectSequence: "42",
    attentionRequired: true,
    lastActivityAt: "2026-08-06T10:15:00.000Z",
    updatedAt: "2026-08-06T10:15:00.000Z",
    version: 7,
    latestRevisionId: null,
    assignee: { id: "operator-1", displayName: "Оператор Алина" },
    assignment: {
      id: "assignment-1",
      state: "ACTIVE",
      operatorId: "operator-1",
      operatorName: "Оператор Алина",
      teamName: "Billing",
      version: 3,
      actionEtag: '"sa1.current.signature"',
    },
  },
  conversation,
  messages: {
    items: [],
    nextCursor: null,
    newerCursor: null,
    anchorOrdinal: 3,
  },
};

function render(
  profileProps: {
    canReadProfile?: boolean;
    profile?: ProfileProjectionResponseDto | null;
  } = {},
) {
  return mount(SupportConversationContext, {
    props: { conversation, selection, ...profileProps },
    global: {
      stubs: {
        Button: { template: '<button type="button"><slot /></button>' },
        Message: { template: "<div><slot /></div>" },
        RouterLink: { template: "<a><slot /></a>" },
      },
    },
  });
}

describe("support conversation context", () => {
  it("renders Case context without fabricating a linked Conversation", () => {
    const wrapper = mount(SupportConversationContext, {
      props: {
        conversation: null,
        selection: { ...selection, conversation: null },
      },
      global: {
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          Message: { template: "<div><slot /></div>" },
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });

    expect(wrapper.text()).toContain("Нет связанного чата");
  });

  it("switches from user context to the server-provided Case projection", async () => {
    const wrapper = render();

    await wrapper.get('[role="tab"][aria-selected="false"]').trigger("click");

    expect(wrapper.get('[aria-label="Кейс"]').text()).toContain(
      "Проверить возврат бонусов",
    );
    expect(wrapper.get('[aria-label="Кейс"]').text()).toContain("Высокий");
    expect(wrapper.get('[aria-label="Кейс"]').text()).toContain(
      "Оператор Алина",
    );
    expect(wrapper.text()).not.toContain("raw-external-id-must-not-render");
  });

  it("exposes exactly user, Case, and actions tabs", () => {
    const wrapper = render();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "Пользователь",
      "Кейс",
      "Действия",
    ]);
  });

  it("only renders the internal-notes entry point with the dedicated read grant", async () => {
    const denied = render();
    const allowed = mount(SupportConversationContext, {
      props: {
        conversation,
        selection,
        canReadInternalNotes: true,
      },
      global: {
        stubs: {
          Button: {
            props: ["label"],
            emits: ["click"],
            template:
              '<button type="button" @click="$emit(\'click\')">{{ label }}<slot /></button>',
          },
          Message: { template: "<div><slot /></div>" },
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });

    await allowed.findAll('[role="tab"]')[2]!.trigger("click");
    expect(denied.text()).not.toContain("Внутренние заметки");
    expect(allowed.text()).toContain("Внутренние заметки");
    await allowed.get(".internal-notes-link").trigger("click");
    expect(allowed.emitted("openInternalNotes")).toHaveLength(1);
  });

  it("requires both session assignment authority and the server Case capability for release", async () => {
    const actionableSelection: SupportWorkspaceSelection = {
      ...selection,
      capabilities: { ...selection.capabilities, releaseAssignment: true },
    };
    const denied = mount(SupportConversationContext, {
      props: {
        conversation,
        selection: actionableSelection,
        canReleaseAssignment: false,
      },
      global: {
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          Message: { template: "<div><slot /></div>" },
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });
    const allowed = mount(SupportConversationContext, {
      props: {
        conversation,
        selection: actionableSelection,
        canReleaseAssignment: true,
      },
      global: {
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          Message: { template: "<div><slot /></div>" },
          RouterLink: { template: "<a><slot /></a>" },
          Dialog: { template: '<div><slot /><slot name="footer" /></div>' },
          Select: { props: ["modelValue", "options"], template: "<select />" },
          Textarea: { template: "<textarea />" },
        },
      },
    });

    await denied.findAll('[role="tab"]')[2]!.trigger("click");
    await allowed.findAll('[role="tab"]')[2]!.trigger("click");
    expect(denied.findComponent(SupportAssignmentRelease).exists()).toBe(false);
    expect(allowed.findComponent(SupportAssignmentRelease).exists()).toBe(true);
  });

  it("localizes every server Case state and priority instead of exposing enum values", async () => {
    const cases = [
      ["IN_PROGRESS", "В работе"],
      ["WAITING_END_USER", "Ожидает пользователя"],
      ["WAITING_SYSTEM", "Ожидает системы"],
      ["WAITING_ADMIN", "Ожидает оператора"],
      ["UNRESOLVED", "Не решён"],
      ["CANCELLED", "Отменён"],
    ] as const;

    for (const [status, label] of cases) {
      const wrapper = mount(SupportConversationContext, {
        props: {
          conversation,
          selection: { ...selection, case: { ...selection.case!, status } },
        },
        global: {
          stubs: {
            Button: { template: '<button type="button"><slot /></button>' },
            Message: { template: "<div><slot /></div>" },
            RouterLink: { template: "<a><slot /></a>" },
          },
        },
      });
      await wrapper.findAll('[role="tab"]')[1]!.trigger("click");
      expect(wrapper.get('[aria-label="Кейс"]').text()).toContain(label);
    }
    const critical = mount(SupportConversationContext, {
      props: {
        conversation,
        selection: {
          ...selection,
          case: { ...selection.case!, priority: "CRITICAL" },
        },
      },
      global: {
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          Message: { template: "<div><slot /></div>" },
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });
    await critical.findAll('[role="tab"]')[1]!.trigger("click");
    expect(critical.get('[aria-label="Кейс"]').text()).toContain("Критический");
  });

  it("renders allowed and redacted profile fields but removes forbidden fields", async () => {
    const wrapper = render({
      canReadProfile: true,
      profile: {
        endUserId: "end-user-1",
        externalUserId: "raw-external-id-must-not-render",
        profileVersion: "1",
        syncStatus: "VALID_WITH_WARNINGS",
        provenance: "PRODUCT_PROFILE",
        fields: [
          {
            definitionId: "field-name",
            definitionRevisionId: "field-name-r1",
            key: "name",
            label: "Имя",
            valueType: "STRING",
            lifecycle: "ACTIVE",
            classification: "PERSONAL",
            access: "ALLOWED",
            availability: "AVAILABLE",
            observedAt: "2026-08-06T10:00:00.000Z",
            value: { type: "STRING", value: "Ирина" },
          },
          {
            definitionId: "field-phone",
            definitionRevisionId: "field-phone-r1",
            key: "phone",
            label: "Телефон",
            valueType: "STRING",
            lifecycle: "ACTIVE",
            classification: "SENSITIVE",
            access: "REDACTED",
            availability: "DENIED",
          },
          {
            definitionId: "field-secret",
            definitionRevisionId: "field-secret-r1",
            key: "secret",
            label: "Секретное поле",
            valueType: "STRING",
            lifecycle: "ACTIVE",
            classification: "SENSITIVE",
            access: "FORBIDDEN",
            availability: "DENIED",
          },
        ],
      },
    });

    const profile = wrapper.get('[aria-label="Пользователь"]');
    expect(profile.text()).toContain("Ирина");
    expect(profile.text()).toContain("Телефон");
    expect(profile.text()).toContain("Скрыто");
    expect(profile.text()).toContain("Снимок с предупреждениями");
    expect(profile.text()).toContain("Профиль продукта");
    expect(profile.text()).toContain("Персональное");
    expect(profile.text()).not.toContain("Секретное поле");
    expect(wrapper.text()).not.toContain("raw-external-id-must-not-render");
  });
});
