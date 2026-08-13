import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AIAnalysisDetailPanel from './AIAnalysisDetailPanel.vue';

const technicalIdentifierStub = {
  props: ['label', 'value'],
  template: '<div>{{ label }} {{ value }}</div>',
};

const detail = {
  analysis: {
    analysisId: 'analysis-1',
    createdAt: '2026-07-31T07:00:00.000Z',
    createdByCmsUserId: 'admin-1',
    kind: 'SCHEDULED_ONCE' as const,
    projectSequence: '42',
    question: 'Покажи депозиты',
    scopeKind: 'PROJECT' as const,
    state: 'ACTIVE' as const,
    title: 'Депозиты',
    updatedAt: '2026-07-31T07:00:00.000Z',
    version: 1,
  },
  runs: [],
  schedule: {
    dstDisambiguation: 'EXACT' as const,
    localDateTime: '2026-07-31T12:00:00',
    nextRunAt: '2026-07-31T10:00:00.000Z',
    runAt: '2026-07-31T10:00:00.000Z',
    scheduleId: 'schedule-1',
    scheduleSpecVersion: 1,
    scheduleType: 'ONCE' as const,
    state: 'ACTIVE' as const,
    timezone: 'Europe/Madrid',
  },
  subjectEvidence: { total: 0 },
};

describe('AIAnalysisDetailPanel', () => {
  it('allows cancellation only through the separately authorized control', async () => {
    const wrapper = shallowMount(AIAnalysisDetailPanel, {
      props: {
        projectId: 'project-1',
        detail,
        loading: false,
        error: '',
        canManage: true,
        canReadCost: false,
        cancelling: false,
      },
      global: {
        stubs: {
          Button: {
            props: ['label'],
            emits: ['click'],
            template: '<button @click="$emit(\'click\')">{{ label }}</button>',
          },
          Tag: { template: '<span />' },
          Message: { template: '<div><slot /></div>' },
          Skeleton: { template: '<div />' },
          TechnicalIdentifier: technicalIdentifierStub,
        },
      },
    });

    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Отменить');
    expect(cancel).toBeDefined();
    await cancel!.trigger('click');
    expect(wrapper.emitted('cancel')).toBeUndefined();
    await wrapper.get('[data-testid="confirm-analysis-cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toEqual([
      [{ projectId: 'project-1', analysisId: 'analysis-1', version: 1 }],
    ]);

    await wrapper.setProps({ canManage: false });
    expect(wrapper.text()).not.toContain('Отменить');
  });

  it('pins confirmation and hides cost metadata without cost permission', async () => {
    const wrapper = shallowMount(AIAnalysisDetailPanel, {
      props: {
        projectId: 'project-1',
        detail: {
          ...detail,
          runs: [
            {
              runId: 'run-1',
              attemptNumber: 1,
              status: 'SUCCEEDED',
              initiatedBy: 'CMS_USER',
              costStatus: 'UNKNOWN',
              costStatuses: [],
              limitationCodes: [],
              limitations: [],
              providerResponseIds: [],
              receipts: [],
              provider: 'xai',
              model: 'grok-private',
              createdAt: '2026-07-31T07:00:00.000Z',
              updatedAt: '2026-07-31T07:01:00.000Z',
            },
          ],
        },
        loading: false,
        error: '',
        canManage: true,
        canReadCost: false,
        cancelling: false,
      },
      global: {
        stubs: {
          Button: {
            props: ['label'],
            emits: ['click'],
            template: '<button @click="$emit(\'click\')">{{ label }}</button>',
          },
          Tag: { template: '<span />' },
          Message: { template: '<div><slot /></div>' },
          Skeleton: { template: '<div />' },
          TechnicalIdentifier: technicalIdentifierStub,
        },
      },
    });

    expect(wrapper.text()).not.toContain('grok-private');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Отменить')!
      .trigger('click');
    await wrapper.setProps({
      projectId: 'project-2',
      detail: {
        ...detail,
        analysis: {
          ...detail.analysis,
          analysisId: 'analysis-2',
          version: 2,
        },
      },
    });
    expect(wrapper.find('[data-testid="confirm-analysis-cancel"]').exists()).toBe(false);
  });

  it('renders pinned revisions, receipt completeness and legacy compatibility', () => {
    const wrapper = shallowMount(AIAnalysisDetailPanel, {
      props: {
        projectId: 'project-1',
        detail: {
          ...detail,
          schedule: {
            ...detail.schedule,
            state: 'PAUSED' as const,
            failureCode: 'SCHEDULE_FAILED',
            failureMessage: 'Отложенный запуск не удалось запустить.',
          },
          analysis: {
            ...detail.analysis,
            createdByCmsUserId: null,
            compatibility: {
              readOnly: true,
              sourceKind: 'AI_REVIEW',
              sourceId: 'legacy-1',
              attributionStatus: 'REQUESTER_UNKNOWN',
              provenanceStatus: 'PARTIAL',
            },
          },
          runs: [
            {
              runId: 'run-1',
              attemptNumber: 1,
              status: 'SUCCEEDED',
              initiatedBy: 'LEGACY',
              catalogRevisionId: 'catalog-1',
              catalogRevisionDigest: 'a'.repeat(64),
              queryPolicyRevisionId: 'policy-1',
              capabilitySetRevision: 'b'.repeat(64),
              costStatus: 'UNKNOWN',
              costStatuses: [],
              limitationCodes: ['RUN_PARTIAL'],
              limitations: [
                {
                  code: 'RUN_PARTIAL',
                  message: 'Часть данных запуска недоступна.',
                },
              ],
              errorCode: 'RUN_FAILED',
              errorMessage: 'Запуск анализа не удалось завершить.',
              providerResponseIds: [],
              receipts: [
                {
                  id: 'receipt-1',
                  runId: 'run-1',
                  ordinal: 1,
                  status: 'REJECTED',
                  queryHash: 'c'.repeat(64),
                  matchedEndUserCount: '12',
                  matchedEndUserCountExact: false,
                  examinedRows: 100,
                  resultRows: 10,
                  groups: 2,
                  serializedBytes: 200,
                  durationMs: 30,
                  workUnits: '100',
                  complete: false,
                  truncated: true,
                  limitationCodes: ['ROW_LIMIT'],
                  limitations: [
                    {
                      code: 'ROW_LIMIT',
                      message: 'Достигнут лимит строк.',
                    },
                  ],
                  rejectionCode: 'POLICY_DENIED',
                  rejectionMessage: 'Политика доступа не разрешает этот запрос.',
                  createdAt: '2026-07-31T07:00:00.000Z',
                },
              ],
              createdAt: '2026-07-31T07:00:00.000Z',
              updatedAt: '2026-07-31T07:01:00.000Z',
            },
          ],
        },
        loading: false,
        error: '',
        canManage: true,
        canReadCost: false,
        cancelling: false,
      },
      global: {
        stubs: {
          Button: { template: '<button />' },
          Tag: { template: '<span />' },
          Message: { template: '<div><slot /></div>' },
          Skeleton: { template: '<div />' },
          TechnicalIdentifier: technicalIdentifierStub,
        },
      },
    });

    expect(wrapper.text()).toContain('catalog-1');
    expect(wrapper.text()).toContain('policy-1');
    expect(wrapper.text()).toContain('Отложенный запуск не удалось запустить.');
    expect(wrapper.text()).toContain('Неполный · усечён');
    expect(wrapper.text()).toContain('ROW_LIMIT');
    expect(wrapper.text()).toContain('POLICY_DENIED');
    expect(wrapper.text()).toContain('Часть данных запуска недоступна.');
    expect(wrapper.text()).toContain('Запуск анализа не удалось завершить.');
    expect(wrapper.text()).toContain('Достигнут лимит строк.');
    expect(wrapper.text()).toContain('Политика доступа не разрешает этот запрос.');
    expect(wrapper.text()).toContain('Автор неизвестен');
    expect(wrapper.text()).toContain('Provenance сохранён частично');
    expect(wrapper.text()).not.toContain('Отменить');
  });
});
