import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportOperationalAlertDetail,
  SupportOperationalAlertPage,
} from '@/features/support-control/api/support-lead-source';
import { createSupportOperationalAlertsController } from './use-support-operational-alerts';

function commands() {
  return { acknowledge: vi.fn(), resolve: vi.fn() };
}

function alertPage(
  ids: string[] = [],
  nextCursor: string | null = null,
): SupportOperationalAlertPage {
  return {
    computedAt: '2026-08-06T10:00:00.000Z',
    materializationState: 'READY',
    items: ids.map((id) => ({
      id,
      version: 1,
      severity: 'HIGH',
      state: 'NEW',
      sourceKind: 'UNASSIGNED_AGED',
      firstObservedAt: '2026-08-06T09:55:00.000Z',
      lastObservedAt: '2026-08-06T10:00:00.000Z',
      occurrenceCount: 1,
      hasOwner: false,
    })),
    nextCursor,
  };
}

function alertDetail(
  ids: string[] = [],
  nextCursor: string | null = null,
): SupportOperationalAlertDetail {
  return {
    alert: alertPage(['alert-1']).items[0]!,
    computedAt: '2026-08-06T10:00:00.000Z',
    materializationState: 'READY',
    effectiveWindow: {
      from: '2026-08-06T09:00:00.000Z',
      to: '2026-08-06T10:00:00.000Z',
    },
    generation: 1,
    policyRevisionId: 'policy-r1',
    nextCursor,
    timeline: ids.map((id) => ({
      id,
      eventKind: 'SOURCE_OBSERVED',
      occurredAt: '2026-08-06T10:00:00.000Z',
      actorType: 'SYSTEM',
      beforeVersion: null,
      afterVersion: 1,
      generation: 1,
      policyRevisionId: 'policy-r1',
      reasonCode: null,
    })),
  };
}

describe('support operational alerts controller', () => {
  it('does not commit list data after the alert permission is revoked', async () => {
    let allowed = true;
    let resolve!: (value: SupportOperationalAlertPage) => void;
    const pending = new Promise<SupportOperationalAlertPage>((done) => {
      resolve = done;
    });
    const controller = createSupportOperationalAlertsController(
      { projectId: () => 'project-1', canRead: () => allowed },
      {
        readAlerts: vi.fn().mockReturnValue(pending),
        readAlertDetail: vi.fn(),
        ...commands(),
      },
    );

    const load = controller.load();
    allowed = false;
    controller.reset();
    resolve(alertPage());
    await load;

    expect(controller.page.value).toBeNull();
    expect(controller.error.value).toBe('');
  });

  it('aborts an open causal timeline and ignores a late response after the pane closes', async () => {
    const abort = vi.fn();
    let resolve!: (value: SupportOperationalAlertDetail) => void;
    const pending = new Promise<SupportOperationalAlertDetail>((done) => {
      resolve = done;
    });
    const controller = createSupportOperationalAlertsController(
      { projectId: () => 'project-1', canRead: () => true },
      {
        readAlerts: vi.fn().mockResolvedValue(alertPage()),
        readAlertDetail: vi.fn((_, __, ___, signal?: AbortSignal) => {
          signal?.addEventListener('abort', abort, { once: true });
          return pending;
        }),
        ...commands(),
      },
    );

    const open = controller.openDetail('alert-1');
    controller.closeDetail();
    resolve(alertDetail());
    await open;

    expect(abort).toHaveBeenCalledOnce();
    expect(controller.detail.value).toBeNull();
  });

  it('appends a server cursor page without duplicating alerts', async () => {
    const readAlerts = vi.fn((_, request?: { cursor?: string }) =>
      Promise.resolve(
        request?.cursor ? alertPage(['alert-1', 'alert-2']) : alertPage(['alert-1'], 'cursor-2'),
      ),
    );
    const controller = createSupportOperationalAlertsController(
      { projectId: () => 'project-1', canRead: () => true },
      { readAlerts, readAlertDetail: vi.fn(), ...commands() },
    );

    await controller.load();
    await controller.loadMore();

    expect(controller.page.value?.items.map((item) => item.id)).toEqual(['alert-1', 'alert-2']);
    expect(readAlerts).toHaveBeenLastCalledWith(
      'project-1',
      { cursor: 'cursor-2' },
      expect.any(AbortSignal),
    );
  });

  it('appends a causal-history cursor page without duplicating events', async () => {
    const readAlertDetail = vi.fn((_, __, request?: { cursor?: string }) =>
      Promise.resolve(
        request?.cursor
          ? alertDetail(['event-1', 'event-2'])
          : alertDetail(['event-1'], 'cursor-2'),
      ),
    );
    const controller = createSupportOperationalAlertsController(
      { projectId: () => 'project-1', canRead: () => true },
      { readAlerts: vi.fn(), readAlertDetail, ...commands() },
    );

    await controller.openDetail('alert-1');
    await controller.loadMoreDetail();

    expect(controller.detail.value?.timeline.map((event) => event.id)).toEqual([
      'event-1',
      'event-2',
    ]);
    expect(readAlertDetail).toHaveBeenLastCalledWith(
      'project-1',
      'alert-1',
      {
        cursor: 'cursor-2',
        from: '2026-08-06T09:00:00.000Z',
        to: '2026-08-06T10:00:00.000Z',
      },
      expect.any(AbortSignal),
    );
  });

  it('acknowledges only the opened alert with its current server version', async () => {
    const acknowledge = vi.fn().mockResolvedValue({
      alertId: 'alert-1',
      state: 'ACKNOWLEDGED',
      version: 2,
      occurredAt: '2026-08-06T10:02:00.000Z',
      replayed: false,
    });
    const controller = createSupportOperationalAlertsController(
      {
        projectId: () => 'project-1',
        canRead: () => true,
        canManage: () => true,
      },
      {
        readAlerts: vi.fn().mockResolvedValue(alertPage(['alert-1'])),
        readAlertDetail: vi.fn().mockResolvedValue(alertDetail()),
        acknowledge,
        resolve: vi.fn(),
      },
    );

    await controller.openDetail('alert-1');
    await controller.acknowledge('INVESTIGATING');

    expect(acknowledge).toHaveBeenCalledWith('project-1', 'alert-1', {
      expectedVersion: 1,
      idempotencyKey: expect.any(String),
      reasonCode: 'INVESTIGATING',
    });
    expect(controller.mutating.value).toBeNull();
  });

  it('purges alert state and asks for authority recovery on a concealed 404', async () => {
    const onForbidden = vi.fn();
    const controller = createSupportOperationalAlertsController(
      {
        projectId: () => 'project-1',
        canRead: () => true,
        onForbidden,
      },
      {
        readAlerts: vi
          .fn()
          .mockResolvedValueOnce(alertPage(['alert-1']))
          .mockRejectedValueOnce(new ApiError(404, 'not found')),
        readAlertDetail: vi.fn(),
        ...commands(),
      },
    );

    await controller.load();
    await controller.load();

    expect(controller.page.value).toBeNull();
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it('clears an in-flight command when the alert detail is closed', async () => {
    let resolveAcknowledge!: () => void;
    const controller = createSupportOperationalAlertsController(
      {
        projectId: () => 'project-1',
        canRead: () => true,
        canManage: () => true,
      },
      {
        readAlerts: vi.fn().mockResolvedValue(alertPage(['alert-1'])),
        readAlertDetail: vi.fn().mockResolvedValue(alertDetail()),
        acknowledge: vi.fn().mockReturnValue(
          new Promise<void>((resolve) => {
            resolveAcknowledge = resolve;
          }),
        ),
        resolve: vi.fn(),
      },
    );

    await controller.openDetail('alert-1');
    const command = controller.acknowledge('INVESTIGATING');
    expect(controller.mutating.value).toBe('ACKNOWLEDGE');
    controller.closeDetail();
    resolveAcknowledge();
    await command;

    expect(controller.mutating.value).toBeNull();
  });

  it('purges a late owner catalog when manage permission is revoked', async () => {
    let resolveTargets!: (
      value: Array<{ id: string; displayName: string; teamIds: string[] }>,
    ) => void;
    const controller = createSupportOperationalAlertsController(
      {
        projectId: () => 'project-1',
        canRead: () => true,
        canManage: () => true,
      },
      {
        readAlerts: vi.fn(),
        readAlertDetail: vi.fn().mockResolvedValue(alertDetail()),
        readAlertOwnerTargets: vi.fn().mockReturnValue(
          new Promise((resolve) => {
            resolveTargets = resolve;
          }),
        ),
        ...commands(),
      },
    );

    const detailRequest = controller.openDetail('alert-1');
    await detailRequest;
    controller.resetManagement();
    resolveTargets([{ id: 'operator-1', displayName: 'Оператор', teamIds: [] }]);
    await Promise.resolve();

    expect(controller.detail.value?.alert.id).toBe('alert-1');
    expect(controller.ownerTargets.value).toEqual([]);
  });
});
