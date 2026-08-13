import {
  supportPresentationsCatalogOperators,
  supportQueueCreate,
  supportQueueDetail,
  supportQueueList,
  supportQueuePreviewDraft,
  supportQueuePublish,
  supportQueueReplaceDraft,
  supportQueueRevisions,
  supportQueueRevisionDiff,
  supportQueueRestoreRevisionAsDraft,
  supportRoutingCreate,
  supportRoutingDetail,
  supportRoutingList,
  supportRoutingPublish,
  supportRoutingReplaceDraft,
  supportRoutingRevisionDiff,
  supportRoutingRevisionHistory,
  supportRoutingRestoreRevisionDraft,
  supportRoutingRuntimeActivation,
  supportRoutingRuntimeConfigurationAuditTimeline,
  supportRoutingRuntimeDecisionDetail,
  supportRoutingRuntimeDecisionList,
  supportRoutingRuntimeQueueSlot,
  supportRoutingRuntimeQueueSlots,
  supportRoutingRuntimeReadiness,
  supportRoutingRuntimeResolveOperatorAvailability,
  supportRoutingRuntimeRequest,
  supportRoutingRuntimeShadowRun,
  supportRoutingRuntimeShadowRunDecisions,
  supportRoutingRuntimeTransitionQueueActivation,
  supportWorkforceArchiveSkill,
  supportWorkforceArchiveTeam,
  supportWorkforceCreateSkill,
  supportWorkforceCreateTeam,
  supportWorkforceDiscardDraft,
  supportWorkforceGetWorkforce,
  supportWorkforceListSkills,
  supportWorkforceListTeams,
  supportWorkforcePublish,
  supportWorkforceRenameSkill,
  supportWorkforceRenameTeam,
  supportWorkforceReplaceDraft,
  supportWorkforceHistory,
  supportWorkforceDiff,
  supportWorkforceRestore,
} from '@/shared/api/generated/retenive-backend';
import type {
  SupportQueueDraftDto,
  SupportRoutingPolicyDraftDto,
  ReplaceSupportWorkforceDraftDto,
} from '@/shared/api/generated/models';
import { isMockMode } from '@/shared/config/data-mode';
import type {
  PolicyDraft,
  QueueDraft,
  RoutingAuditEvent,
  RoutingCommandContext,
  RoutingControlPlaneSource,
  RoutingDecision,
  RoutingDecisionDetail,
  RoutingIdentity,
  RoutingOperator,
  RoutingPolicy,
  RoutingQueue,
  RoutingReadiness,
  RoutingRevision,
  RoutingSlot,
  RoutingWorkspaceSnapshot,
  ShadowRun,
  WorkforceConfiguration,
  WorkforceState,
} from '../model/routing-control-plane';
import { mockRoutingControlPlaneSource } from './routing-control-plane-source.mock';

function options(context?: RoutingCommandContext) {
  return {
    signal: context?.signal,
    headers: {
      ...(context?.actionEtag ? { 'If-Match': context.actionEtag } : {}),
      ...(context?.idempotencyKey ? { 'Idempotency-Key': context.idempotencyKey } : {}),
    },
  };
}

function readOptions(signal?: AbortSignal) {
  return { signal };
}

function asConfiguration(value: unknown): WorkforceConfiguration {
  const fallback: WorkforceConfiguration = { teams: [], operators: [] };
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Partial<WorkforceConfiguration>;
  return {
    teams: Array.isArray(record.teams) ? structuredClone(record.teams) : [],
    operators: Array.isArray(record.operators) ? structuredClone(record.operators) : [],
  };
}

function mapIdentity(value: {
  id: string;
  code: string;
  name: string;
  lifecycle: string;
  version: number;
  description?: string | null;
  kind?: string;
}): RoutingIdentity {
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    lifecycle: value.lifecycle === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    version: value.version,
    description: value.description,
    kind: value.kind,
  };
}

function mapWorkforce(
  value: Awaited<ReturnType<typeof supportWorkforceGetWorkforce>>,
): WorkforceState {
  const draft = value.draft;
  const published = value.publishedRevision;
  return {
    actionEtag: value.actionEtag,
    rootVersion: value.rootVersion,
    currentRevisionNumber: value.currentRevisionNumber,
    draft: draft
      ? {
          generation: draft.generation,
          version: draft.version,
          contentHash: draft.contentHash,
          configuration: asConfiguration(draft.configuration),
        }
      : null,
    published: published
      ? {
          id: published.id,
          revisionNumber: published.revisionNumber,
          publishedAt: published.publishedAt,
          configuration: asConfiguration(published.configuration),
        }
      : null,
  };
}

function policyDraft(value: Partial<PolicyDraft> | null | undefined): PolicyDraft {
  return {
    mandatorySkills: value?.mandatorySkills ?? [],
    preferredSkills: value?.preferredSkills ?? [],
    mandatoryLanguages: value?.mandatoryLanguages ?? [],
    preferredLanguages: value?.preferredLanguages ?? [],
    capacityWeightUnits: value?.capacityWeightUnits ?? 1,
    hardUtilizationPercent: value?.hardUtilizationPercent ?? 90,
    weights: value?.weights ?? { skill: 40, language: 20, load: 20, continuity: 10, idle: 10 },
    queueWeights: value?.queueWeights ?? { sla: 40, priority: 30, escalation: 20, age: 10 },
    timeouts: value?.timeouts ?? { offerSeconds: 45, reservationSeconds: 90 },
    retry: value?.retry ?? { maxAttempts: 3, cooldownSeconds: 30, fallbackDelaySeconds: 10 },
  };
}

function mapPolicy(
  value: Awaited<ReturnType<typeof supportRoutingDetail>>,
  actionEtag: string,
): RoutingPolicy {
  return {
    id: value.id,
    code: value.stableCode,
    lifecycle: value.lifecycle === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    version: value.version,
    actionEtag,
    detailLoaded: true,
    draft: value.draft
      ? {
          generation: value.draft.generation,
          version: value.draft.version,
          configuration: policyDraft(value.draft.configuration as PolicyDraft),
        }
      : null,
    published: value.publishedRevision
      ? {
          id: value.publishedRevision.id,
          revisionNumber: value.publishedRevision.revisionNumber,
          publishedAt: value.publishedRevision.publishedAt,
          configuration: policyDraft(value.publishedRevision.configuration as PolicyDraft),
        }
      : null,
  };
}

function mapQueue(value: Awaited<ReturnType<typeof supportQueueDetail>>): RoutingQueue {
  const compiled = value.draft?.configuration;
  const draftConfiguration: QueueDraft | null = compiled
    ? {
        displayName: compiled.displayName,
        description: compiled.description ?? null,
        visibility: structuredClone(compiled.visibility) as QueueDraft['visibility'],
        filter: structuredClone(compiled.filter) as QueueDraft['filter'],
        sort: structuredClone(compiled.sort) as QueueDraft['sort'],
        routing: structuredClone(compiled.routing) as QueueDraft['routing'],
      }
    : null;
  return {
    id: value.queue.id,
    code: value.queue.stableCode,
    kind: value.queue.kind,
    name: value.queue.displayName,
    description: value.queue.description ?? null,
    lifecycle: value.queue.lifecycle === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    version: value.queue.version,
    actionEtag: value.actionEtag,
    detailLoaded: true,
    draft:
      value.draft && draftConfiguration
        ? {
            generation: value.draft.generation,
            version: value.draft.version,
            configuration: draftConfiguration,
          }
        : null,
    published: value.publishedRevision
      ? {
          id: value.publishedRevision.id,
          revisionNumber: value.publishedRevision.revisionNumber,
          publishedAt: value.publishedRevision.publishedAt,
        }
      : null,
  };
}

function excludedCount(value: object): number {
  return Object.values(value).reduce<number>(
    (total, current) => total + (typeof current === 'number' ? current : 0),
    0,
  );
}

function mapDecision(
  value: Awaited<ReturnType<typeof supportRoutingRuntimeDecisionList>>['items'][number],
): RoutingDecision {
  return {
    id: value.id,
    caseId: value.caseId,
    mode: value.mode,
    outcome: value.outcome,
    queueId: value.queueId,
    policyId: value.policyId,
    selectedTeamId: value.selectedTeamId,
    selectedOperatorId: value.selectedOperatorId,
    candidateCount: value.candidateCount,
    excludedCount: excludedCount(value.exclusionCounts),
    latencyMs: value.latencyMs,
    evaluatedAt: value.evaluatedAt,
    pins: {
      queueRevisionId: value.queueRevisionId,
      policyRevisionId: value.policyRevisionId,
      workforceRevisionId: value.workforceRevisionId,
    },
  };
}

function mapReadiness(
  value: Awaited<ReturnType<typeof supportRoutingRuntimeReadiness>>['items'][number],
): RoutingReadiness {
  return {
    queueId: value.queueId,
    status: value.status === 'NOT_READY' ? 'BLOCKING' : value.status,
    allowedTargetModes: [...value.allowedTargetModes],
    candidateCount: value.candidateCount,
    checks: value.checks.map((check) => ({
      code: check.code,
      status: check.status,
      resourceId: check.resourceId,
      observedVersion: check.observedVersion,
    })),
    activation: value.currentActivation
      ? {
          mode: value.currentActivation.requestedMode,
          version: value.currentActivation.version,
          activatedAt: value.currentActivation.activatedAt,
        }
      : null,
  };
}

function mapShadow(value: Awaited<ReturnType<typeof supportRoutingRuntimeShadowRun>>): ShadowRun {
  return {
    id: value.id,
    state: value.state,
    requested: value.requested,
    accepted: value.accepted,
    pending: value.pending,
    completed: value.completed,
    failed: value.failed,
    createdAt: value.createdAt,
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
  };
}

const apiSource: RoutingControlPlaneSource = {
  async load(projectId, access, signal) {
    const [
      teamPage,
      skillPage,
      workforceDto,
      queuePage,
      policyPage,
      slotPage,
      readinessPage,
      activationPage,
      operatorPage,
    ] = await Promise.all([
      access.teams
        ? supportWorkforceListTeams(projectId, { limit: 100 }, readOptions(signal))
        : Promise.resolve(null),
      access.teams
        ? supportWorkforceListSkills(projectId, { limit: 100 }, readOptions(signal))
        : Promise.resolve(null),
      access.teams
        ? supportWorkforceGetWorkforce(projectId, readOptions(signal))
        : Promise.resolve(null),
      access.queues
        ? supportQueueList(projectId, { limit: 100 }, readOptions(signal))
        : Promise.resolve(null),
      access.routing
        ? supportRoutingList(projectId, { limit: 200 }, readOptions(signal))
        : Promise.resolve(null),
      access.routing
        ? supportRoutingRuntimeQueueSlots(projectId, { limit: 100 }, readOptions(signal))
        : Promise.resolve(null),
      access.routing
        ? supportRoutingRuntimeReadiness(projectId, undefined, readOptions(signal))
        : Promise.resolve(null),
      access.routing
        ? supportRoutingRuntimeActivation(projectId, readOptions(signal))
        : Promise.resolve(null),
      access.teams
        ? supportPresentationsCatalogOperators(projectId, { limit: 100 }, readOptions(signal))
        : Promise.resolve(null),
    ]);
    const queues: RoutingQueue[] = (queuePage?.items ?? []).map((queue) => {
      const ready = readinessPage?.items.find((item) => item.queueId === queue.id);
      const queueRevisionId = ready?.candidateVector?.queueRevisionId ?? null;
      return {
        id: queue.id,
        code: queue.stableCode,
        kind: queue.kind,
        name: queue.displayName,
        description: queue.description ?? null,
        lifecycle: queue.lifecycle === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
        version: queue.version,
        actionEtag: '',
        detailLoaded: false,
        draft: null,
        published: queueRevisionId
          ? { id: queueRevisionId, revisionNumber: queue.version, publishedAt: '' }
          : null,
      };
    });
    const policies = (policyPage?.items ?? []).map((policy) => ({
      ...mapPolicy(policy, ''),
      detailLoaded: false,
    }));
    const availabilityPage =
      access.availability && operatorPage?.items.length
        ? await supportRoutingRuntimeResolveOperatorAvailability(
            projectId,
            { cmsUserIds: operatorPage.items.map((item) => item.cmsUserId) },
            readOptions(signal),
          )
        : null;
    const availabilityByOperator = new Map(
      availabilityPage?.items.map((item) => [item.operatorId, item]) ?? [],
    );
    const configuration =
      (access.teamsManage ? workforceDto?.draft?.configuration : undefined) ??
      workforceDto?.publishedRevision?.configuration;
    const operators = (operatorPage?.items ?? []).map((item) => {
      const configured = configuration?.operators.find(
        (operator) => operator.cmsUserId === item.cmsUserId,
      );
      const teamIds =
        configuration?.teams
          .filter((team) => team.members.includes(item.cmsUserId))
          .map((team) => team.teamId) ?? [];
      return {
        id: item.cmsUserId,
        name: item.displayName,
        state:
          item.membershipState === 'ACTIVE'
            ? ('ACTIVE' as const)
            : item.membershipState === 'INACTIVE'
              ? ('INACTIVE' as const)
              : ('UNKNOWN' as const),
        maxCapacityUnits: configured?.maxCapacityUnits ?? 1,
        teamIds,
        skills:
          configured?.skills.map((skill) => ({ ...skill, preferred: skill.preferred ?? false })) ??
          [],
        languages:
          configured?.languages.map((language) => ({
            ...language,
            preferred: language.preferred ?? false,
          })) ?? [],
        availability: availabilityByOperator.get(item.cmsUserId)?.status ?? 'UNKNOWN',
      };
    });
    const slots: RoutingSlot[] = (slotPage?.items ?? []).map((slot) => ({
      ...slot,
      actionEtag: slotPage!.actionEtag,
    }));
    return {
      teams: (teamPage?.teams?.items ?? []).map(mapIdentity),
      skills: (skillPage?.skills?.items ?? []).map(mapIdentity),
      operators,
      workforce: workforceDto
        ? { ...mapWorkforce(workforceDto), ...(access.teamsManage ? {} : { draft: null }) }
        : {
            actionEtag: '',
            rootVersion: 0,
            currentRevisionNumber: 0,
            draft: null,
            published: null,
          },
      queues,
      policies,
      slots,
      slotActionEtag: slotPage?.actionEtag ?? '',
      readiness: (readinessPage?.items ?? []).map(mapReadiness),
      activationsTruncated: activationPage?.activationsTruncated ?? false,
      readinessTruncated: readinessPage?.truncated ?? false,
      catalogCursors: {
        teams: teamPage?.teams?.nextCursor ?? null,
        skills: skillPage?.skills?.nextCursor ?? null,
        operators: operatorPage?.nextCursor ?? null,
        queues: queuePage?.nextCursor ?? null,
        slots: slotPage?.nextCursor ?? null,
      },
    } satisfies RoutingWorkspaceSnapshot;
  },
  async loadMoreCatalog(
    projectId,
    kind,
    cursor,
    signal,
    canManageTeams = false,
    canReadAvailability = false,
  ) {
    if (kind === 'queues') {
      const response = await supportQueueList(
        projectId,
        { limit: 100, cursor },
        readOptions(signal),
      );
      return {
        items: response.items.map((queue): RoutingQueue => ({
          id: queue.id,
          code: queue.stableCode,
          kind: queue.kind,
          name: queue.displayName,
          description: queue.description ?? null,
          lifecycle: queue.lifecycle === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
          version: queue.version,
          actionEtag: '',
          detailLoaded: false,
          draft: null,
          published: null,
        })),
        nextCursor: response.nextCursor,
      };
    }
    if (kind === 'slots') {
      const response = await supportRoutingRuntimeQueueSlots(
        projectId,
        { limit: 100, cursor },
        readOptions(signal),
      );
      return {
        items: response.items.map((slot): RoutingSlot => ({
          ...slot,
          actionEtag: response.actionEtag,
        })),
        nextCursor: response.nextCursor,
        actionEtag: response.actionEtag,
      };
    }
    if (kind === 'teams' || kind === 'skills') {
      const response =
        kind === 'teams'
          ? await supportWorkforceListTeams(projectId, { limit: 100, cursor }, readOptions(signal))
          : await supportWorkforceListSkills(
              projectId,
              { limit: 100, cursor },
              readOptions(signal),
            );
      const page = kind === 'teams' ? response.teams : response.skills;
      return { items: (page?.items ?? []).map(mapIdentity), nextCursor: page?.nextCursor ?? null };
    }
    const [response, workforce] = await Promise.all([
      supportPresentationsCatalogOperators(projectId, { limit: 100, cursor }, readOptions(signal)),
      supportWorkforceGetWorkforce(projectId, readOptions(signal)),
    ]);
    const availabilityPage =
      canReadAvailability && response.items.length
        ? await supportRoutingRuntimeResolveOperatorAvailability(
            projectId,
            { cmsUserIds: response.items.map((item) => item.cmsUserId) },
            readOptions(signal),
          )
        : null;
    const availabilityByOperator = new Map(
      availabilityPage?.items.map((item) => [item.operatorId, item]) ?? [],
    );
    const configuration =
      (canManageTeams ? workforce.draft?.configuration : undefined) ??
      workforce.publishedRevision?.configuration;
    const items: RoutingOperator[] = response.items.map((item) => {
      const configured = configuration?.operators.find(
        (operator) => operator.cmsUserId === item.cmsUserId,
      );
      return {
        id: item.cmsUserId,
        name: item.displayName,
        state:
          item.membershipState === 'ACTIVE'
            ? 'ACTIVE'
            : item.membershipState === 'INACTIVE'
              ? 'INACTIVE'
              : 'UNKNOWN',
        maxCapacityUnits: configured?.maxCapacityUnits ?? 1,
        teamIds:
          configuration?.teams
            .filter((team) => team.members.includes(item.cmsUserId))
            .map((team) => team.teamId) ?? [],
        skills:
          configured?.skills.map((skill) => ({ ...skill, preferred: skill.preferred ?? false })) ??
          [],
        languages:
          configured?.languages.map((language) => ({
            ...language,
            preferred: language.preferred ?? false,
          })) ?? [],
        availability: availabilityByOperator.get(item.cmsUserId)?.status ?? 'UNKNOWN',
      };
    });
    return { items, nextCursor: response.nextCursor };
  },
  async queue(projectId, queueId, signal) {
    return mapQueue(await supportQueueDetail(projectId, queueId, readOptions(signal)));
  },
  async policy(projectId, policyId, signal) {
    let etag = '';
    const detail = await supportRoutingDetail(projectId, policyId, {
      ...readOptions(signal),
      onResponse: ({ headers }) => {
        etag = String(headers.etag ?? headers.ETag ?? '');
      },
    });
    return mapPolicy(detail, etag);
  },
  async listDecisions(projectId, signal, cursor) {
    const response = await supportRoutingRuntimeDecisionList(
      projectId,
      { limit: 100, ...(cursor ? { cursor } : {}) },
      readOptions(signal),
    );
    return {
      items: response.items.map(mapDecision),
      nextCursor: typeof response.nextCursor === 'string' ? response.nextCursor : null,
    };
  },
  async decision(projectId, decisionId, signal) {
    const value = await supportRoutingRuntimeDecisionDetail(
      projectId,
      decisionId,
      readOptions(signal),
    );
    return {
      ...mapDecision(value),
      candidates: value.candidates.map((candidate) => ({
        rank: candidate.rank,
        operatorId: candidate.operatorId,
        eligible: candidate.eligible,
        exclusions: [...candidate.exclusions],
        score: { ...candidate.score },
        factVersions: { ...candidate.factVersions },
      })),
      inputManifest: { ...value.inputManifest },
      sourceVector: { ...value.sourceVector },
    } as RoutingDecisionDetail;
  },
  async createTeam(projectId, value, context) {
    await supportWorkforceCreateTeam(projectId, value, options(context));
  },
  async createSkill(projectId, value, context) {
    await supportWorkforceCreateSkill(projectId, value, options(context));
  },
  async renameIdentity(projectId, kind, id, value, context) {
    const command = { name: value.name, expectedVersion: value.expectedVersion };
    if (kind === 'TEAM') await supportWorkforceRenameTeam(projectId, id, command, options(context));
    else await supportWorkforceRenameSkill(projectId, id, command, options(context));
  },
  async archiveIdentity(projectId, kind, id, value, context) {
    const command = { expectedVersion: value.expectedVersion, reason: value.reason };
    if (kind === 'TEAM')
      await supportWorkforceArchiveTeam(projectId, id, command, options(context));
    else await supportWorkforceArchiveSkill(projectId, id, command, options(context));
  },
  async saveWorkforce(projectId, configuration, context) {
    await supportWorkforceReplaceDraft(
      projectId,
      configuration as unknown as ReplaceSupportWorkforceDraftDto,
      options(context),
    );
  },
  async discardWorkforce(projectId, context) {
    await supportWorkforceDiscardDraft(projectId, {}, options(context));
  },
  async publishWorkforce(projectId, context) {
    await supportWorkforcePublish(projectId, {}, options(context));
  },
  async createQueue(projectId, code, draft, context) {
    await supportQueueCreate(
      projectId,
      { code, draft: draft as unknown as SupportQueueDraftDto },
      options(context),
    );
  },
  async saveQueue(projectId, queueId, draft, context) {
    await supportQueueReplaceDraft(
      projectId,
      queueId,
      { draft: draft as unknown as SupportQueueDraftDto },
      options(context),
    );
  },
  async previewQueue(projectId, queueId, sampleLimit, signal) {
    const value = await supportQueuePreviewDraft(
      projectId,
      queueId,
      { sampleLimit },
      readOptions(signal),
    );
    return {
      count: value.count ?? value.countLowerBound ?? 0,
      exact: value.countExact,
      lowerBound: value.countLowerBound,
      caseIds: value.caseIds,
      diagnostics: [...value.diagnostics, ...value.reasonSummary],
      evaluatedAt: value.evaluatedAt,
      sourceHighWater: { ...value.sourceHighWater },
    };
  },
  async publishQueue(projectId, queueId, context) {
    await supportQueuePublish(projectId, queueId, options(context));
  },
  async createPolicy(projectId, code, draft, context) {
    await supportRoutingCreate(
      projectId,
      { stableCode: code, draft: draft as SupportRoutingPolicyDraftDto },
      options(context),
    );
  },
  async savePolicy(projectId, policyId, draft, context) {
    await supportRoutingReplaceDraft(
      projectId,
      policyId,
      { draft: draft as SupportRoutingPolicyDraftDto },
      options(context),
    );
  },
  async publishPolicy(projectId, policyId, context) {
    await supportRoutingPublish(projectId, policyId, options(context));
  },
  async bind(projectId, queueId, policyId, routePriority, context) {
    await supportRoutingRuntimeQueueSlot(
      projectId,
      queueId,
      { policyId, routePriority },
      options(context),
    );
  },
  async runShadow(projectId, limit, context) {
    return mapShadow(await supportRoutingRuntimeRequest(projectId, { limit }, options(context)));
  },
  async shadowRun(projectId, runId, signal) {
    return mapShadow(await supportRoutingRuntimeShadowRun(projectId, runId, readOptions(signal)));
  },
  async shadowRunDecisionIds(projectId, runId, signal) {
    const response = await supportRoutingRuntimeShadowRunDecisions(
      projectId,
      runId,
      { limit: 100 },
      readOptions(signal),
    );
    return response.items.flatMap((item) =>
      typeof item.decisionId === 'string' ? [item.decisionId] : [],
    );
  },
  async activate(projectId, queueId, targetMode, expectedActivationVersion, reasonCode, context) {
    await supportRoutingRuntimeTransitionQueueActivation(
      projectId,
      queueId,
      { targetMode, expectedActivationVersion, reasonCode },
      options(context),
    );
  },
  async audit(projectId, resourceType, resourceId, signal) {
    const response = await supportRoutingRuntimeConfigurationAuditTimeline(
      projectId,
      { resourceType, resourceId, limit: 100 },
      readOptions(signal),
    );
    return response.items.map((event): RoutingAuditEvent => ({
      id: event.id,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      actorName: event.actor.displayName,
      outcome: event.outcome,
      reason: typeof event.reason === 'string' ? event.reason : null,
      reasonCode: typeof event.reasonCode === 'string' ? event.reasonCode : null,
      oldRevisionId: typeof event.oldRevisionId === 'string' ? event.oldRevisionId : null,
      newRevisionId: typeof event.newRevisionId === 'string' ? event.newRevisionId : null,
    }));
  },
  async revisions(projectId, kind, resourceId, signal) {
    if (kind === 'QUEUE') {
      if (!resourceId) return [];
      const value = await supportQueueRevisions(
        projectId,
        resourceId,
        { limit: 100 },
        readOptions(signal),
      );
      return value.items.map((item): RoutingRevision => ({
        id: item.id,
        revisionNumber: item.revisionNumber,
        publishedAt: item.publishedAt,
        publisherName: item.publisher.displayName,
        contentHash: item.contentHash,
      }));
    }
    if (kind === 'POLICY') {
      if (!resourceId) return [];
      const value = await supportRoutingRevisionHistory(
        projectId,
        resourceId,
        { limit: 100 },
        readOptions(signal),
      );
      return value.items.map((item): RoutingRevision => ({
        id: item.id,
        revisionNumber: item.revisionNumber,
        publishedAt: item.publishedAt,
        publisherName: item.publisher.displayName,
        contentHash: item.contentHash,
      }));
    }
    const value = await supportWorkforceHistory(projectId, { limit: 100 }, readOptions(signal));
    return value.items.map((item): RoutingRevision => ({
      id: item.id,
      revisionNumber: item.revisionNumber,
      publishedAt: item.publishedAt,
      publisherName: item.publisher.displayName,
      contentHash: item.contentHash,
    }));
  },
  async revisionDiff(projectId, kind, fromRevisionId, toRevisionId, resourceId, signal) {
    if (kind === 'QUEUE') {
      if (!resourceId) throw new Error('Queue id is required');
      const value = await supportQueueRevisionDiff(
        projectId,
        resourceId,
        { fromRevisionId, toRevisionId },
        readOptions(signal),
      );
      return {
        fromRevision: value.from.revisionNumber,
        toRevision: value.to.revisionNumber,
        sections: [...value.changedSections],
        summary: value.changedSections.length
          ? `Изменены разделы: ${value.changedSections.join(', ')}`
          : 'Семантических изменений нет',
      };
    }
    if (kind === 'POLICY') {
      if (!resourceId) throw new Error('Policy id is required');
      const value = await supportRoutingRevisionDiff(
        projectId,
        resourceId,
        { fromRevisionId, toRevisionId },
        readOptions(signal),
      );
      return {
        fromRevision: value.from.revisionNumber,
        toRevision: value.to.revisionNumber,
        sections: [
          ...value.codeSetChanges.map((item) => item.field),
          ...value.numericChanges.map((item) => item.field),
        ],
        summary: `${value.codeSetChanges.length} изменений списков, ${value.numericChanges.length} числовых изменений`,
      };
    }
    const value = await supportWorkforceDiff(
      projectId,
      fromRevisionId,
      toRevisionId,
      readOptions(signal),
    );
    return {
      fromRevision: value.from.revisionNumber,
      toRevision: value.to.revisionNumber,
      sections: ['TEAMS', 'OPERATORS', 'SKILLS'].filter(
        (_, index) => [value.teams, value.operators, value.skills][index]!.totalChanged > 0,
      ),
      summary: `Команды: ${value.teams.totalChanged}, операторы: ${value.operators.totalChanged}, навыки: ${value.skills.totalChanged}`,
    };
  },
  async restoreRevision(projectId, kind, revisionId, resourceId, reasonCode, context) {
    if (kind === 'QUEUE') {
      if (!resourceId) throw new Error('Queue id is required');
      await supportQueueRestoreRevisionAsDraft(
        projectId,
        resourceId,
        revisionId,
        { reasonCode },
        options(context),
      );
    } else if (kind === 'POLICY') {
      if (!resourceId) throw new Error('Policy id is required');
      await supportRoutingRestoreRevisionDraft(
        projectId,
        resourceId,
        revisionId,
        { reasonCode },
        options(context),
      );
    } else {
      await supportWorkforceRestore(projectId, revisionId, { reasonCode }, options(context));
    }
  },
};

export const routingControlPlaneSource = isMockMode ? mockRoutingControlPlaneSource : apiSource;
