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
};

const selection: SupportWorkspaceSelection = {
  checkpoint: "42",
  capabilitiesRevision: "revision-1",
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
  messages: { items: [], nextCursor: null },
};

function render(
  canOpenCase: boolean,
  profileProps: {
    canReadProfile?: boolean;
    profile?: ProfileProjectionResponseDto | null;
  } = {},
) {
  return mount(SupportConversationContext, {
    props: { conversation, selection, canOpenCase, ...profileProps },
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
  it("renders the server-provided Case projection without revealing raw user identity", () => {
    const wrapper = render(true);

    expect(wrapper.get('[aria-label="Case"]').text()).toContain(
      "Проверить возврат бонусов",
    );
    expect(wrapper.get('[aria-label="Case"]').text()).toContain("Высокий");
    expect(wrapper.get('[aria-label="Case"]').text()).toContain(
      "Оператор Алина",
    );
    expect(wrapper.text()).not.toContain("raw-external-id-must-not-render");
    expect(wrapper.get("a").text()).toBe("Открыть в рабочем месте");
  });

  it("does not mount a Case deep link without the exact case-read permission", () => {
    const wrapper = render(false);

    expect(wrapper.find('[aria-label="Case"]').exists()).toBe(true);
    expect(wrapper.find("a").exists()).toBe(false);
  });

  it("only renders the internal-notes entry point with the dedicated read grant", async () => {
    const denied = render(true);
    const allowed = mount(SupportConversationContext, {
      props: {
        conversation,
        selection,
        canOpenCase: true,
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

    expect(denied.text()).not.toContain("Внутренние заметки");
    expect(allowed.text()).toContain("Внутренние заметки");
    await allowed.get(".internal-notes-link").trigger("click");
    expect(allowed.emitted("openInternalNotes")).toHaveLength(1);
  });

  it("requires both session assignment authority and the server Case capability for release", () => {
    const actionableSelection: SupportWorkspaceSelection = {
      ...selection,
      capabilities: { ...selection.capabilities, releaseAssignment: true },
    };
    const denied = mount(SupportConversationContext, {
      props: {
        conversation,
        selection: actionableSelection,
        canOpenCase: true,
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
        canOpenCase: true,
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

    expect(denied.findComponent(SupportAssignmentRelease).exists()).toBe(false);
    expect(allowed.findComponent(SupportAssignmentRelease).exists()).toBe(true);
  });

  it("localizes every server Case state and priority instead of exposing enum values", () => {
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
          canOpenCase: true,
        },
        global: {
          stubs: {
            Button: { template: '<button type="button"><slot /></button>' },
            Message: { template: "<div><slot /></div>" },
            RouterLink: { template: "<a><slot /></a>" },
          },
        },
      });
      expect(wrapper.get('[aria-label="Case"]').text()).toContain(label);
    }
    const critical = mount(SupportConversationContext, {
      props: {
        conversation,
        selection: {
          ...selection,
          case: { ...selection.case!, priority: "CRITICAL" },
        },
        canOpenCase: true,
      },
      global: {
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          Message: { template: "<div><slot /></div>" },
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });
    expect(critical.get('[aria-label="Case"]').text()).toContain("Критический");
  });

  it("renders allowed and redacted profile fields but removes forbidden fields", async () => {
    const wrapper = render(true, {
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

    await wrapper.get('[role="tab"]:nth-child(3)').trigger("click");
    const profile = wrapper.get('[aria-label="Данные пользователя"]');
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
