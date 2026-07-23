import {
  platformOperationsProjectSettings,
  platformOperationsUpdateProjectSettings,
  eventCatalogArchive,
  eventCatalogCreate,
  eventCatalogDetail,
  eventCatalogList,
  eventCatalogRevision,
  eventCatalogRevisions,
  eventCatalogUpdateMetadata,
  eventCatalogUpdatePolicy,
  scenarioAuthoringArchiveScenario,
  scenarioAuthoringListScenarios,
  scenarioAuthoringUpdateScenarioMetadata,
  uiRegistryCreate,
  uiRegistryList,
  uiRegistryRemove,
  uiRegistryUpdate,
  platformOperationsUsers,
  platformOperationsUsersPage,
  eventsList,
  scenarioRunsList,
  scenarioRunsPage,
  projectAuditEventsList,
  adminMessagingSend,
  presenceList,
  adminConversationsList,
  adminConversationsGet,
  adminConversationsListMessages,
  adminEventLogsGet,
  adminEventLogsList,
  platformOperationsActivitySettings,
  platformOperationsUpdateActivitySettings,
  conversationAISuspensionsGet,
  conversationAISuspensionsStart,
  conversationAISuspensionsExtend,
  conversationAISuspensionsResume,
  conversationAISuspensionsHistory,
} from '@/shared/api/generated/lola-backend'
import type { LolaRepository, RepositoryCapabilities } from './contracts'
import { UnsupportedRepositoryCapabilityError } from './contracts'
import {
  mapEndUser,
  mapEventDefinition,
  mapEventDefinitionRevision,
  mapProject,
  mapUiElement,
  toCreateUiElementDto,
  toUpdateProjectSettingsDto,
  toUpdateUiElementDto,
  mapAuditEvent,
  mapEventLog,
  mapScenarioRun,
  mapScenario,
  mapActiveSessions,
  mapConversation,
  mapConversationMessage,
  mapConversationAISuspensionDetail,
} from './mappers'

const capabilities: RepositoryCapabilities = {
  projectSettings: true,
  projectMembers: true,
  users: true,
  uiElements: true,
  eventDefinitions: true,
  scenarios: true,
  presence: true,
  activity: false,
  conversations: true,
  manualActions: false,
  operations: true,
  auditEvents: true,
  adminMessaging: true,
  userAttributes: false,
}

function unsupported(capability: keyof RepositoryCapabilities): never {
  throw new UnsupportedRepositoryCapabilityError(capability)
}

const optionalString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined
export const apiRepository: LolaRepository = {
  mode: 'api',
  capabilities,

  async getProject(projectId) {
    return mapProject(await platformOperationsProjectSettings(projectId))
  },

  async updateProject(projectId, patch) {
    return mapProject(await platformOperationsUpdateProjectSettings(projectId, toUpdateProjectSettingsDto(patch)))
  },

  async getElements(projectId) {
    return (await uiRegistryList(projectId)).map(mapUiElement)
  },

  async createElement(projectId, value) {
    return mapUiElement(await uiRegistryCreate(projectId, toCreateUiElementDto(value)))
  },

  async updateElement(projectId, id, value) {
    return mapUiElement(await uiRegistryUpdate(projectId, id, toUpdateUiElementDto(value)))
  },

  async deleteElement(projectId, id) {
    await uiRegistryRemove(projectId, id)
  },

  async getEvents(projectId) {
    return (await eventCatalogList(projectId)).map(mapEventDefinition)
  },

  async getEventDefinitionRevisions(projectId, definitionKeyId, request) {
    const [response, definitionDto] = await Promise.all([
      eventCatalogRevisions(projectId, definitionKeyId, request),
      eventCatalogDetail(projectId, definitionKeyId),
    ])
    const definition = mapEventDefinition(definitionDto)
    return {
      items: response.items.map((item) => mapEventDefinitionRevision(item, definition)),
      nextCursor: response.nextCursor ?? null,
    }
  },

  async getEventDefinitionRevision(projectId, definitionKeyId, revisionId) {
    const [revision, definitionDto] = await Promise.all([
      eventCatalogRevision(projectId, definitionKeyId, revisionId),
      eventCatalogDetail(projectId, definitionKeyId),
    ])
    return mapEventDefinitionRevision(revision, mapEventDefinition(definitionDto))
  },

  async saveEvent(projectId, value) {
    if (!value.id) {
      return mapEventDefinition(await eventCatalogCreate(projectId, {
        code: value.code,
        name: value.name,
        ...(value.description === undefined ? {} : { description: value.description }),
        payloadSchema: value.payloadSchema,
        ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
        ...(value.clientIngestible === undefined ? {} : { clientIngestible: value.clientIngestible }),
        ...(value.countsAsActivity === undefined ? {} : { countsAsActivity: value.countsAsActivity }),
      }))
    }

    const definitionKeyId = value.definitionKeyId
    if (!definitionKeyId || value.policyVersion === undefined || !value.metadataUpdatedAt) {
      throw new Error('Event update requires stable identity and concurrency evidence')
    }
    const current = mapEventDefinition(await eventCatalogDetail(projectId, definitionKeyId))
    if (JSON.stringify(current.payloadSchema) !== JSON.stringify(value.payloadSchema)) {
      throw new Error('Event schema changes must use the schema draft publication workflow')
    }
    if (current.name !== value.name || (current.description ?? undefined) !== value.description) {
      await eventCatalogUpdateMetadata(projectId, definitionKeyId, {
        name: value.name,
        ...(value.description === undefined ? {} : { description: value.description }),
        expectedUpdatedAt: value.metadataUpdatedAt,
      })
    }
    if (current.enabled !== value.enabled || current.clientIngestible !== value.clientIngestible || current.countsAsActivity !== value.countsAsActivity) {
      await eventCatalogUpdatePolicy(projectId, definitionKeyId, {
        enabled: value.enabled ?? current.enabled,
        clientIngestible: value.clientIngestible ?? current.clientIngestible,
        countsAsActivity: value.countsAsActivity ?? current.countsAsActivity,
        expectedVersion: value.policyVersion,
      })
    }
    return mapEventDefinition(await eventCatalogDetail(projectId, definitionKeyId))
  },

  async deleteEvent(projectId, definitionKeyId, command) {
    await eventCatalogArchive(projectId, definitionKeyId, command)
  },

  async getUserAttributeSchema() { return unsupported('userAttributes') },

  async createUserAttributeDefinition() { return unsupported('userAttributes') },

  async updateUserAttributeDefinition() { return unsupported('userAttributes') },

  async deleteUserAttributeDefinition() { return unsupported('userAttributes') },

  async getScenarios(projectId) {
    return (await scenarioAuthoringListScenarios(projectId)).map(mapScenario)
  },

  async saveScenario(projectId, value) {
    if (!value.id || !value.updatedAt) {
      throw new Error('Scenario updates require stable identity and concurrency evidence')
    }
    if (value.status === 'ARCHIVED') {
      throw new Error('Scenario archival must use the audited archive operation')
    }
    return mapScenario(await scenarioAuthoringUpdateScenarioMetadata(projectId, value.id, {
      name: value.name,
      ...(value.description === undefined ? {} : { description: value.description }),
      eventDefinitionId: value.eventDefinitionId,
      ...(value.status === undefined ? {} : { status: value.status }),
      ...(value.conversationPolicy === undefined ? {} : { conversationPolicy: value.conversationPolicy }),
      ...(value.priority === undefined ? {} : { priority: value.priority }),
      ...(value.cooldownSeconds === undefined ? {} : { cooldownSeconds: value.cooldownSeconds }),
      ...(value.maxRunsPerUser === undefined ? {} : { maxRunsPerUser: value.maxRunsPerUser }),
      ...(value.activeFrom === undefined ? {} : { activeFrom: value.activeFrom }),
      ...(value.activeTo === undefined ? {} : { activeTo: value.activeTo }),
      expectedUpdatedAt: value.updatedAt,
      reason: 'Scenario metadata updated from CMS',
    }))
  },

  async updateScenarioMetadata(projectId, scenarioId, value) {
    return mapScenario(await scenarioAuthoringUpdateScenarioMetadata(projectId, scenarioId, value))
  },

  async deleteScenario(projectId, scenarioId, command) {
    await scenarioAuthoringArchiveScenario(projectId, scenarioId, command)
  },

  async getUsers(projectId) {
    return (await platformOperationsUsers(projectId)).map(mapEndUser)
  },

  async getUsersPage(projectId, request) {
    const response = await platformOperationsUsersPage(projectId, request)
    return { items: response.items.map(mapEndUser), nextCursor: optionalString(response.nextCursor) ?? null }
  },

  async getSessions(projectId) {
    return (await presenceList(projectId)).flatMap(mapActiveSessions)
  },
  async getActivity() { return unsupported('activity') },
  async getConversations(projectId, userId, request) {
    const response = await adminConversationsList(projectId, userId, {
      limit: request?.limit ?? 30,
      ...(request?.cursor ? { cursor: request.cursor } : {}),
    })
    return { items: response.items.map(mapConversation), nextCursor: response.nextCursor ?? null }
  },
  async getConversation(projectId, userId, conversationId) {
    return mapConversation(await adminConversationsGet(projectId, userId, conversationId))
  },
  async getMessages(projectId, userId, conversationId, request) {
    const response = await adminConversationsListMessages(projectId, userId, conversationId, {
      limit: request?.limit ?? 50,
      ...(request?.cursor ? { cursor: request.cursor } : {}),
    })
    return { items: response.items.map(mapConversationMessage), nextCursor: response.nextCursor ?? null }
  },
  async getConversationAISuspension(projectId, endUserId, conversationId) {
    return mapConversationAISuspensionDetail(
      await conversationAISuspensionsGet(projectId, endUserId, conversationId),
    )
  },
  async startConversationAISuspension(projectId, endUserId, conversationId, command, idempotencyKey) {
    const response = await conversationAISuspensionsStart(projectId, endUserId, conversationId, command, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return { ...response, state: mapConversationAISuspensionDetail(response.state) }
  },
  async extendConversationAISuspension(projectId, endUserId, conversationId, command, idempotencyKey) {
    const response = await conversationAISuspensionsExtend(projectId, endUserId, conversationId, command, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return { ...response, state: mapConversationAISuspensionDetail(response.state) }
  },
  async resumeConversationAI(projectId, endUserId, conversationId, command, idempotencyKey) {
    const response = await conversationAISuspensionsResume(projectId, endUserId, conversationId, command, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return { ...response, state: mapConversationAISuspensionDetail(response.state) }
  },
  async getConversationAISuspensionHistory(projectId, endUserId, conversationId, request) {
    const response = await conversationAISuspensionsHistory(projectId, endUserId, conversationId, request)
    return { items: response.items, nextCursor: response.nextCursor ?? null }
  },
  async sendAction() { return unsupported('manualActions') },

  async getEventLogs(projectId, request) {
    const response = await eventsList(projectId, request)
    return {
      items: response.items.map(mapEventLog),
      pagination: response.pagination,
    }
  },

  async getEventLogPage(projectId, filters) {
    const response = await adminEventLogsList(projectId, filters, { paramsSerializer: { indexes: null } })
    return {
      items: response.items.map(mapEventLog),
      nextCursor: response.pageInfo.nextCursor ?? null,
    }
  },

  async getEventLog(projectId, eventId) {
    return mapEventLog(await adminEventLogsGet(projectId, eventId))
  },

  async getScenarioRuns(projectId) {
    return (await scenarioRunsList(projectId)).map(mapScenarioRun)
  },

  async getScenarioRunsPage(projectId, request) {
    const response = await scenarioRunsPage(projectId, request)
    return { items: response.items.map(mapScenarioRun), nextCursor: response.nextCursor ?? null }
  },

  async getActivitySettings(projectId) {
    return platformOperationsActivitySettings(projectId)
  },

  async updateActivitySettings(projectId, value) {
    return platformOperationsUpdateActivitySettings(projectId, value)
  },

  async getAuditEventsPage(projectId, request) {
    const response = await projectAuditEventsList(projectId, request)
    return {
      items: response.items.map(mapAuditEvent),
      nextCursor: response.nextCursor ?? null,
    }
  },

  async sendAdminMessage(projectId, userId, message) {
    if (message.actions?.length && !message.interactionSessionId) {
      throw new Error('Для отправки действий нужна активная сессия пользователя')
    }
    if ((message.actions?.length ?? 0) > 5) throw new Error('Можно отправить не более 5 действий')
    const idempotencyKey = message.idempotencyKey ?? globalThis.crypto.randomUUID()
    const response = await adminMessagingSend(projectId, userId, {
      text: message.text,
      ...(message.conversationId
        ? { conversationId: message.conversationId }
        : { conversationPolicy: message.conversationPolicy }),
      interactionSessionId: message.interactionSessionId,
      actions: message.actions,
      aiSuspension: message.aiSuspension,
    }, { headers: { 'Idempotency-Key': idempotencyKey } })
    return {
      duplicate: response.duplicate,
      messageId: response.message.id,
      threadId: response.message.threadId,
      commandIds: response.commandIds,
      status: response.message.status,
      deliveryStatus: response.delivery?.status,
      ...(response.aiSuspension ? {
        aiSuspension: {
          ...response.aiSuspension,
          state: mapConversationAISuspensionDetail(response.aiSuspension.state),
        },
      } : {}),
    }
  },

  async getStats(projectId, effectivePermissionCodes) {
    const permitted = (permission: string) =>
      effectivePermissionCodes === undefined || effectivePermissionCodes.includes(permission)
    const canReadEvents = permitted('project.event_logs.read')
    const [project, scenarios, users, sessions, eventLogs, failedEventLogs, runs] = await Promise.all([
      permitted('project.settings.read') ? this.getProject(projectId) : Promise.resolve(null),
      capabilities.scenarios && permitted('project.scenarios.read') ? this.getScenarios(projectId) : Promise.resolve([]),
      permitted('project.end_users.read') ? this.getUsers(projectId) : Promise.resolve([]),
      permitted('project.conversations.read') ? this.getSessions(projectId) : Promise.resolve([]),
      canReadEvents ? this.getEventLogs(projectId, { limit: 1 }) : Promise.resolve(null),
      canReadEvents ? this.getEventLogs(projectId, { status: 'FAILED', limit: 1 }) : Promise.resolve(null),
      permitted('project.scenario_runs.read') ? this.getScenarioRuns(projectId) : Promise.resolve([]),
    ])
    return {
      users: project?._count?.users ?? users.length,
      online: new Set(sessions.map((item) => item.userId)).size,
      events: project?._count?.eventLogs ?? eventLogs?.pagination.total ?? 0,
      scenarios: scenarios.filter((item) => item.status === 'ACTIVE').length,
      conversations: 0,
      ctaConversion: 0,
      integrationErrors:
        (failedEventLogs?.pagination.total ?? 0) +
        runs.filter((item) => item.status === 'FAILED').length,
    }
  },
}
