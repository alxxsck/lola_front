import {
  adminEndUserProfilesProfile,
  supportInspectorEventsList,
  supportLeadActivity,
} from '@/shared/api/generated/retenive-backend';
import type {
  ProfileProjectionResponseDto,
  SupportInspectorEventPageResponseDto,
} from '@/shared/api/generated/models';
import { normalizeApiError } from '@/shared/api/http/api-error';
import { repository } from '@/shared/api/repository';
import { isMockMode } from '@/shared/config/data-mode';
import type {
  SupportActivitySnapshot,
  SupportInspectorSource,
} from '@/features/support-inspector/model/use-support-inspector';

function mockField(
  key: string,
  label: string,
  value: string | undefined,
  restricted = false,
): ProfileProjectionResponseDto['fields'][number] {
  return {
    definitionId: `mock-${key}`,
    definitionRevisionId: `mock-${key}-r1`,
    key,
    label,
    description: null,
    purpose: 'Контекст обращения',
    valueType: 'STRING',
    semanticRole: null,
    lifecycle: 'ACTIVE',
    classification: key === 'email' ? 'PERSONAL' : 'INTERNAL',
    access: restricted ? 'REDACTED' : 'ALLOWED',
    availability: restricted ? 'DENIED' : value ? 'AVAILABLE' : 'MISSING',
    observedAt: '2026-07-26T09:20:00.000Z',
    ageSeconds: 60,
    ...(!restricted && value ? { value: { type: 'STRING', value } } : {}),
  };
}

const apiSource: SupportInspectorSource = {
  async readProfile(projectId, endUserId, signal) {
    try {
      return await adminEndUserProfilesProfile(projectId, endUserId, {
        signal,
      });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readEvents(projectId, caseId, params, signal) {
    try {
      return await supportInspectorEventsList(projectId, caseId, params, {
        signal,
      });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readActivity(projectId, params, signal) {
    try {
      const activity = await supportLeadActivity(projectId, params, { signal });
      return {
        capabilities: activity.capabilities,
        checkpoint: activity.checkpoint,
        computedAt: activity.computedAt,
        data: activity.data,
        effectiveWindow: activity.effectiveWindow,
        freshnessState: activity.freshnessState,
        kind: activity.kind,
        nextCursor: activity.nextCursor,
        projectionGeneration: activity.projectionGeneration,
        sourceHighWater: activity.sourceHighWater,
      };
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockSource: SupportInspectorSource = {
  async readProfile(projectId, endUserId, signal) {
    const page = await repository.getUsersPage(projectId, { limit: 100 });
    if (signal?.aborted) throw signal.reason;
    const user = page.items.find((item) => item.id === endUserId);
    if (!user) throw new Error('Support workspace End User is unavailable');
    return {
      endUserId: user.id,
      externalUserId: user.externalId,
      profileVersion: '7',
      syncStatus: 'VALID',
      fields: [
        mockField('name', 'Имя', user.profile.name),
        mockField('email', 'Email', user.profile.email, true),
        mockField('country', 'Страна', user.profile.country),
        mockField('segment', 'Сегмент', user.segment),
      ],
      observedAt: user.lastSeenAt,
      receivedAt: user.lastSeenAt,
      ageSeconds: Math.max(0, Math.round((Date.now() - Date.parse(user.lastSeenAt)) / 1_000)),
      contractRevision: 1,
      publicationId: 'mock-publication-1',
      publicationSequence: 1,
      provenance: 'PRODUCT_PROFILE',
    };
  },
  async readEvents(_projectId, caseId, params, signal) {
    if (signal?.aborted) throw signal.reason;
    const all: SupportInspectorEventPageResponseDto['items'] = [
      {
        id: 'mock-event-online',
        code: 'retenive.became_online',
        name: 'Пользователь появился онлайн',
        definitionVersion: 1,
        source: 'FRONTEND',
        status: 'PROCESSED',
        occurredAt: '2026-07-26T09:18:00.000Z',
        receivedAt: '2026-07-26T09:18:01.000Z',
      },
      {
        id: 'mock-event-visit',
        code: 'retenive.visit_started',
        name: 'Начался визит пользователя',
        definitionVersion: 2,
        source: 'FRONTEND',
        status: 'RECEIVED',
        occurredAt: '2026-07-26T09:17:00.000Z',
        receivedAt: '2026-07-26T09:17:01.000Z',
      },
    ];
    const offset = params.cursor ? Number(params.cursor) : 0;
    const limit = params.limit ?? 50;
    const items = all.slice(offset, offset + limit);
    return {
      recipeVersion: 1,
      caseId,
      snapshotAt: params.to,
      items,
      nextCursor: offset + items.length < all.length ? String(offset + items.length) : null,
    };
  },
  async readActivity(_projectId, params, signal) {
    if (signal?.aborted) throw signal.reason;
    const caseId = params.caseId ?? null;
    const result: SupportActivitySnapshot = {
      kind: 'SUPPORT_ACTIVITY',
      projectionGeneration: 1,
      computedAt: '2026-07-26T09:20:00.000Z',
      freshnessState: 'READY',
      effectiveWindow: null,
      sourceHighWater: '2',
      checkpoint: '2',
      nextCursor: null,
      capabilities: {
        noEligibleOperator: 'UNAVAILABLE',
        routingCapacityRisks: 'AVAILABLE',
        savedQueues: 'UNAVAILABLE',
        sla: 'CONFIGURED',
        teamSkillLanguageCapacity: 'UNAVAILABLE',
      },
      data: {
        facts: [
          {
            activityId: 'mock-activity-2',
            activitySequence: '2',
            actor: { type: 'CMS_USER', cmsUserId: 'cms_1', systemCode: null },
            assignmentId: 'mock-assignment-1',
            caseId,
            commandOutcome: 'APPLIED',
            conversationId: null,
            deliveryId: null,
            deliveryState: null,
            eligibilityOverride: null,
            eventCode: 'SUPPORT_CASE_ASSIGNMENT_CLAIMED',
            factKind: 'ASSIGNMENT',
            messageId: null,
            occurredAt: '2026-07-26T09:20:00.000Z',
            operatorCmsUserId: 'cms_1',
            ownerVersion: 1,
            reasonCode: 'SELF_CLAIM',
            schemaVersion: 1,
            targetTeamId: 'mock-team-1',
          },
          {
            activityId: 'mock-activity-1',
            activitySequence: '1',
            actor: {
              type: 'SYSTEM',
              cmsUserId: null,
              systemCode: 'CASE_RUNTIME',
            },
            assignmentId: null,
            caseId,
            commandOutcome: null,
            conversationId: null,
            deliveryId: null,
            deliveryState: null,
            eligibilityOverride: null,
            eventCode: 'CASE_CHANGED',
            factKind: 'CASE',
            messageId: null,
            occurredAt: '2026-07-26T09:19:00.000Z',
            operatorCmsUserId: null,
            ownerVersion: null,
            reasonCode: 'END_USER_CASE_CREATED',
            schemaVersion: 1,
            targetTeamId: null,
          },
        ],
      },
    };
    return result;
  },
};

export const supportInspectorSource: SupportInspectorSource = isMockMode ? mockSource : apiSource;
