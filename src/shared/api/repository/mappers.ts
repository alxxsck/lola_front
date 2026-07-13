import type {
  CreateEventDefinitionDto,
  CreateUiElementDto,
  EndUserResponseDto,
  EventDefinitionResponseDto,
  ProjectMemberResponseDto,
  ProjectResponseDto,
  UiElementResponseDto,
  UpdateEventDefinitionDto,
  UpdateProjectDto,
  UpdateUiElementDto,
  AuditLogResponseDto,
  EventLogResponseDto,
  ScenarioRunResponseDto,
  ActiveUserResponseDto,
  ScenarioActionDefinitionResponseDto,
  AdminConversationResponseDto,
  AdminConversationMessageResponseDto,
} from '@/shared/api/generated/models'
import type { ActiveSession, AuditLog, CmsUser, Conversation, ConversationMessage, EndUser, EventDefinition, EventLog, Project, ScenarioRun, UiElement } from '@/shared/types/domain'
import type { SaveEventDefinition, SaveUiElement } from './contracts'
import { parseActionDefinition } from '@/shared/lib/action-definition'

const defined = <T extends object>(value: T): T => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined),
) as T

const optionalString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined

export function mapActionDefinition(dto: ScenarioActionDefinitionResponseDto) {
  return parseActionDefinition(dto)
}

export function mapProject(dto: ProjectResponseDto): Project {
  return {
    id: dto.id,
    name: dto.name,
    slug: dto.slug,
    status: dto.status,
    publicKey: dto.publicKey,
    defaultLocale: dto.defaultLocale,
    supportedLocales: dto.supportedLocales,
    assistantName: dto.assistantName,
    systemPrompt: dto.systemPrompt,
    settings: dto.settings,
    organization: dto.organization,
    _count: dto._count,
  }
}

export function toUpdateProjectDto(patch: Partial<Project>): UpdateProjectDto {
  return defined({
    name: patch.name,
    status: patch.status,
    defaultLocale: patch.defaultLocale,
    supportedLocales: patch.supportedLocales,
    assistantName: patch.assistantName,
    systemPrompt: patch.systemPrompt,
    settings: patch.settings,
  })
}

export function mapProjectMember(dto: ProjectMemberResponseDto): CmsUser {
  return {
    id: dto.id,
    email: dto.email,
    name: optionalString(dto.name) ?? dto.email,
    role: dto.role,
  }
}

export function mapEndUser(dto: EndUserResponseDto): EndUser {
  return {
    id: dto.id,
    projectId: dto.projectId,
    externalId: dto.externalId,
    isGuest: dto.isGuest,
    locale: optionalString(dto.locale),
    segment: optionalString(dto.segment),
    profile: dto.profile,
    attributes: dto.attributes,
    preferences: dto.preferences,
    lastSeenAt: dto.lastSeenAt,
    createdAt: dto.createdAt,
  }
}

export function mapConversation(dto: AdminConversationResponseDto): Conversation {
  return {
    id: dto.id,
    userId: dto.endUserId,
    title: dto.title?.trim() || 'Диалог без названия',
    status: dto.status === 'OPEN' ? 'ACTIVE' : 'ARCHIVED',
    lastMessageAt: dto.messages[0]?.createdAt ?? dto.updatedAt,
    messageCount: dto._count.messages,
  }
}

export function mapConversationMessage(dto: AdminConversationMessageResponseDto): ConversationMessage {
  return {
    id: dto.id,
    conversationId: dto.threadId,
    author: dto.role,
    text: dto.text,
    status: dto.status,
    createdAt: dto.createdAt,
  }
}

export function mapActiveSessions(dto: ActiveUserResponseDto): ActiveSession[] {
  const profile = record(dto.profile)
  const userName = typeof profile.name === 'string' && profile.name.trim() ? profile.name : dto.externalId
  const sessions = new Map<string, ActiveSession>()

  for (const connection of dto.connections) {
    const existing = sessions.get(connection.sessionId)
    if (existing && existing.lastSeenAt >= connection.lastHeartbeatAt) continue
    sessions.set(connection.sessionId, {
      id: connection.sessionId,
      userId: dto.id,
      externalId: dto.externalId,
      userName,
      device: connection.transport === 'ANY_CABLE' ? 'AnyCable' : 'Socket.IO',
      transport: connection.transport,
      connectionCount: dto.activeConnectionCount,
      sessionCount: dto.activeSessionCount,
      startedAt: connection.connectedAt,
      lastSeenAt: connection.lastHeartbeatAt,
      status: 'ONLINE',
    })
  }

  return [...sessions.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
}

export function mapUiElement(dto: UiElementResponseDto): UiElement {
  return {
    id: dto.id,
    projectId: dto.projectId,
    code: dto.code,
    name: dto.name,
    kind: dto.kind,
    selector: optionalString(dto.selector),
    route: optionalString(dto.route),
    handler: optionalString(dto.handler),
    config: dto.config,
    enabled: dto.enabled,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  }
}

const uiPayload = (value: SaveUiElement) => defined({
  code: value.code,
  name: value.name,
  kind: value.kind,
  selector: value.selector,
  route: value.route,
  handler: value.handler,
  config: value.config,
  enabled: value.enabled,
})

export function toCreateUiElementDto(value: SaveUiElement): CreateUiElementDto {
  return uiPayload(value)
}

export function toUpdateUiElementDto(value: SaveUiElement): UpdateUiElementDto {
  return uiPayload(value)
}

export function mapEventDefinition(dto: EventDefinitionResponseDto): EventDefinition {
  return {
    id: dto.id,
    projectId: dto.projectId,
    code: dto.code,
    name: dto.name,
    description: optionalString(dto.description),
    version: dto.version,
    payloadSchema: dto.payloadSchema,
    enabled: dto.enabled,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  }
}

export function toCreateEventDefinitionDto(value: SaveEventDefinition): CreateEventDefinitionDto {
  return defined({
    code: value.code,
    name: value.name,
    description: value.description,
    version: value.version,
    payloadSchema: value.payloadSchema,
    enabled: value.enabled,
  })
}

export function toUpdateEventDefinitionDto(value: SaveEventDefinition): UpdateEventDefinitionDto {
  return defined({
    name: value.name,
    description: value.description,
    payloadSchema: value.payloadSchema,
    enabled: value.enabled,
  })
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}

export function mapEventLog(dto: EventLogResponseDto): EventLog {
  return {
    id: dto.id,
    eventCode: dto.eventDefinition.code,
    eventName: dto.eventDefinition.name,
    userId: dto.endUserId,
    userExternalId: dto.endUser.externalId,
    source: dto.source,
    status: dto.status,
    occurredAt: dto.occurredAt,
    receivedAt: dto.receivedAt,
    payload: record(dto.payload),
    context: record(dto.context),
    processingResult: dto.processingResult ? record(dto.processingResult) : undefined,
    error: dto.error ? record(dto.error) : undefined,
  }
}

export function mapScenarioRun(dto: ScenarioRunResponseDto): ScenarioRun {
  return {
    id: dto.id,
    scenarioId: dto.scenarioId,
    scenarioCode: dto.scenario.code,
    scenarioName: dto.scenario.name,
    eventLogId: dto.eventLogId,
    userId: dto.endUserId,
    userExternalId: dto.endUser.externalId,
    status: dto.status,
    context: record(dto.context),
    error: dto.error ? record(dto.error) : undefined,
    startedAt: dto.startedAt,
    finishedAt: typeof dto.finishedAt === 'string' ? dto.finishedAt : undefined,
    currentStep: dto.currentStep,
    steps: dto.steps.map((step) => ({
      id: step.id,
      position: step.position,
      actionType: step.actionType,
      status: step.status,
      config: record(step.config),
      errorCode: typeof step.errorCode === 'string' ? step.errorCode : undefined,
      error: step.error ? record(step.error) : undefined,
      result: step.result ? record(step.result) : undefined,
      command: step.command ? {
        id: step.command.id,
        type: step.command.type,
        status: step.command.status,
        sequence: step.command.sequence,
        payload: record(step.command.payload),
        createdAt: step.command.createdAt,
        expiresAt: typeof step.command.expiresAt === 'string' ? step.command.expiresAt : undefined,
      } : undefined,
    })),
  }
}

export function mapAuditLog(dto: AuditLogResponseDto): AuditLog {
  return {
    id: dto.id,
    actor: {
      id: dto.adminUser?.id ?? dto.adminUserId ?? undefined,
      email: dto.adminUser?.login,
      name: dto.adminUser?.displayName ?? undefined,
    },
    action: dto.action,
    status: dto.status,
    resourceType: dto.resourceType ?? undefined,
    resourceId: dto.resourceId ?? undefined,
    requestId: dto.requestId ?? undefined,
    metadata: record(dto.metadata),
    createdAt: dto.createdAt,
  }
}
