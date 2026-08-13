import { ApiError } from '@/shared/api/http/api-error';
import type {
  PolicyDraft,
  QueueDraft,
  RoutingAuditEvent,
  RoutingControlPlaneSource,
  RoutingDecision,
  RoutingDecisionDetail,
  RoutingWorkspaceSnapshot,
  ShadowRun,
  WorkforceConfiguration,
} from '../model/routing-control-plane';
import { emptyPolicyDraft, emptyQueueDraft } from '../model/routing-control-plane';

const teamSupport = 'team-support';
const teamVip = 'team-vip';
const skillBilling = 'skill-billing';
const skillTechnical = 'skill-technical';
const workforceConfiguration: WorkforceConfiguration = {
  teams: [
    {
      teamId: teamSupport,
      members: ['operator-anna', 'operator-mikhail'],
      skills: [{ skillId: skillTechnical, requirement: 'REQUIRED', minimumProficiency: 2 }],
      languages: [{ languageTag: 'ru', requirement: 'REQUIRED', minimumProficiency: 2 }],
    },
    {
      teamId: teamVip,
      members: ['operator-anna'],
      skills: [{ skillId: skillBilling, requirement: 'PREFERRED', minimumProficiency: 2 }],
      languages: [],
    },
  ],
  operators: [
    {
      cmsUserId: 'operator-anna',
      maxCapacityUnits: 8,
      skills: [
        { skillId: skillTechnical, proficiency: 4, preferred: true },
        { skillId: skillBilling, proficiency: 3 },
      ],
      languages: [
        { languageTag: 'ru', proficiency: 'NATIVE', preferred: true },
        { languageTag: 'en', proficiency: 'FLUENT' },
      ],
    },
    {
      cmsUserId: 'operator-mikhail',
      maxCapacityUnits: 6,
      skills: [{ skillId: skillTechnical, proficiency: 3 }],
      languages: [{ languageTag: 'ru', proficiency: 'NATIVE', preferred: true }],
    },
  ],
};

const initialQueueDraft: QueueDraft = {
  ...emptyQueueDraft('Срочные обращения'),
  description: 'Открытые обращения с высоким риском нарушения срока',
  routing: { mode: 'AUTO_ASSIGN', primaryTeamIds: [teamSupport], fallbackTeamIds: [teamVip] },
  filter: {
    schemaVersion: 1,
    predicate: {
      kind: 'AND',
      children: [
        { kind: 'ENUM_IN', field: 'STATUS', values: ['OPEN', 'IN_PROGRESS'] },
        { kind: 'ENUM_IN', field: 'SLA_RISK', values: ['AT_RISK', 'BREACHED'] },
      ],
    },
  },
};

const initialPolicyDraft: PolicyDraft = {
  ...emptyPolicyDraft(),
  mandatorySkills: [skillTechnical],
  mandatoryLanguages: ['ru'],
};

function initialSnapshot(): RoutingWorkspaceSnapshot {
  return {
    teams: [
      {
        id: teamSupport,
        code: 'support',
        name: 'Основная поддержка',
        lifecycle: 'ACTIVE',
        version: 2,
      },
      { id: teamVip, code: 'vip', name: 'Приоритетные клиенты', lifecycle: 'ACTIVE', version: 1 },
    ],
    skills: [
      {
        id: skillTechnical,
        code: 'technical',
        name: 'Технические вопросы',
        kind: 'TECHNICAL',
        lifecycle: 'ACTIVE',
        version: 1,
      },
      {
        id: skillBilling,
        code: 'billing',
        name: 'Оплата и тарифы',
        kind: 'PROCESS',
        lifecycle: 'ACTIVE',
        version: 1,
      },
    ],
    operators: [
      {
        id: 'operator-anna',
        name: 'Анна Крылова',
        state: 'ACTIVE',
        availability: 'AVAILABLE',
        maxCapacityUnits: 8,
        teamIds: [teamSupport, teamVip],
        skills: workforceConfiguration.operators[0]!.skills.map((item) => ({
          ...item,
          preferred: item.preferred ?? false,
        })),
        languages: workforceConfiguration.operators[0]!.languages.map((item) => ({
          ...item,
          preferred: item.preferred ?? false,
        })),
      },
      {
        id: 'operator-mikhail',
        name: 'Михаил Орлов',
        state: 'ACTIVE',
        availability: 'BUSY',
        maxCapacityUnits: 6,
        teamIds: [teamSupport],
        skills: workforceConfiguration.operators[1]!.skills.map((item) => ({
          ...item,
          preferred: item.preferred ?? false,
        })),
        languages: workforceConfiguration.operators[1]!.languages.map((item) => ({
          ...item,
          preferred: item.preferred ?? false,
        })),
      },
    ],
    workforce: {
      actionEtag: '"mock-workforce-4"',
      rootVersion: 4,
      currentRevisionNumber: 3,
      draft: null,
      published: {
        id: 'workforce-revision-3',
        revisionNumber: 3,
        publishedAt: '2026-08-12T07:20:00.000Z',
        configuration: structuredClone(workforceConfiguration),
      },
    },
    queues: [
      {
        id: 'queue-urgent',
        code: 'urgent',
        kind: 'SYSTEM',
        name: initialQueueDraft.displayName,
        description: initialQueueDraft.description,
        lifecycle: 'ACTIVE',
        version: 4,
        actionEtag: '"mock-queue-4"',
        draft: null,
        detailLoaded: true,
        published: {
          id: 'queue-revision-4',
          revisionNumber: 4,
          publishedAt: '2026-08-12T07:30:00.000Z',
        },
      },
    ],
    policies: [
      {
        id: 'policy-balanced',
        code: 'balanced',
        lifecycle: 'ACTIVE',
        version: 3,
        actionEtag: '"mock-policy-3"',
        draft: null,
        detailLoaded: true,
        published: {
          id: 'policy-revision-3',
          revisionNumber: 3,
          publishedAt: '2026-08-12T07:35:00.000Z',
          configuration: structuredClone(initialPolicyDraft),
        },
      },
    ],
    slots: [
      {
        queueId: 'queue-urgent',
        policyId: 'policy-balanced',
        routePriority: 10,
        version: 2,
        actionEtag: '"mock-slot-2"',
      },
    ],
    slotActionEtag: '"mock-slot-catalog-2"',
    readiness: [
      {
        queueId: 'queue-urgent',
        status: 'READY',
        allowedTargetModes: ['OFFER', 'AUTO_ASSIGN'],
        candidateCount: 2,
        checks: [
          {
            code: 'WORKFORCE_PUBLISHED',
            status: 'PASS',
            resourceId: 'workforce-revision-3',
            observedVersion: 3,
          },
          {
            code: 'QUEUE_PUBLISHED',
            status: 'PASS',
            resourceId: 'queue-revision-4',
            observedVersion: 4,
          },
          {
            code: 'POLICY_PUBLISHED',
            status: 'PASS',
            resourceId: 'policy-revision-3',
            observedVersion: 3,
          },
          {
            code: 'QUEUE_SLOT_CONFIGURED',
            status: 'PASS',
            resourceId: 'queue-urgent',
            observedVersion: 2,
          },
          {
            code: 'CANDIDATE_SET_AVAILABLE',
            status: 'PASS',
            resourceId: teamSupport,
            observedVersion: 2,
          },
        ],
        activation: { mode: 'OFFER', version: 2, activatedAt: '2026-08-12T07:45:00.000Z' },
      },
    ],
    activationsTruncated: false,
    readinessTruncated: false,
    catalogCursors: { teams: null, skills: null, operators: null, queues: null, slots: null },
  };
}

let snapshots = new Map<string, RoutingWorkspaceSnapshot>();
const runs = new Map<string, ShadowRun>();
const receipts = new Map<string, string>();

const decisions: RoutingDecisionDetail[] = [
  {
    id: 'decision-1042',
    caseId: '1042',
    mode: 'LIVE',
    outcome: 'SELECTED',
    queueId: 'queue-urgent',
    policyId: 'policy-balanced',
    selectedTeamId: teamSupport,
    selectedOperatorId: 'operator-anna',
    candidateCount: 2,
    excludedCount: 0,
    latencyMs: 38,
    evaluatedAt: '2026-08-12T08:04:21.000Z',
    pins: {
      queueRevisionId: 'queue-revision-4',
      policyRevisionId: 'policy-revision-3',
      workforceRevisionId: 'workforce-revision-3',
    },
    candidates: [
      {
        rank: 1,
        operatorId: 'operator-anna',
        eligible: true,
        exclusions: [],
        score: { skill: 40, language: 20, load: 18, continuity: 10, idle: 8, total: 96 },
        factVersions: { workforce: 3, availability: 17, assignmentLoad: 9 },
      },
      {
        rank: 2,
        operatorId: 'operator-mikhail',
        eligible: true,
        exclusions: [],
        score: { skill: 30, language: 20, load: 12, continuity: 8, idle: 7, total: 77 },
        factVersions: { workforce: 3, availability: 21, assignmentLoad: 12 },
      },
    ],
    inputManifest: { caseVersion: 8, queueRoutePriority: 10, caseRank: 1 },
    sourceVector: { queueRevisionNumber: 4, policyRevisionNumber: 3, workforceRevisionNumber: 3 },
  },
  {
    id: 'decision-1038',
    caseId: '1038',
    mode: 'SHADOW',
    outcome: 'NO_ELIGIBLE_OPERATOR',
    queueId: 'queue-urgent',
    policyId: 'policy-balanced',
    selectedTeamId: null,
    selectedOperatorId: null,
    candidateCount: 2,
    excludedCount: 2,
    latencyMs: 44,
    evaluatedAt: '2026-08-12T07:58:12.000Z',
    pins: {
      queueRevisionId: 'queue-revision-4',
      policyRevisionId: 'policy-revision-3',
      workforceRevisionId: 'workforce-revision-3',
    },
    candidates: [
      {
        rank: 1,
        operatorId: 'operator-anna',
        eligible: false,
        exclusions: ['CAPACITY_EXHAUSTED'],
        score: { total: 0 },
        factVersions: { workforce: 3, availability: 16 },
      },
      {
        rank: 2,
        operatorId: 'operator-mikhail',
        eligible: false,
        exclusions: ['AVAILABILITY_NOT_ROUTABLE'],
        score: { total: 0 },
        factVersions: { workforce: 3, availability: 20 },
      },
    ],
    inputManifest: { caseVersion: 5, queueRoutePriority: 10, caseRank: 2 },
    sourceVector: { queueRevisionNumber: 4, policyRevisionNumber: 3, workforceRevisionNumber: 3 },
  },
];

function snapshot(projectId: string): RoutingWorkspaceSnapshot {
  const value = snapshots.get(projectId) ?? initialSnapshot();
  snapshots.set(projectId, value);
  return value;
}

function retain(context: { idempotencyKey: string }, fingerprint: string): boolean {
  const prior = receipts.get(context.idempotencyKey);
  if (prior && prior !== fingerprint)
    throw new ApiError(
      409,
      'Ключ команды уже использован',
      undefined,
      undefined,
      'IDEMPOTENCY_KEY_REUSED',
    );
  if (prior) return false;
  receipts.set(context.idempotencyKey, fingerprint);
  return true;
}

function verify(actual: string, expected?: string): void {
  if (expected && expected !== actual)
    throw new ApiError(
      409,
      'Состояние изменилось на сервере',
      undefined,
      undefined,
      'VERSION_CONFLICT',
    );
}

function refreshReadiness(value: RoutingWorkspaceSnapshot, queueId: string): void {
  const queue = value.queues.find((item) => item.id === queueId);
  const slot = value.slots.find((item) => item.queueId === queueId);
  const policy = value.policies.find((item) => item.id === slot?.policyId);
  const checks = [
    ['WORKFORCE_PUBLISHED', Boolean(value.workforce.published)],
    ['QUEUE_PUBLISHED', Boolean(queue?.published)],
    ['POLICY_PUBLISHED', Boolean(policy?.published)],
    ['QUEUE_SLOT_CONFIGURED', Boolean(slot)],
  ] as const;
  const current = value.readiness.find((item) => item.queueId === queueId);
  const next = {
    queueId,
    status: checks.every(([, pass]) => pass) ? ('READY' as const) : ('BLOCKING' as const),
    allowedTargetModes: checks.every(([, pass]) => pass)
      ? (['OFFER', 'AUTO_ASSIGN'] as Array<'OFFER' | 'AUTO_ASSIGN'>)
      : [],
    candidateCount: value.operators.filter((operator) => operator.state === 'ACTIVE').length,
    checks: checks.map(([code, pass]) => ({
      code,
      status: pass ? ('PASS' as const) : ('BLOCKING' as const),
      resourceId: null,
      observedVersion: null,
    })),
    activation: current?.activation ?? null,
  };
  if (current) Object.assign(current, next);
  else value.readiness.push(next);
}

export const mockRoutingControlPlaneSource: RoutingControlPlaneSource = {
  async load(projectId, access, signal) {
    if (signal?.aborted) throw signal.reason;
    const value = structuredClone(snapshot(projectId));
    if (!access.teams) {
      value.teams = [];
      value.skills = [];
      value.operators = [];
      value.workforce = {
        actionEtag: '',
        rootVersion: 0,
        currentRevisionNumber: 0,
        draft: null,
        published: null,
      };
    } else if (!access.teamsManage) value.workforce.draft = null;
    if (!access.queues) value.queues = [];
    if (!access.routing) {
      value.policies = [];
      value.slots = [];
      value.readiness = [];
    }
    return value;
  },
  async queue(projectId, queueId, signal) {
    if (signal?.aborted) throw signal.reason;
    const value = snapshot(projectId).queues.find((item) => item.id === queueId);
    if (!value) throw new ApiError(404, 'Очередь не найдена', undefined, undefined, 'NOT_FOUND');
    return structuredClone(value);
  },
  async policy(projectId, policyId, signal) {
    if (signal?.aborted) throw signal.reason;
    const value = snapshot(projectId).policies.find((item) => item.id === policyId);
    if (!value) throw new ApiError(404, 'Политика не найдена', undefined, undefined, 'NOT_FOUND');
    return structuredClone(value);
  },
  async listDecisions(_projectId, signal) {
    if (signal?.aborted) throw signal.reason;
    return { items: structuredClone(decisions as RoutingDecision[]), nextCursor: null };
  },
  async loadMoreCatalog(_projectId, _kind, _cursor, signal) {
    if (signal?.aborted) throw signal.reason;
    return { items: [], nextCursor: null };
  },
  async decision(_projectId, decisionId, signal) {
    if (signal?.aborted) throw signal.reason;
    const value = decisions.find((item) => item.id === decisionId);
    if (!value) throw new ApiError(404, 'Решение не найдено', undefined, undefined, 'NOT_FOUND');
    return structuredClone(value);
  },
  async createTeam(projectId, data, context) {
    if (!retain(context, `team:${JSON.stringify(data)}`)) return;
    snapshot(projectId).teams.push({
      id: `team-${crypto.randomUUID()}`,
      ...data,
      lifecycle: 'ACTIVE',
      version: 1,
    });
  },
  async createSkill(projectId, data, context) {
    if (!retain(context, `skill:${JSON.stringify(data)}`)) return;
    snapshot(projectId).skills.push({
      id: `skill-${crypto.randomUUID()}`,
      ...data,
      lifecycle: 'ACTIVE',
      version: 1,
    });
  },
  async renameIdentity(projectId, kind, id, data, context) {
    if (!retain(context, `rename:${kind}:${id}:${JSON.stringify(data)}`)) return;
    const value = (kind === 'TEAM' ? snapshot(projectId).teams : snapshot(projectId).skills).find(
      (item) => item.id === id,
    );
    if (!value || value.version !== data.expectedVersion)
      throw new ApiError(
        409,
        'Версия справочника изменилась',
        undefined,
        undefined,
        'VERSION_CONFLICT',
      );
    value.name = data.name;
    value.version += 1;
  },
  async archiveIdentity(projectId, kind, id, data, context) {
    if (!retain(context, `archive:${kind}:${id}:${JSON.stringify(data)}`)) return;
    const value = (kind === 'TEAM' ? snapshot(projectId).teams : snapshot(projectId).skills).find(
      (item) => item.id === id,
    );
    if (!value || value.version !== data.expectedVersion)
      throw new ApiError(
        409,
        'Версия справочника изменилась',
        undefined,
        undefined,
        'VERSION_CONFLICT',
      );
    value.lifecycle = 'ARCHIVED';
    value.version += 1;
  },
  async saveWorkforce(projectId, configuration, context) {
    const value = snapshot(projectId);
    verify(value.workforce.actionEtag, context.actionEtag);
    if (!retain(context, `workforce:${JSON.stringify(configuration)}`)) return;
    value.workforce.rootVersion += 1;
    value.workforce.actionEtag = `"mock-workforce-${value.workforce.rootVersion}"`;
    value.workforce.draft = {
      generation: (value.workforce.draft?.generation ?? value.workforce.currentRevisionNumber) + 1,
      version: 1,
      contentHash: 'draft',
      configuration: structuredClone(configuration),
    };
  },
  async discardWorkforce(projectId, context) {
    const value = snapshot(projectId);
    verify(value.workforce.actionEtag, context.actionEtag);
    if (!retain(context, 'workforce:discard')) return;
    value.workforce.draft = null;
  },
  async publishWorkforce(projectId, context) {
    const value = snapshot(projectId);
    verify(value.workforce.actionEtag, context.actionEtag);
    if (!value.workforce.draft)
      throw new ApiError(
        409,
        'Нет сохранённого черновика',
        undefined,
        undefined,
        'DRAFT_NOT_FOUND',
      );
    if (!retain(context, 'workforce:publish')) return;
    value.workforce.currentRevisionNumber += 1;
    value.workforce.published = {
      id: `workforce-revision-${value.workforce.currentRevisionNumber}`,
      revisionNumber: value.workforce.currentRevisionNumber,
      publishedAt: new Date().toISOString(),
      configuration: value.workforce.draft.configuration,
    };
    value.workforce.draft = null;
  },
  async createQueue(projectId, code, draft, context) {
    if (!retain(context, `queue:${code}:${JSON.stringify(draft)}`)) return;
    snapshot(projectId).queues.push({
      id: `queue-${crypto.randomUUID()}`,
      code,
      name: draft.displayName,
      description: draft.description,
      lifecycle: 'ACTIVE',
      version: 1,
      actionEtag: '"mock-queue-1"',
      detailLoaded: true,
      draft: { generation: 1, version: 1, configuration: structuredClone(draft) },
      published: null,
    });
  },
  async saveQueue(projectId, queueId, draft, context) {
    const value = snapshot(projectId).queues.find((item) => item.id === queueId);
    if (!value) throw new ApiError(404, 'Очередь не найдена', undefined, undefined, 'NOT_FOUND');
    verify(value.actionEtag, context.actionEtag);
    if (!retain(context, `queue-save:${queueId}:${JSON.stringify(draft)}`)) return;
    value.version += 1;
    value.actionEtag = `"mock-queue-${value.version}"`;
    value.name = draft.displayName;
    value.description = draft.description;
    value.draft = {
      generation: value.draft?.generation ?? (value.published?.revisionNumber ?? 0) + 1,
      version: (value.draft?.version ?? 0) + 1,
      configuration: structuredClone(draft),
    };
  },
  async previewQueue(_projectId, _queueId, sampleLimit, signal) {
    if (signal?.aborted) throw signal.reason;
    return {
      count: 1284,
      exact: true,
      lowerBound: null,
      caseIds: ['1042', '1038', '1031'].slice(0, sampleLimit),
      diagnostics: [],
      evaluatedAt: new Date().toISOString(),
      sourceHighWater: { caseVersion: 1042 },
    };
  },
  async publishQueue(projectId, queueId, context) {
    const value = snapshot(projectId);
    const queue = value.queues.find((item) => item.id === queueId);
    if (!queue) throw new ApiError(404, 'Очередь не найдена', undefined, undefined, 'NOT_FOUND');
    verify(queue.actionEtag, context.actionEtag);
    if (!queue.draft)
      throw new ApiError(
        409,
        'Нет сохранённого черновика',
        undefined,
        undefined,
        'DRAFT_NOT_FOUND',
      );
    if (!retain(context, `queue-publish:${queueId}`)) return;
    queue.version += 1;
    queue.actionEtag = `"mock-queue-${queue.version}"`;
    queue.published = {
      id: `queue-revision-${queue.version}`,
      revisionNumber: queue.version,
      publishedAt: new Date().toISOString(),
    };
    queue.draft = null;
    refreshReadiness(value, queueId);
  },
  async createPolicy(projectId, code, draft, context) {
    if (!retain(context, `policy:${code}:${JSON.stringify(draft)}`)) return;
    snapshot(projectId).policies.push({
      id: `policy-${crypto.randomUUID()}`,
      code,
      lifecycle: 'ACTIVE',
      version: 1,
      actionEtag: '"mock-policy-1"',
      detailLoaded: true,
      draft: { generation: 1, version: 1, configuration: structuredClone(draft) },
      published: null,
    });
  },
  async savePolicy(projectId, policyId, draft, context) {
    const policy = snapshot(projectId).policies.find((item) => item.id === policyId);
    if (!policy) throw new ApiError(404, 'Политика не найдена', undefined, undefined, 'NOT_FOUND');
    verify(policy.actionEtag, context.actionEtag);
    if (!retain(context, `policy-save:${policyId}:${JSON.stringify(draft)}`)) return;
    policy.version += 1;
    policy.actionEtag = `"mock-policy-${policy.version}"`;
    policy.draft = {
      generation: policy.draft?.generation ?? (policy.published?.revisionNumber ?? 0) + 1,
      version: (policy.draft?.version ?? 0) + 1,
      configuration: structuredClone(draft),
    };
  },
  async publishPolicy(projectId, policyId, context) {
    const value = snapshot(projectId);
    const policy = value.policies.find((item) => item.id === policyId);
    if (!policy) throw new ApiError(404, 'Политика не найдена', undefined, undefined, 'NOT_FOUND');
    verify(policy.actionEtag, context.actionEtag);
    if (!policy.draft)
      throw new ApiError(
        409,
        'Нет сохранённого черновика',
        undefined,
        undefined,
        'DRAFT_NOT_FOUND',
      );
    if (!retain(context, `policy-publish:${policyId}`)) return;
    policy.version += 1;
    policy.actionEtag = `"mock-policy-${policy.version}"`;
    policy.published = {
      id: `policy-revision-${policy.version}`,
      revisionNumber: policy.version,
      publishedAt: new Date().toISOString(),
      configuration: policy.draft.configuration,
    };
    policy.draft = null;
    value.slots
      .filter((slot) => slot.policyId === policyId)
      .forEach((slot) => refreshReadiness(value, slot.queueId));
  },
  async bind(projectId, queueId, policyId, routePriority, context) {
    const value = snapshot(projectId);
    const current = value.slots.find((item) => item.queueId === queueId);
    verify(current?.actionEtag ?? '"mock-slot-0"', context.actionEtag);
    if (!retain(context, `slot:${queueId}:${policyId}:${routePriority}`)) return;
    const conflict = value.slots.find(
      (slot) => slot.routePriority === routePriority && slot.queueId !== queueId,
    );
    if (conflict)
      throw new ApiError(
        409,
        'Приоритет уже занят другой очередью',
        undefined,
        undefined,
        'SUPPORT_ROUTING_ROUTE_PRIORITY_IN_USE',
      );
    if (current) {
      current.policyId = policyId;
      current.routePriority = routePriority;
      current.version += 1;
      current.actionEtag = `"mock-slot-${current.version}"`;
    } else
      value.slots.push({
        queueId,
        policyId,
        routePriority,
        version: 1,
        actionEtag: '"mock-slot-1"',
      });
    refreshReadiness(value, queueId);
  },
  async runShadow(_projectId, limit, context) {
    if (!retain(context, `shadow:${limit}`)) return structuredClone([...runs.values()].at(-1)!);
    const run: ShadowRun = {
      id: `run-${crypto.randomUUID()}`,
      state: 'COMPLETED',
      requested: limit,
      accepted: Math.min(limit, 2),
      pending: 0,
      completed: Math.min(limit, 2),
      failed: 0,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    runs.set(run.id, run);
    return structuredClone(run);
  },
  async shadowRun(_projectId, runId, signal) {
    if (signal?.aborted) throw signal.reason;
    const value = runs.get(runId);
    if (!value)
      throw new ApiError(404, 'Проверочный запуск не найден', undefined, undefined, 'NOT_FOUND');
    return structuredClone(value);
  },
  async shadowRunDecisionIds(_projectId, _runId, signal) {
    if (signal?.aborted) throw signal.reason;
    return decisions.map((item) => item.id);
  },
  async activate(projectId, queueId, targetMode, expectedActivationVersion, reasonCode, context) {
    const value = snapshot(projectId);
    const readiness = value.readiness.find((item) => item.queueId === queueId);
    if (!readiness)
      throw new ApiError(
        409,
        'Готовность не рассчитана',
        undefined,
        undefined,
        'SUPPORT_ROUTING_CONFIGURATION_NOT_READY',
      );
    if (readiness.status !== 'READY' && targetMode !== 'DISABLED')
      throw new ApiError(
        409,
        'Маршрутизация пока не готова',
        undefined,
        undefined,
        'SUPPORT_ROUTING_CONFIGURATION_NOT_READY',
      );
    if ((readiness.activation?.version ?? 0) !== expectedActivationVersion)
      throw new ApiError(409, 'Режим уже изменился', undefined, undefined, 'VERSION_CONFLICT');
    if (!retain(context, `activation:${queueId}:${targetMode}:${reasonCode}`)) return;
    readiness.activation =
      targetMode === 'DISABLED'
        ? null
        : {
            mode: targetMode,
            version: expectedActivationVersion + 1,
            activatedAt: new Date().toISOString(),
          };
  },
  async audit(_projectId, _resourceType, resourceId, signal): Promise<RoutingAuditEvent[]> {
    if (signal?.aborted) throw signal.reason;
    return [
      {
        id: `audit-${resourceId}`,
        eventType: 'PUBLISHED',
        occurredAt: '2026-08-12T07:35:00.000Z',
        actorName: 'Елена Воронова',
        outcome: 'APPLIED',
        reason: 'Подготовка автоматического назначения',
        reasonCode: 'CONFIGURATION_APPROVED',
        oldRevisionId: null,
        newRevisionId: 'revision-3',
      },
    ];
  },
  async revisions(_projectId, kind, _resourceId, signal) {
    if (signal?.aborted) throw signal.reason;
    const prefix = kind.toLocaleLowerCase();
    return [3, 2, 1].map((revisionNumber) => ({
      id: `${prefix}-revision-${revisionNumber}`,
      revisionNumber,
      publishedAt: new Date(Date.UTC(2026, 7, 12 - (3 - revisionNumber), 7, 30)).toISOString(),
      publisherName: revisionNumber === 3 ? 'Елена Воронова' : 'Алексей Смирнов',
      contentHash: String(revisionNumber).repeat(64),
    }));
  },
  async revisionDiff(_projectId, kind, _fromRevisionId, _toRevisionId, _resourceId, signal) {
    if (signal?.aborted) throw signal.reason;
    return {
      fromRevision: 2,
      toRevision: 3,
      sections:
        kind === 'POLICY'
          ? ['WEIGHTS', 'RETRY']
          : kind === 'QUEUE'
            ? ['FILTER', 'ROUTING']
            : ['TEAMS', 'OPERATORS'],
      summary:
        kind === 'POLICY'
          ? 'Изменены веса выбора и число попыток'
          : kind === 'QUEUE'
            ? 'Изменены условия выборки и резервная команда'
            : 'Добавлен оператор и обновлена ёмкость команды',
    };
  },
  async restoreRevision(projectId, kind, revisionId, resourceId, reasonCode, context) {
    if (!retain(context, `restore:${kind}:${revisionId}:${reasonCode}`)) return;
    const value = snapshot(projectId);
    if (kind === 'WORKFORCE') {
      value.workforce.draft = {
        generation: value.workforce.currentRevisionNumber + 1,
        version: 1,
        contentHash: 'restored',
        configuration: structuredClone(value.workforce.published!.configuration),
      };
      return;
    }
    if (kind === 'QUEUE') {
      const queue = value.queues.find((item) => item.id === resourceId);
      if (queue)
        queue.draft = {
          generation: (queue.published?.revisionNumber ?? 0) + 1,
          version: 1,
          configuration: structuredClone(initialQueueDraft),
        };
      return;
    }
    const policy = value.policies.find((item) => item.id === resourceId);
    if (policy)
      policy.draft = {
        generation: (policy.published?.revisionNumber ?? 0) + 1,
        version: 1,
        configuration: structuredClone(policy.published?.configuration ?? initialPolicyDraft),
      };
  },
};

export function resetMockRoutingControlPlane(): void {
  snapshots = new Map();
  runs.clear();
  receipts.clear();
}
