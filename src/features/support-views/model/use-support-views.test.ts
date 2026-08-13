import { describe, expect, it, vi } from 'vitest';
import { createSupportViewsController } from './use-support-views';
import type { SupportViewsSource } from '@/features/support-views/api/support-views-source';
import { ApiError } from '@/shared/api/http/api-error';

const freshness = {
  state: 'READY' as const,
  lagSeconds: 0,
  indexedThrough: '2026-08-08T00:00:00Z',
};
const system = {
  code: 'MY_ACTIVE' as const,
  permitted: true,
  surface: 'CASES' as const,
  scope: 'SYSTEM' as const,
  displayNameKey: 'my',
  count: { state: 'EXACT' as const, value: 7, cappedAt: 100 },
  freshness,
};
const defaultView = {
  available: true,
  effectiveSelection: { kind: 'SYSTEM' as const, presetCode: 'MY_ACTIVE' as const },
  selection: { kind: 'SYSTEM' as const, presetCode: 'MY_ACTIVE' as const },
  etag: '"dv1"',
  version: 1,
};

function source(overrides: Partial<SupportViewsSource> = {}): SupportViewsSource {
  return {
    catalog: vi.fn().mockResolvedValue({ system: [system], saved: [], defaultView }),
    query: vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
      freshness,
      authorityKey: 'system:MY_ACTIVE',
    }),
    create: vi.fn(),
    replace: vi.fn(),
    publish: vi.fn(),
    archive: vi.fn(),
    setDefault: vi.fn(),
    ...overrides,
  };
}

describe('support views controller', () => {
  it('uses only an authoritative permitted fallback', async () => {
    const onSelection = vi.fn();
    const api = source();
    const controller = createSupportViewsController(
      {
        projectId: () => 'project-1',
        canSearch: () => true,
        canReadSaved: () => false,
        canMutate: () => false,
        phrase: () => '',
        onSelection,
      },
      api,
    );
    await controller.load({ kind: 'SAVED', id: '11111111-1111-4111-8111-111111111111' });
    expect(controller.selection.value).toEqual({ kind: 'SYSTEM', code: 'MY_ACTIVE' });
    expect(onSelection).toHaveBeenCalledWith({ kind: 'SYSTEM', code: 'MY_ACTIVE' });
  });

  it('drops a late query after project switch', async () => {
    let projectId = 'project-1';
    let resolve!: (value: never) => void;
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        freshness,
        authorityKey: 'system:MY_ACTIVE',
      })
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
    const api = source({ query: query as never });
    const controller = createSupportViewsController(
      {
        projectId: () => projectId,
        canSearch: () => true,
        canReadSaved: () => false,
        canMutate: () => false,
        phrase: () => '',
        onSelection: vi.fn(),
      },
      api,
    );
    await controller.load(null);
    const pending = controller.query();
    projectId = 'project-2';
    resolve({
      items: [{ id: 'leak' }],
      nextCursor: null,
      freshness,
      authorityKey: 'system:MY_ACTIVE',
    } as never);
    await pending;
    expect(controller.items.value).toEqual([]);
  });

  it('allows a search-only operator to replace the personal default', async () => {
    const api = source({ setDefault: vi.fn().mockResolvedValue(defaultView) });
    const controller = createSupportViewsController(
      {
        projectId: () => 'project-1',
        canSearch: () => true,
        canReadSaved: () => false,
        canMutate: () => false,
        phrase: () => '',
        onSelection: vi.fn(),
      },
      api,
    );
    await controller.load(null);
    await expect(
      controller.setDefault({ kind: 'SYSTEM', presetCode: 'ALL_CASES' }, 'default-1'),
    ).resolves.toBe(true);
    expect(api.setDefault).toHaveBeenCalledOnce();
  });

  it('purges a concealed view and resolves a permitted fallback', async () => {
    const saved = {
      id: '11111111-1111-4111-8111-111111111111',
      lifecycle: 'ACTIVE',
      permissions: { read: true },
      draft: { displayName: 'Private' },
    } as never;
    const api = source({
      catalog: vi
        .fn()
        .mockResolvedValueOnce({ system: [system], saved: [saved], defaultView })
        .mockResolvedValueOnce({ system: [system], saved: [], defaultView }),
      query: vi.fn().mockRejectedValueOnce(new ApiError(404, 'concealed')).mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        freshness,
        authorityKey: 'system:MY_ACTIVE',
      }),
    });
    const controller = createSupportViewsController(
      {
        projectId: () => 'project-1',
        canSearch: () => true,
        canReadSaved: () => true,
        canMutate: () => false,
        phrase: () => '',
        onSelection: vi.fn(),
      },
      api,
    );
    await controller.load({ kind: 'SAVED', id: '11111111-1111-4111-8111-111111111111' });
    expect(controller.saved.value).toEqual([]);
    expect(controller.selection.value).toEqual({ kind: 'SYSTEM', code: 'MY_ACTIVE' });
    expect(controller.items.value).toEqual([]);
  });

  it('rejects a late saved catalog after read authority is revoked', async () => {
    let canReadSaved = true;
    let resolveCatalog!: (value: never) => void;
    const catalog = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCatalog = resolve;
        }),
    );
    const api = source({ catalog: catalog as never });
    const controller = createSupportViewsController(
      {
        projectId: () => 'project-1',
        canSearch: () => true,
        canReadSaved: () => canReadSaved,
        canMutate: () => false,
        phrase: () => '',
        onSelection: vi.fn(),
      },
      api,
    );

    const pending = controller.load(null);
    canReadSaved = false;
    await controller.purgeSaved();
    resolveCatalog({
      system: [system],
      saved: [{ id: 'private-view', lifecycle: 'ACTIVE', permissions: { read: true } }],
      defaultView,
    } as never);
    await pending;

    expect(controller.saved.value).toEqual([]);
    expect(controller.selection.value).toBeNull();
  });

  it('bounds forbidden recovery when every refreshed fallback is denied', async () => {
    const allCases = { ...system, code: 'ALL_CASES' as const, displayNameKey: 'all' };
    const conversations = {
      ...system,
      code: 'ALL_CONVERSATIONS' as const,
      surface: 'CONVERSATIONS' as const,
      displayNameKey: 'conversations',
    };
    const privateSaved = {
      id: '11111111-1111-4111-8111-111111111111',
      lifecycle: 'ACTIVE',
      permissions: { read: true },
      draft: { displayName: 'Private' },
    } as never;
    const api = source({
      catalog: vi.fn().mockResolvedValue({
        system: [system, allCases, conversations],
        saved: [privateSaved],
        defaultView,
      }),
      query: vi.fn().mockRejectedValue(new ApiError(403, 'denied')),
    });
    const onSelection = vi.fn();
    const controller = createSupportViewsController(
      {
        projectId: () => 'project-1',
        canSearch: () => true,
        canReadSaved: () => false,
        canMutate: () => false,
        phrase: () => '',
        onSelection,
      },
      api,
    );

    await controller.load(null);

    expect(api.query).toHaveBeenCalledTimes(2);
    expect(controller.selection.value).toBeNull();
    expect(controller.items.value).toEqual([]);
    expect(controller.error.value).toBe('Представление больше недоступно');
    expect(controller.system.value).toEqual([]);
    expect(controller.saved.value).toEqual([]);
    expect(controller.defaultView.value).toBeNull();
    expect(onSelection).toHaveBeenLastCalledWith(null);
  });

  it('enters an explicit custom-search mode without discarding catalogs', async () => {
    const api = source();
    const onSelection = vi.fn();
    const controller = createSupportViewsController(
      {
        projectId: () => 'project-1',
        canSearch: () => true,
        canReadSaved: () => false,
        canMutate: () => false,
        phrase: () => '',
        onSelection,
      },
      api,
    );
    await controller.load(null);

    await controller.clearSelection();

    expect(controller.selection.value).toBeNull();
    expect(controller.system.value).toEqual([system]);
    expect(onSelection).toHaveBeenLastCalledWith(null);
  });

  it('loads catalogs without selecting the default in durable custom mode', async () => {
    const api = source();
    const controller = createSupportViewsController(
      {
        projectId: () => 'project-1',
        canSearch: () => true,
        canReadSaved: () => false,
        canMutate: () => false,
        phrase: () => '',
        onSelection: vi.fn(),
      },
      api,
    );

    await controller.loadCustom();

    expect(controller.system.value).toEqual([system]);
    expect(controller.selection.value).toBeNull();
    expect(api.query).not.toHaveBeenCalled();
  });

  it('clears a custom memory-only phrase before querying a selected view', async () => {
    let phrase = 'private phrase';
    const api = source();
    const controller = createSupportViewsController(
      {
        projectId: () => 'project-1',
        canSearch: () => true,
        canReadSaved: () => false,
        canMutate: () => false,
        phrase: () => phrase,
        beforeSelection: () => {
          phrase = '';
        },
        onSelection: vi.fn(),
      },
      api,
    );
    await controller.loadCustom();

    await controller.select({ kind: 'SYSTEM', code: 'MY_ACTIVE' });

    expect(api.query).toHaveBeenLastCalledWith(
      'project-1',
      { kind: 'SYSTEM', code: 'MY_ACTIVE' },
      '',
      undefined,
    );
  });
});
