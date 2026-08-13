import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventQueryRepository } from '../api/event-query-repository';
import EventPicker from '@/features/events/EventPicker.vue';
import CaseEventVerification from './CaseEventVerification.vue';
import type {
  CaseVerificationEstimateResponseDto,
  EventQueryPolicyCatalogResponseDto,
} from '@/shared/api/generated/models';

vi.mock('../api/event-query-repository', () => ({
  eventQueryRepository: {
    listItems: vi.fn(),
    estimateCaseVerification: vi.fn(),
    startCaseVerification: vi.fn(),
    getCaseVerification: vi.fn(),
  },
}));

const policy: EventQueryPolicyCatalogResponseDto = {
  audience: 'INTERNAL_AI',
  effectiveOnly: true,
  items: [
    {
      definitionKeyId: 'definition-1',
      eventCode: 'deposit.completed',
      eventName: 'Депозит зачислен',
      lifecycle: 'ACTIVE',
      configuration: {
        descriptionForAI: 'Депозит зачислен',
        allowedModes: ['SUMMARY'],
        maxInteractiveLookbackHours: 168,
        maxVerificationLookbackHours: 720,
        safeFields: [],
      },
      effective: { internalAi: true, endUserConversation: false },
      queryable: true,
    },
  ],
  pageInfo: { hasMore: false, nextCursor: null },
};

const result: CaseVerificationEstimateResponseDto = {
  complete: true,
  policyRevisionId: '60000000-0000-4000-8000-000000000006',
  snapshotReceivedAt: '2026-07-28T11:00:00.000Z',
  queries: [
    {
      key: 'goal_event',
      query: {
        eventCodes: ['deposit.completed'],
        mode: 'SUMMARY',
        timeRange: { kind: 'CURRENT_CASE_WINDOW' },
      },
    },
  ],
  predicate: { operator: 'EVENT_EXISTS', queryKey: 'goal_event' },
  evaluation: 'VERIFIED_RESOLVED',
  estimatedAddedInputTokens: 74,
  results: {
    goal_event: {
      status: 'COMPLETED',
      complete: true,
      truncated: false,
      excludedCount: 0,
      limitations: [],
      provenance: {
        source: 'EVENT_LOG',
        policyRevisionId: '60000000-0000-4000-8000-000000000006',
        snapshotReceivedAt: '2026-07-28T11:00:00.000Z',
      },
      policyRevisionId: '60000000-0000-4000-8000-000000000006',
      range: {
        from: '2026-07-28T10:00:00.000Z',
        to: '2026-07-28T11:00:00.000Z',
      },
      snapshotReceivedAt: '2026-07-28T11:00:00.000Z',
      matchedCount: 1,
      serializedBytes: 220,
      estimatedAddedInputTokens: 74,
      summaries: [
        {
          eventCode: 'deposit.completed',
          count: 1,
          firstOccurredAt: '2026-07-28T10:30:00.000Z',
          lastOccurredAt: '2026-07-28T10:30:00.000Z',
        },
      ],
    },
  },
};

function mountComponent(
  extraProps: Partial<InstanceType<typeof CaseEventVerification>['$props']> = {},
) {
  return mount(CaseEventVerification, {
    props: {
      projectId: '30000000-0000-4000-8000-000000000003',
      caseId: '40000000-0000-4000-8000-000000000004',
      caseCreatedAt: new Date(Date.now() - 60 * 60 * 1_000).toISOString(),
      caseStatus: 'WAITING_SYSTEM',
      canVerify: true,
      canPreview: true,
      ...extraProps,
    },
    global: {
      stubs: {
        Button: {
          props: ['label', 'disabled', 'loading'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Dialog: {
          props: ['visible'],
          template: '<div v-if="visible" role="dialog"><slot /></div>',
        },
        InputText: {
          props: ['modelValue'],
          emits: ['update:modelValue', 'input'],
          template: '<input />',
        },
        Message: { template: '<div class="message"><slot /></div>' },
      },
    },
  });
}

describe('CaseEventVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventQueryRepository.listItems).mockResolvedValue(policy);
    vi.mocked(eventQueryRepository.estimateCaseVerification).mockResolvedValue(result);
    vi.mocked(eventQueryRepository.startCaseVerification).mockResolvedValue({
      ...result,
      id: '70000000-0000-4000-8000-000000000007',
      planId: '80000000-0000-4000-8000-000000000008',
      status: 'COMPLETED',
      caseChanged: true,
      caseStatus: 'RESOLVED',
      caseVersion: 5,
    });
    vi.mocked(eventQueryRepository.getCaseVerification).mockResolvedValue({
      ...result,
      id: 'run-restored',
      planId: 'plan-restored',
      status: 'COMPLETED',
      caseChanged: false,
      caseStatus: 'RESOLVED',
      caseVersion: 5,
    });
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '90000000-0000-4000-8000-000000000009',
    );
  });

  it('estimates a server-scoped query, shows bounded evidence and starts once with a fresh key', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.text()).toContain('READY');
    await wrapper.get('button[data-test="refresh-case-data"]').trigger('click');
    await flushPromises();

    expect(eventQueryRepository.estimateCaseVerification).toHaveBeenCalledWith(
      '30000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000004',
      {
        queries: [
          {
            key: 'goal_event',
            query: {
              eventCodes: ['deposit.completed'],
              mode: 'SUMMARY',
              timeRange: { kind: 'CURRENT_CASE_WINDOW' },
            },
          },
        ],
        predicate: { operator: 'EVENT_EXISTS', queryKey: 'goal_event' },
      },
    );
    expect(wrapper.get('[role="dialog"]').text()).toContain('220 Б');
    expect(wrapper.get('[role="dialog"]').text()).toContain('74 токен');
    expect(wrapper.get('[role="dialog"]').text()).toContain('deposit.completed');
    expect(wrapper.get('[role="dialog"]').text()).not.toContain('raw payload');

    await wrapper.get('button[data-test="start-case-verification"]').trigger('click');
    await flushPromises();

    expect(eventQueryRepository.startCaseVerification).toHaveBeenCalledTimes(1);
    expect(eventQueryRepository.startCaseVerification).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        idempotencyKey: '90000000-0000-4000-8000-000000000009',
      }),
    );
    expect(wrapper.text()).toContain('VERIFIED_RESOLVED');
    expect(wrapper.text()).toContain('модель не вызывалась');
    expect(wrapper.emitted('completed')?.[0]).toEqual([
      expect.objectContaining({ caseStatus: 'RESOLVED', caseVersion: 5 }),
    ]);
  });

  it('keeps an inconclusive result visually unresolved', async () => {
    vi.mocked(eventQueryRepository.startCaseVerification).mockResolvedValue({
      ...result,
      evaluation: 'INCONCLUSIVE',
      id: 'run-2',
      planId: 'plan-2',
      status: 'COMPLETED',
      caseChanged: false,
      caseStatus: 'WAITING_SYSTEM',
      caseVersion: 4,
    });
    const wrapper = mountComponent();
    await flushPromises();
    await wrapper.get('button[data-test="refresh-case-data"]').trigger('click');
    await flushPromises();
    await wrapper.get('button[data-test="start-case-verification"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('INCONCLUSIVE');
    expect(wrapper.find('.verification-state.resolved').exists()).toBe(false);
    expect(wrapper.text()).toContain('Недостаточно полных данных');
  });

  it('keeps READY and the confirmed event when picker search is empty', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    const picker = wrapper.getComponent(EventPicker);
    expect(picker.props('modelValue')).toBe('deposit.completed');
    vi.mocked(eventQueryRepository.listItems).mockResolvedValueOnce({
      ...policy,
      items: [],
    });

    await picker.props('load')({ query: 'missing', limit: 25 });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('READY');
    expect(wrapper.getComponent(EventPicker).props('modelValue')).toBe('deposit.completed');
  });

  it('restores persisted evidence after the case detail refreshes', async () => {
    const wrapper = mountComponent({
      caseStatus: 'RESOLVED',
      runId: 'run-restored',
    });
    await flushPromises();

    expect(eventQueryRepository.getCaseVerification).toHaveBeenCalledWith(
      '30000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000004',
      'run-restored',
    );
    expect(wrapper.text()).toContain('VERIFIED_RESOLVED');
    expect(wrapper.text()).toContain('policy 60000000-0000-4000-8000-000000000006');
    expect(wrapper.text()).not.toContain('EXPIRED');
  });

  it('reuses the idempotency key after an ambiguous start timeout', async () => {
    vi.mocked(globalThis.crypto.randomUUID)
      .mockReturnValueOnce('90000000-0000-4000-8000-000000000009')
      .mockReturnValueOnce('91000000-0000-4000-8000-000000000010');
    vi.mocked(eventQueryRepository.startCaseVerification)
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({
        ...result,
        id: 'run-replayed',
        planId: 'plan-replayed',
        status: 'COMPLETED',
        caseChanged: true,
        caseStatus: 'RESOLVED',
        caseVersion: 5,
      });
    const wrapper = mountComponent();
    await flushPromises();
    await wrapper.get('button[data-test="refresh-case-data"]').trigger('click');
    await flushPromises();

    const start = wrapper.get('button[data-test="start-case-verification"]');
    await start.trigger('click');
    await flushPromises();
    await start.trigger('click');
    await flushPromises();

    const keys = vi
      .mocked(eventQueryRepository.startCaseVerification)
      .mock.calls.map((call) => call[2].idempotencyKey);
    expect(keys).toEqual([
      '90000000-0000-4000-8000-000000000009',
      '90000000-0000-4000-8000-000000000009',
    ]);
    expect(wrapper.text()).not.toContain('Статус обращения не изменён');
  });

  it('ignores a late verification result after switching to another Case', async () => {
    let resolveStart!: (
      value: Awaited<ReturnType<typeof eventQueryRepository.startCaseVerification>>,
    ) => void;
    vi.mocked(eventQueryRepository.startCaseVerification).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    const wrapper = mountComponent();
    await flushPromises();
    await wrapper.get('button[data-test="refresh-case-data"]').trigger('click');
    await flushPromises();
    await wrapper.get('button[data-test="start-case-verification"]').trigger('click');

    await wrapper.setProps({
      caseId: '41000000-0000-4000-8000-000000000005',
    });
    await flushPromises();
    resolveStart({
      ...result,
      id: 'late-run',
      planId: 'late-plan',
      status: 'COMPLETED',
      caseChanged: true,
      caseStatus: 'RESOLVED',
      caseVersion: 5,
    });
    await flushPromises();

    expect(wrapper.emitted('completed')).toBeUndefined();
    expect(wrapper.text()).not.toContain('VERIFIED_RESOLVED');
    expect(wrapper.text()).toContain('READY');
  });

  it('only offers ranges allowed by the selected verification policy', async () => {
    vi.mocked(eventQueryRepository.listItems).mockResolvedValue({
      ...policy,
      items: [
        {
          ...policy.items[0]!,
          configuration: {
            ...policy.items[0]!.configuration,
            maxVerificationLookbackHours: 6,
          },
        },
      ],
    });
    const wrapper = mountComponent({
      caseCreatedAt: new Date(Date.now() - 48 * 60 * 60 * 1_000).toISOString(),
    });
    await flushPromises();

    const period = wrapper.get('[data-test="verification-period"]');
    expect(period.text()).toContain('6 ч. (лимит политики)');
    expect(period.text()).not.toContain('24 часа');
    expect(period.text()).not.toContain('С открытия обращения');

    await wrapper.get('button[data-test="refresh-case-data"]').trigger('click');
    await flushPromises();
    expect(eventQueryRepository.estimateCaseVerification).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        queries: [
          expect.objectContaining({
            query: expect.objectContaining({
              timeRange: expect.objectContaining({ kind: 'EXPLICIT' }),
            }),
          }),
        ],
      }),
    );
  });

  it('ищет разрешённое событие на сервере за пределами первой страницы', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    vi.mocked(eventQueryRepository.listItems).mockResolvedValueOnce({
      ...policy,
      items: [
        {
          ...policy.items[0]!,
          eventCode: 'withdrawal.completed',
          eventName: 'Вывод завершён',
        },
      ],
    });
    await wrapper.getComponent(EventPicker).props('load')({
      query: 'withdrawal',
      limit: 25,
    });

    expect(eventQueryRepository.listItems).toHaveBeenLastCalledWith(expect.any(String), {
      audience: 'INTERNAL_AI',
      effective: true,
      query: 'withdrawal',
      limit: 25,
    });
  });
});
