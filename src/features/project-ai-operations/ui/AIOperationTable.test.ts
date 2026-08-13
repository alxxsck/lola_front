import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AIOperationTable from './AIOperationTable.vue';

const item = {
  operationId: 'operation-1',
  projectSequence: '42',
  rootCorrelationId: 'root-1',
  category: 'AI_ANALYSIS' as const,
  status: 'FAILED' as const,
  title: 'Project AI Analysis',
  sourceKind: 'AI_ANALYSIS_RUN',
  sourceId: 'run-1',
  initiator: {
    type: 'CMS_USER' as const,
    id: 'admin-1',
    displayName: 'Анна',
  },
  chargedAccount: 'PROJECT_BUDGET' as const,
  responsibleCmsUserId: 'admin-1',
  responsibleCmsUserDisplayName: 'Анна',
  chargedEndUserId: null,
  subjectSummary: { availability: 'EXACT' as const, count: 3 },
  usageRecords: 2,
  cost: {
    providerReportedCost: '0.25',
    estimatedFallbackCost: '0',
    effectiveCost: '0.25',
    state: 'KNOWN' as const,
    unknownUsageRecords: 0,
    reservedCostUsdTicks: '0',
  },
  dbWorkUnits: '20',
  limitationCodes: ['CLARIFICATION_REQUIRED'],
  startedAt: '2026-07-31T08:00:00.000Z',
};

describe('AIOperationTable', () => {
  it('renders operations as compact, human-readable journal rows', () => {
    const wrapper = mount(AIOperationTable, {
      props: {
        items: [item, { ...item, operationId: 'operation-2', projectSequence: '43' }],
        projectId: 'project-1',
        canReadCost: true,
      },
      global: {
        stubs: {
          RouterLink: {
            name: 'RouterLink',
            props: ['to'],
            template: '<a class="operation-link"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.get('table').attributes('aria-label')).toBe('Журнал AI-операций');
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.text()).toContain('Анализ проекта');
    expect(wrapper.text()).toContain('Запуск анализа проекта');
    expect(wrapper.text()).toContain('Ошибка');
    expect(wrapper.text()).toContain('Бюджет проекта');
    expect(wrapper.text()).toContain('$0.25');
    expect(wrapper.text()).not.toContain('Project AI Analysis');
    expect(wrapper.text()).not.toContain('AI_ANALYSIS_RUN');
  });
});
