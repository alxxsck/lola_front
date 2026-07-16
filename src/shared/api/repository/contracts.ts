import type {
  ActiveSession,
  ActivityItem,
  CmsUser,
  Conversation,
  ConversationMessage,
  DashboardStats,
  EndUser,
  EventDefinition,
  ManualAction,
  AdminMessageRequest,
  AdminMessageResult,
  AuditLog,
  Project,
  Scenario,
  ScenarioActionDefinition,
  ScenarioRun,
  EventLog,
  EventLogStatus,
  UserAttributeSchema,
  UserAttributeMutation,
  UserAttributeType,
  UserAttributeValidation,
  UiElement,
} from '@/shared/types/domain'

export type RepositoryMode = 'mock' | 'api'

export interface RepositoryCapabilities {
  projectSettings: boolean
  projectMembers: boolean
  users: boolean
  uiElements: boolean
  eventDefinitions: boolean
  scenarios: boolean
  actionDefinitions: boolean
  presence: boolean
  activity: boolean
  conversations: boolean
  manualActions: boolean
  operations: boolean
  auditLogs: boolean
  adminMessaging: boolean
  userAttributes: boolean
}

type UiElementCreateBase = Pick<UiElement, 'name' | 'code'> & Partial<Pick<UiElement, 'config' | 'enabled'>>
export type CreateUiElement = UiElementCreateBase & (
  | { kind: 'ELEMENT' | 'BUTTON'; selector?: string }
  | { kind: 'PAGE'; route: string }
  | { kind: 'MODAL'; modalName: string }
)
export type UpdateUiElement = Partial<Pick<UiElement, 'name' | 'code' | 'kind' | 'selector' | 'route' | 'modalName' | 'config' | 'enabled'>>
export type SaveEventDefinition = Partial<EventDefinition> & Pick<EventDefinition, 'name' | 'code' | 'payloadSchema'>
export type SaveScenario = Partial<Scenario> & Pick<Scenario, 'name' | 'code' | 'eventDefinitionId' | 'actions'>
export type CreateProjectMember = Pick<CmsUser, 'email' | 'role'> & { name?: string }

export interface CursorPageRequest {
  cursor?: string
  limit?: number
}

export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null
}

export interface UserAttributeDefinitionInput {
  key: string
  label: string
  description?: string
  type: UserAttributeType
  required?: boolean
  clientVisible?: boolean
  validation?: UserAttributeValidation
  enabled?: boolean
  position?: number
}

export type UpdateUserAttributeDefinitionInput = Partial<Omit<UserAttributeDefinitionInput, 'key' | 'type' | 'description'>> & { description?: string | null }

export interface EventLogFilters extends CursorPageRequest {
  eventCode?: string
  externalUserId?: string
  source?: EventLog['source']
  status?: EventLogStatus
  receivedFrom?: string
  receivedTo?: string
  occurredFrom?: string
  occurredTo?: string
}

export interface LolaRepository {
  readonly mode: RepositoryMode
  readonly capabilities: RepositoryCapabilities
  getProject(projectId: string): Promise<Project>
  updateProject(projectId: string, patch: Partial<Project>): Promise<Project>
  getMembers(projectId: string): Promise<CmsUser[]>
  createMember(projectId: string, member: CreateProjectMember): Promise<CmsUser>
  deleteMember(projectId: string, memberId: string): Promise<void>
  getElements(projectId: string): Promise<UiElement[]>
  createElement(projectId: string, value: CreateUiElement): Promise<UiElement>
  updateElement(projectId: string, id: string, value: UpdateUiElement): Promise<UiElement>
  deleteElement(projectId: string, id: string): Promise<void>
  getEvents(projectId: string): Promise<EventDefinition[]>
  saveEvent(projectId: string, value: SaveEventDefinition): Promise<EventDefinition>
  deleteEvent(projectId: string, id: string): Promise<void>
  getUserAttributeSchema(projectId: string): Promise<UserAttributeSchema>
  createUserAttributeDefinition(projectId: string, value: UserAttributeDefinitionInput): Promise<UserAttributeMutation>
  updateUserAttributeDefinition(projectId: string, id: string, value: UpdateUserAttributeDefinitionInput): Promise<UserAttributeMutation>
  deleteUserAttributeDefinition(projectId: string, id: string): Promise<UserAttributeMutation>
  getScenarios(projectId: string): Promise<Scenario[]>
  getActionDefinitions(projectId: string): Promise<ScenarioActionDefinition[]>
  saveScenario(projectId: string, value: SaveScenario): Promise<Scenario>
  deleteScenario(projectId: string, id: string): Promise<void>
  getUsers(projectId: string): Promise<EndUser[]>
  getSessions(projectId: string): Promise<ActiveSession[]>
  getActivity(userId?: string): Promise<ActivityItem[]>
  getConversations(projectId: string, userId: string, request?: CursorPageRequest): Promise<CursorPage<Conversation>>
  getMessages(projectId: string, userId: string, conversationId: string, request?: CursorPageRequest): Promise<CursorPage<ConversationMessage>>
  sendAction(session: ActiveSession, action: ManualAction): Promise<{ commandId: string; status: string }>
  getEventLogs(projectId: string): Promise<EventLog[]>
  getEventLogPage(projectId: string, filters?: EventLogFilters): Promise<CursorPage<EventLog>>
  getEventLog(projectId: string, eventId: string): Promise<EventLog>
  getScenarioRuns(projectId: string): Promise<ScenarioRun[]>
  getAuditLogs(projectId: string): Promise<AuditLog[]>
  sendAdminMessage(projectId: string, userId: string, message: AdminMessageRequest): Promise<AdminMessageResult>
  getStats(projectId: string): Promise<DashboardStats>
}

export class UnsupportedRepositoryCapabilityError extends Error {
  constructor(capability: keyof RepositoryCapabilities) {
    super(`Backend capability "${capability}" is not available`)
    this.name = 'UnsupportedRepositoryCapabilityError'
  }
}
