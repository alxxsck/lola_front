import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import type { SupportSlaConfigurationSource } from '../api/support-sla-configuration-source';
import { createSupportSlaConfigurationController } from './use-support-sla-configuration';

const etag = (letter: string) => `"ssla1.${letter.repeat(43)}"`;
const configuration = {
  calendar: {
    timeZone: 'Europe/Madrid',
    weekly: [{ isoWeekday: 1, intervals: [{ startMinute: 540, endMinute: 1080 }] }],
    exceptions: [],
  },
  policy: {
    rules: [
      {
        code: 'DEFAULT',
        order: 0,
        when: {},
        targets: {
          firstHumanResponseBusinessSeconds: 3600,
          nextHumanResponseBusinessSeconds: 7200,
          resolutionBusinessSeconds: 28_800,
        },
        atRiskRemainingPercent: 20,
        pause: {
          firstHumanResponseStatuses: [],
          nextHumanResponseStatuses: ['WAITING_END_USER' as const],
          resolutionStatuses: ['WAITING_END_USER' as const],
        },
      },
    ],
  },
};

function publishedSnapshot(actionEtag = etag('a')) {
  return {
    mode: 'SLA_SETTINGS' as const,
    rootVersion: 1,
    actionEtag,
    reconciliationCheckpoint: 'checkpoint-1',
    draft: null,
    publishedConfiguration: {
      configurationRevision: {
        id: 'configuration-1',
        revisionNumber: 1,
        catalogRevisionId: 'sla-catalog-r1',
        configurationHash: 'd'.repeat(64),
        publicationKind: 'PUBLISH' as const,
        publishReason: 'Начальная публикация',
        publishedAt: '2026-08-10T10:00:00.000Z',
      },
      calendarRevision: {
        id: 'calendar-1',
        revisionNumber: 1,
        sourceDraftGeneration: 1,
        contentHash: 'a'.repeat(64),
        publishedAt: '2026-08-10T10:00:00.000Z',
        calendarEngineRevision: 'calendar-engine-1',
        tzdbVersion: '2026a',
        calendar: structuredClone(configuration.calendar),
      },
      policyRevision: {
        id: 'policy-1',
        revisionNumber: 1,
        sourceDraftGeneration: 1,
        contentHash: 'b'.repeat(64),
        publishedAt: '2026-08-10T10:00:00.000Z',
        policy: structuredClone(configuration.policy),
      },
    },
  };
}

function draftSnapshot(actionEtag = etag('b')) {
  return {
    ...publishedSnapshot(actionEtag),
    rootVersion: 2,
    draft: {
      generation: 2,
      version: 1,
      contentHash: 'c'.repeat(64),
      configuration: structuredClone(configuration),
    },
  };
}

function setup(sourceOverrides: Partial<SupportSlaConfigurationSource> = {}) {
  const source: SupportSlaConfigurationSource = {
    read: vi.fn().mockResolvedValue(publishedSnapshot()),
    replaceDraft: vi.fn().mockResolvedValue({
      intent: 'REPLACE_SLA_DRAFT',
      rootVersion: 2,
      actionEtag: etag('b'),
      draft: {
        generation: 2,
        version: 1,
        contentHash: 'c'.repeat(64),
      },
    }),
    discardDraft: vi.fn(),
    publish: vi.fn(),
    ...sourceOverrides,
  };
  const onForbidden = vi.fn();
  const controller = createSupportSlaConfigurationController(
    {
      actorId: () => 'operator-1',
      projectId: () => 'project-1',
      canRead: () => true,
      canManage: () => true,
      onForbidden,
      createIdempotencyKey: () => 'sla-command-key-1',
    },
    source,
  );
  return { controller, source, onForbidden };
}

describe('Support SLA configuration controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves a complete draft and reconciles normalized state', async () => {
    const { controller, source } = setup();
    vi.mocked(source.read)
      .mockResolvedValueOnce(publishedSnapshot())
      .mockResolvedValueOnce(draftSnapshot());

    await controller.load();
    controller.form.value.rules[0]!.targetsMinutes.resolution = 600;
    await controller.saveDraft();

    expect(source.replaceDraft).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        policy: expect.objectContaining({
          rules: [
            expect.objectContaining({
              targets: expect.objectContaining({
                resolutionBusinessSeconds: 36_000,
              }),
            }),
          ],
        }),
      }),
      etag('a'),
      'sla-command-key-1',
      expect.any(AbortSignal),
    );
    expect(controller.snapshot.value?.draft?.version).toBe(1);
    expect(controller.dirty.value).toBe(false);
    expect(controller.success.value).toContain('Черновик сохранён');
  });

  it('keeps local edits while reconciling an OCC conflict', async () => {
    const { controller, source } = setup({
      replaceDraft: vi
        .fn()
        .mockRejectedValue(
          new ApiError(409, 'conflict', undefined, undefined, 'SLA_DRAFT_VERSION_CONFLICT'),
        ),
    });
    vi.mocked(source.read)
      .mockResolvedValueOnce(publishedSnapshot())
      .mockResolvedValueOnce(draftSnapshot());

    await controller.load();
    controller.form.value.timeZone = 'Europe/Paris';
    await controller.saveDraft();

    expect(controller.form.value.timeZone).toBe('Europe/Paris');
    expect(controller.snapshot.value?.draft?.version).toBe(1);
    expect(controller.conflict.value).toBe(true);
    expect(controller.error.value).toContain('конфигурация изменилась');
  });

  it('recognizes an accepted save after a transport timeout by GET reconcile', async () => {
    const { controller, source } = setup({
      replaceDraft: vi
        .fn()
        .mockRejectedValue(new ApiError(0, 'timeout', undefined, undefined, 'NETWORK_ERROR')),
    });
    const accepted = draftSnapshot();
    accepted.draft!.configuration!.policy.rules[0]!.targets.resolutionBusinessSeconds = 36_000;
    vi.mocked(source.read)
      .mockResolvedValueOnce(publishedSnapshot())
      .mockResolvedValueOnce(accepted);

    await controller.load();
    controller.form.value.rules[0]!.targetsMinutes.resolution = 600;
    await controller.saveDraft();

    expect(controller.recovery.value).toBeNull();
    expect(controller.dirty.value).toBe(false);
    expect(controller.success.value).toContain('подтверждено сверкой');
  });

  it('discards only the saved draft and keeps the published configuration', async () => {
    const afterDiscard = publishedSnapshot(etag('c'));
    afterDiscard.rootVersion = 3;
    const { controller, source } = setup({
      discardDraft: vi.fn().mockResolvedValue({
        intent: 'DISCARD_SLA_DRAFT',
        rootVersion: 3,
        actionEtag: etag('c'),
      }),
    });
    vi.mocked(source.read)
      .mockResolvedValueOnce(draftSnapshot())
      .mockResolvedValueOnce(afterDiscard);

    await controller.load();
    await controller.discardDraft();

    expect(source.discardDraft).toHaveBeenCalledWith(
      'project-1',
      etag('b'),
      'sla-command-key-1',
      expect.any(AbortSignal),
    );
    expect(controller.snapshot.value?.draft).toBeNull();
    expect(controller.snapshot.value?.publishedConfiguration?.policyRevision.id).toBe('policy-1');
    expect(controller.success.value).toBe('Черновик удалён.');
  });

  it('publishes the saved draft', async () => {
    const published = publishedSnapshot(etag('c'));
    published.rootVersion = 3;
    published.publishedConfiguration!.calendarRevision.revisionNumber = 2;
    published.publishedConfiguration!.policyRevision.revisionNumber = 2;
    const { controller, source } = setup({
      publish: vi.fn().mockResolvedValue({
        intent: 'PUBLISH_SLA_CONFIGURATION',
        rootVersion: 3,
        actionEtag: etag('c'),
        calendarRevisionId: 'calendar-2',
        policyRevisionId: 'policy-2',
      }),
    });
    vi.mocked(source.read).mockResolvedValueOnce(draftSnapshot()).mockResolvedValueOnce(published);

    await controller.load();
    await controller.publish();

    expect(source.publish).toHaveBeenCalledWith(
      'project-1',
      etag('b'),
      'sla-command-key-1',
      expect.any(AbortSignal),
    );
    expect(controller.snapshot.value?.draft).toBeNull();
    expect(controller.snapshot.value?.publishedConfiguration?.policyRevision.revisionNumber).toBe(
      2,
    );
    expect(controller.success.value).toContain('Состояние расчёта не изменено');
  });

  it('retries an unknown save with the exact original body, ETag, and idempotency key', async () => {
    const replaceDraft = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'timeout', undefined, undefined, 'NETWORK_ERROR'))
      .mockResolvedValueOnce({
        intent: 'REPLACE_SLA_DRAFT',
        rootVersion: 2,
        actionEtag: etag('b'),
        draft: {
          generation: 2,
          version: 1,
          contentHash: 'c'.repeat(64),
        },
      });
    const { controller, source } = setup({ replaceDraft });
    vi.mocked(source.read)
      .mockResolvedValueOnce(publishedSnapshot())
      .mockResolvedValueOnce(publishedSnapshot())
      .mockResolvedValueOnce(draftSnapshot());

    await controller.load();
    controller.form.value.rules[0]!.targetsMinutes.resolution = 600;
    await controller.saveDraft();
    expect(controller.recovery.value).toBe('UNKNOWN_OUTCOME');

    await controller.retryPending();

    expect(replaceDraft).toHaveBeenCalledTimes(2);
    expect(replaceDraft.mock.calls[1]!.slice(0, 4)).toEqual(
      replaceDraft.mock.calls[0]!.slice(0, 4),
    );
    expect(controller.recovery.value).toBeNull();
    expect(controller.snapshot.value?.draft?.version).toBe(1);
  });
});
