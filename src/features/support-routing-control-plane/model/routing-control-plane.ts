export type RoutingSection = "overview" | "identities" | "workforce" | "queues" | "policies" | "decisions";
export type Lifecycle = "ACTIVE" | "ARCHIVED";
export type RoutingMode = "MANUAL" | "OFFER" | "AUTO_ASSIGN";
export type ReadinessStatus = "READY" | "BLOCKING" | "DEGRADED";

export interface RoutingIdentity {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  kind?: string | null;
  lifecycle: Lifecycle;
  version: number;
}

export interface RoutingOperator {
  id: string;
  name: string;
  state: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  maxCapacityUnits: number;
  teamIds: string[];
  skills: Array<{ skillId: string; proficiency: number; preferred: boolean }>;
  languages: Array<{ languageTag: string; proficiency: "WORKING" | "FLUENT" | "NATIVE"; preferred: boolean }>;
  availability: "AVAILABLE" | "BUSY" | "OFFLINE" | "UNKNOWN";
}

export interface WorkforceConfiguration {
  teams: Array<{
    teamId: string;
    members: string[];
    skills: Array<{ skillId: string; requirement: "REQUIRED" | "PREFERRED"; minimumProficiency?: number }>;
    languages: Array<{ languageTag: string; requirement: "REQUIRED" | "PREFERRED"; minimumProficiency?: number }>;
  }>;
  operators: Array<{
    cmsUserId: string;
    maxCapacityUnits: number;
    skills: Array<{ skillId: string; proficiency: number; preferred?: boolean }>;
    languages: Array<{ languageTag: string; proficiency: "WORKING" | "FLUENT" | "NATIVE"; preferred?: boolean }>;
  }>;
}

export interface WorkforceState {
  actionEtag: string;
  rootVersion: number;
  currentRevisionNumber: number;
  draft: null | { generation: number; version: number; contentHash: string; configuration: WorkforceConfiguration };
  published: null | { id: string; revisionNumber: number; publishedAt: string; configuration: WorkforceConfiguration };
}

export type QueuePredicate =
  | { kind: "AND" | "OR"; children: QueuePredicate[] }
  | { kind: "NOT"; child: QueuePredicate }
  | { kind: "ENUM_IN"; field: "STATUS" | "PRIORITY" | "IMPACT" | "URGENCY" | "TOPIC_GROUP" | "LANGUAGE" | "ASSIGNMENT_STATE" | "SLA_RISK" | "SLA_CLOCK_KIND" | "BREACH_STATE"; values: string[] }
  | { kind: "ID_IN"; field: "ASSIGNED_TEAM_ID" | "ASSIGNED_OPERATOR_ID"; values: string[] }
  | { kind: "BOOLEAN"; field: "ADMIN_ATTENTION_REQUIRED" | "DEGRADED" | "ACTIONABLE"; value: boolean }
  | { kind: "TIME_RANGE"; field: "CREATED_AT" | "LAST_ACTIVITY_AT" | "WAITING_SINCE" | "REOPENED_AT" | "SLA_DUE_AT"; from: string | null; to: string | null }
  | { kind: "RELATIVE_WINDOW"; field: "UNASSIGNED_AGE" | "WAITING_AGE" | "SLA_DUE_IN" | "RESOLVED_AGE"; days: number };

export interface QueueDraft {
  displayName: string;
  description: string | null;
  visibility: { kind: "PROJECT" | "TEAMS"; teamIds: string[] };
  filter: { schemaVersion: 1; predicate: QueuePredicate };
  sort: Array<{ field: "EFFECTIVE_PRIORITY" | "SLA_DUE_AT" | "ELIGIBLE_SINCE" | "LAST_ACTIVITY_AT" | "CREATED_AT"; direction: "ASC" | "DESC" }>;
  routing: { mode: RoutingMode; primaryTeamIds: string[]; fallbackTeamIds: string[] };
}

export interface RoutingQueue {
  id: string;
  code: string;
  kind?: "SYSTEM" | "PROJECT";
  name: string;
  description: string | null;
  lifecycle: Lifecycle;
  version: number;
  actionEtag: string;
  detailLoaded: boolean;
  draft: null | { generation: number; version: number; configuration: QueueDraft };
  published: null | { id: string; revisionNumber: number; publishedAt: string };
}

export interface PolicyDraft {
  mandatorySkills: string[];
  preferredSkills: string[];
  mandatoryLanguages: string[];
  preferredLanguages: string[];
  capacityWeightUnits: number;
  hardUtilizationPercent: number;
  weights: { skill: number; language: number; load: number; continuity: number; idle: number };
  queueWeights: { sla: number; priority: number; escalation: number; age: number };
  timeouts: { offerSeconds: number; reservationSeconds: number };
  retry: { maxAttempts: number; cooldownSeconds: number; fallbackDelaySeconds: number };
}

export interface RoutingPolicy {
  id: string;
  code: string;
  lifecycle: Lifecycle;
  version: number;
  actionEtag: string;
  detailLoaded: boolean;
  draft: null | { generation: number; version: number; configuration: PolicyDraft };
  published: null | { id: string; revisionNumber: number; publishedAt: string; configuration: PolicyDraft };
}

export interface RoutingSlot { queueId: string; policyId: string; routePriority: number; version: number; actionEtag: string }
export interface RoutingCheck { code: string; status: "PASS" | "BLOCKING" | "DEGRADED"; resourceId: string | null; observedVersion: number | null }
export interface RoutingReadiness {
  queueId: string;
  status: ReadinessStatus;
  allowedTargetModes: Array<"OFFER" | "AUTO_ASSIGN">;
  candidateCount: number | null;
  checks: RoutingCheck[];
  activation: null | { mode: RoutingMode; version: number; activatedAt: string };
}

export interface ShadowRun {
  id: string;
  state: "QUEUED" | "RUNNING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "FAILED";
  requested: number;
  accepted: number;
  pending: number;
  completed: number;
  failed: number;
  createdAt: string;
  completedAt: string | null;
}

export interface RoutingDecision {
  id: string;
  caseId: string;
  mode: string;
  outcome: string;
  queueId: string | null;
  policyId: string | null;
  selectedTeamId: string | null;
  selectedOperatorId: string | null;
  candidateCount: number;
  excludedCount: number;
  latencyMs: number;
  evaluatedAt: string;
  pins: { queueRevisionId: string | null; policyRevisionId: string | null; workforceRevisionId: string | null };
}

export interface RoutingDecisionCandidate {
  rank: number;
  operatorId: string;
  eligible: boolean;
  exclusions: string[];
  score: Record<string, number>;
  factVersions: Record<string, string | number | null>;
}

export interface RoutingDecisionDetail extends RoutingDecision {
  candidates: RoutingDecisionCandidate[];
  inputManifest: Record<string, unknown>;
  sourceVector: Record<string, unknown>;
}

export interface RoutingAuditEvent {
  id: string;
  eventType: string;
  occurredAt: string;
  actorName: string;
  outcome: string;
  reason: string | null;
  reasonCode: string | null;
  oldRevisionId: string | null;
  newRevisionId: string | null;
}

export interface RoutingRevision {
  id: string;
  revisionNumber: number;
  publishedAt: string;
  publisherName: string;
  contentHash: string;
}

export interface RoutingRevisionDiff {
  fromRevision: number;
  toRevision: number;
  sections: string[];
  summary: string;
}

export interface RoutingWorkspaceSnapshot {
  teams: RoutingIdentity[];
  skills: RoutingIdentity[];
  operators: RoutingOperator[];
  workforce: WorkforceState;
  queues: RoutingQueue[];
  policies: RoutingPolicy[];
  slots: RoutingSlot[];
  /** OCC token of the Queue Slot catalog, used when a Queue has no slot yet. */
  slotActionEtag: string;
  readiness: RoutingReadiness[];
  activationsTruncated: boolean;
  readinessTruncated: boolean;
  catalogCursors: { teams: string | null; skills: string | null; operators: string | null; queues: string | null; slots: string | null };
}

export interface RoutingReadAccess {
  teams: boolean;
  teamsManage: boolean;
  availability: boolean;
  queues: boolean;
  routing: boolean;
}

export interface RoutingCommandContext { actionEtag?: string; idempotencyKey: string; signal?: AbortSignal }

export interface RoutingControlPlaneSource {
  load(projectId: string, access: RoutingReadAccess, signal?: AbortSignal): Promise<RoutingWorkspaceSnapshot>;
  queue(projectId: string, queueId: string, signal?: AbortSignal): Promise<RoutingQueue>;
  policy(projectId: string, policyId: string, signal?: AbortSignal): Promise<RoutingPolicy>;
  listDecisions(projectId: string, signal?: AbortSignal, cursor?: string): Promise<{ items: RoutingDecision[]; nextCursor: string | null }>;
  loadMoreCatalog(projectId: string, kind: "teams" | "skills" | "operators" | "queues" | "slots", cursor: string, signal?: AbortSignal, canManageTeams?: boolean, canReadAvailability?: boolean): Promise<{ items: Array<RoutingIdentity | RoutingOperator | RoutingQueue | RoutingSlot>; nextCursor: string | null; actionEtag?: string }>;
  decision(projectId: string, decisionId: string, signal?: AbortSignal): Promise<RoutingDecisionDetail>;
  createTeam(projectId: string, value: { code: string; name: string }, context: RoutingCommandContext): Promise<void>;
  createSkill(projectId: string, value: { code: string; name: string; kind: "GENERAL" | "SAFETY" | "CHANNEL" }, context: RoutingCommandContext): Promise<void>;
  renameIdentity(projectId: string, kind: "TEAM" | "SKILL", id: string, value: { name: string; expectedVersion: number }, context: RoutingCommandContext): Promise<void>;
  archiveIdentity(projectId: string, kind: "TEAM" | "SKILL", id: string, value: { expectedVersion: number; reason: string }, context: RoutingCommandContext): Promise<void>;
  saveWorkforce(projectId: string, configuration: WorkforceConfiguration, context: RoutingCommandContext): Promise<void>;
  discardWorkforce(projectId: string, context: RoutingCommandContext): Promise<void>;
  publishWorkforce(projectId: string, context: RoutingCommandContext): Promise<void>;
  createQueue(projectId: string, code: string, draft: QueueDraft, context: RoutingCommandContext): Promise<void>;
  saveQueue(projectId: string, queueId: string, draft: QueueDraft, context: RoutingCommandContext): Promise<void>;
  previewQueue(projectId: string, queueId: string, sampleLimit: number, signal?: AbortSignal): Promise<{ count: number; exact: boolean; lowerBound: number | null; caseIds: string[]; diagnostics: string[]; evaluatedAt: string; sourceHighWater: Record<string, unknown> }>;
  publishQueue(projectId: string, queueId: string, context: RoutingCommandContext): Promise<void>;
  createPolicy(projectId: string, code: string, draft: PolicyDraft, context: RoutingCommandContext): Promise<void>;
  savePolicy(projectId: string, policyId: string, draft: PolicyDraft, context: RoutingCommandContext): Promise<void>;
  publishPolicy(projectId: string, policyId: string, context: RoutingCommandContext): Promise<void>;
  bind(projectId: string, queueId: string, policyId: string, routePriority: number, context: RoutingCommandContext): Promise<void>;
  runShadow(projectId: string, limit: number, context: RoutingCommandContext): Promise<ShadowRun>;
  shadowRun(projectId: string, runId: string, signal?: AbortSignal): Promise<ShadowRun>;
  shadowRunDecisionIds(projectId: string, runId: string, signal?: AbortSignal): Promise<string[]>;
  activate(projectId: string, queueId: string, targetMode: "DISABLED" | "OFFER" | "AUTO_ASSIGN", expectedActivationVersion: number, reasonCode: string, context: RoutingCommandContext): Promise<void>;
  audit(projectId: string, resourceType: "SUPPORT_QUEUE" | "SUPPORT_QUEUE_ROUTING" | "SUPPORT_ROUTING_POLICY" | "SUPPORT_WORKFORCE", resourceId: string, signal?: AbortSignal): Promise<RoutingAuditEvent[]>;
  revisions(projectId: string, kind: "QUEUE" | "POLICY" | "WORKFORCE", resourceId?: string, signal?: AbortSignal): Promise<RoutingRevision[]>;
  revisionDiff(projectId: string, kind: "QUEUE" | "POLICY" | "WORKFORCE", fromRevisionId: string, toRevisionId: string, resourceId?: string, signal?: AbortSignal): Promise<RoutingRevisionDiff>;
  restoreRevision(projectId: string, kind: "QUEUE" | "POLICY" | "WORKFORCE", revisionId: string, resourceId: string | undefined, reasonCode: "CONFIGURATION_REGRESSION" | "INCIDENT_RECOVERY" | "OPERATOR_REQUEST" | "OTHER", context: RoutingCommandContext): Promise<void>;
}

export const emptyPolicyDraft = (): PolicyDraft => ({
  mandatorySkills: [], preferredSkills: [], mandatoryLanguages: [], preferredLanguages: [],
  capacityWeightUnits: 1, hardUtilizationPercent: 90,
  weights: { skill: 40, language: 20, load: 20, continuity: 10, idle: 10 },
  queueWeights: { sla: 40, priority: 30, escalation: 20, age: 10 },
  timeouts: { offerSeconds: 45, reservationSeconds: 90 },
  retry: { maxAttempts: 3, cooldownSeconds: 30, fallbackDelaySeconds: 10 },
});

export const emptyQueueDraft = (name = "Новая очередь"): QueueDraft => ({
  displayName: name, description: null,
  visibility: { kind: "PROJECT", teamIds: [] },
  filter: { schemaVersion: 1, predicate: { kind: "AND", children: [{ kind: "ENUM_IN", field: "STATUS", values: ["OPEN"] }] } },
  sort: [{ field: "EFFECTIVE_PRIORITY", direction: "DESC" }],
  routing: { mode: "MANUAL", primaryTeamIds: [], fallbackTeamIds: [] },
});

export function labelUnknown(value: string, labels: Record<string, string>): string {
  return labels[value] ?? `Неизвестное состояние · ${value}`;
}

export function routingPolicyLabel(
  policy: Pick<RoutingPolicy, "code"> | null | undefined,
): string {
  if (!policy) return "Не настроена";
  return policy.code === "balanced" ? "Сбалансированная" : policy.code;
}

const SYSTEM_QUEUE_PRESENTATIONS: Record<string, { label: string; purpose: string }> = {
  unassigned: {
    label: "Без исполнителя",
    purpose: "Новые обращения, которым ещё не назначен оператор",
  },
  "waiting-admin": {
    label: "Ожидают администратора",
    purpose: "Обращения, где требуется решение администратора",
  },
  "sla-at-risk": {
    label: "Риск нарушения SLA",
    purpose: "Обращения с приближающимся или нарушенным сроком",
  },
  urgent: {
    label: "Срочные обращения",
    purpose: "Обращения с высоким приоритетом или срочностью",
  },
  "recently-resolved": {
    label: "Недавно решённые",
    purpose: "Недавно закрытые обращения для контроля результата",
  },
  unmapped: {
    label: "Без маршрута",
    purpose: "Обращения, которые не попали ни в одну рабочую очередь",
  },
  degraded: {
    label: "Проблемы обработки",
    purpose: "Обращения, обработанные с ограничениями или ошибками",
  },
};

export function routingQueueLabel(
  queue: Pick<RoutingQueue, "code" | "name" | "kind">,
): string {
  if (queue.kind === "SYSTEM" || queue.name === queue.code) {
    return SYSTEM_QUEUE_PRESENTATIONS[queue.code]?.label ?? queue.name ?? queue.code;
  }
  return queue.name || queue.code;
}

export function routingQueuePurpose(
  queue: Pick<RoutingQueue, "code" | "description" | "kind">,
): string {
  return queue.description ||
    (queue.kind === "SYSTEM" ? SYSTEM_QUEUE_PRESENTATIONS[queue.code]?.purpose : undefined) ||
    "Пользовательская выборка обращений";
}
