import { describe, expect, it } from "vitest";
import type {
  SupportWorkspaceSelectionCaseResponseDto,
  SupportWorkspaceSelectionResponseDto,
} from "@/shared/api/generated/models";
import { supportWorkspaceContractFixtures } from "@/shared/api/repository/fixtures/support-workspace-contract-fixtures";
import {
  mapSupportWorkspaceSelection,
  mapWorkspaceCase,
  mapWorkspaceCaseRow,
  withMockMessageOrdinals,
} from "./support-workspace-source";

const value: SupportWorkspaceSelectionCaseResponseDto = {
  id: "case-1",
  endUserId: "end-user-1",
  title: "Возврат",
  summary:
    "Пользователь не видит возврат после отмены покупки и ждёт подтверждения.",
  goal: "Подтвердить статус возврата и назвать следующий шаг",
  groupCode: "billing",
  projectSequence: "42",
  status: "OPEN",
  priority: "NORMAL",
  attentionRequired: false,
  slaSignal: null,
  lastActivityAt: "2026-08-06T10:00:00.000Z",
  updatedAt: "2026-08-06T10:00:00.000Z",
  version: 1,
  assignment: null,
};

describe("support workspace Case mapper", () => {
  it("maps only the bounded authoritative Case inbox projection", () => {
    expect(
      mapWorkspaceCaseRow({
        id: "case-42",
        endUserId: "end-user-1",
        projectSequence: "42",
        title: "Возврат",
        status: "WAITING_ADMIN",
        priority: "HIGH",
        groupCode: "BILLING",
        attentionRequired: true,
        slaSignal: null,
        lastActivityAt: "2026-08-06T10:00:00.000Z",
        updatedAt: "2026-08-06T10:00:00.000Z",
        version: 3,
      }),
    ).toEqual({
      id: "case-42",
      endUserId: "end-user-1",
      projectSequence: "42",
      title: "Возврат",
      status: "WAITING_ADMIN",
      priority: "HIGH",
      groupCode: "BILLING",
      attentionRequired: true,
      lastActivityAt: "2026-08-06T10:00:00.000Z",
      updatedAt: "2026-08-06T10:00:00.000Z",
      version: 3,
      slaSignal: null,
    });
  });

  it("rejects a Case projection belonging to another end user", () => {
    expect(() => mapWorkspaceCase(value, "end-user-2")).toThrow(
      "another end user",
    );
  });

  it("keeps the operator-facing Case brief for the selected end user", () => {
    expect(mapWorkspaceCase(value, "end-user-1")).toMatchObject({
      id: "case-1",
      title: "Возврат",
      projectSequence: "42",
      summary:
        "Пользователь не видит возврат после отмены покупки и ждёт подтверждения.",
      goal: "Подтвердить статус возврата и назвать следующий шаг",
    });
  });

  it("keeps the server-issued assignment action ETag only in the action model", () => {
    const mapped = mapWorkspaceCase(
      {
        ...value,
        assignment: {
          actionEtag: '"sa1.current.signature"',
          capacityWeightUnits: 100,
          caseId: "case-1",
          endedAt: null,
          id: "assignment-1",
          occurrenceNumber: 1,
          operator: { id: "operator-1", displayName: "Алина", avatarUrl: null },
          startedAt: "2026-08-06T10:00:00.000Z",
          state: "ASSIGNED",
          team: { id: "team-1", code: "billing", name: "Billing" },
          version: 3,
          workforceRevisionId: "workforce-1",
        },
      },
      "end-user-1",
    );

    expect(mapped?.assignment).toMatchObject({
      id: "assignment-1",
      operatorId: "operator-1",
      actionEtag: '"sa1.current.signature"',
    });
  });

  it("rejects an assignment projection that belongs to another Case", () => {
    expect(() =>
      mapWorkspaceCase(
        {
          ...value,
          assignment: {
            actionEtag: '"sa1.current.signature"',
            capacityWeightUnits: 100,
            caseId: "case-2",
            endedAt: null,
            id: "assignment-1",
            occurrenceNumber: 1,
            operator: {
              id: "operator-1",
              displayName: "Алина",
              avatarUrl: null,
            },
            startedAt: "2026-08-06T10:00:00.000Z",
            state: "ASSIGNED",
            team: { id: "team-1", code: "billing", name: "Billing" },
            version: 3,
            workforceRevisionId: "workforce-1",
          },
        },
        "end-user-1",
      ),
    ).toThrow("another case");
  });
});

describe("support workspace mock history", () => {
  it("appends a newly written mock message after the server-ordering range", () => {
    const messages = withMockMessageOrdinals([
      {
        id: "message-1",
        conversationId: "conversation-1",
        ordinal: 2,
        author: "USER",
        text: "Второе",
        status: "COMPLETED",
        createdAt: "2026-08-06T10:01:00.000Z",
      },
      {
        id: "message-2",
        conversationId: "conversation-1",
        ordinal: 1,
        author: "ADMIN",
        text: "Первое",
        status: "COMPLETED",
        createdAt: "2026-08-06T10:00:00.000Z",
      },
      {
        id: "message-3",
        conversationId: "conversation-1",
        author: "ADMIN",
        text: "Новое сообщение",
        status: "COMPLETED",
        createdAt: "2026-08-06T10:02:00.000Z",
      },
    ]);

    expect(messages.map((message) => message.ordinal)).toEqual([2, 1, 3]);
  });
});

describe("support workspace selection contract mapper", () => {
  it("keeps an authoritative Case selection without fabricating a Conversation", () => {
    const full = supportWorkspaceContractFixtures.fullSelectionSuccess;
    const response: SupportWorkspaceSelectionResponseDto = {
      ...full,
      conversation: null,
      messages: {
        items: [],
        nextCursor: null,
        newerCursor: null,
        anchorOrdinal: null,
      },
      routing: supportWorkspaceContractFixtures.fullSelectionSuccess.routing,
      sla: supportWorkspaceContractFixtures.fullSelectionSuccess.sla,
    };

    const mapped = mapSupportWorkspaceSelection(response, {
      caseId: full.case.id,
    });

    expect(mapped.case?.id).toBe(full.case.id);
    expect(mapped.conversation).toBeNull();
    expect(mapped.messages).toEqual({
      items: [],
      nextCursor: null,
      newerCursor: null,
      anchorOrdinal: null,
    });
  });

  it("maps the executable minimal selection fixture", () => {
    const response = supportWorkspaceContractFixtures.minimalSelectionSuccess;

    const mapped = mapSupportWorkspaceSelection(response, {
      conversationId: response.conversation.id,
    });

    expect(mapped).toMatchObject({
      checkpoint: "checkpoint:minimal",
      capabilitiesRevision: "capabilities:minimal",
      actionRevisions: {},
      case: null,
      conversation: {
        id: response.conversation.id,
        title: "Диалог без названия",
        lastMessageOrdinal: 0,
        readState: {
          lastReadOrdinal: 0,
          firstUnreadOrdinal: null,
          unreadMessageCount: 0,
        },
      },
      messages: {
        items: [],
        nextCursor: null,
        newerCursor: null,
        anchorOrdinal: null,
      },
    });
  });

  it("maps the executable full selection fixture without losing recovery data", () => {
    const response = supportWorkspaceContractFixtures.fullSelectionSuccess;

    const mapped = mapSupportWorkspaceSelection(response, {
      conversationId: response.conversation.id,
    });

    expect(mapped).toMatchObject({
      checkpoint: "checkpoint:full",
      capabilitiesRevision: "capabilities:full",
      actionRevisions: response.actionRevisions,
      case: {
        id: response.case.id,
        latestRevisionId: response.case.latestRevisionId,
      },
      conversation: {
        id: response.conversation.id,
        lastMessageOrdinal: 17,
        readState: {
          lastReadOrdinal: 15,
          firstUnreadOrdinal: 16,
          unreadMessageCount: 2,
          unreadCustomerMessageCount: 1,
        },
      },
      messages: {
        items: [
          {
            ordinal: 17,
            authorSnapshot: response.messages.items[0]?.author,
            delivery: response.messages.items[0]?.delivery,
          },
        ],
        nextCursor: "messages:older",
        newerCursor: "messages:newer",
        anchorOrdinal: 16,
      },
    });
  });

  it("preserves recovery revisions, canonical ordinal and complete delivery", () => {
    const response: SupportWorkspaceSelectionResponseDto = {
      mode: "SELECTION",
      checkpoint: "checkpoint-17",
      capabilitiesRevision: "capabilities-9",
      actionRevisions: {
        aiSuspensionVersion: "ai-4",
        assignmentVersion: 3,
        caseVersion: 8,
        conversationUpdatedAt: "2026-08-07T10:00:00.000Z",
      },
      capabilities: {
        assignCase: true,
        claimAssignment: false,
        escalateCase: true,
        manageCase: true,
        releaseAssignment: true,
        reply: true,
        replyWithoutTranslation: false,
        suspendAi: true,
        transferAssignment: true,
        attachments: {
          state: "AVAILABLE",
          upload: true,
          download: true,
          maxFilesPerMessage: 10,
          maxBytesPerFile: 20 * 1024 * 1024,
          maxBytesPerMessage: 50 * 1024 * 1024,
          contentTypes: ["image/png"],
        },
        internalNotes: {
          state: "AVAILABLE",
          read: true,
          create: true,
          historyRead: true,
          correct: true,
          tombstone: true,
          realtimeWatch: true,
          attachmentUpload: true,
          attachmentDownload: true,
        },
      },
      classificationOptions: [],
      endUser: {
        id: "end-user-1",
        isGuest: false,
        createdAt: "2026-08-07T09:00:00.000Z",
        lastSeenAt: "2026-08-07T10:00:00.000Z",
        locale: "ru",
      },
      case: {
        ...value,
        latestRevisionId: "case-revision-8",
      },
      conversation: {
        id: "conversation-1",
        endUserId: "end-user-1",
        title: "Возврат",
        status: "OPEN",
        messageCount: 17,
        lastMessage: null,
        lastMessageOrdinal: 17,
        isCurrent: true,
        currentInteractionSessionCount: 0,
        readState: {
          conversationId: "conversation-1",
          lastReadOrdinal: 15,
          highestOrdinal: 17,
          firstUnreadOrdinal: 16,
          unreadMessageCount: 2,
          unreadCustomerMessageCount: 1,
          updatedAt: "2026-08-07T09:59:00.000Z",
        },
        createdAt: "2026-08-07T09:00:00.000Z",
        updatedAt: "2026-08-07T10:00:00.000Z",
      },
      messages: {
        items: [
          {
            id: "message-17",
            threadId: "conversation-1",
            ordinal: 17,
            role: "ADMIN",
            status: "COMPLETED",
            text: "Проверяю результат",
            contentState: "ACTIVE",
            contentVersion: 1,
            revisionNumber: 1,
            attachments: [],
            macroProvenance: null,
            knowledgeProvenance: null,
            author: {
              type: "CMS_USER",
              cmsUserId: "operator-1",
              displayName: "Анна",
              avatarUrl: null,
            },
            delivery: {
              id: "delivery-17",
              channel: "SDK_REALTIME",
              commandIds: ["command-17"],
              interactionSessionId: null,
              status: "PENDING",
              generation: 1,
              version: 0,
              errorCode: null,
              retryEligible: false,
              allowedActions: [],
              acceptedAt: "2026-08-07T10:00:00.000Z",
            },
            createdAt: "2026-08-07T10:00:00.000Z",
            updatedAt: "2026-08-07T10:00:00.000Z",
          },
        ],
        nextCursor: "older-page",
        newerCursor: "newer-page",
        anchorOrdinal: 16,
      },
      relatedCases: [],
      relatedConversations: [],
      relatedCasesTruncated: false,
      relatedConversationsTruncated: false,
      routing: supportWorkspaceContractFixtures.fullSelectionSuccess.routing,
      sla: supportWorkspaceContractFixtures.fullSelectionSuccess.sla,
    };

    const mapped = mapSupportWorkspaceSelection(response, {
      conversationId: "conversation-1",
    });

    expect(mapped.actionRevisions).toEqual(response.actionRevisions);
    expect(mapped.sla).toMatchObject({
      clocks: [
        expect.objectContaining({
          kind: "FIRST_HUMAN_RESPONSE",
          risk: "AT_RISK",
          remainingBusinessMs: 1_200_000,
        }),
      ],
    });
    expect(mapped.routing).toMatchObject({
      state: "AVAILABLE",
      reasonCode: "CAPACITY_GAP",
      queue: { name: "Приоритетные платежи" },
      candidateCount: 3,
      eligibleCandidateCount: null,
      exclusions: { CAPACITY_EXHAUSTED: 2 },
      fallback: { state: "SCHEDULED" },
    });
    expect(mapped.case?.latestRevisionId).toBe("case-revision-8");
    expect(mapped.conversation?.lastMessageOrdinal).toBe(17);
    expect(mapped.conversation?.readState).toMatchObject({
      lastReadOrdinal: 15,
      firstUnreadOrdinal: 16,
      unreadMessageCount: 2,
      unreadCustomerMessageCount: 1,
    });
    expect(mapped.messages).toEqual({
      items: [
        expect.objectContaining({
          ordinal: 17,
          delivery: {
            id: "delivery-17",
            channel: "SDK_REALTIME",
            commandIds: ["command-17"],
            interactionSessionId: null,
            status: "PENDING",
            generation: 1,
            version: 0,
            errorCode: null,
            retryEligible: false,
            allowedActions: [],
            acceptedAt: "2026-08-07T10:00:00.000Z",
          },
        }),
      ],
      nextCursor: "older-page",
      newerCursor: "newer-page",
      anchorOrdinal: 16,
    });
  });
});
