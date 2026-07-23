import { describe, expect, it } from "vitest";
import type {
  EndUserResponseDto,
  EventCatalogDefinitionResponseDto,
  EventLogResponseDto,
  ProjectResponseDto,
  ScenarioRunResponseDto,
  UiElementResponseDto,
  ProjectAuditEventResponseDto,
} from "@/shared/api/generated/models";
import {
  mapActiveSessions,
  mapAuditEvent,
  mapConversation,
  mapConversationMessage,
  mapEndUser,
  mapEventDefinition,
  mapEventLog,
  mapProject,
  mapScenarioRun,
  mapUiElement,
  toCreateUiElementDto,
  toUpdateProjectSettingsDto,
  toUpdateUiElementDto,
} from "./mappers";

describe("repository domain mappers", () => {
  it("keeps stable and revision Event identities distinct", () => {
    const mapped = mapEventDefinition({
      id: "event-revision-2",
      revisionId: "event-revision-2",
      definitionKeyId: "event-key-1",
      currentRevisionId: "event-revision-2",
      projectId: "project-1",
      code: "deposit",
      name: "Deposit",
      description: null,
      version: 2,
      payloadSchema: { type: "object" },
      enabled: true,
      clientIngestible: false,
      countsAsActivity: true,
      policyVersion: 1,
      policyUpdatedAt: "now",
      metadataUpdatedAt: "now",
      origin: "CUSTOM",
      readOnly: false,
      lifecycle: "ACTIVE",
      archivedAt: null,
      isCurrent: true,
      createdAt: "now",
      updatedAt: "now",
    } as EventCatalogDefinitionResponseDto);

    expect(mapped.id).toBe("event-revision-2");
    expect(mapped.definitionKeyId).toBe("event-key-1");
  });

  it("maps the project contract without leaking backend-only fields", () => {
    const dto: ProjectResponseDto = {
      id: "project-1",
      version: 1,
      organizationId: "org-1",
      name: "Lola",
      slug: "lola",
      status: "ACTIVE",
      publicKey: "public",
      serverKeyPrefix: "secret-prefix",
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "Help",
      voiceInstructions: "Speak warmly",
      settings: { timezone: "UTC" },
      createdAt: "now",
      updatedAt: "now",
    };
    expect(mapProject(dto)).toEqual(
      expect.objectContaining({
        id: "project-1",
        voiceInstructions: "Speak warmly",
        settings: { timezone: "UTC" },
      }),
    );
    expect(mapProject(dto)).not.toHaveProperty("serverKeyPrefix");
  });

  it("only sends editable project fields", () => {
    expect(
      toUpdateProjectSettingsDto({
        id: "immutable",
        version: 7,
        slug: "immutable",
        publicKey: "immutable",
        name: "Updated",
        voiceInstructions: "  Speak slowly.\nPause.  ",
        settings: { description: "New" },
      }),
    ).toEqual({
      expectedVersion: 7,
      name: "Updated",
      voiceInstructions: "  Speak slowly.\nPause.  ",
      settings: { description: "New" },
    });
  });

  it("normalizes nullable response fields and preserves JSON payloads", () => {
    const ui = mapUiElement({
      id: "ui-1",
      projectId: "project-1",
      code: "home",
      name: "Home",
      kind: "PAGE",
      selector: null,
      route: "/home",
      modalName: null,
      handler: null,
      config: { direct: true },
      enabled: true,
      createdAt: "now",
      updatedAt: "now",
    } as unknown as UiElementResponseDto);
    const user = mapEndUser({
      id: "user-1",
      projectId: "project-1",
      externalId: "external",
      isGuest: false,
      locale: null,
      segment: null,
      profile: {},
      attributes: {},
      preferences: {},
      lastSeenAt: "now",
      createdAt: "now",
      updatedAt: "now",
    } as EndUserResponseDto);

    expect(ui).toMatchObject({
      route: "/home",
      selector: undefined,
      config: { direct: true },
    });
    expect(user).toMatchObject({ locale: undefined, segment: undefined });
  });

  it("maps modalName in both directions without using the deprecated handler as a binding", () => {
    const modal = mapUiElement({
      id: "ui-2",
      projectId: "project-1",
      code: "deposit_modal",
      name: "Deposit",
      kind: "MODAL",
      selector: null,
      route: null,
      modalName: "deposit",
      handler: "openDepositModal",
      config: {},
      enabled: true,
      createdAt: "now",
      updatedAt: "now",
    } as unknown as UiElementResponseDto);

    expect(modal).toMatchObject({
      modalName: "deposit",
      handler: "openDepositModal",
    });
    expect(
      toCreateUiElementDto({
        code: modal.code,
        name: modal.name,
        kind: "MODAL",
        modalName: modal.modalName!,
      }),
    ).toEqual({
      code: "deposit_modal",
      name: "Deposit",
      kind: "MODAL",
      modalName: "deposit",
    });
  });

  it("preserves bounded AI target exposure and its audit reason in generated DTOs", () => {
    const page = mapUiElement({
      id: "ui-3",
      projectId: "project-1",
      code: "bonuses",
      name: "Bonuses",
      kind: "PAGE",
      selector: null,
      route: "/bonuses",
      modalName: null,
      handler: null,
      config: {},
      enabled: true,
      aiEnabled: true,
      aiDescription: "The page where the user reviews available bonuses.",
      aiAliases: ["rewards"],
      createdAt: "now",
      updatedAt: "now",
    });

    expect(page).toMatchObject({
      aiEnabled: true,
      aiDescription: "The page where the user reviews available bonuses.",
      aiAliases: ["rewards"],
    });
    expect(
      toUpdateUiElementDto({
        aiEnabled: true,
        aiDescription: "The page where the user reviews available bonuses.",
        aiAliases: ["rewards"],
        auditReason: "Expose bonuses target for OPEN_PAGE",
      }),
    ).toEqual({
      aiEnabled: true,
      aiDescription: "The page where the user reviews available bonuses.",
      aiAliases: ["rewards"],
      auditReason: "Expose bonuses target for OPEN_PAGE",
    });
  });

  it("maps operational DTOs into page-safe domain models", () => {
    const event = mapEventLog({
      id: "log-1",
      projectId: "project-1",
      eventDefinitionId: "event-1",
      eventDefinitionKeyId: "event-key-1",
      endUserId: "user-1",
      source: "SERVER",
      payload: { amount: 12 },
      context: {},
      occurredAt: "now",
      receivedAt: "now",
      status: "PROCESSED",
      ingestionPolicyVersion: 3,
      ingestionPolicySnapshot: {
        enabled: true,
        clientIngestible: false,
        countsAsActivity: true,
      },
      eventDefinition: {
        id: "event-1",
        projectId: "project-1",
        code: "deposit",
        name: "Deposit",
        version: 2,
      },
      endUser: { id: "user-1", externalId: "customer-42" },
    } as unknown as EventLogResponseDto);
    expect(event).toMatchObject({
      eventDefinitionId: "event-1",
      eventDefinitionKeyId: "event-key-1",
      eventVersion: 2,
      ingestionPolicyVersion: 3,
      ingestionPolicySnapshot: {
        enabled: true,
        clientIngestible: false,
        countsAsActivity: true,
      },
    });
    const run = mapScenarioRun({
      id: "run-1",
      projectId: "project-1",
      scenarioId: "scenario-1",
      eventLogId: "log-1",
      endUserId: "user-1",
      status: "RUNNING",
      conversationPolicy: "reuse_active",
      startedAt: "now",
      currentStep: 0,
      scenario: { id: "scenario-1", code: "welcome", name: "Welcome" },
      endUser: { id: "user-1", externalId: "customer-42" },
      steps: [
        {
          id: "step-1",
          position: 0,
          nodeKey: "open-page",
          actionType: "OPEN_PAGE",
          executor: "FRONTEND",
          status: "WAITING_ACK",
          command: {
            id: "command-1",
            type: "OPEN_PAGE",
            sequence: 1,
            status: "SENT",
            createdAt: "now",
          },
        },
      ],
    } as ScenarioRunResponseDto);
    const audit = mapAuditEvent({
      id: "audit-1",
      eventType: "iam.project_resource.changed",
      eventVersion: 1,
      occurredAt: "2026-07-23T10:00:00.000Z",
      actor: {
        type: "CMS_USER",
        id: "admin-1",
        email: "owner@lola.dev",
        displayName: "Owner",
      },
      target: { kind: "PROJECT", id: "project-1" },
      requiredPermissionCode: "project.scenarios.write",
      outcome: "SUCCESS",
      authorizationEvidence: {},
      reasonCode: null,
      auditReason: "Save onboarding draft",
      requestId: "request-1",
      correlationId: "cms.save-draft",
      ipAddress: "203.0.113.10",
      userAgent: "CMS test",
      before: null,
      after: null,
      metadata: {
        source: "scenario-authoring",
        details: {
          resourceType: "SCENARIO",
          resourceId: "scenario-1",
          operation: "SAVE_DRAFT",
        },
      },
    } as ProjectAuditEventResponseDto);

    expect(event).toMatchObject({
      eventCode: "deposit",
      userExternalId: "customer-42",
      payload: { amount: 12 },
    });
    expect(run.steps[0]).toMatchObject({
      status: "WAITING_ACK",
      command: { id: "command-1", sequence: 1 },
    });
    expect(audit.actor).toEqual({
      id: "admin-1",
      type: "CMS_USER",
      email: "owner@lola.dev",
      name: "Owner",
    });
    expect(audit).toMatchObject({
      eventType: "iam.project_resource.changed",
      operation: "SAVE_DRAFT",
      outcome: "SUCCESS",
      resourceType: "SCENARIO",
      resourceId: "scenario-1",
      target: { kind: "PROJECT", id: "project-1" },
      occurredAt: "2026-07-23T10:00:00.000Z",
    });
  });

  it("deduplicates multiple connections of the same active session by latest heartbeat", () => {
    const sessions = mapActiveSessions({
      id: "user-1",
      externalId: "customer-1",
      isGuest: false,
      presence: "online",
      profile: {},
      lastSeenAt: "2026-07-11T10:00:00.000Z",
      activeConnectionCount: 2,
      activeSessionCount: 1,
      connections: [
        {
          id: "connection-1",
          sessionId: "session-1",
          transport: "SOCKET_IO",
          connectedAt: "2026-07-11T09:00:00.000Z",
          lastHeartbeatAt: "2026-07-11T09:58:00.000Z",
        },
        {
          id: "connection-2",
          sessionId: "session-1",
          transport: "ANY_CABLE",
          connectedAt: "2026-07-11T09:05:00.000Z",
          lastHeartbeatAt: "2026-07-11T10:00:00.000Z",
        },
      ],
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: "session-1",
      userName: "customer-1",
      device: "AnyCable",
      status: "ONLINE",
    });
  });

  it("maps admin conversation history into the UI domain", () => {
    expect(
      mapConversation({
        id: "conversation-1",
        projectId: "project-1",
        endUserId: "user-1",
        title: null,
        status: "CLOSED",
        createdAt: "2026-07-13T08:00:00.000Z",
        updatedAt: "2026-07-13T09:00:00.000Z",
        _count: { messages: 2 },
        isCurrent: true,
        currentInteractionSessionCount: 2,
        aiSuspension: {
          mode: "SUSPENDED",
          lifecycle: "ACTIVE",
          version: "90071992547409930",
          suspendedUntil: "2026-07-20T14:00:00.000Z",
          serverTime: "2026-07-20T13:00:00.000Z",
        },
        messages: [
          {
            id: "message-2",
            role: "ASSISTANT",
            text: "Last",
            createdAt: "2026-07-13T08:59:00.000Z",
          },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        title: "Диалог без названия",
        status: "ARCHIVED",
        updatedAt: "2026-07-13T09:00:00.000Z",
        messageCount: 2,
        isCurrent: true,
        currentInteractionSessionCount: 2,
        lastMessageAt: "2026-07-13T08:59:00.000Z",
        aiSuspension: {
          mode: "SUSPENDED",
          lifecycle: "ACTIVE",
          version: "90071992547409930",
          suspendedUntil: "2026-07-20T14:00:00.000Z",
          serverTime: "2026-07-20T13:00:00.000Z",
        },
      }),
    );
    expect(
      mapConversationMessage({
        id: "message-1",
        threadId: "conversation-1",
        role: "ASSISTANT",
        status: "COMPLETED",
        text: "Hello",
        createdAt: "2026-07-13T08:00:00.000Z",
        updatedAt: "2026-07-13T08:00:00.000Z",
      }),
    ).toEqual(
      expect.objectContaining({
        conversationId: "conversation-1",
        author: "ASSISTANT",
        text: "Hello",
      }),
    );
    expect(
      mapConversationMessage({
        id: "message-2",
        threadId: "conversation-1",
        role: "ASSISTANT",
        status: "CANCELLED",
        text: "Незавершённый ответ",
        createdAt: "2026-07-13T08:01:00.000Z",
        updatedAt: "2026-07-13T08:01:00.000Z",
      }).status,
    ).toBe("CANCELLED");
  });
});
