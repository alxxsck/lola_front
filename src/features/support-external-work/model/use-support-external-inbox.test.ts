import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import {
  mockSupportExternalWorkSource,
  resetMockSupportExternalWork,
} from '../api/support-external-work-mock-source';
import { createSupportExternalInboxController } from './use-support-external-inbox';

describe('Support External Work inbox controller', () => {
  beforeEach(() => resetMockSupportExternalWork());

  it('loads the compatibility inbox and its causal timeline', async () => {
    const controller = createSupportExternalInboxController(
      {
        actorId: () => 'operator-1',
        projectId: () => 'project-1',
        canReadInbox: () => true,
        canReadLinked: () => true,
        canRetry: () => true,
        canResolveUnknown: () => true,
      },
      mockSupportExternalWorkSource,
    );

    await controller.load();
    await controller.selectItem(controller.items.value[0]!.itemId);

    expect(controller.mode.value).toBe('ATTENTION');
    expect(controller.detail.value?.provider).toBe('HELPDESK');
    expect(controller.timeline.value).toHaveLength(2);
    expect(controller.commands.value).toEqual([]);
  });

  it('shows exact Case commands only for a linked item', async () => {
    const controller = createSupportExternalInboxController(
      {
        actorId: () => 'operator-1',
        projectId: () => 'project-1',
        canReadInbox: () => true,
        canReadLinked: () => true,
        canRetry: () => true,
        canResolveUnknown: () => true,
      },
      mockSupportExternalWorkSource,
    );

    await controller.setMode('LINKED');
    await controller.selectItem(controller.items.value[0]!.itemId);

    expect(controller.detail.value?.link?.caseId).toBeTruthy();
    expect(controller.commands.value[0]).toMatchObject({
      status: 'UNKNOWN',
      errorCategory: 'UNKNOWN_OUTCOME',
    });
  });

  it('passes bounded provider, status, freshness and age filters to the linked read', async () => {
    const listItems = vi.fn(mockSupportExternalWorkSource.listItems);
    const controller = createSupportExternalInboxController(
      {
        actorId: () => 'operator-1',
        projectId: () => 'project-1',
        canReadInbox: () => true,
        canReadLinked: () => true,
        canRetry: () => true,
        canResolveUnknown: () => true,
        now: () => new Date('2026-08-09T16:00:00.000Z'),
      },
      { ...mockSupportExternalWorkSource, listItems },
    );
    controller.provider.value = 'JSM';
    controller.status.value = 'IN_PROGRESS';
    controller.freshness.value = 'FRESH';
    controller.age.value = '24H';

    await controller.setMode('LINKED');

    expect(listItems).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        provider: 'JSM',
        status: 'IN_PROGRESS',
        freshness: 'FRESH',
        updatedAfter: '2026-08-08T16:00:00.000Z',
        limit: 50,
      }),
      expect.any(AbortSignal),
    );
  });

  it('uses opaque cursors and replaces rows when moving between server pages', async () => {
    const first = await mockSupportExternalWorkSource.listItems('project-1');
    const pageOne = { ...first.items[0]!, summary: 'page one' };
    const pageTwo = { ...first.items[0]!, itemId: 'page-two-item', summary: 'page two' };
    const listItems = vi
      .fn()
      .mockResolvedValueOnce({ items: [pageOne], nextCursor: 'opaque-next' })
      .mockResolvedValueOnce({ items: [pageTwo], nextCursor: null })
      .mockResolvedValueOnce({ items: [pageOne], nextCursor: 'opaque-next' });
    const controller = createSupportExternalInboxController(
      {
        actorId: () => 'operator-pages',
        projectId: () => 'project-pages',
        canReadInbox: () => false,
        canReadLinked: () => true,
        canRetry: () => false,
        canResolveUnknown: () => false,
      },
      { ...mockSupportExternalWorkSource, listItems },
    );

    await controller.load();
    await controller.loadMore();
    expect(listItems).toHaveBeenNthCalledWith(
      2,
      'project-pages',
      expect.objectContaining({ cursor: 'opaque-next', limit: 50 }),
      expect.any(AbortSignal),
    );
    expect(controller.items.value.map((item) => item.summary)).toEqual(['page two']);
    expect(controller.pageIndex.value).toBe(1);

    await controller.loadPrevious();
    expect(listItems).toHaveBeenNthCalledWith(
      3,
      'project-pages',
      expect.not.objectContaining({ cursor: expect.anything() }),
      expect.any(AbortSignal),
    );
    expect(controller.items.value.map((item) => item.summary)).toEqual(['page one']);
  });

  it('enforces retry and resolve-unknown permissions independently', async () => {
    let resolveUnknown = false;
    const refreshCommandEvidence = vi.fn(mockSupportExternalWorkSource.refreshCommandEvidence);
    const controller = createSupportExternalInboxController(
      {
        actorId: () => 'operator-iam',
        projectId: () => 'project-iam',
        canReadInbox: () => true,
        canReadLinked: () => true,
        canRetry: () => true,
        canResolveUnknown: () => resolveUnknown,
      },
      { ...mockSupportExternalWorkSource, refreshCommandEvidence },
    );
    await controller.setMode('LINKED');
    await controller.selectItem(controller.items.value[0]!.itemId);
    const commandId = controller.commands.value[0]!.commandId;

    await controller.refreshCommandEvidence(commandId);
    expect(refreshCommandEvidence).not.toHaveBeenCalled();

    resolveUnknown = true;
    await controller.refreshCommandEvidence(commandId);
    expect(refreshCommandEvidence).toHaveBeenCalledOnce();
  });

  it('ignores a late forbidden detail page from an obsolete Project scope', async () => {
    let projectId = 'project-old';
    let rejectOldPage!: (cause: unknown) => void;
    let timelineReads = 0;
    const baseTimeline = await mockSupportExternalWorkSource.readLinkedTimeline(
      'project-old',
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      { limit: 100 },
    );
    const readLinkedTimeline = vi.fn(async () => {
      timelineReads += 1;
      if (timelineReads === 1) return { ...baseTimeline, nextCursor: 'old-detail-cursor' };
      if (timelineReads === 2)
        return new Promise<never>((_resolve, reject) => {
          rejectOldPage = reject;
        });
      return { ...baseTimeline, nextCursor: null };
    });
    const onForbidden = vi.fn();
    const context = {
      actorId: () => 'operator-detail-scope',
      projectId: () => projectId,
      canReadInbox: () => true,
      canReadLinked: () => true,
      canRetry: () => true,
      canResolveUnknown: () => true,
      onForbidden,
    };
    const controller = createSupportExternalInboxController(context, {
      ...mockSupportExternalWorkSource,
      readLinkedTimeline,
    });
    await controller.setMode('LINKED');
    await controller.selectItem(controller.items.value[0]!.itemId);
    const oldPage = controller.loadMoreTimeline();
    await vi.waitFor(() => expect(rejectOldPage).toBeTypeOf('function'));

    projectId = 'project-new';
    controller.reset();
    await controller.setMode('LINKED');
    await controller.selectItem(controller.items.value[0]!.itemId);
    rejectOldPage(new ApiError(403, 'old scope denied'));
    await oldPage;

    expect(onForbidden).not.toHaveBeenCalled();
    expect(controller.detail.value?.itemId).toBe('40000000-0000-4000-8000-000000000002');
    expect(controller.timeline.value).toHaveLength(2);
  });

  it('exact-replays a timed-out recovery command with the same key', async () => {
    const keys: string[] = [];
    let attempt = 0;
    const refreshCommandEvidence = vi.fn(
      async (...args: Parameters<typeof mockSupportExternalWorkSource.refreshCommandEvidence>) => {
        attempt += 1;
        keys.push(args[5]);
        if (attempt === 1) throw new ApiError(0, 'timeout');
        return mockSupportExternalWorkSource.refreshCommandEvidence(...args);
      },
    );
    const controller = createSupportExternalInboxController(
      {
        actorId: () => 'operator-1',
        projectId: () => 'project-1',
        canReadInbox: () => true,
        canReadLinked: () => true,
        canRetry: () => true,
        canResolveUnknown: () => true,
        createIdempotencyKey: () => 'stable-recovery-key',
      },
      { ...mockSupportExternalWorkSource, refreshCommandEvidence },
    );
    await controller.setMode('LINKED');
    await controller.selectItem(controller.items.value[0]!.itemId);

    await controller.refreshCommandEvidence(controller.commands.value[0]!.commandId);
    expect(controller.recovery.value).toBe('UNKNOWN_OUTCOME');

    await controller.retryPending();
    expect(keys).toEqual(['stable-recovery-key', 'stable-recovery-key']);
    expect(controller.recovery.value).toBeNull();
  });

  it('retains an ambiguous recovery only for its captured actor and Project', async () => {
    let projectId = 'project-a';
    let attempt = 0;
    let reject!: (cause: unknown) => void;
    const keys: string[] = [];
    const refreshCommandEvidence = vi.fn(
      async (...args: Parameters<typeof mockSupportExternalWorkSource.refreshCommandEvidence>) => {
        attempt += 1;
        keys.push(args[5]);
        if (attempt === 1)
          return new Promise<never>((_resolve, rejectPromise) => {
            reject = rejectPromise;
          });
        return mockSupportExternalWorkSource.refreshCommandEvidence(...args);
      },
    );
    const context = {
      actorId: () => 'operator-captured',
      projectId: () => projectId,
      canReadInbox: () => true,
      canReadLinked: () => true,
      canRetry: () => true,
      canResolveUnknown: () => true,
      createIdempotencyKey: () => 'captured-command-key',
    };
    const controller = createSupportExternalInboxController(context, {
      ...mockSupportExternalWorkSource,
      refreshCommandEvidence,
    });
    await controller.setMode('LINKED');
    await controller.selectItem(controller.items.value[0]!.itemId);
    const request = controller.refreshCommandEvidence(controller.commands.value[0]!.commandId);
    await vi.waitFor(() => expect(reject).toBeTypeOf('function'));

    projectId = 'project-b';
    controller.reset();
    reject(new ApiError(0, 'timeout'));
    await request;
    await controller.load();
    expect(controller.recovery.value).toBeNull();

    projectId = 'project-a';
    await controller.load();
    expect(controller.recovery.value).toBe('UNKNOWN_OUTCOME');
    await controller.retryPending();
    expect(keys).toEqual(['captured-command-key', 'captured-command-key']);
  });
});
