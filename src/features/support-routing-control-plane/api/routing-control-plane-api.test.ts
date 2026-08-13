import { beforeEach, describe, expect, it, vi } from 'vitest';

const generated = vi.hoisted(() => ({
  teams: vi.fn(),
  skills: vi.fn(),
  workforce: vi.fn(),
  queues: vi.fn(),
  queueDetail: vi.fn(),
  policies: vi.fn(),
  policyDetail: vi.fn(),
  slots: vi.fn(),
  readiness: vi.fn(),
  activations: vi.fn(),
  operators: vi.fn(),
  availability: vi.fn(),
  saveQueue: vi.fn(),
  noop: vi.fn(),
}));

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  supportWorkforceListTeams: generated.teams,
  supportWorkforceListSkills: generated.skills,
  supportWorkforceGetWorkforce: generated.workforce,
  supportQueueList: generated.queues,
  supportQueueDetail: generated.queueDetail,
  supportRoutingList: generated.policies,
  supportRoutingDetail: generated.policyDetail,
  supportRoutingRuntimeQueueSlots: generated.slots,
  supportRoutingRuntimeReadiness: generated.readiness,
  supportRoutingRuntimeActivation: generated.activations,
  supportPresentationsCatalogOperators: generated.operators,
  supportRoutingRuntimeResolveOperatorAvailability: generated.availability,
  supportQueueReplaceDraft: generated.saveQueue,
  supportQueueCreate: generated.noop,
  supportQueuePreviewDraft: generated.noop,
  supportQueuePublish: generated.noop,
  supportQueueRevisions: generated.noop,
  supportQueueRevisionDiff: generated.noop,
  supportQueueRestoreRevisionAsDraft: generated.noop,
  supportRoutingCreate: generated.noop,
  supportRoutingPublish: generated.noop,
  supportRoutingReplaceDraft: generated.noop,
  supportRoutingRevisionDiff: generated.noop,
  supportRoutingRevisionHistory: generated.noop,
  supportRoutingRestoreRevisionDraft: generated.noop,
  supportRoutingRuntimeConfigurationAuditTimeline: generated.noop,
  supportRoutingRuntimeDecisionDetail: generated.noop,
  supportRoutingRuntimeDecisionList: generated.noop,
  supportRoutingRuntimeQueueSlot: generated.noop,
  supportRoutingRuntimeRequest: generated.noop,
  supportRoutingRuntimeShadowRun: generated.noop,
  supportRoutingRuntimeTransitionQueueActivation: generated.noop,
  supportWorkforceArchiveSkill: generated.noop,
  supportWorkforceArchiveTeam: generated.noop,
  supportWorkforceCreateSkill: generated.noop,
  supportWorkforceCreateTeam: generated.noop,
  supportWorkforceDiscardDraft: generated.noop,
  supportWorkforcePublish: generated.noop,
  supportWorkforceRenameSkill: generated.noop,
  supportWorkforceRenameTeam: generated.noop,
  supportWorkforceReplaceDraft: generated.noop,
  supportWorkforceHistory: generated.noop,
  supportWorkforceDiff: generated.noop,
  supportWorkforceRestore: generated.noop,
}));
vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }));

import { routingControlPlaneSource } from './routing-control-plane-source';
import { emptyQueueDraft } from '../model/routing-control-plane';

describe('routing API adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generated.teams.mockResolvedValue({ teams: { items: [] } });
    generated.skills.mockResolvedValue({ skills: { items: [] } });
    generated.workforce.mockResolvedValue({
      actionEtag: '"workforce-1"',
      rootVersion: 1,
      currentRevisionNumber: 0,
      draft: null,
      publishedRevision: null,
    });
    generated.queues.mockResolvedValue({
      items: [
        {
          id: 'queue-1',
          stableCode: 'queue-one',
          displayName: 'Первая линия',
          description: null,
          lifecycle: 'ACTIVE',
          version: 3,
        },
      ],
    });
    generated.policies.mockResolvedValue({ items: [] });
    generated.slots.mockResolvedValue({ items: [], actionEtag: '"slots-1"' });
    generated.readiness.mockResolvedValue({ items: [], truncated: false });
    generated.activations.mockResolvedValue({ activationsTruncated: false });
    generated.operators.mockResolvedValue({
      items: [
        {
          cmsUserId: '00000000-0000-4000-8000-000000000021',
          displayName: 'Анна Смирнова',
          membershipState: 'ACTIVE',
        },
      ],
      nextCursor: null,
    });
    generated.availability.mockResolvedValue({
      items: [
        {
          operatorId: '00000000-0000-4000-8000-000000000021',
          status: 'AVAILABLE',
          acceptsNewWork: true,
          version: 7,
          expiresAt: null,
        },
      ],
    });
  });

  it('loads bounded catalogs without an N+1 detail fan-out', async () => {
    const value = await routingControlPlaneSource.load('project-1', {
      teams: true,
      teamsManage: true,
      availability: true,
      queues: true,
      routing: true,
    });

    expect(value.queues).toHaveLength(1);
    expect(generated.queueDetail).not.toHaveBeenCalled();
    expect(generated.policyDetail).not.toHaveBeenCalled();
    expect(value.operators[0]?.availability).toBe('AVAILABLE');
    expect(generated.availability).toHaveBeenCalledWith(
      'project-1',
      { cmsUserIds: ['00000000-0000-4000-8000-000000000021'] },
      { signal: undefined },
    );
    expect(generated.queues).toHaveBeenCalledWith(
      'project-1',
      { limit: 100 },
      { signal: undefined },
    );
  });

  it('passes OCC and idempotency headers through the generated mutation', async () => {
    const signal = new AbortController().signal;
    await routingControlPlaneSource.saveQueue(
      'project-1',
      'queue-1',
      emptyQueueDraft('Первая линия'),
      {
        actionEtag: '"queue-3"',
        idempotencyKey: 'routing-command-1',
        signal,
      },
    );

    expect(generated.saveQueue).toHaveBeenCalledWith(
      'project-1',
      'queue-1',
      { draft: emptyQueueDraft('Первая линия') },
      {
        signal,
        headers: {
          'If-Match': '"queue-3"',
          'Idempotency-Key': 'routing-command-1',
        },
      },
    );
  });
});
