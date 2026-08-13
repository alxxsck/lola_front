import {
  supportSlaConfigurationDiscardDraft,
  supportSlaConfigurationPublish,
  supportSlaConfigurationRead,
  supportSlaConfigurationReplaceDraft,
} from '@/shared/api/generated/retenive-backend';
import type {
  DiscardSupportSlaDraftMutationResponseDto,
  PublishSupportSlaConfigurationMutationResponseDto,
  ReplaceSupportSlaConfigurationDraftDto,
  ReplaceSupportSlaDraftMutationResponseDto,
  SupportSlaConfigurationSettingsResponseDto,
  SupportSlaConfigurationDraftResponseDto,
} from '@/shared/api/generated/models';
import { ApiError, normalizeApiError } from '@/shared/api/http/api-error';
import { noAuthRetryRequestOptions } from '@/shared/api/http/axios-instance';
import { dataMode } from '@/shared/config/data-mode';

export type SupportSlaConfigurationSnapshot = Omit<
  Pick<
    SupportSlaConfigurationSettingsResponseDto,
    'mode' | 'rootVersion' | 'actionEtag' | 'draft' | 'publishedConfiguration'
  >,
  'draft'
> & {
  draft?:
    | (Omit<SupportSlaConfigurationDraftResponseDto, 'catalogRevisionId' | 'configuration'> & {
        catalogRevisionId?: string;
        configuration?: Omit<ReplaceSupportSlaConfigurationDraftDto, 'catalogRevisionId'> & {
          catalogRevisionId?: string;
        };
      })
    | null;
};

export interface SupportSlaConfigurationSource {
  read(projectId: string, signal?: AbortSignal): Promise<SupportSlaConfigurationSnapshot>;
  replaceDraft(
    projectId: string,
    configuration: ReplaceSupportSlaConfigurationDraftDto,
    actionEtag: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<ReplaceSupportSlaDraftMutationResponseDto>;
  discardDraft(
    projectId: string,
    actionEtag: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<DiscardSupportSlaDraftMutationResponseDto>;
  publish(
    projectId: string,
    actionEtag: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<PublishSupportSlaConfigurationMutationResponseDto>;
}

function commandOptions(actionEtag: string, idempotencyKey: string, signal?: AbortSignal) {
  return {
    ...noAuthRetryRequestOptions(),
    ...(signal ? { signal } : {}),
    headers: {
      'Idempotency-Key': idempotencyKey,
      'If-Match': actionEtag,
    },
  };
}

function unexpectedReceipt(intent: string | undefined): never {
  throw new ApiError(
    502,
    'Сервер вернул результат другой SLA-команды.',
    { intent },
    undefined,
    'SLA_COMMAND_RECEIPT_MISMATCH',
  );
}

export const apiSupportSlaConfigurationSource: SupportSlaConfigurationSource = {
  async read(projectId, signal) {
    try {
      return await supportSlaConfigurationRead(projectId, {
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },

  async replaceDraft(projectId, configuration, actionEtag, idempotencyKey, signal) {
    try {
      const receipt = await supportSlaConfigurationReplaceDraft(
        projectId,
        configuration,
        commandOptions(actionEtag, idempotencyKey, signal),
      );
      return receipt.intent === 'REPLACE_SLA_DRAFT' ? receipt : unexpectedReceipt(receipt.intent);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },

  async discardDraft(projectId, actionEtag, idempotencyKey, signal) {
    try {
      const receipt = await supportSlaConfigurationDiscardDraft(
        projectId,
        {},
        commandOptions(actionEtag, idempotencyKey, signal),
      );
      return receipt.intent === 'DISCARD_SLA_DRAFT' ? receipt : unexpectedReceipt(receipt.intent);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },

  async publish(projectId, actionEtag, idempotencyKey, signal) {
    try {
      const receipt = await supportSlaConfigurationPublish(
        projectId,
        { reason: 'Publish SLA configuration from CMS' },
        commandOptions(actionEtag, idempotencyKey, signal),
      );
      return receipt.intent === 'PUBLISH_SLA_CONFIGURATION'
        ? receipt
        : unexpectedReceipt(receipt.intent);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockRoots = new Map<string, SupportSlaConfigurationSnapshot>();
const mockReceipts = new Map<string, unknown>();

function mockEtag(version: number): string {
  return `"ssla1.${String(version).padStart(43, 'a')}"`;
}

function mockConfiguration(): ReplaceSupportSlaConfigurationDraftDto {
  return {
    catalogRevisionId: 'mock-sla-catalog-r1',
    calendar: {
      timeZone: 'Europe/Madrid',
      weekly: Array.from({ length: 7 }, (_, index) => ({
        isoWeekday: index + 1,
        intervals: index < 5 ? [{ startMinute: 540, endMinute: 1080 }] : [],
      })),
      exceptions: [],
    },
    policy: {
      rules: [
        {
          code: 'URGENT',
          order: 0,
          when: { priorities: ['URGENT', 'CRITICAL'] },
          targets: {
            firstHumanResponseBusinessSeconds: 1800,
            nextHumanResponseBusinessSeconds: 3600,
            resolutionBusinessSeconds: 14_400,
          },
          atRiskRemainingPercent: 25,
          pause: {
            firstHumanResponseStatuses: [],
            nextHumanResponseStatuses: ['WAITING_END_USER'],
            resolutionStatuses: ['WAITING_END_USER', 'WAITING_SYSTEM'],
          },
        },
        {
          code: 'DEFAULT',
          order: 1,
          when: {},
          targets: {
            firstHumanResponseBusinessSeconds: 3600,
            nextHumanResponseBusinessSeconds: 7200,
            resolutionBusinessSeconds: 28_800,
          },
          atRiskRemainingPercent: 20,
          pause: {
            firstHumanResponseStatuses: [],
            nextHumanResponseStatuses: ['WAITING_END_USER'],
            resolutionStatuses: ['WAITING_END_USER', 'WAITING_SYSTEM'],
          },
        },
      ],
    },
  };
}

function initialMockRoot(): SupportSlaConfigurationSnapshot {
  const configuration = mockConfiguration();
  return {
    mode: 'SLA_SETTINGS',
    rootVersion: 1,
    actionEtag: mockEtag(1),
    draft: null,
    publishedConfiguration: {
      configurationRevision: {
        id: 'mock-configuration-revision-3',
        revisionNumber: 3,
        catalogRevisionId: configuration.catalogRevisionId,
        configurationHash: 'd'.repeat(64),
        publicationKind: 'PUBLISH',
        publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
        publishReason: 'Начальная публикация',
        rollbackSourceRevisionId: null,
      },
      calendarRevision: {
        id: 'mock-calendar-revision-3',
        revisionNumber: 3,
        sourceDraftGeneration: 3,
        contentHash: 'a'.repeat(64),
        publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
        calendarEngineRevision: 'calendar-engine-mock',
        tzdbVersion: '2026a',
        calendar: configuration.calendar,
      },
      policyRevision: {
        id: 'mock-policy-revision-3',
        revisionNumber: 3,
        sourceDraftGeneration: 3,
        contentHash: 'b'.repeat(64),
        publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
        policy: configuration.policy,
      },
    },
  };
}

function mockRoot(projectId: string): SupportSlaConfigurationSnapshot {
  const existing = mockRoots.get(projectId);
  if (existing) return existing;
  const root = initialMockRoot();
  mockRoots.set(projectId, root);
  return root;
}

function assertMockCommand(
  projectId: string,
  actionEtag: string,
  idempotencyKey: string,
  fingerprint: string,
): unknown | null {
  const receiptKey = `${projectId}\u0000${idempotencyKey}`;
  if (mockReceipts.has(receiptKey)) {
    const retained = mockReceipts.get(receiptKey) as {
      fingerprint: string;
      receipt: unknown;
    };
    if (retained.fingerprint !== fingerprint)
      throw new ApiError(
        409,
        'Idempotency key was reused',
        undefined,
        undefined,
        'IDEMPOTENCY_KEY_REUSED',
      );
    return structuredClone(retained.receipt);
  }
  if (mockRoot(projectId).actionEtag !== actionEtag)
    throw new ApiError(
      409,
      'SLA configuration changed',
      undefined,
      undefined,
      'SLA_CONCURRENT_UPDATE',
    );
  return null;
}

function retainMockReceipt(
  projectId: string,
  idempotencyKey: string,
  fingerprint: string,
  receipt: unknown,
): void {
  mockReceipts.set(`${projectId}\u0000${idempotencyKey}`, {
    fingerprint,
    receipt: structuredClone(receipt),
  });
}

export const mockSupportSlaConfigurationSource: SupportSlaConfigurationSource = {
  async read(projectId) {
    return structuredClone(mockRoot(projectId));
  },
  async replaceDraft(projectId, configuration, actionEtag, idempotencyKey) {
    const fingerprint = JSON.stringify({ actionEtag, configuration });
    const retained = assertMockCommand(projectId, actionEtag, idempotencyKey, fingerprint);
    if (retained) return retained as ReplaceSupportSlaDraftMutationResponseDto;
    const current = mockRoot(projectId);
    const nextVersion = current.rootVersion + 1;
    const generation = (current.draft?.generation ?? 3) + 1;
    const draft = {
      catalogRevisionId: configuration.catalogRevisionId,
      generation,
      version: (current.draft?.version ?? 0) + 1,
      contentHash: 'c'.repeat(64),
      configuration: structuredClone(configuration),
    };
    const receipt: ReplaceSupportSlaDraftMutationResponseDto = {
      intent: 'REPLACE_SLA_DRAFT',
      rootVersion: nextVersion,
      actionEtag: mockEtag(nextVersion),
      draft: {
        catalogRevisionId: draft.catalogRevisionId,
        generation: draft.generation,
        version: draft.version,
        contentHash: draft.contentHash,
      },
    };
    mockRoots.set(projectId, {
      ...current,
      rootVersion: nextVersion,
      actionEtag: receipt.actionEtag,
      draft,
    });
    retainMockReceipt(projectId, idempotencyKey, fingerprint, receipt);
    return structuredClone(receipt);
  },
  async discardDraft(projectId, actionEtag, idempotencyKey) {
    const fingerprint = JSON.stringify({ actionEtag, kind: 'DISCARD' });
    const retained = assertMockCommand(projectId, actionEtag, idempotencyKey, fingerprint);
    if (retained) return retained as DiscardSupportSlaDraftMutationResponseDto;
    const current = mockRoot(projectId);
    if (!current.draft)
      throw new ApiError(409, 'Draft is missing', undefined, undefined, 'SLA_DRAFT_NOT_FOUND');
    const nextVersion = current.rootVersion + 1;
    const receipt: DiscardSupportSlaDraftMutationResponseDto = {
      intent: 'DISCARD_SLA_DRAFT',
      rootVersion: nextVersion,
      actionEtag: mockEtag(nextVersion),
      draft: null,
    };
    mockRoots.set(projectId, {
      ...current,
      rootVersion: nextVersion,
      actionEtag: receipt.actionEtag,
      draft: null,
    });
    retainMockReceipt(projectId, idempotencyKey, fingerprint, receipt);
    return structuredClone(receipt);
  },
  async publish(projectId, actionEtag, idempotencyKey) {
    const fingerprint = JSON.stringify({ actionEtag, kind: 'PUBLISH' });
    const retained = assertMockCommand(projectId, actionEtag, idempotencyKey, fingerprint);
    if (retained) return retained as PublishSupportSlaConfigurationMutationResponseDto;
    const current = mockRoot(projectId);
    if (!current.draft?.configuration)
      throw new ApiError(409, 'Draft is missing', undefined, undefined, 'SLA_DRAFT_NOT_FOUND');
    const nextVersion = current.rootVersion + 1;
    const revisionNumber = (current.publishedConfiguration?.policyRevision.revisionNumber ?? 0) + 1;
    const publishedAt = new Date().toISOString();
    const publishedConfiguration = {
      configurationRevision: {
        id: `mock-configuration-revision-${revisionNumber}`,
        revisionNumber,
        catalogRevisionId:
          current.draft.configuration.catalogRevisionId ??
          current.draft.catalogRevisionId ??
          'mock-sla-catalog-r1',
        configurationHash: current.draft.contentHash,
        publicationKind: 'PUBLISH' as const,
        publishedAt,
        publishReason: 'Публикация из CMS',
        rollbackSourceRevisionId: null,
      },
      calendarRevision: {
        id: `mock-calendar-revision-${revisionNumber}`,
        revisionNumber,
        sourceDraftGeneration: current.draft.generation,
        contentHash: current.draft.contentHash,
        publishedAt,
        calendarEngineRevision: 'calendar-engine-mock',
        tzdbVersion: '2026a',
        calendar: structuredClone(current.draft.configuration.calendar),
      },
      policyRevision: {
        id: `mock-policy-revision-${revisionNumber}`,
        revisionNumber,
        sourceDraftGeneration: current.draft.generation,
        contentHash: current.draft.contentHash,
        publishedAt,
        policy: structuredClone(current.draft.configuration.policy),
      },
    };
    const receipt: PublishSupportSlaConfigurationMutationResponseDto = {
      intent: 'PUBLISH_SLA_CONFIGURATION',
      rootVersion: nextVersion,
      actionEtag: mockEtag(nextVersion),
      draft: null,
      publishedConfiguration: {
        configurationRevision: publishedConfiguration.configurationRevision,
        calendarRevision: publishedConfiguration.calendarRevision,
        policyRevision: publishedConfiguration.policyRevision,
      },
    };
    mockRoots.set(projectId, {
      ...current,
      rootVersion: nextVersion,
      actionEtag: receipt.actionEtag,
      draft: null,
      publishedConfiguration,
    });
    retainMockReceipt(projectId, idempotencyKey, fingerprint, receipt);
    return structuredClone(receipt);
  },
};

export function resetMockSupportSlaConfiguration(): void {
  mockRoots.clear();
  mockReceipts.clear();
}

export const supportSlaConfigurationSource =
  dataMode === 'mock' || import.meta.env.MODE === 'test'
    ? mockSupportSlaConfigurationSource
    : apiSupportSlaConfigurationSource;
