import {
  platformCreateEventDefinition,
  platformCreateMember,
  platformCreateScenario,
  platformCreateUi,
  platformDeleteEventDefinition,
  platformDeleteMember,
  platformDeleteScenario,
  platformDeleteUi,
  platformEventDefinitions,
  platformGetProject,
  platformMembers,
  platformScenarios,
  platformActionDefinitions,
  platformUiElements,
  platformUpdateEventDefinition,
  platformUpdateProject,
  platformUpdateScenario,
  platformUpdateUi,
  platformUsers,
  eventsList,
  scenarioRunsList,
  auditList,
  adminMessagingSend,
  presenceList,
  adminConversationsList,
  adminConversationsListMessages,
  adminEventLogsGet,
  adminEventLogsList,
  platformCreateUserAttributeDefinition,
  platformDeleteUserAttributeDefinition,
  platformUpdateUserAttributeDefinition,
  platformUserAttributeDefinitions,
} from '@/shared/api/generated/lola-backend'
import type { ScenarioResponseDto } from '@/shared/api/generated/models'
import { toCreateScenarioDto, toUpdateScenarioDto } from './scenario-contract'
import type { Scenario } from '@/shared/types/domain'
import type { LolaRepository, RepositoryCapabilities } from './contracts'
import { UnsupportedRepositoryCapabilityError } from './contracts'
import {
  mapEndUser,
  mapEventDefinition,
  mapProject,
  mapProjectMember,
  mapUiElement,
  toCreateEventDefinitionDto,
  toCreateUiElementDto,
  toUpdateEventDefinitionDto,
  toUpdateProjectDto,
  toUpdateUiElementDto,
  mapAuditLog,
  mapEventLog,
  mapScenarioRun,
  mapActiveSessions,
  mapActionDefinition,
  mapConversation,
  mapConversationMessage,
  mapUserAttributeSchema,
  mapUserAttributeMutation,
} from './mappers'

const capabilities: RepositoryCapabilities = {
  projectSettings: true,
  projectMembers: true,
  users: true,
  uiElements: true,
  eventDefinitions: true,
  scenarios: true,
  actionDefinitions: true,
  presence: true,
  activity: false,
  conversations: true,
  manualActions: false,
  operations: true,
  auditLogs: true,
  adminMessaging: true,
  userAttributes: true,
}

function unsupported(capability: keyof RepositoryCapabilities): never {
  throw new UnsupportedRepositoryCapabilityError(capability)
}

const optionalString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined
const optionalNumber = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined

function mapScenario(dto: ScenarioResponseDto): Scenario {
  return {
    id: dto.id,
    projectId: dto.projectId,
    code: dto.code,
    name: dto.name,
    description: optionalString(dto.description),
    eventDefinitionId: dto.eventDefinitionId,
    eventDefinition: dto.eventDefinition ? mapEventDefinition(dto.eventDefinition) : undefined,
    status: dto.status,
    conversationPolicy: dto.conversationPolicy,
    priority: dto.priority,
    conditions: Array.isArray(dto.conditions) ? dto.conditions as unknown as Scenario['conditions'] : [],
    cooldownSeconds: dto.cooldownSeconds,
    maxRunsPerUser: optionalNumber(dto.maxRunsPerUser),
    activeFrom: optionalString(dto.activeFrom),
    activeTo: optionalString(dto.activeTo),
    actions: dto.actions as unknown as Scenario['actions'],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  }
}

export const apiRepository: LolaRepository = {
  mode: 'api',
  capabilities,

  async getProject(projectId) {
    return mapProject(await platformGetProject(projectId))
  },

  async updateProject(projectId, patch) {
    return mapProject(await platformUpdateProject(projectId, toUpdateProjectDto(patch)))
  },

  async getMembers(projectId) {
    return (await platformMembers(projectId)).map(mapProjectMember)
  },

  async createMember(projectId, member) {
    return mapProjectMember(await platformCreateMember(projectId, member))
  },

  async deleteMember(projectId, memberId) {
    await platformDeleteMember(projectId, memberId)
  },

  async getElements(projectId) {
    return (await platformUiElements(projectId)).map(mapUiElement)
  },

  async createElement(projectId, value) {
    return mapUiElement(await platformCreateUi(projectId, toCreateUiElementDto(value)))
  },

  async updateElement(projectId, id, value) {
    return mapUiElement(await platformUpdateUi(projectId, id, toUpdateUiElementDto(value)))
  },

  async deleteElement(projectId, id) {
    await platformDeleteUi(projectId, id)
  },

  async getEvents(projectId) {
    return (await platformEventDefinitions(projectId)).map(mapEventDefinition)
  },

  async saveEvent(projectId, value) {
    const dto = value.id
      ? await platformUpdateEventDefinition(projectId, value.id, toUpdateEventDefinitionDto(value))
      : await platformCreateEventDefinition(projectId, toCreateEventDefinitionDto(value))
    return mapEventDefinition(dto)
  },

  async deleteEvent(projectId, id) {
    await platformDeleteEventDefinition(projectId, id)
  },

  async getUserAttributeSchema(projectId) {
    return mapUserAttributeSchema(await platformUserAttributeDefinitions(projectId))
  },

  async createUserAttributeDefinition(projectId, value) {
    return mapUserAttributeMutation(await platformCreateUserAttributeDefinition(projectId, { ...value, validation: value.validation ? { ...value.validation } : undefined }))
  },

  async updateUserAttributeDefinition(projectId, id, value) {
    return mapUserAttributeMutation(await platformUpdateUserAttributeDefinition(projectId, id, { ...value, validation: value.validation ? { ...value.validation } : undefined }))
  },

  async deleteUserAttributeDefinition(projectId, id) {
    return mapUserAttributeMutation(await platformDeleteUserAttributeDefinition(projectId, id))
  },

  async getScenarios(projectId) {
    return (await platformScenarios(projectId)).map(mapScenario)
  },

  async getActionDefinitions(projectId) {
    return (await platformActionDefinitions(projectId)).map(mapActionDefinition)
  },

  async saveScenario(projectId, value) {
    const dto = value.id
      ? await platformUpdateScenario(projectId, value.id, toUpdateScenarioDto(value))
      : await platformCreateScenario(projectId, toCreateScenarioDto(value))
    return mapScenario(dto)
  },

  async deleteScenario(projectId, id) {
    await platformDeleteScenario(projectId, id)
  },

  async getUsers(projectId) {
    return (await platformUsers(projectId)).map(mapEndUser)
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
  async getMessages(projectId, userId, conversationId, request) {
    const response = await adminConversationsListMessages(projectId, userId, conversationId, {
      limit: request?.limit ?? 50,
      ...(request?.cursor ? { cursor: request.cursor } : {}),
    })
    return { items: response.items.map(mapConversationMessage), nextCursor: response.nextCursor ?? null }
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

  async getAuditLogs(projectId) {
    return (await auditList(projectId)).map(mapAuditLog)
  },

  async sendAdminMessage(projectId, userId, message) {
    if (message.actions?.length && !message.interactionSessionId) {
      throw new Error('Для отправки действий нужна активная сессия пользователя')
    }
    if ((message.actions?.length ?? 0) > 5) throw new Error('Можно отправить не более 5 действий')
    const idempotencyKey = message.idempotencyKey ?? globalThis.crypto.randomUUID()
    const response = await adminMessagingSend(projectId, userId, {
      text: message.text,
      conversationPolicy: message.conversationPolicy,
      interactionSessionId: message.interactionSessionId,
      actions: message.actions,
    }, { headers: { 'Idempotency-Key': idempotencyKey } })
    return {
      duplicate: response.duplicate,
      messageId: response.message.id,
      threadId: response.message.threadId,
      commandIds: response.commandIds,
      status: response.message.status,
    }
  },

  async getStats(projectId) {
    const [project, scenarios, users, sessions, eventLogs, failedEventLogs, runs] = await Promise.all([
      this.getProject(projectId),
      this.getScenarios(projectId),
      this.getUsers(projectId),
      this.getSessions(projectId),
      this.getEventLogs(projectId, { limit: 1 }),
      this.getEventLogs(projectId, { status: 'FAILED', limit: 1 }),
      this.getScenarioRuns(projectId),
    ])
    return {
      users: project._count?.users ?? users.length,
      online: new Set(sessions.map((item) => item.userId)).size,
      events: project._count?.eventLogs ?? eventLogs.pagination.total,
      scenarios: scenarios.filter((item) => item.status === 'ACTIVE').length,
      conversations: 0,
      ctaConversion: 0,
      integrationErrors: failedEventLogs.pagination.total + runs.filter((item) => item.status === 'FAILED').length,
    }
  },
}
