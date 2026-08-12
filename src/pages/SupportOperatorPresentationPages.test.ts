import { enableAutoUnmount, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  route: {
    params: {} as Record<string, string>,
    fullPath: '/support/quality',
  },
  router: { push: vi.fn() },
  auth: null as {
    user: { id: string };
    project: { id: string; effectivePermissionCodes: string[] } | null;
  } | null,
}));
const quality = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listReviews: vi.fn(),
}));
const presentations = vi.hoisted(() => ({
  resolve: vi.fn(),
  catalog: vi.fn(),
}));
const artifacts = vi.hoisted(() => ({
  readDashboard: vi.fn(),
  readReport: vi.fn(),
  reportHistory: vi.fn(),
  runDashboard: vi.fn(),
}));
const analytics = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => state.router,
}));
vi.mock('@/features/auth/auth.store', async () => {
  const { reactive } = await import('vue');
  state.auth = reactive({
    user: { id: 'reviewer-1' },
    project: {
      id: 'project-1',
      effectivePermissionCodes: [
        'project.support.quality.read',
        'project.dashboards.read',
        'project.dashboards.share',
        'project.reporting.aggregate.read',
      ],
    },
  });
  return { useAuthStore: () => state.auth };
});
vi.mock('@/features/support-quality/api/support-quality-source', () => ({
  supportQualitySource: quality,
}));
vi.mock('@/features/support-quality/api/support-operator-presentation-source', () => ({
  supportOperatorPresentationSource: presentations,
}));
vi.mock('@/features/support-analytics/api/support-analytics-artifact-source', () => ({
  supportAnalyticsArtifactSource: artifacts,
}));
vi.mock('@/features/support-analytics/api/support-analytics-source', () => ({
  HighCostConfirmationRequiredError: class extends Error {},
  metricLabel: () => 'Метрика',
  supportAnalyticsSource: analytics,
}));

import SupportAnalyticsArtifactPage from './SupportAnalyticsArtifactPage.vue';
import SupportQualityPage from './SupportQualityPage.vue';

enableAutoUnmount(afterEach);

const routerLinkStub = { template: '<a><slot /></a>' };
const selectStub = {
  props: ['options', 'optionLabel', 'ariaLabel'],
  template:
    '<div class="select-stub" :aria-label="ariaLabel"><span v-for="option in options" :key="option.cmsUserId ?? option.value">{{ option[optionLabel] }}</span></div>',
};
const buttonStub = {
  props: ['label'],
  emits: ['click'],
  template: '<button @click="$emit(\'click\')">{{ label }}</button>',
};
const dialogStub = {
  props: ['visible'],
  template: '<section v-if="visible"><slot /></section>',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('operator presentations in Ticket 33 pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.route.params = {};
    state.route.fullPath = '/support/quality';
    state.auth!.user.id = 'reviewer-1';
    state.auth!.project = {
      id: 'project-1',
      effectivePermissionCodes: ['project.support.quality.read'],
    };
    quality.listTasks.mockResolvedValue({ items: [], nextCursor: null });
    quality.listReviews.mockResolvedValue({ items: [], nextCursor: null });
    presentations.resolve.mockResolvedValue({ items: [] });
    presentations.catalog.mockResolvedValue({ items: [], nextCursor: null });
    analytics.run.mockResolvedValue({ result: { rows: [] } });
  });

  it('shows resolved operator names in the quality queue without exposing UUIDs', async () => {
    quality.listReviews.mockResolvedValue({
      items: [
        {
          id: 'review-1',
          operatorCmsUserId: 'operator-private-id',
          state: 'SUBMITTED',
          maximumScore: 10,
          totalScore: 9,
        },
      ],
      nextCursor: null,
    });
    presentations.resolve.mockResolvedValue({
      items: [
        {
          cmsUserId: 'operator-private-id',
          displayName: 'Марина Соколова',
          membershipState: 'ACTIVE',
          selectable: true,
          presentationVersion: 2,
          avatar: null,
        },
      ],
    });

    const wrapper = shallowMount(SupportQualityPage, {
      global: { stubs: { RouterLink: routerLinkStub, Select: selectStub } },
    });

    await vi.waitFor(() => expect(wrapper.text()).toContain('Марина Соколова'));
    expect(wrapper.text()).not.toContain('operator-private-id');
    expect(presentations.resolve).toHaveBeenCalledWith(
      'project-1',
      ['operator-private-id'],
      expect.any(AbortSignal),
    );
  });

  it('offers the first bounded operator catalog by name for dashboard sharing', async () => {
    state.route.params = { dashboardId: 'dashboard-1' };
    state.route.fullPath = '/support/analytics/dashboards/dashboard-1';
    state.auth!.project = {
      id: 'project-1',
      effectivePermissionCodes: [
        'project.dashboards.read',
        'project.dashboards.share',
        'project.reporting.aggregate.read',
      ],
    };
    const report = {
      savedReportId: 'report-1',
      savedReportRevisionId: 'report-revision-1',
      revision: 1,
      queryDefinitionHash: 'a'.repeat(64),
      name: 'Качество',
      description: '',
      query: { metrics: [] },
    };
    artifacts.readDashboard.mockResolvedValue({
      dashboardId: 'dashboard-1',
      dashboardRevisionId: 'dashboard-revision-1',
      revision: 1,
      name: 'Панель качества',
      description: '',
      report,
    });
    artifacts.readReport.mockResolvedValue(report);
    artifacts.reportHistory.mockResolvedValue({ items: [] });
    artifacts.runDashboard.mockResolvedValue({ result: { rows: [] } });
    presentations.catalog.mockResolvedValue({
      items: [
        {
          cmsUserId: 'operator-private-id',
          displayName: 'Марина Соколова',
          membershipState: 'ACTIVE',
          selectable: true,
          presentationVersion: 2,
          avatar: null,
        },
      ],
      nextCursor: null,
    });

    const wrapper = shallowMount(SupportAnalyticsArtifactPage, {
      global: { stubs: { RouterLink: routerLinkStub, Select: selectStub } },
    });

    await vi.waitFor(() => expect(wrapper.text()).toContain('Марина Соколова'));
    expect(wrapper.text()).not.toContain('operator-private-id');
    expect(wrapper.text()).not.toContain('aaaaaaaaaaaa');
    expect(presentations.catalog).toHaveBeenCalledWith(
      'project-1',
      undefined,
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('discards a late operator catalog after the project changes', async () => {
    state.route.params = { dashboardId: 'dashboard-1' };
    state.route.fullPath = '/support/analytics/dashboards/dashboard-1';
    state.auth!.project = {
      id: 'project-1',
      effectivePermissionCodes: [
        'project.dashboards.read',
        'project.dashboards.share',
        'project.reporting.aggregate.read',
      ],
    };
    const report = {
      savedReportId: 'report-1',
      savedReportRevisionId: 'report-revision-1',
      revision: 1,
      queryDefinitionHash: 'a'.repeat(64),
      name: 'Качество',
      description: '',
      query: { metrics: [] },
    };
    artifacts.readDashboard.mockResolvedValue({
      dashboardId: 'dashboard-1',
      dashboardRevisionId: 'dashboard-revision-1',
      revision: 1,
      name: 'Панель качества',
      description: '',
      report,
    });
    artifacts.readReport.mockResolvedValue(report);
    artifacts.reportHistory.mockResolvedValue({ items: [] });
    artifacts.runDashboard.mockResolvedValue({ result: { rows: [] } });
    const oldCatalog = deferred<{ items: Array<Record<string, unknown>>; nextCursor: null }>();
    presentations.catalog
      .mockImplementationOnce(() => oldCatalog.promise)
      .mockResolvedValueOnce({
        items: [
          {
            cmsUserId: 'operator-project-2',
            displayName: 'Оператор второго проекта',
            membershipState: 'ACTIVE',
            selectable: true,
            presentationVersion: 1,
            avatar: null,
          },
        ],
        nextCursor: null,
      });

    const wrapper = shallowMount(SupportAnalyticsArtifactPage, {
      global: { stubs: { RouterLink: routerLinkStub, Select: selectStub } },
    });
    await vi.waitFor(() => expect(presentations.catalog).toHaveBeenCalledTimes(1));

    state.auth!.project = {
      id: 'project-2',
      effectivePermissionCodes: [
        'project.dashboards.read',
        'project.dashboards.share',
        'project.reporting.aggregate.read',
      ],
    };
    await vi.waitFor(() => expect(wrapper.text()).toContain('Оператор второго проекта'));

    oldCatalog.resolve({
      items: [
        {
          cmsUserId: 'operator-project-1',
          displayName: 'Оператор первого проекта',
        },
      ],
      nextCursor: null,
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('Оператор первого проекта');
    expect(wrapper.text()).not.toContain('operator-project-1');
  });

  it('shows human artifact labels and reveals identifiers only through diagnostics', async () => {
    state.route.params = { reportId: 'report-1' };
    state.route.fullPath = '/support/analytics/reports/report-1';
    state.auth!.project = {
      id: 'project-1',
      effectivePermissionCodes: ['project.reporting.aggregate.read'],
    };
    artifacts.readReport.mockResolvedValue({
      savedReportId: 'report-private-id',
      savedReportRevisionId: 'report-revision-private-id',
      revision: 17,
      queryDefinitionHash: 'a'.repeat(64),
      name: 'Отчёт качества',
      description: '',
      query: { metrics: ['quality_score_average_private'] },
    });
    artifacts.reportHistory.mockResolvedValue({ items: [] });
    analytics.run.mockResolvedValue({
      result: { rows: [] },
      receipt: {
        completeness: 'COMPLETE',
        datasetRevisionId: 'dataset-revision-private-id',
        privacyEpoch: 'privacy-epoch-private-id',
      },
    });
    const wrapper = shallowMount(SupportAnalyticsArtifactPage, {
      global: {
        stubs: {
          RouterLink: routerLinkStub,
          Select: selectStub,
          Button: buttonStub,
          Dialog: dialogStub,
        },
      },
    });

    await vi.waitFor(() => expect(wrapper.text()).toContain('Отчёт качества'));
    expect(wrapper.text()).toContain('Метрика');
    expect(wrapper.text()).toContain('Технические сведения');
    expect(wrapper.text()).not.toContain('quality_score_average_private');
    expect(wrapper.text()).not.toContain('dataset-revision-private-id');
    expect(wrapper.text()).not.toContain('privacy-epoch-private-id');
    expect(wrapper.text()).not.toContain('report-revision-private-id');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Технические сведения')!
      .trigger('click');

    expect(wrapper.text()).toContain('dataset-revision-private-id');
    expect(wrapper.text()).toContain('privacy-epoch-private-id');
    expect(wrapper.text()).toContain('report-revision-private-id');
  });

  it('scrubs revision history before an unauthorized early return', async () => {
    state.route.params = { reportId: 'report-1' };
    state.route.fullPath = '/support/analytics/reports/report-1';
    state.auth!.project = {
      id: 'project-1',
      effectivePermissionCodes: ['project.reporting.aggregate.read'],
    };
    const report = {
      savedReportId: 'report-1',
      savedReportRevisionId: 'revision-1',
      revision: 1,
      queryDefinitionHash: 'a'.repeat(64),
      name: 'Отчёт качества',
      description: '',
      query: { metrics: [] },
    };
    artifacts.readReport.mockResolvedValue(report);
    artifacts.reportHistory
      .mockResolvedValueOnce({
        items: Array.from({ length: 50 }, (_, index) => ({ revision: index + 1 })),
      })
      .mockRejectedValueOnce(new Error('История временно недоступна'));
    const wrapper = shallowMount(SupportAnalyticsArtifactPage, {
      global: { stubs: { RouterLink: routerLinkStub, Button: buttonStub, Dialog: dialogStub } },
    });
    await vi.waitFor(() => expect(wrapper.text()).toContain('50 опубликованных снимков'));

    state.auth!.project!.effectivePermissionCodes = [];
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('Отчёт качества'));
    state.auth!.project!.effectivePermissionCodes = ['project.reporting.aggregate.read'];

    await vi.waitFor(() => expect(wrapper.text()).toContain('История временно недоступна'));
    expect(wrapper.text()).not.toContain('50 опубликованных снимков');
  });
});
