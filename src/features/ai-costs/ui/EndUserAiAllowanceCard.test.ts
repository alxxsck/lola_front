import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EndUserAiAllowanceCard from './EndUserAiAllowanceCard.vue';

const mocks = vi.hoisted(() => ({
  endUserBalance: vi.fn(),
  projectPolicy: vi.fn(),
}));

vi.mock('../api/ai-allowance-repository', () => ({
  aiAllowanceRepository: {
    endUserBalance: mocks.endUserBalance,
    projectPolicy: mocks.projectPolicy,
  },
}));

const balance = {
  projectPolicyVersion: 'policy-7',
  account: {
    projectId: 'project-1',
    endUserId: 'user-1',
    currency: 'USD' as const,
    availableUsd: '3.25',
    reservedUsd: '0.15',
    settledUsd: '4.5',
    unknownHeldUsd: '0',
    overageUsd: '0',
    version: 'account-2',
  },
  currentPeriod: {
    id: 'period-1',
    kind: 'DAY' as const,
    timezone: 'Europe/Madrid',
    startsAt: '2026-08-02T22:00:00.000Z',
    endsAt: '2026-08-03T22:00:00.000Z',
    baseAllocatedUsd: '5',
    status: 'OPEN' as const,
    planRevision: {
      id: 'revision-vip-3',
      planId: 'plan-vip',
      revisionNumber: 3,
      periodKind: 'DAY' as const,
      recurringAmountUsd: '5',
      dailyCapUsd: null,
      effectiveFrom: '2026-08-01T00:00:00.000Z',
      changeReason: 'VIP tier',
      createdAt: '2026-08-01T00:00:00.000Z',
      categoryRules: [],
    },
  },
  currentPeriodSpend: {
    reservedUsd: '0.15',
    settledUsd: '1.6',
    unknownHeldUsd: '0',
    overageUsd: '0',
  },
  pendingBaseAllocationUsd: '0',
  activeGrants: [
    {
      id: 'grant-1',
      amountUsd: '1',
      sourceType: 'MANUAL',
      sourceId: 'cms-user-1',
      validFrom: '2026-08-02T10:00:00.000Z',
      expiresAt: '2026-08-03T22:00:00.000Z',
      status: 'ACTIVE' as const,
      reason: 'Support extension',
      actorType: 'CMS_USER',
      actorId: 'cms-user-1',
      createdAt: '2026-08-02T10:00:00.000Z',
    },
  ],
  grantsPageInfo: { hasMore: false, nextCursor: null },
  endUserAssignment: {
    id: 'assignment-1',
    scope: 'END_USER' as const,
    endUserId: 'user-1',
    planId: 'plan-vip',
    effectiveFrom: '2026-08-01T00:00:00.000Z',
    effectiveUntil: null,
    version: 'assignment-1',
    reason: 'VIP',
    plan: {
      id: 'plan-vip',
      key: 'vip',
      name: 'VIP',
      status: 'ACTIVE' as const,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  },
};

const policy = {
  projectPolicyVersion: 'policy-7',
  policy: {
    projectId: 'project-1',
    enforcementMode: 'SOFT' as const,
    timezone: 'Europe/Madrid',
    warningContent: {},
    lowThresholdMode: 'PERCENT' as const,
    lowThresholdValue: '10',
    exhaustedContent: {},
    showEndUserExactUsd: true,
    version: 'policy-7',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  plans: [],
  plansPageInfo: { hasMore: false, nextCursor: null },
  defaultAssignment: null,
  runtimeGates: {
    hardEnforcementApproved: false,
    emergencyDisabled: false,
  },
};

function mountCard(overrides: Record<string, boolean> = {}) {
  return mount(EndUserAiAllowanceCard, {
    props: {
      projectId: 'project-1',
      endUserId: 'user-1',
      canGrant: false,
      canManage: false,
      canReconcile: false,
      refreshKey: 0,
      ...overrides,
    },
  });
}

describe('End User AI allowance card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.endUserBalance.mockResolvedValue(balance);
    mocks.projectPolicy.mockResolvedValue(policy);
  });

  it('explains the effective non-blocking mode and current user allowance', async () => {
    const wrapper = mountCard({ canGrant: true });
    await flushPromises();

    expect(mocks.endUserBalance).toHaveBeenCalledWith('project-1', 'user-1', {
      grantLimit: 1,
    });
    expect(mocks.projectPolicy).toHaveBeenCalledWith('project-1', {
      planLimit: 1,
    });
    expect(wrapper.get('[data-testid="allowance-runtime-status"]').text()).toContain(
      'Мягкий контроль',
    );
    expect(wrapper.get('[data-testid="allowance-runtime-status"]').text()).toContain(
      'AI не блокируется',
    );
    expect(wrapper.text()).toContain('3,25 $');
    expect(wrapper.text()).toContain('1,60 $');
    expect(wrapper.text()).toContain('VIP');
    expect(wrapper.text()).toContain('1 активное начисление');
    expect(wrapper.text()).toContain('Начислить квоту');

    await wrapper.get('[data-action="open-allowance-details"]').trigger('click');
    expect(wrapper.emitted('openDetails')).toHaveLength(1);
  });

  it('states that zero values do not limit AI when allowance control is disabled', async () => {
    mocks.endUserBalance.mockResolvedValue({
      ...balance,
      account: {
        ...balance.account,
        availableUsd: '0',
        reservedUsd: '0',
        settledUsd: '0',
      },
      currentPeriod: null,
      currentPeriodSpend: null,
      activeGrants: [],
      endUserAssignment: null,
      pendingBaseAllocationUsd: '0',
    });
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      policy: null,
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.get('[data-testid="allowance-runtime-status"]').text()).toContain(
      'Контроль выключен',
    );
    expect(wrapper.get('[data-testid="allowance-runtime-status"]').text()).toContain(
      'AI доступен без блокировки по квоте',
    );
    expect(wrapper.text()).toContain('применяются правила проекта');
    expect(wrapper.text()).toContain('Период ещё не создан');
    expect(wrapper.text()).not.toContain('Используется проектный план по умолчанию');
  });

  it('does not mark a lazy HARD period as exhausted before its base allocation', async () => {
    mocks.endUserBalance.mockResolvedValue({
      ...balance,
      account: {
        ...balance.account,
        availableUsd: '0',
        reservedUsd: '0',
        settledUsd: '0',
      },
      currentPeriod: null,
      currentPeriodSpend: null,
      pendingBaseAllocationUsd: '5',
    });
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      policy: { ...policy.policy!, enforcementMode: 'HARD' as const },
      runtimeGates: {
        hardEnforcementApproved: true,
        emergencyDisabled: false,
      },
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.get('[data-testid="allowance-runtime-status"]').text()).toContain(
      'HARD-контроль активен',
    );
    const status = wrapper.get('[data-testid="allowance-balance-status"]');
    expect(status.text()).toContain('Доступно после первого начисления');
    expect(status.text()).toContain('AVAILABLE');
    expect(status.text()).not.toContain('EXHAUSTED');
  });

  it('shows LOW independently from a non-blocking enforcement mode', async () => {
    mocks.endUserBalance.mockResolvedValue({
      ...balance,
      account: { ...balance.account, availableUsd: '0.5' },
      currentPeriod: {
        ...balance.currentPeriod,
        baseAllocatedUsd: '5',
      },
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.get('[data-testid="allowance-runtime-status"]').text()).toContain(
      'Мягкий контроль',
    );
    expect(wrapper.get('[data-testid="allowance-balance-status"]').text()).toContain('LOW');
  });

  it('does not undercount active grants when the backend page has more', async () => {
    mocks.endUserBalance.mockResolvedValue({
      ...balance,
      grantsPageInfo: { hasMore: true, nextCursor: 'next-grant' },
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain('1+ активных начислений · есть ещё');
  });

  it('does not present project default as the effective segment or level source', async () => {
    mocks.endUserBalance.mockResolvedValue({
      ...balance,
      endUserAssignment: null,
    });
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      defaultAssignment: {
        ...balance.endUserAssignment!,
        scope: 'PROJECT_DEFAULT' as const,
        endUserId: null,
      },
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain('Базовый план проекта настроен');
    expect(wrapper.text()).toContain('точный источник текущего плана API не сообщает');
    expect(wrapper.text()).not.toContain('Используется проектный план');
  });

  it('opens grant and assignment in their named modes', async () => {
    const wrapper = mountCard({ canGrant: true, canManage: true });
    await flushPromises();

    await wrapper.get('[data-action="assign-allowance-plan"]').trigger('click');
    await wrapper.get('[data-action="grant-allowance"]').trigger('click');

    expect(wrapper.emitted('openDetails')).toEqual([['assignment'], ['grant']]);
  });
});
