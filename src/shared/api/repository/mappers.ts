import type {
  CreateUiElementDto,
  EndUserResponseDto,
  EventCatalogDefinitionResponseDto,
  EventCatalogRevisionResponseDto,
  ProjectResponseDto,
  UiElementResponseDto,
  UpdateProjectSettingsDto,
  UpdateUiElementDto,
  AuditLogResponseDto,
  EventLogResponseDto,
  ScenarioRunResponseDto,
  ActiveUserResponseDto,
  AdminConversationResponseDto,
  AdminConversationMessageResponseDto,
  ConversationAISuspensionResponseDto,
  ConversationAISuspensionSummaryResponseDto,
  ScenarioAuthoringSummaryResponseDto,
} from '@/shared/api/generated/models'
import type {
  ActiveSession,
  AuditLog,
  Conversation,
  ConversationAISuspensionDetail,
  ConversationAISuspensionSummary,
  ConversationMessage,
  EndUser,
  EventLog,
  EventDefinition,
  EventDefinitionRevision,
  Project,
  Scenario,
  ScenarioRun,
  UiElement,
} from '@/shared/types/domain'
import type {
  CreateUiElement,
  UpdateUiElement,
} from './contracts'

const defined = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

export function mapProject(dto: ProjectResponseDto): Project {
  return {
    id: dto.id,
    version: dto.version,
    name: dto.name,
    slug: dto.slug,
    status: dto.status,
    publicKey: dto.publicKey,
    defaultLocale: dto.defaultLocale,
    supportedLocales: dto.supportedLocales,
    assistantName: dto.assistantName,
    systemPrompt: dto.systemPrompt,
    voiceInstructions: dto.voiceInstructions,
    settings: dto.settings,
    organization: dto.organization,
    _count: dto._count,
  }
}

export function toUpdateProjectSettingsDto(
  patch: Partial<Project> & Pick<Project, 'version'>,
): UpdateProjectSettingsDto {
  return defined({
    expectedVersion: patch.version,
    name: patch.name,
    assistantName: patch.assistantName,
    systemPrompt: patch.systemPrompt,
    voiceInstructions: patch.voiceInstructions,
    settings: patch.settings,
  })
}

export function mapEventDefinition(dto: EventCatalogDefinitionResponseDto | EventCatalogRevisionResponseDto): EventDefinition {
  return {
    id: dto.id,
    projectId: dto.projectId,
    definitionKeyId: dto.definitionKeyId,
    currentRevisionId: dto.currentRevisionId ?? null,
    isCurrent: dto.isCurrent,
    origin: dto.origin,
    readOnly: dto.readOnly,
    code: dto.code,
    name: dto.name,
    ...(dto.description == null ? {} : { description: dto.description }),
    version: dto.version,
    payloadSchema: dto.payloadSchema,
    enabled: dto.enabled,
    clientIngestible: dto.clientIngestible,
    countsAsActivity: dto.countsAsActivity,
    policyVersion: dto.policyVersion,
    policyUpdatedAt: dto.policyUpdatedAt,
    metadataUpdatedAt: dto.metadataUpdatedAt,
    ...('lifecycle' in dto ? { lifecycle: dto.lifecycle } : {}),
    ...('archivedAt' in dto ? { archivedAt: dto.archivedAt ?? null } : {}),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  }
}

export function mapEventDefinitionRevision(dto: EventCatalogRevisionResponseDto): EventDefinitionRevision {
  return {
    ...mapEventDefinition(dto),
    definitionKeyId: dto.definitionKeyId,
    currentRevisionId: dto.currentRevisionId ?? null,
    isCurrent: dto.isCurrent,
    origin: dto.origin,
    readOnly: dto.readOnly,
    pinnedScenarioRevisionCount: dto.pinnedScenarioRevisionCount,
    compatibility: dto.compatibility,
  }
}

export function mapScenario(dto: ScenarioAuthoringSummaryResponseDto): Scenario {
  return {
    id: dto.id,
    projectId: dto.projectId,
    code: dto.code,
    name: dto.name,
    ...(dto.description == null ? {} : { description: dto.description }),
    eventDefinitionId: dto.eventDefinitionId,
    status: dto.status,
    conversationPolicy: dto.conversationPolicy,
    priority: dto.priority,
    conditions: [],
    cooldownSeconds: dto.cooldownSeconds,
    ...(dto.maxRunsPerUser == null ? {} : { maxRunsPerUser: dto.maxRunsPerUser }),
    ...(dto.activeFrom == null ? {} : { activeFrom: dto.activeFrom }),
    ...(dto.activeTo == null ? {} : { activeTo: dto.activeTo }),
    actions: [],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
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

export function mapConversation(
  dto: AdminConversationResponseDto,
): Conversation {
  return {
    id: dto.id,
    userId: dto.endUserId,
    title: dto.title?.trim() || 'Диалог без названия',
    status: dto.status === 'OPEN' ? 'ACTIVE' : 'ARCHIVED',
    updatedAt: dto.updatedAt,
    lastMessageAt: dto.messages[0]?.createdAt ?? dto.updatedAt,
    messageCount: dto._count.messages,
    isCurrent: dto.isCurrent,
    currentInteractionSessionCount: dto.currentInteractionSessionCount,
    aiSuspension: mapConversationAISuspensionSummary(dto.aiSuspension),
  }
}

export function mapConversationAISuspensionSummary(
  dto: ConversationAISuspensionSummaryResponseDto,
): ConversationAISuspensionSummary {
  return {
    mode: dto.mode,
    lifecycle: dto.lifecycle,
    version: dto.version,
    suspendedUntil: dto.suspendedUntil,
    serverTime: dto.serverTime,
  }
}

export function mapConversationAISuspensionDetail(
  dto: ConversationAISuspensionResponseDto,
): ConversationAISuspensionDetail {
  return {
    ...mapConversationAISuspensionSummary(dto),
    startedAt: dto.startedAt,
    startedBy: dto.startedBy,
    reason: dto.reason,
    note: dto.note,
    resumedAt: dto.resumedAt,
    resumedBy: dto.resumedBy,
  }
}

export function mapConversationMessage(
  dto: AdminConversationMessageResponseDto,
): ConversationMessage {
  return {
    id: dto.id,
    conversationId: dto.threadId,
    author: dto.role,
    text: dto.text,
    status: dto.status,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  }
}

export function mapActiveSessions(dto: ActiveUserResponseDto): ActiveSession[] {
  const profile = record(dto.profile)
  const userName =
    typeof profile.name === 'string' && profile.name.trim()
      ? profile.name
      : dto.externalId
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
      currentConversationId: null,
      startedAt: connection.connectedAt,
      lastSeenAt: connection.lastHeartbeatAt,
      status: 'ONLINE',
    })
  }

  return [...sessions.values()].sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  )
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
    modalName: optionalString(dto.modalName),
    handler: optionalString(dto.handler),
    config: dto.config,
    enabled: dto.enabled,
    aiEnabled: dto.aiEnabled,
    aiDescription: dto.aiDescription ?? null,
    aiAliases: dto.aiAliases,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  }
}

const uiPayload = (value: UpdateUiElement) =>
  defined({
    code: value.code,
    name: value.name,
    kind: value.kind,
    selector: value.selector,
    route: value.route,
    modalName: value.modalName,
    config: value.config,
    enabled: value.enabled,
    aiEnabled: value.aiEnabled,
    aiDescription: value.aiDescription,
    aiAliases: value.aiAliases,
    auditReason: value.auditReason,
  })

export function toCreateUiElementDto(
  value: CreateUiElement,
): CreateUiElementDto {
  return {
    ...uiPayload(value),
    code: value.code,
    name: value.name,
    kind: value.kind,
    aiDescription: value.aiDescription ?? undefined,
  }
}

export function toUpdateUiElementDto(
  value: UpdateUiElement,
): UpdateUiElementDto {
  return uiPayload(value)
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

export function mapEventLog(dto: EventLogResponseDto): EventLog {
  return {
    id: dto.id,
    eventCode: dto.eventDefinition.code,
    eventName: dto.eventDefinition.name,
    eventDefinitionId: dto.eventDefinitionId,
    eventVersion: dto.eventDefinition.version,
    userId: dto.endUserId,
    userExternalId: dto.endUser.externalId,
    source: dto.source,
    status: dto.status,
    externalEventId: optionalString(dto.externalEventId),
    message: optionalString(dto.message),
    occurredAt: dto.occurredAt,
    receivedAt: dto.receivedAt,
    payload: record(dto.payload),
    context: record(dto.context),
    processingResult: dto.processingResult
      ? record(dto.processingResult)
      : undefined,
    error: dto.error ?? undefined,
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
    conversationPolicy: dto.conversationPolicy,
    conversationId: optionalString(dto.conversationId),
    interactionSessionId: optionalString(dto.interactionSessionId),
    scenarioRevisionId: optionalString(dto.scenarioRevisionId),
    errorCode: optionalString(dto.errorCode),
    startedAt: dto.startedAt,
    finishedAt: typeof dto.finishedAt === 'string' ? dto.finishedAt : undefined,
    currentStep: dto.currentStep,
    steps: dto.steps.map((step) => ({
      id: step.id,
      position: step.position,
      nodeKey: step.nodeKey,
      actionType: step.actionType,
      executor: step.executor,
      status: step.status,
      errorCode:
        typeof step.errorCode === 'string' ? step.errorCode : undefined,
      startedAt: optionalString(step.startedAt),
      finishedAt: optionalString(step.finishedAt),
      resumeAt: optionalString(step.resumeAt),
      command: step.command
        ? {
            id: step.command.id,
            type: step.command.type,
            status: step.command.status,
            sequence: step.command.sequence,
            createdAt: step.command.createdAt,
            expiresAt:
              typeof step.command.expiresAt === 'string'
                ? step.command.expiresAt
                : undefined,
            sentAt: optionalString(step.command.sentAt),
            acknowledgedAt: optionalString(step.command.acknowledgedAt),
            executedAt: optionalString(step.command.executedAt),
          }
        : undefined,
    })),
  }
}

export function mapAuditLog(dto: AuditLogResponseDto): AuditLog {
  return {
    id: dto.id,
    actor: {
      id: dto.actorCmsUser?.id ?? dto.actorCmsUserId ?? undefined,
      email: dto.actorCmsUser?.email,
      name: dto.actorCmsUser?.displayName ?? undefined,
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
