import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import { createSupportSearchController } from './use-support-search';
import type {
  SupportSearchPage,
  SupportSearchRequest,
} from '@/features/support-search/api/support-search-source';

function page(id: string, nextCursor: string | null = null): SupportSearchPage {
  return {
    items: [
      {
        id,
        kind: 'CASE',
        selection: { kind: 'CASE', id },
        snippet: `Case ${id}`,
        activityAt: '2026-08-08T10:00:00.000Z',
        matchProvenance: 'ORIGINAL',
      },
    ],
    nextCursor,
    freshness: {
      state: 'READY',
      lagSeconds: 0,
      indexedThrough: '2026-08-08T10:00:00.000Z',
    },
  };
}

describe('support search controller', () => {
  it('ignores a stale response after the query changes', async () => {
    const resolvers: Array<(value: SupportSearchPage) => void> = [];
    let request: SupportSearchRequest = {
      phrase: 'first',
      scope: 'CASES',
      filters: {},
      sort: { field: 'RELEVANCE', direction: 'DESC' },
    };
    const source = {
      search: vi.fn(() => new Promise<SupportSearchPage>((resolve) => resolvers.push(resolve))),
    };
    const controller = createSupportSearchController(
      { projectId: () => 'project-1', request: () => request },
      source,
    );

    const first = controller.search();
    request = { ...request, phrase: 'second' };
    const second = controller.search();
    resolvers[1]!(page('new'));
    await second;
    resolvers[0]!(page('stale'));
    await first;

    expect(controller.items.value.map((item) => item.id)).toEqual(['new']);
  });

  it('invalidates an in-flight response before the debounced replacement starts', async () => {
    let resolve!: (value: SupportSearchPage) => void;
    const source = {
      search: vi.fn(() => new Promise<SupportSearchPage>((done) => (resolve = done))),
    };
    const controller = createSupportSearchController(
      {
        projectId: () => 'project-1',
        request: () => ({
          phrase: 'old query',
          scope: 'CASES',
          filters: {},
          sort: { field: 'RELEVANCE', direction: 'DESC' },
        }),
      },
      source,
    );

    const pending = controller.search();
    controller.reset();
    resolve(page('stale'));
    await pending;

    expect(controller.items.value).toEqual([]);
    expect(controller.loading.value).toBe(false);
  });

  it('sends filters, sort and the server cursor without filtering locally', async () => {
    const source = {
      search: vi
        .fn()
        .mockResolvedValueOnce(page('one', 'signed-cursor'))
        .mockResolvedValueOnce(page('two')),
    };
    const request: SupportSearchRequest = {
      phrase: 'payment',
      scope: 'CASES',
      filters: { statuses: ['OPEN'], priorities: ['HIGH'] },
      sort: { field: 'PRIORITY', direction: 'DESC' },
    };
    const controller = createSupportSearchController(
      { projectId: () => 'project-1', request: () => request },
      source,
    );

    await controller.search();
    await controller.loadMore();

    expect(source.search).toHaveBeenNthCalledWith(2, 'project-1', {
      ...request,
      cursor: 'signed-cursor',
      limit: 30,
    });
    expect(controller.items.value.map((item) => item.id)).toEqual(['one', 'two']);
  });

  it('separates validation, degraded and concealed states', async () => {
    const source = {
      search: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(400, 'Invalid query'))
        .mockResolvedValueOnce({
          ...page('one'),
          freshness: {
            state: 'DEGRADED' as const,
            lagSeconds: 75,
            indexedThrough: '2026-08-08T09:58:45.000Z',
          },
        })
        .mockRejectedValueOnce(new ApiError(404, 'Concealed')),
    };
    const request: SupportSearchRequest = {
      phrase: 'payment',
      scope: 'CASES',
      filters: {},
      sort: { field: 'RELEVANCE', direction: 'DESC' },
    };
    const onForbidden = vi.fn();
    const controller = createSupportSearchController(
      {
        projectId: () => 'project-1',
        request: () => request,
        onForbidden,
      },
      source,
    );

    await controller.search();
    expect(controller.failure.value).toBe('VALIDATION');
    await controller.search();
    expect(controller.freshness.value?.state).toBe('DEGRADED');
    await controller.search();
    expect(controller.items.value).toEqual([]);
    expect(controller.failure.value).toBe('FORBIDDEN');
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it('does not call the source without the dedicated search capability', async () => {
    const source = { search: vi.fn() };
    const controller = createSupportSearchController(
      {
        projectId: () => 'project-1',
        canSearch: () => false,
        request: () => ({
          phrase: 'payment',
          scope: 'CASES',
          filters: {},
          sort: { field: 'RELEVANCE', direction: 'DESC' },
        }),
      },
      source,
    );

    await controller.search();

    expect(source.search).not.toHaveBeenCalled();
    expect(controller.items.value).toEqual([]);
  });

  it('does not commit a late response after search authority is revoked', async () => {
    let allowed = true;
    let resolve!: (value: SupportSearchPage) => void;
    const source = {
      search: vi.fn(() => new Promise<SupportSearchPage>((done) => (resolve = done))),
    };
    const controller = createSupportSearchController(
      {
        projectId: () => 'project-1',
        canSearch: () => allowed,
        request: () => ({
          phrase: 'payment',
          scope: 'CASES',
          filters: {},
          sort: { field: 'RELEVANCE', direction: 'DESC' },
        }),
      },
      source,
    );

    const pending = controller.search();
    allowed = false;
    resolve(page('concealed'));
    await pending;

    expect(controller.items.value).toEqual([]);
  });

  it('does not commit a response after the active project changes', async () => {
    let projectId = 'project-1';
    let resolve!: (value: SupportSearchPage) => void;
    const source = {
      search: vi.fn(() => new Promise<SupportSearchPage>((done) => (resolve = done))),
    };
    const controller = createSupportSearchController(
      {
        projectId: () => projectId,
        request: () => ({
          phrase: 'payment',
          scope: 'CASES',
          filters: {},
          sort: { field: 'RELEVANCE', direction: 'DESC' },
        }),
      },
      source,
    );

    const pending = controller.search();
    projectId = 'project-2';
    resolve(page('project-1-result'));
    await pending;

    expect(controller.items.value).toEqual([]);
  });
});
