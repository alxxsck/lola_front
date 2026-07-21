import type {
  ActiveSession,
  ActivityItem,
  CmsUser,
  Conversation,
  ConversationMessage,
  ConversationAISuspensionDetail,
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
  ActivitySettings,
  UpdateActivitySettings,
} from "@/shared/types/domain";
import type {
  ConversationAISuspensionHistoryItemResponseDto,
  ExtendConversationAISuspensionDto,
  ResumeConversationAIDto,
  StartConversationAISuspensionDto,
} from "@/shared/api/generated/models";

export type RepositoryMode = "mock" | "api";

export interface RepositoryCapabilities {
  projectSettings: boolean;
  projectMembers: boolean;
  users: boolean;
  uiElements: boolean;
  eventDefinitions: boolean;
  scenarios: boolean;
  actionDefinitions: boolean;
  presence: boolean;
  activity: boolean;
  conversations: boolean;
  manualActions: boolean;
  operations: boolean;
  auditLogs: boolean;
  adminMessaging: boolean;
  userAttributes: boolean;
}

type UiElementCreateBase = Pick<UiElement, "name" | "code"> &
  Partial<Pick<UiElement, "config" | "enabled" | "aiEnabled" | "aiAliases">> & {
    aiDescription?: string;
    auditReason?: string;
  };
export type CreateUiElement = UiElementCreateBase &
  (
    | { kind: "ELEMENT" | "BUTTON"; selector?: string }
    | { kind: "PAGE"; route: string }
    | { kind: "MODAL"; modalName: string }
  );
export type UpdateUiElement = Partial<
  Pick<
    UiElement,
    | "name"
    | "code"
    | "kind"
    | "selector"
    | "route"
    | "modalName"
    | "config"
    | "enabled"
    | "aiEnabled"
    | "aiDescription"
    | "aiAliases"
  >
> & { auditReason?: string };
export type SaveScenario = Partial<Scenario> &
  Pick<Scenario, "name" | "code" | "eventDefinitionId" | "actions">;
export type UpdateScenarioMetadata = Partial<
  Pick<
    Scenario,
    | "name"
    | "description"
    | "eventDefinitionId"
    | "status"
    | "conversationPolicy"
    | "priority"
    | "conditions"
    | "cooldownSeconds"
    | "maxRunsPerUser"
    | "activeFrom"
    | "activeTo"
  >
>;
export type CreateProjectMember = Pick<CmsUser, "email" | "role"> & {
  name?: string;
};

export interface CursorPageRequest {
  cursor?: string;
  limit?: number;
  eventDefinitionKeyId?: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ConversationAISuspensionMutationResult {
  state: ConversationAISuspensionDetail;
  replayed: boolean;
  inFlightCancellation?: {
    status?: "NOT_REQUIRED" | "REQUESTED";
    messageIds?: string[];
    voiceSessionIds?: string[];
  };
}

export interface PageRequest {
  page?: number;
  limit?: number;
}

export interface PageInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Page<T> {
  items: T[];
  pagination: PageInfo;
}

export interface EventLogsPageRequest extends PageRequest {
  search?: string;
  status?: EventLogStatus;
}

export interface UserAttributeDefinitionInput {
  key: string;
  label: string;
  description?: string;
  type: UserAttributeType;
  required?: boolean;
  clientVisible?: boolean;
  validation?: UserAttributeValidation;
  enabled?: boolean;
  position?: number;
}

export type UpdateUserAttributeDefinitionInput = Partial<
  Omit<UserAttributeDefinitionInput, "key" | "type" | "description">
> & { description?: string | null };

export interface EventLogFilters extends CursorPageRequest {
  eventCode?: string[];
  externalUserId?: string;
  source?: EventLog["source"][];
  status?: EventLogStatus[];
  receivedFrom?: string;
  receivedTo?: string;
  occurredFrom?: string;
  occurredTo?: string;
}

export interface LolaRepository {
  readonly mode: RepositoryMode;
  readonly capabilities: RepositoryCapabilities;
  getProject(projectId: string): Promise<Project>;
  updateProject(projectId: string, patch: Partial<Project>): Promise<Project>;
  getMembers(projectId: string): Promise<CmsUser[]>;
  createMember(
    projectId: string,
    member: CreateProjectMember,
  ): Promise<CmsUser>;
  deleteMember(projectId: string, memberId: string): Promise<void>;
  getElements(projectId: string): Promise<UiElement[]>;
  createElement(projectId: string, value: CreateUiElement): Promise<UiElement>;
  updateElement(
    projectId: string,
    id: string,
    value: UpdateUiElement,
  ): Promise<UiElement>;
  deleteElement(projectId: string, id: string): Promise<void>;
  getEvents(projectId: string): Promise<EventDefinition[]>;
  getUserAttributeSchema(projectId: string): Promise<UserAttributeSchema>;
  createUserAttributeDefinition(
    projectId: string,
    value: UserAttributeDefinitionInput,
  ): Promise<UserAttributeMutation>;
  updateUserAttributeDefinition(
    projectId: string,
    id: string,
    value: UpdateUserAttributeDefinitionInput,
  ): Promise<UserAttributeMutation>;
  deleteUserAttributeDefinition(
    projectId: string,
    id: string,
  ): Promise<UserAttributeMutation>;
  getScenarios(projectId: string): Promise<Scenario[]>;
  getActionDefinitions(projectId: string): Promise<ScenarioActionDefinition[]>;
  saveScenario(projectId: string, value: SaveScenario): Promise<Scenario>;
  updateScenarioMetadata(
    projectId: string,
    scenarioId: string,
    value: UpdateScenarioMetadata,
  ): Promise<Scenario>;
  deleteScenario(projectId: string, id: string): Promise<void>;
  getUsers(projectId: string): Promise<EndUser[]>;
  getUsersPage(
    projectId: string,
    request?: CursorPageRequest,
  ): Promise<CursorPage<EndUser>>;
  getSessions(projectId: string): Promise<ActiveSession[]>;
  getActivity(userId?: string): Promise<ActivityItem[]>;
  getConversations(
    projectId: string,
    userId: string,
    request?: CursorPageRequest,
  ): Promise<CursorPage<Conversation>>;
  getConversation(
    projectId: string,
    userId: string,
    conversationId: string,
  ): Promise<Conversation>;
  getMessages(
    projectId: string,
    userId: string,
    conversationId: string,
    request?: CursorPageRequest,
  ): Promise<CursorPage<ConversationMessage>>;
  getConversationAISuspension(
    projectId: string,
    endUserId: string,
    conversationId: string,
  ): Promise<ConversationAISuspensionDetail>;
  startConversationAISuspension(
    projectId: string,
    endUserId: string,
    conversationId: string,
    command: StartConversationAISuspensionDto,
    idempotencyKey: string,
  ): Promise<ConversationAISuspensionMutationResult>;
  extendConversationAISuspension(
    projectId: string,
    endUserId: string,
    conversationId: string,
    command: ExtendConversationAISuspensionDto,
    idempotencyKey: string,
  ): Promise<ConversationAISuspensionMutationResult>;
  resumeConversationAI(
    projectId: string,
    endUserId: string,
    conversationId: string,
    command: ResumeConversationAIDto,
    idempotencyKey: string,
  ): Promise<ConversationAISuspensionMutationResult>;
  getConversationAISuspensionHistory(
    projectId: string,
    endUserId: string,
    conversationId: string,
    request?: CursorPageRequest,
  ): Promise<CursorPage<ConversationAISuspensionHistoryItemResponseDto>>;
  sendAction(
    session: ActiveSession,
    action: ManualAction,
  ): Promise<{ commandId: string; status: string }>;
  getEventLogs(
    projectId: string,
    request?: EventLogsPageRequest,
  ): Promise<Page<EventLog>>;
  getEventLogPage(
    projectId: string,
    filters?: EventLogFilters,
  ): Promise<CursorPage<EventLog>>;
  getEventLog(projectId: string, eventId: string): Promise<EventLog>;
  getScenarioRuns(projectId: string): Promise<ScenarioRun[]>;
  getScenarioRunsPage(
    projectId: string,
    request?: CursorPageRequest,
  ): Promise<CursorPage<ScenarioRun>>;
  getActivitySettings(projectId: string): Promise<ActivitySettings>;
  updateActivitySettings(
    projectId: string,
    value: UpdateActivitySettings,
  ): Promise<ActivitySettings>;
  getAuditLogs(projectId: string): Promise<AuditLog[]>;
  sendAdminMessage(
    projectId: string,
    userId: string,
    message: AdminMessageRequest,
  ): Promise<AdminMessageResult>;
  getStats(projectId: string): Promise<DashboardStats>;
}

export class UnsupportedRepositoryCapabilityError extends Error {
  constructor(capability: keyof RepositoryCapabilities) {
    super(`Backend capability "${capability}" is not available`);
    this.name = "UnsupportedRepositoryCapabilityError";
  }
}
