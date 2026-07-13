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
}

export type SaveUiElement = Partial<UiElement> & Pick<UiElement, 'name' | 'code' | 'kind'>
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

export interface LolaRepository {
  readonly mode: RepositoryMode
  readonly capabilities: RepositoryCapabilities
  getProject(projectId: string): Promise<Project>
  updateProject(projectId: string, patch: Partial<Project>): Promise<Project>
  getMembers(projectId: string): Promise<CmsUser[]>
  createMember(projectId: string, member: CreateProjectMember): Promise<CmsUser>
  deleteMember(projectId: string, memberId: string): Promise<void>
  getElements(projectId: string): Promise<UiElement[]>
  saveElement(projectId: string, value: SaveUiElement): Promise<UiElement>
  deleteElement(projectId: string, id: string): Promise<void>
  getEvents(projectId: string): Promise<EventDefinition[]>
  saveEvent(projectId: string, value: SaveEventDefinition): Promise<EventDefinition>
  deleteEvent(projectId: string, id: string): Promise<void>
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
