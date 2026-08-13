import { describe, expect, it, vi } from 'vitest';
import type {
  SupportLeadCaseRiskPage,
  SupportLeadRiskType,
} from '@/features/support-control/api/support-lead-source';
import { createSupportLeadRisksController } from './use-support-lead-risks';

const page = (
  riskType: SupportLeadRiskType,
  caseIds: string[] = [],
  nextCursor: string | null = null,
): SupportLeadCaseRiskPage => ({
  computedAt: '2026-08-06T10:00:00.000Z',
  freshnessState: 'READY',
  riskType,
  items: caseIds.map((caseId) => ({
    caseId,
    caseVersion: 1,
    assignmentVersion: null,
    deliveryVersion: null,
    detectedAt: '2026-08-06T10:00:00.000Z',
    dueAt: null,
    riskSortAt: '2026-08-06T10:00:00.000Z',
    riskType,
    slaClockVersion: null,
  })),
  nextCursor,
});

describe('support lead risks controller', () => {
  it('does not commit a response after its risk type changes', async () => {
    let resolve!: (value: SupportLeadCaseRiskPage) => void;
    const pending = new Promise<SupportLeadCaseRiskPage>((done) => {
      resolve = done;
    });
    const controller = createSupportLeadRisksController(
      { projectId: () => 'project-1', canRead: () => true },
      {
        readCaseRisks: vi
          .fn()
          .mockReturnValueOnce(pending)
          .mockResolvedValueOnce(page('UNASSIGNED_AGED')),
      },
    );

    const load = controller.load('SLA_AT_RISK');
    await controller.load('UNASSIGNED_AGED');
    resolve(page('SLA_AT_RISK'));
    await load;

    expect(controller.riskType.value).toBe('UNASSIGNED_AGED');
    expect(controller.page.value?.riskType).toBe('UNASSIGNED_AGED');
  });

  it('aborts a risk request when the protected view resets', () => {
    const abort = vi.fn();
    const controller = createSupportLeadRisksController(
      { projectId: () => 'project-1', canRead: () => true },
      {
        readCaseRisks: vi.fn((_, __, ___, signal?: AbortSignal) => {
          signal?.addEventListener('abort', abort, { once: true });
          return new Promise<SupportLeadCaseRiskPage>(() => undefined);
        }),
      },
    );

    void controller.load();
    controller.reset();

    expect(abort).toHaveBeenCalledOnce();
    expect(controller.page.value).toBeNull();
  });

  it('appends a server cursor page without duplicating Cases', async () => {
    const readCaseRisks = vi.fn((_, riskType: SupportLeadRiskType, request?: { cursor?: string }) =>
      Promise.resolve(
        request?.cursor
          ? page(riskType, ['case-1', 'case-2'])
          : page(riskType, ['case-1'], 'cursor-2'),
      ),
    );
    const controller = createSupportLeadRisksController(
      { projectId: () => 'project-1', canRead: () => true },
      { readCaseRisks },
    );

    await controller.load();
    await controller.loadMore();

    expect(controller.page.value?.items.map((item) => item.caseId)).toEqual(['case-1', 'case-2']);
    expect(readCaseRisks).toHaveBeenLastCalledWith(
      'project-1',
      'UNASSIGNED_AGED',
      { cursor: 'cursor-2' },
      expect.any(AbortSignal),
    );
  });
});
