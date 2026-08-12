import { enableAutoUnmount, flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  route: {
    name: 'support-analytics-quality',
    query: {} as Record<string, string>,
  },
  router: { replace: vi.fn(), push: vi.fn() },
  auth: null as {
    user: { id: string };
    project: { id: string; effectivePermissionCodes: string[] } | null;
  } | null,
}));
const analytics = vi.hoisted(() => ({ catalog: vi.fn(), run: vi.fn() }));
const artifacts = vi.hoisted(() => ({
  saveAndPublishReport: vi.fn(),
  exportReport: vi.fn(),
  readExport: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => state.router,
}));
vi.mock('@/features/auth/auth.store', async () => {
  const { reactive } = await import('vue');
  state.auth = reactive({
    user: { id: 'analyst-1' },
    project: {
      id: 'project-1',
      effectivePermissionCodes: [
        'project.reporting.aggregate.read',
        'project.reporting.author',
        'project.reporting.export',
      ],
    },
  });
  return { useAuthStore: () => state.auth };
});
vi.mock('@/features/support-analytics/api/support-analytics-source', () => ({
  HighCostConfirmationRequiredError: class extends Error {},
  metricLabel: () => 'Средняя оценка',
  metricUnit: () => 'DECIMAL',
  supportAnalyticsSource: analytics,
}));
vi.mock('@/features/support-analytics/api/support-analytics-artifact-source', () => ({
  supportAnalyticsArtifactSource: artifacts,
}));
vi.mock('@/shared/realtime/cms-realtime-client', () => ({
  cmsRealtimeClient: { subscribe: vi.fn(() => vi.fn()) },
}));

import SupportAnalyticsPage from './SupportAnalyticsPage.vue';

enableAutoUnmount(afterEach);

const catalog = {
  datasets: [
    {
      datasetCode: 'SUPPORT_QUALITY',
      datasetRevisionId: 'quality-revision-1',
      revision: 1,
      name: 'Качество поддержки',
      semanticDigest: 'a'.repeat(64),
      readiness: {
        status: 'READY',
        dataAsOf: '2026-08-12T10:00:00.000Z',
        coverageFrom: '2026-08-01T00:00:00.000Z',
        coverageUntil: '2026-08-12T10:00:00.000Z',
        projectionLagMs: 1000,
        missingSourceFamilies: [],
      },
      dimensions: [
        { code: 'OCCURRED_DAY', source: 'SUPPORT_QUALITY' },
        { code: 'SCORECARD_REVISION', source: 'SUPPORT_QUALITY' },
      ],
      metrics: [
        {
          code: 'quality_score_average',
          operation: 'AVERAGE',
          classification: 'AGGREGATE',
          exactness: 'EXACT',
          minimumSample: 1,
          requiredPermissionCodes: [],
          compatibleDimensions: ['OCCURRED_DAY', 'SCORECARD_REVISION'],
          valueKind: 'DECIMAL',
        },
      ],
    },
  ],
};
const queryResult = {
  status: 'READY',
  result: {
    rows: [
      {
        dimensions: [{ code: 'OCCURRED_DAY', value: '2026-08-12' }],
        metrics: [
          {
            metricCode: 'quality_score_average',
            state: 'VALUE',
            value: 91,
            sampleSize: 10,
          },
        ],
      },
    ],
  },
  receipt: {
    dataAsOf: '2026-08-12T10:00:00.000Z',
    completeness: 'COMPLETE',
    rows: 1,
    bytes: 100,
    suppressedCellCount: 0,
    expiresAt: '2026-08-12T11:00:00.000Z',
    datasetRevisionId: 'quality-revision-1',
  },
};

const buttonStub = {
  props: ['label', 'disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
};
const dialogStub = {
  props: ['visible'],
  template: '<div v-if="visible"><slot /><slot name="footer" /></div>',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function mountPage() {
  return shallowMount(SupportAnalyticsPage, {
    global: {
      stubs: {
        Button: buttonStub,
        Dialog: dialogStub,
        InputText: true,
        Select: true,
        Tag: true,
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
}

async function clickButton(wrapper: ReturnType<typeof mountPage>, label: string): Promise<void> {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === label)!
    .trigger('click');
  await flushPromises();
}

describe('SupportAnalyticsPage permission fencing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.route.query = {};
    state.auth!.user.id = 'analyst-1';
    state.auth!.project = {
      id: 'project-1',
      effectivePermissionCodes: [
        'project.reporting.aggregate.read',
        'project.reporting.author',
        'project.reporting.export',
      ],
    };
    analytics.catalog.mockResolvedValue(catalog);
    analytics.run.mockResolvedValue(queryResult);
    artifacts.saveAndPublishReport.mockResolvedValue({
      savedReportId: 'report-private-id',
      savedReportRevisionId: 'revision-private-id',
      revision: 1,
      queryDefinitionHash: 'b'.repeat(64),
      name: 'Отчёт по качеству поддержки',
      description: '',
      query: {},
    });
    artifacts.exportReport.mockResolvedValue({
      exportId: 'export-private-id',
      status: 'QUEUED',
      format: 'CSV',
    });
    artifacts.readExport.mockImplementation(() => new Promise(() => {}));
  });

  it('shows the pinned scorecard revision as a Russian filter', async () => {
    const wrapper = mountPage();

    await vi.waitFor(() => expect(wrapper.text()).toContain('Версия карты оценки'));
  });

  it('scrubs an export when export authority is removed but aggregate read remains', async () => {
    const wrapper = mountPage();

    await vi.waitFor(() => expect(wrapper.text()).toContain('Сохранить отчёт'));
    await clickButton(wrapper, 'Сохранить отчёт');
    await clickButton(wrapper, 'Сохранить и опубликовать');
    await clickButton(wrapper, 'CSV');
    await vi.waitFor(() => expect(wrapper.find('.delivery-lifecycle').exists()).toBe(true));
    expect(wrapper.text()).toContain('В очереди');
    expect(wrapper.text()).toContain('Технические сведения');
    expect(wrapper.text()).not.toContain('export-private-id');
    expect(wrapper.text()).not.toContain('QUEUED');
    expect(wrapper.text()).not.toContain('ревизия 1');

    state.auth!.project!.effectivePermissionCodes = ['project.reporting.aggregate.read'];
    await flushPromises();

    expect(wrapper.find('.delivery-lifecycle').exists()).toBe(false);
  });

  it('rejects an in-flight export response after an authority ABA change', async () => {
    const pendingExport = deferred<{
      exportId: string;
      status: string;
      format: string;
    }>();
    artifacts.exportReport.mockReturnValueOnce(pendingExport.promise);
    const wrapper = mountPage();

    await vi.waitFor(() => expect(wrapper.text()).toContain('Сохранить отчёт'));
    await clickButton(wrapper, 'Сохранить отчёт');
    await clickButton(wrapper, 'Сохранить и опубликовать');
    void clickButton(wrapper, 'CSV');
    await vi.waitFor(() => expect(artifacts.exportReport).toHaveBeenCalledTimes(1));

    state.auth!.project!.effectivePermissionCodes = ['project.reporting.aggregate.read'];
    await flushPromises();
    state.auth!.project!.effectivePermissionCodes = [
      'project.reporting.aggregate.read',
      'project.reporting.author',
      'project.reporting.export',
    ];
    await flushPromises();
    pendingExport.resolve({
      exportId: 'stale-export-private-id',
      status: 'QUEUED',
      format: 'CSV',
    });
    await flushPromises();

    expect(wrapper.find('.delivery-lifecycle').exists()).toBe(false);
  });

  it('does not expose a stale command failure after an authority ABA change', async () => {
    const pendingExport = deferred<never>();
    artifacts.exportReport.mockReturnValueOnce(pendingExport.promise);
    const wrapper = mountPage();

    await vi.waitFor(() => expect(wrapper.text()).toContain('Сохранить отчёт'));
    await clickButton(wrapper, 'Сохранить отчёт');
    await clickButton(wrapper, 'Сохранить и опубликовать');
    void clickButton(wrapper, 'CSV');
    await vi.waitFor(() => expect(artifacts.exportReport).toHaveBeenCalledTimes(1));

    state.auth!.project!.effectivePermissionCodes = ['project.reporting.aggregate.read'];
    await flushPromises();
    state.auth!.project!.effectivePermissionCodes = [
      'project.reporting.aggregate.read',
      'project.reporting.author',
      'project.reporting.export',
    ];
    await flushPromises();
    pendingExport.reject(new Error('stale-private-failure'));
    await flushPromises();

    expect(wrapper.text()).not.toContain('stale-private-failure');
  });
});
