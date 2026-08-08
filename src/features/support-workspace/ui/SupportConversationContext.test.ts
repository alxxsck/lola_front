import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { ProfileProjectionResponseDto } from "@/shared/api/generated/models";
import type {
  SupportWorkspaceConversation,
  SupportWorkspaceSelection,
} from "@/features/support-workspace/api/support-workspace-source";
import {
  createSupportInspectorController,
  type SupportInspectorPermissions,
  type SupportInspectorSource,
} from "@/features/support-inspector/model/use-support-inspector";
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
  sla: null,
  routing: null,
  conversation,
  messages: {
    items: [],
    nextCursor: null,
    newerCursor: null,
    anchorOrdinal: 3,
  },
};

function profile(): ProfileProjectionResponseDto {
  return {
    endUserId: "end-user-1",
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
  };
}

function createInspector(
  current: SupportWorkspaceSelection,
  permissions: SupportInspectorPermissions = {
    profile: true,
    events: true,
    activity: true,
  },
  sourceOverrides: Partial<SupportInspectorSource> = {},
) {
  const source: SupportInspectorSource = {
    readProfile: vi.fn().mockResolvedValue(profile()),
    readEvents: vi.fn().mockResolvedValue({
      recipeVersion: 1,
      caseId: current.case?.id ?? "case-1",
      snapshotAt: "2026-08-08T10:00:00.000Z",
      nextCursor: null,
      items: [
        {
          id: "event-1",
          code: "deposit.failed",
          name: "Попытка депозита отклонена",
          definitionVersion: 1,
          source: "SERVER",
          status: "PROCESSED",
          occurredAt: "2026-08-08T09:30:00.000Z",
          receivedAt: "2026-08-08T09:30:01.000Z",
        },
      ],
    }),
    readActivity: vi.fn().mockResolvedValue({
      kind: "SUPPORT_ACTIVITY",
      projectionGeneration: 1,
      computedAt: "2026-08-08T10:00:00.000Z",
      freshnessState: "READY",
      effectiveWindow: null,
      sourceHighWater: "1",
      checkpoint: "1",
      nextCursor: null,
      slaRolloutState: "SHADOW",
      capabilities: {
        noEligibleOperator: "UNAVAILABLE",
        routingCapacityRisks: "UNAVAILABLE",
        savedQueues: "UNAVAILABLE",
        sla: "SHADOW",
        teamSkillLanguageCapacity: "UNAVAILABLE",
      },
      data: {
        facts: [
          {
            activityId: "activity-1",
            activitySequence: "1",
            actor: { type: "CMS_USER", cmsUserId: "cms-1", systemCode: null },
            assignmentId: "assignment-1",
            caseId: current.case?.id ?? null,
            commandOutcome: "APPLIED",
            conversationId: null,
            deliveryId: null,
            deliveryState: null,
            eligibilityOverride: null,
            eventCode: "SUPPORT_CASE_ASSIGNMENT_CLAIMED",
            factKind: "ASSIGNMENT",
            messageId: null,
            occurredAt: "2026-08-08T09:45:00.000Z",
            operatorCmsUserId: "cms-1",
            ownerVersion: 1,
            reasonCode: "SELF_CLAIM",
            schemaVersion: 1,
            targetTeamId: "team-1",
          },
        ],
      },
    }),
    ...sourceOverrides,
  };
  return {
    source,
    controller: createSupportInspectorController(
      {
        projectId: () => "project-1",
        endUserId: () => current.endUser.id,
        caseId: () => current.case?.id,
        operatorId: () => "operator-1",
        permissions: () => permissions,
      },
      source,
      { now: () => new Date("2026-08-08T10:00:00.000Z") },
    ),
  };
}

function render(
  props: Partial<
    InstanceType<typeof SupportConversationContext>["$props"]
  > = {},
  current = selection,
) {
  const { controller } = createInspector(current);
  return mount(SupportConversationContext, {
    props: {
      conversation: current.conversation,
      selection: current,
      inspector: controller,
      canReadSlaContext: true,
      canReadRoutingContext: true,
      ...props,
    },
    global: {
      stubs: {
        Button: {
          props: ["label"],
          emits: ["click"],
          template:
            '<button type="button" @click="$emit(\'click\')">{{ label }}<slot /></button>',
        },
        SupportCaseOperationsContext: true,
        RouterLink: { template: "<a><slot /></a>" },
      },
    },
  });
}

describe("support conversation inspector", () => {
  it("renders the five permission-aware tabs with Case as the default", () => {
    const wrapper = render();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "Обращение",
      "Пользователь",
      "Профиль",
      "События",
      "Активность",
    ]);
    expect(wrapper.get('[aria-label="Обращение"]').text()).toContain(
      "Проверить возврат бонусов",
    );
  });

  it("keeps user context useful without rendering a product external id", async () => {
    const wrapper = render();
    await wrapper.findAll('[role="tab"]')[1]!.trigger("click");

    const user = wrapper.get('[aria-label="Пользователь"]');
    expect(user.text()).toContain("Активный");
    expect(user.text()).toContain("RU");
    expect(user.text()).toContain("В диалоге и проекте");
    expect(user.text()).not.toContain("external");
  });

  it("loads Product Profile only when Data is opened and removes forbidden fields", async () => {
    const { controller, source } = createInspector(selection);
    const wrapper = render({ inspector: controller });
    expect(source.readProfile).not.toHaveBeenCalled();

    await wrapper.findAll('[role="tab"]')[2]!.trigger("click");
    await flushPromises();

    expect(source.readProfile).toHaveBeenCalledOnce();
    const data = wrapper.get('[aria-label="Данные пользователя"]');
    expect(data.text()).toContain("Ирина");
    expect(data.text()).toContain("Телефон");
    expect(data.text()).toContain("Скрыто");
    expect(data.text()).not.toContain("Секретное поле");
  });

  it("uses the server causal activity feed instead of a synthetic client log", async () => {
    const wrapper = render();
    await wrapper.findAll('[role="tab"]')[4]!.trigger("click");
    await flushPromises();

    const activity = wrapper.get('[aria-label="Активность поддержки"]');
    expect(activity.text()).toContain("Обращение принято оператором");
    expect(activity.text()).toContain("Оператор взял обращение");
  });

  it("hides protected tabs before mount when their permission is absent", () => {
    const { controller } = createInspector(selection, {
      profile: false,
      events: false,
      activity: false,
    });
    const wrapper = render({ inspector: controller });

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "Обращение",
      "Пользователь",
    ]);
    expect(wrapper.text()).not.toContain("Product Profile");
  });

  it("keeps conversation-only selections on the User tab", () => {
    const conversationOnly = { ...selection, case: null };
    const wrapper = render({}, conversationOnly);

    expect(
      wrapper.findAll('[role="tab"]').map((tab) => tab.text()),
    ).not.toContain("Обращение");
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe(
      "Пользователь",
    );
  });
});
