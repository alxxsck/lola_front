import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import {
  mockRoutingControlPlaneSource,
  resetMockRoutingControlPlane,
} from './routing-control-plane-source.mock';
import { emptyPolicyDraft } from '../model/routing-control-plane';

describe('routing control plane source', () => {
  beforeEach(() => resetMockRoutingControlPlane());

  it('loads a human-readable, server-owned readiness projection', async () => {
    const value = await mockRoutingControlPlaneSource.load('project-a', {
      teams: true,
      teamsManage: true,
      availability: true,
      queues: true,
      routing: true,
    });
    expect(value.teams.map((item) => item.name)).toContain('Основная поддержка');
    expect(value.operators.map((item) => item.name)).toContain('Анна Крылова');
    expect(value.readiness[0]).toMatchObject({ status: 'READY', candidateCount: 2 });
    expect(value.readiness[0]?.checks.every((item) => item.status === 'PASS')).toBe(true);
  });

  it('retains one idempotency key for replay and rejects a different body', async () => {
    const context = { idempotencyKey: 'intent-12345678' };
    await mockRoutingControlPlaneSource.createTeam(
      'project-a',
      { code: 'vip2', name: 'Вторая линия' },
      context,
    );
    await mockRoutingControlPlaneSource.createTeam(
      'project-a',
      { code: 'vip2', name: 'Вторая линия' },
      context,
    );
    await expect(
      mockRoutingControlPlaneSource.createTeam(
        'project-a',
        { code: 'vip3', name: 'Третья линия' },
        context,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    } satisfies Partial<ApiError>);
    expect(
      (
        await mockRoutingControlPlaneSource.load('project-a', {
          teams: true,
          teamsManage: true,
          availability: true,
          queues: true,
          routing: true,
        })
      ).teams.filter((item) => item.code === 'vip2'),
    ).toHaveLength(1);
  });

  it('preserves the queue draft when a route priority conflicts', async () => {
    const before = await mockRoutingControlPlaneSource.load('project-a', {
      teams: true,
      teamsManage: true,
      availability: true,
      queues: true,
      routing: true,
    });
    await mockRoutingControlPlaneSource.createPolicy('project-a', 'overflow', emptyPolicyDraft(), {
      idempotencyKey: 'policy-12345678',
    });
    await expect(
      mockRoutingControlPlaneSource.bind('project-a', 'queue-other', before.policies[0]!.id, 10, {
        actionEtag: '"mock-slot-0"',
        idempotencyKey: 'slot-12345678',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'SUPPORT_ROUTING_ROUTE_PRIORITY_IN_USE' });
    expect(
      (
        await mockRoutingControlPlaneSource.load('project-a', {
          teams: true,
          teamsManage: true,
          availability: true,
          queues: true,
          routing: true,
        })
      ).slots,
    ).toHaveLength(1);
  });

  it('links a durable shadow run to terminal counters', async () => {
    const run = await mockRoutingControlPlaneSource.runShadow('project-a', 50, {
      idempotencyKey: 'shadow-12345678',
    });
    expect(run.id).toMatch(/^run-/);
    expect(run).toMatchObject({ state: 'COMPLETED', pending: 0, completed: 2 });
    await expect(mockRoutingControlPlaneSource.shadowRun('project-a', run.id)).resolves.toEqual(
      run,
    );
  });

  it('fails activation closed when readiness is blocking', async () => {
    await mockRoutingControlPlaneSource.createQueue(
      'project-a',
      'unbound',
      (await import('../model/routing-control-plane')).emptyQueueDraft('Без связи'),
      { idempotencyKey: 'queue-12345678' },
    );
    const queue = (
      await mockRoutingControlPlaneSource.load('project-a', {
        teams: true,
        teamsManage: true,
        availability: true,
        queues: true,
        routing: true,
      })
    ).queues.find((item) => item.code === 'unbound')!;
    await expect(
      mockRoutingControlPlaneSource.activate('project-a', queue.id, 'AUTO_ASSIGN', 0, 'APPROVED', {
        idempotencyKey: 'activate-12345678',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'SUPPORT_ROUTING_CONFIGURATION_NOT_READY' });
  });
});
