import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  uiRegistryCreate,
  uiRegistryRemove,
  uiRegistryUpdate,
  platformOperationsProjectSettings,
  platformOperationsUpdateProjectSettings,
  eventCatalogArchive,
  eventCatalogCreate,
  eventCatalogDetail,
  eventCatalogList,
  eventCatalogRevision,
  eventCatalogRevisions,
  eventCatalogUpdatePolicy,
  scenarioAuthoringArchiveScenario,
  scenarioAuthoringListScenarios,
  scenarioAuthoringUpdateScenarioMetadata,
  adminMessagingSend,
  presenceList,
  adminConversationsList,
  adminConversationsListMessages,
  adminEventLogsGet,
  adminEventLogsList,
  eventsList,
  platformOperationsUsersPage,
  scenarioRunsPage,
  platformOperationsActivitySettings,
  platformOperationsUpdateActivitySettings,
  projectAuditEventsList,
  conversationAISuspensionsGet,
  conversationAISuspensionsStart,
  conversationAISuspensionsExtend,
  conversationAISuspensionsResume,
  conversationAISuspensionsHistory,
} from "@/shared/api/generated/lola-backend";
import type {
  ProjectResponseDto,
  UiElementResponseDto,
} from "@/shared/api/generated/models";
import { apiRepository } from "./api-repository";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  uiRegistryCreate: vi.fn(),
  uiRegistryList: vi.fn(),
  uiRegistryRemove: vi.fn(),
  uiRegistryUpdate: vi.fn(),
  platformOperationsProjectSettings: vi.fn(),
  platformOperationsUpdateProjectSettings: vi.fn(),
  eventCatalogArchive: vi.fn(),
  eventCatalogCreate: vi.fn(),
  eventCatalogDetail: vi.fn(),
  eventCatalogList: vi.fn(),
  eventCatalogRevision: vi.fn(),
  eventCatalogRevisions: vi.fn(),
  eventCatalogUpdatePolicy: vi.fn(),
  scenarioAuthoringArchiveScenario: vi.fn(),
  scenarioAuthoringListScenarios: vi.fn(),
  scenarioAuthoringUpdateScenarioMetadata: vi.fn(),
  platformOperationsUsers: vi.fn(),
  platformOperationsUsersPage: vi.fn(),
  adminMessagingSend: vi.fn(),
  eventsList: vi.fn(),
  scenarioRunsList: vi.fn(),
  presenceList: vi.fn(),
  adminConversationsList: vi.fn(),
  adminConversationsListMessages: vi.fn(),
  adminEventLogsGet: vi.fn(),
  adminEventLogsList: vi.fn(),
  scenarioRunsPage: vi.fn(),
  platformOperationsActivitySettings: vi.fn(),
  platformOperationsUpdateActivitySettings: vi.fn(),
  projectAuditEventsList: vi.fn(),
  conversationAISuspensionsGet: vi.fn(),
  conversationAISuspensionsStart: vi.fn(),
  conversationAISuspensionsExtend: vi.fn(),
  conversationAISuspensionsResume: vi.fn(),
  conversationAISuspensionsHistory: vi.fn(),
}));

const uiResponse = {
  id: "ui-1",
  projectId: "project-1",
  code: "deposit",
  name: "Deposit",
  kind: "BUTTON" as const,
  selector: "#deposit",
  config: {},
  enabled: true,
  createdAt: "now",
  updatedAt: "now",
} as unknown as UiElementResponseDto;

describe("api repository adapter", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("routes UI create, update and delete through the generated client", async () => {
    vi.mocked(uiRegistryCreate).mockResolvedValue(uiResponse);
    vi.mocked(uiRegistryUpdate).mockResolvedValue(uiResponse);
    vi.mocked(uiRegistryRemove).mockResolvedValue(uiResponse);

    await apiRepository.createElement("project-1", {
      code: "deposit",
      name: "Deposit",
      kind: "ELEMENT",
      selector: "#deposit",
    });
    await apiRepository.updateElement("project-1", "ui-1", {
      name: "Deposit updated",
    });
    await apiRepository.deleteElement("project-1", "ui-1");

    expect(uiRegistryCreate).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ code: "deposit", selector: "#deposit" }),
    );
    expect(uiRegistryUpdate).toHaveBeenCalledWith("project-1", "ui-1", {
      name: "Deposit updated",
    });
    expect(uiRegistryRemove).toHaveBeenCalledWith("project-1", "ui-1");
  });

  it("exposes current cursor pages and activity settings through generated target contracts", async () => {
    vi.mocked(platformOperationsUsersPage).mockResolvedValue({
      items: [],
      nextCursor: "user-2" as never,
    });
    vi.mocked(scenarioRunsPage).mockResolvedValue({
      items: [],
      nextCursor: "run-2",
    });
    const settings = {
      projectVersion: 2,
      timezone: "Europe/Madrid",
      visitInactivitySeconds: 1800,
      reconnectGraceSeconds: 30,
      limits: {
        visitInactivitySeconds: { min: 60, max: 86400 },
        reconnectGraceSeconds: { min: 1, max: 300 },
      },
      semantics: {
        timezone: "activity_day",
        visitInactivitySeconds: "visit_boundary",
        reconnectGraceSeconds: "reconnect",
      },
    } as never;
    vi.mocked(platformOperationsActivitySettings).mockResolvedValue(settings);
    vi.mocked(platformOperationsUpdateActivitySettings).mockResolvedValue(
      settings,
    );

    await expect(
      apiRepository.getUsersPage("project-1", { cursor: "user-1", limit: 50 }),
    ).resolves.toEqual({ items: [], nextCursor: "user-2" });
    await expect(
      apiRepository.getScenarioRunsPage("project-1", {
        cursor: "run-1",
        limit: 50,
      }),
    ).resolves.toEqual({ items: [], nextCursor: "run-2" });
    await apiRepository.getActivitySettings("project-1");
    await apiRepository.updateActivitySettings("project-1", {
      expectedVersion: 2,
      timezone: "Europe/Madrid",
      visitInactivitySeconds: 1800,
      reconnectGraceSeconds: 30,
    });

    expect(platformOperationsUsersPage).toHaveBeenCalledWith("project-1", {
      cursor: "user-1",
      limit: 50,
    });
    expect(scenarioRunsPage).toHaveBeenCalledWith("project-1", {
      cursor: "run-1",
      limit: 50,
    });
    expect(platformOperationsUpdateActivitySettings).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        expectedVersion: 2,
        visitInactivitySeconds: 1800,
      }),
    );
  });

  it("returns canonical audit-event cursor pages with server-side filters", async () => {
    vi.mocked(projectAuditEventsList).mockResolvedValue({
      items: [
        {
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
          auditReason: "Save draft",
          requestId: "request-1",
          correlationId: null,
          ipAddress: null,
          userAgent: null,
          before: null,
          after: null,
          metadata: {
            details: {
              operation: "SAVE_DRAFT",
              resourceType: "SCENARIO",
              resourceId: "scenario-1",
            },
          },
        },
      ],
      nextCursor: "audit-1",
    });

    await expect(
      apiRepository.getAuditEventsPage("project-1", {
        cursor: "audit-2",
        limit: 25,
        search: "draft",
        outcome: "SUCCESS",
      }),
    ).resolves.toMatchObject({
      items: [
        {
          id: "audit-1",
          operation: "SAVE_DRAFT",
          resourceType: "SCENARIO",
        },
      ],
      nextCursor: "audit-1",
    });
    expect(projectAuditEventsList).toHaveBeenCalledWith("project-1", {
      cursor: "audit-2",
      limit: 25,
      search: "draft",
      outcome: "SUCCESS",
    });
  });

  it("sends only backend-editable project settings", async () => {
    const response: ProjectResponseDto = {
      id: "project-1",
      version: 1,
      organizationId: "org-1",
      name: "Updated",
      slug: "lola",
      status: "ACTIVE",
      publicKey: "public",
      serverKeyPrefix: "secret",
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "Help",
      voiceInstructions: "",
      settings: {},
      createdAt: "now",
      updatedAt: "now",
    };
    vi.mocked(platformOperationsProjectSettings).mockResolvedValue(response);
    vi.mocked(platformOperationsUpdateProjectSettings).mockResolvedValue(
      response,
    );
    await expect(apiRepository.getProject("project-1")).resolves.toMatchObject({
      id: "project-1",
      name: "Updated",
    });
    await apiRepository.updateProject("project-1", {
      id: "ignored",
      version: 1,
      slug: "ignored",
      name: "Updated",
    });
    expect(platformOperationsUpdateProjectSettings).toHaveBeenCalledWith(
      "project-1",
      { expectedVersion: 1, name: "Updated" },
    );
    expect(platformOperationsProjectSettings).toHaveBeenCalledWith("project-1");
  });

  it("uses generated event catalog list, create, revision and archive endpoints", async () => {
    const definition = {
      id: "event-revision-1",
      revisionId: "event-revision-1",
      projectId: "project-1",
      definitionKeyId: "event-key-1",
      currentRevisionId: "event-revision-1",
      isCurrent: true,
      code: "deposit",
      name: "Deposit",
      description: null,
      version: 1,
      payloadSchema: { type: "object" },
      enabled: true,
      clientIngestible: false,
      countsAsActivity: true,
      policyVersion: 1,
      policyUpdatedAt: "2026-07-20T10:00:00.000Z",
      metadataUpdatedAt: "2026-07-20T10:00:00.000Z",
      origin: "CUSTOM",
      readOnly: false,
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z",
      lifecycle: "ACTIVE",
      archivedAt: null,
    } as const;
    const catalogDefinition = {
      id: "event-key-1",
      projectId: "project-1",
      code: "deposit",
      name: "Deposit",
      description: null,
      lifecycle: "ACTIVE" as const,
      lifecycleVersion: 1,
      lifecycleUpdatedAt: "2026-07-20T10:00:00.000Z",
      metadataUpdatedAt: "2026-07-20T10:00:00.000Z",
      origin: "CUSTOM" as const,
      readOnly: false,
      policy: {
        version: 1,
        updatedAt: "2026-07-20T10:00:00.000Z",
        enabled: true,
        clientIngestible: false,
        countsAsActivity: true,
      },
      currentRevision: {
        id: "event-revision-1",
        number: 1,
        payloadSchema: { type: "object" },
        publishedAt: "2026-07-20T10:00:00.000Z",
      },
    };
    const revision = {
      id: "event-revision-1",
      projectId: "project-1",
      definitionKeyId: "event-key-1",
      isCurrent: true,
      code: "deposit",
      number: 1,
      payloadSchema: { type: "object" },
      publishedAt: "2026-07-20T10:00:00.000Z",
      pinnedScenarioRevisionCount: 0,
      compatibility: "CURRENT" as const,
    };
    vi.mocked(eventCatalogList).mockResolvedValue([catalogDefinition]);
    vi.mocked(eventCatalogCreate).mockResolvedValue(definition);
    vi.mocked(eventCatalogDetail).mockResolvedValue(catalogDefinition);
    vi.mocked(eventCatalogRevisions).mockResolvedValue({
      items: [revision],
      nextCursor: "next",
    });
    vi.mocked(eventCatalogRevision).mockResolvedValue(revision);
    vi.mocked(eventCatalogArchive).mockResolvedValue({
      ...catalogDefinition,
      lifecycle: "ARCHIVED",
    });

    await expect(apiRepository.getEvents("project-1")).resolves.toEqual([
      expect.objectContaining({
        definitionKeyId: "event-key-1",
        policyVersion: 1,
      }),
    ]);
    await apiRepository.saveEvent("project-1", {
      name: "Deposit",
      code: "deposit",
      payloadSchema: { type: "object" },
    });
    await expect(
      apiRepository.getEventDefinitionRevisions("project-1", "event-key-1", {
        cursor: "cursor",
        limit: 25,
      }),
    ).resolves.toMatchObject({ nextCursor: "next" });
    await expect(
      apiRepository.getEventDefinitionRevision(
        "project-1",
        "event-key-1",
        "event-revision-1",
      ),
    ).resolves.toMatchObject({ compatibility: "CURRENT" });
    await apiRepository.deleteEvent("project-1", "event-key-1", {
      expectedLifecycleVersion: 1,
      expectedPolicyVersion: 1,
      reason: "Archive obsolete event",
    });

    expect(eventCatalogCreate).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ code: "deposit" }),
    );
    expect(eventCatalogRevisions).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      { cursor: "cursor", limit: 25 },
    );
    expect(eventCatalogArchive).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      {
        expectedLifecycleVersion: 1,
        expectedPolicyVersion: 1,
        reason: "Archive obsolete event",
      },
    );
  });

  it("updates event ingestion policy with caller concurrency evidence", async () => {
    const current = {
      id: "event-revision-1",
      projectId: "project-1",
      definitionKeyId: "event-key-1",
      currentRevisionId: "event-revision-1",
      isCurrent: true,
      code: "deposit",
      name: "Deposit",
      description: null,
      version: 1,
      payloadSchema: { type: "object" },
      enabled: true,
      clientIngestible: false,
      countsAsActivity: true,
      policyVersion: 7,
      policyUpdatedAt: "now",
      metadataUpdatedAt: "now",
      origin: "CUSTOM",
      readOnly: false,
      createdAt: "now",
      updatedAt: "now",
      lifecycle: "ACTIVE",
      archivedAt: null,
    } as const;
    vi.mocked(eventCatalogUpdatePolicy).mockResolvedValue({
      definitionKeyId: "event-key-1",
      currentRevisionId: "event-revision-1",
      policyChanged: true,
      schemaRevisionUnchanged: true,
      policy: {
        version: 8,
        updatedAt: "later",
        enabled: false,
        clientIngestible: false,
        countsAsActivity: true,
      },
    });
    const currentDetail = {
      id: current.definitionKeyId,
      projectId: current.projectId,
      code: current.code,
      name: current.name,
      description: current.description,
      lifecycle: "ACTIVE" as const,
      lifecycleVersion: 1,
      lifecycleUpdatedAt: "now",
      metadataUpdatedAt: current.metadataUpdatedAt,
      origin: current.origin,
      readOnly: current.readOnly,
      policy: {
        version: 7,
        updatedAt: "now",
        enabled: true,
        clientIngestible: false,
        countsAsActivity: true,
      },
      currentRevision: {
        id: current.id,
        number: 1,
        payloadSchema: current.payloadSchema,
        publishedAt: "now",
      },
    };
    vi.mocked(eventCatalogDetail)
      .mockResolvedValueOnce(currentDetail)
      .mockResolvedValueOnce({
        ...currentDetail,
        policy: { ...currentDetail.policy, enabled: false, version: 8 },
      });

    await apiRepository.saveEvent("project-1", {
      ...current,
      description: undefined,
      enabled: false,
    });
    expect(eventCatalogUpdatePolicy).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      {
        enabled: false,
        clientIngestible: false,
        countsAsActivity: true,
        expectedVersion: 7,
      },
    );
  });

  it("uses generated Scenario Authoring list, metadata and archive endpoints", async () => {
    const scenario = {
      id: "scenario-1",
      projectId: "project-1",
      eventDefinitionId: "event-revision-1",
      code: "welcome",
      name: "Welcome",
      description: null,
      status: "ACTIVE",
      conversationPolicy: "create_new",
      priority: 0,
      currentRevisionId: "scenario-revision-1",
      cooldownSeconds: 0,
      maxRunsPerUser: null,
      activeFrom: null,
      activeTo: null,
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T11:00:00.000Z",
      actions: [],
    } as const;
    vi.mocked(scenarioAuthoringListScenarios).mockResolvedValue([
      scenario as never,
    ]);
    vi.mocked(scenarioAuthoringUpdateScenarioMetadata).mockResolvedValue({
      ...scenario,
      status: "PAUSED",
    } as never);
    vi.mocked(scenarioAuthoringArchiveScenario).mockResolvedValue({
      ...scenario,
      status: "ARCHIVED",
    } as never);

    await expect(apiRepository.getScenarios("project-1")).resolves.toEqual([
      expect.objectContaining({ id: "scenario-1" }),
    ]);
    await apiRepository.updateScenarioMetadata("project-1", "scenario-1", {
      status: "PAUSED",
      expectedUpdatedAt: scenario.updatedAt,
      reason: "Pause from scenario list",
    });
    await apiRepository.deleteScenario("project-1", "scenario-1", {
      expectedUpdatedAt: scenario.updatedAt,
      reason: "Archive obsolete scenario",
    });

    expect(scenarioAuthoringUpdateScenarioMetadata).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      {
        status: "PAUSED",
        expectedUpdatedAt: scenario.updatedAt,
        reason: "Pause from scenario list",
      },
    );
    expect(scenarioAuthoringArchiveScenario).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      {
        expectedUpdatedAt: scenario.updatedAt,
        reason: "Archive obsolete scenario",
      },
    );
  });

  it("fails closed for authoring capabilities that still have no target endpoint", async () => {
    await expect(
      apiRepository.getUserAttributeSchema("project-1"),
    ).rejects.toThrow("userAttributes");
  });

  it("sends admin messages with a UUID idempotency header and a bounded API payload", async () => {
    vi.mocked(adminMessagingSend).mockResolvedValue({
      duplicate: true,
      commandIds: ["command-1"],
      message: { id: "message-1", threadId: "thread-1", status: "COMPLETED" },
      aiSuspension: {
        replayed: false,
        state: {
          mode: "SUSPENDED",
          lifecycle: "ACTIVE",
          version: "1",
          suspendedUntil: "2026-07-20T14:00:00.000Z",
          serverTime: "2026-07-20T13:00:00.000Z",
          startedAt: "2026-07-20T13:00:00.000Z",
          startedBy: null,
          reason: "OPERATOR_TAKEOVER",
          note: null,
          resumedAt: null,
          resumedBy: null,
        },
      },
    } as never);

    const result = await apiRepository.sendAdminMessage("project-1", "user-1", {
      text: "Welcome",
      conversationId: "conversation-7",
      interactionSessionId: "session-1",
      actions: [{ type: "OPEN_PAGE", config: { pageId: "home" } }],
      aiSuspension: { durationSeconds: 3600, reason: "OPERATOR_TAKEOVER" },
      idempotencyKey: "2d77b597-1bc0-4b0f-a783-77597bb71483",
    });

    expect(adminMessagingSend).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      {
        text: "Welcome",
        conversationId: "conversation-7",
        interactionSessionId: "session-1",
        actions: [{ type: "OPEN_PAGE", config: { pageId: "home" } }],
        aiSuspension: { durationSeconds: 3600, reason: "OPERATOR_TAKEOVER" },
      },
      {
        headers: { "Idempotency-Key": "2d77b597-1bc0-4b0f-a783-77597bb71483" },
      },
    );
    expect(result).toMatchObject({
      duplicate: true,
      messageId: "message-1",
      commandIds: ["command-1"],
      aiSuspension: { state: { version: "1" } },
    });
  });

  it("управляет приостановкой AI только через выбранный диалог и сохраняет ключ команды", async () => {
    const state = {
      mode: "SUSPENDED",
      lifecycle: "ACTIVE",
      version: "12",
      suspendedUntil: "2026-07-20T14:00:00.000Z",
      serverTime: "2026-07-20T13:00:00.000Z",
      startedAt: "2026-07-20T13:00:00.000Z",
      startedBy: { id: "admin-1", displayName: "Алексей" },
      reason: "OPERATOR_TAKEOVER",
      note: null,
      resumedAt: null,
      resumedBy: null,
    } as const;
    vi.mocked(conversationAISuspensionsGet).mockResolvedValue(state);
    vi.mocked(conversationAISuspensionsStart).mockResolvedValue({
      state,
      replayed: false,
    });
    vi.mocked(conversationAISuspensionsExtend).mockResolvedValue({
      state: { ...state, version: "13" },
      replayed: false,
    });
    vi.mocked(conversationAISuspensionsResume).mockResolvedValue({
      state: {
        ...state,
        mode: "AUTOMATIC",
        lifecycle: "RESUMED",
        version: "14",
        suspendedUntil: null,
      },
      replayed: false,
    });
    vi.mocked(conversationAISuspensionsHistory).mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await expect(
      apiRepository.getConversationAISuspension(
        "project-1",
        "user-1",
        "conversation-7",
      ),
    ).resolves.toMatchObject({ version: "12" });
    await apiRepository.startConversationAISuspension(
      "project-1",
      "user-1",
      "conversation-7",
      {
        durationSeconds: 3600,
        reason: "OPERATOR_TAKEOVER",
      },
      "start-key",
    );
    await apiRepository.extendConversationAISuspension(
      "project-1",
      "user-1",
      "conversation-7",
      {
        additionalSeconds: 1800,
        expectedVersion: "12",
      },
      "extend-key",
    );
    await apiRepository.resumeConversationAI(
      "project-1",
      "user-1",
      "conversation-7",
      {
        expectedVersion: "13",
        reason: "Вопрос решён",
      },
      "resume-key",
    );
    await apiRepository.getConversationAISuspensionHistory(
      "project-1",
      "user-1",
      "conversation-7",
      { limit: 20 },
    );

    expect(conversationAISuspensionsStart).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "conversation-7",
      {
        durationSeconds: 3600,
        reason: "OPERATOR_TAKEOVER",
      },
      { headers: { "Idempotency-Key": "start-key" } },
    );
    expect(conversationAISuspensionsExtend).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "conversation-7",
      {
        additionalSeconds: 1800,
        expectedVersion: "12",
      },
      { headers: { "Idempotency-Key": "extend-key" } },
    );
    expect(conversationAISuspensionsResume).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "conversation-7",
      {
        expectedVersion: "13",
        reason: "Вопрос решён",
      },
      { headers: { "Idempotency-Key": "resume-key" } },
    );
    expect(conversationAISuspensionsHistory).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "conversation-7",
      { limit: 20 },
    );
  });

  it("maps active backend users to selectable interaction sessions", async () => {
    vi.mocked(presenceList).mockResolvedValue([
      {
        id: "user-1",
        externalId: "customer-1",
        isGuest: false,
        presence: "online",
        profile: { name: "Анна" },
        lastSeenAt: "2026-07-11T10:00:00.000Z",
        activeConnectionCount: 2,
        activeSessionCount: 1,
        connections: [
          {
            id: "connection-old",
            sessionId: "session-1",
            transport: "SOCKET_IO",
            connectedAt: "2026-07-11T09:00:00.000Z",
            lastHeartbeatAt: "2026-07-11T09:59:00.000Z",
          },
          {
            id: "connection-new",
            sessionId: "session-1",
            transport: "ANY_CABLE",
            connectedAt: "2026-07-11T09:30:00.000Z",
            lastHeartbeatAt: "2026-07-11T10:00:00.000Z",
          },
        ],
      },
    ]);

    await expect(apiRepository.getSessions("project-1")).resolves.toEqual([
      expect.objectContaining({
        id: "session-1",
        userId: "user-1",
        userName: "Анна",
        device: "AnyCable",
        connectionCount: 2,
      }),
    ]);
    expect(presenceList).toHaveBeenCalledWith("project-1");
  });

  it("loads conversations and messages through cursor-paginated CMS endpoints", async () => {
    vi.mocked(adminConversationsList).mockResolvedValue({
      items: [
        {
          id: "conversation-1",
          projectId: "project-1",
          endUserId: "user-1",
          title: "Deposit",
          status: "OPEN",
          createdAt: "2026-07-13T08:00:00.000Z",
          updatedAt: "2026-07-13T09:00:00.000Z",
          sessionId: "session-1",
          isCurrent: true,
          currentInteractionSessionCount: 1,
          aiSuspension: {
            mode: "AUTOMATIC",
            lifecycle: "NONE",
            version: "0",
            suspendedUntil: null,
            serverTime: "2026-07-20T13:00:00.000Z",
          },
          _count: { messages: 42 },
          messages: [
            {
              id: "message-last",
              role: "ASSISTANT",
              text: "Done",
              createdAt: "2026-07-13T09:00:00.000Z",
            },
          ],
        },
      ],
      nextCursor: "conversation-1",
    });
    vi.mocked(adminConversationsListMessages).mockResolvedValue({
      items: [
        {
          id: "message-1",
          threadId: "conversation-1",
          role: "USER",
          status: "COMPLETED",
          text: "Hello",
          createdAt: "2026-07-13T08:59:00.000Z",
          updatedAt: "2026-07-13T08:59:00.000Z",
        },
      ],
      nextCursor: "message-1",
    });

    await expect(
      apiRepository.getConversations("project-1", "user-1", {
        cursor: "previous",
        limit: 20,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "conversation-1",
          messageCount: 42,
          status: "ACTIVE",
          isCurrent: true,
          currentInteractionSessionCount: 1,
        }),
      ],
      nextCursor: "conversation-1",
    });
    await expect(
      apiRepository.getMessages("project-1", "user-1", "conversation-1", {
        cursor: "older",
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "message-1",
          author: "USER",
          conversationId: "conversation-1",
        }),
      ],
      nextCursor: "message-1",
    });
    expect(adminConversationsList).toHaveBeenCalledWith("project-1", "user-1", {
      cursor: "previous",
      limit: 20,
    });
    expect(adminConversationsListMessages).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "conversation-1",
      { cursor: "older", limit: 50 },
    );
  });

  it("uses the snapshot cursor CMS endpoint for filtered event logs and detail", async () => {
    const eventLog = {
      id: "log-1",
      projectId: "project-1",
      eventDefinitionId: "event-1",
      eventDefinitionKeyId: "event-key-1",
      endUserId: "user-1",
      source: "FRONTEND" as const,
      status: "PROCESSED" as const,
      occurredAt: "2026-07-16T10:00:00.000Z",
      receivedAt: "2026-07-16T10:00:00.100Z",
      payload: { amount: 25 },
      context: { route: "/wallet" },
      ingestionPolicyVersion: 3,
      ingestionPolicySnapshot: { enabled: true, source: "FRONTEND" },
      eventDefinition: {
        id: "event-1",
        code: "deposit",
        name: "Deposit",
        version: 2,
      },
      endUser: { id: "user-1", externalId: "customer-1" },
      externalEventId: "browser-1",
    };
    vi.mocked(adminEventLogsList).mockResolvedValue({
      items: [eventLog],
      pageInfo: { hasMore: true, nextCursor: "cursor-2" },
    });
    vi.mocked(adminEventLogsGet).mockResolvedValue(eventLog);
    vi.mocked(eventsList).mockResolvedValue({
      items: [eventLog as never],
      pagination: {
        page: 2,
        limit: 25,
        total: 61,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });

    await expect(
      apiRepository.getEventLogs("project-1", {
        page: 2,
        limit: 25,
        search: "deposit",
        status: "FAILED",
      }),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: "log-1", eventCode: "deposit" })],
      pagination: {
        page: 2,
        limit: 25,
        total: 61,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
    expect(eventsList).toHaveBeenCalledWith("project-1", {
      page: 2,
      limit: 25,
      search: "deposit",
      status: "FAILED",
    });

    await expect(
      apiRepository.getEventLogPage("project-1", {
        eventCode: ["deposit", "purchase"],
        status: ["FAILED", "PROCESSED"],
        cursor: "cursor-1",
        limit: 25,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "log-1",
          eventCode: "deposit",
          eventVersion: 2,
          externalEventId: "browser-1",
        }),
      ],
      nextCursor: "cursor-2",
    });
    await expect(
      apiRepository.getEventLog("project-1", "log-1"),
    ).resolves.toEqual(
      expect.objectContaining({ userExternalId: "customer-1" }),
    );
    expect(adminEventLogsList).toHaveBeenCalledWith(
      "project-1",
      {
        eventCode: ["deposit", "purchase"],
        status: ["FAILED", "PROCESSED"],
        cursor: "cursor-1",
        limit: 25,
      },
      { paramsSerializer: { indexes: null } },
    );
    expect(adminEventLogsGet).toHaveBeenCalledWith("project-1", "log-1");
  });

  it("uses pagination totals for dashboard event and failure counts", async () => {
    vi.spyOn(apiRepository, "getProject").mockResolvedValue({
      _count: undefined,
    } as never);
    vi.spyOn(apiRepository, "getScenarios").mockResolvedValue([]);
    vi.spyOn(apiRepository, "getUsers").mockResolvedValue([]);
    vi.spyOn(apiRepository, "getSessions").mockResolvedValue([]);
    const getEventLogs = vi
      .spyOn(apiRepository, "getEventLogs")
      .mockResolvedValueOnce({
        items: [],
        pagination: {
          page: 1,
          limit: 1,
          total: 250,
          totalPages: 250,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      })
      .mockResolvedValueOnce({
        items: [],
        pagination: {
          page: 1,
          limit: 1,
          total: 37,
          totalPages: 37,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      });
    vi.spyOn(apiRepository, "getScenarioRuns").mockResolvedValue([
      { status: "FAILED" },
      { status: "COMPLETED" },
    ] as never);

    await expect(apiRepository.getStats("project-1")).resolves.toEqual(
      expect.objectContaining({
        events: 250,
        integrationErrors: 38,
      }),
    );
    expect(getEventLogs).toHaveBeenNthCalledWith(1, "project-1", { limit: 1 });
    expect(getEventLogs).toHaveBeenNthCalledWith(2, "project-1", {
      status: "FAILED",
      limit: 1,
    });
  });

  it("loads dashboard sources only when their exact Project Permissions are effective", async () => {
    const getProject = vi
      .spyOn(apiRepository, "getProject")
      .mockResolvedValue({ _count: undefined } as never);
    const getScenarios = vi
      .spyOn(apiRepository, "getScenarios")
      .mockResolvedValue([{ status: "ACTIVE" }, { status: "DRAFT" }] as never);
    const getUsers = vi.spyOn(apiRepository, "getUsers").mockResolvedValue([]);
    const getSessions = vi
      .spyOn(apiRepository, "getSessions")
      .mockResolvedValue([]);
    const getEventLogs = vi
      .spyOn(apiRepository, "getEventLogs")
      .mockResolvedValue({
        items: [],
        pagination: {
          page: 1,
          limit: 1,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    const getScenarioRuns = vi
      .spyOn(apiRepository, "getScenarioRuns")
      .mockResolvedValue([]);

    await expect(
      apiRepository.getStats("project-1", ["project.scenarios.read"]),
    ).resolves.toEqual(
      expect.objectContaining({
        users: 0,
        online: 0,
        events: 0,
        scenarios: 1,
        integrationErrors: 0,
      }),
    );

    expect(getScenarios).toHaveBeenCalledWith("project-1");
    expect(getProject).not.toHaveBeenCalled();
    expect(getUsers).not.toHaveBeenCalled();
    expect(getSessions).not.toHaveBeenCalled();
    expect(getEventLogs).not.toHaveBeenCalled();
    expect(getScenarioRuns).not.toHaveBeenCalled();
  });

  it("rejects direct actions without an active interaction session", async () => {
    await expect(
      apiRepository.sendAdminMessage("project-1", "user-1", {
        text: "Open",
        conversationPolicy: "reuse_active",
        actions: [{ type: "OPEN_PAGE", config: {} }],
      }),
    ).rejects.toThrow("активная сессия");
    expect(adminMessagingSend).not.toHaveBeenCalled();
  });
});
