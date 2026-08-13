import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/auth.store';
import { resetMockReportingRepository } from '@/features/reporting/api/reporting-repository';
import { reportingRepository } from '@/features/reporting/api/reporting-repository';
import SavedReportPage from './SavedReportPage.vue';

const stubs = {
  Button: {
    props: ['label', 'loading', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
  },
  InputText: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  Select: { props: ['modelValue', 'options'], template: '<select />' },
  Textarea: { template: '<textarea />' },
  Skeleton: { template: '<span />' },
};

const authorPermissions = [
  'project.analytics.read',
  'project.analytics.query.execute',
  'project.saved_reports.create',
  'project.saved_reports.edit_own',
  'project.saved_reports.publish',
  'project.dashboards.create',
];

async function mountPage(path: string, permissions: string[] = authorPermissions) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.$patch({
    phase: 'AUTHENTICATED',
    user: { id: 'operator-1', email: 'operator@example.com', name: 'Оператор' },
    project: {
      id: 'project-1',
      name: 'Project One',
      slug: 'project-one',
      status: 'ACTIVE',
      supportedLocales: ['ru'],
      effectivePermissionCodes: permissions,
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reports', component: { template: '<div />' } },
      {
        path: '/reports/new',
        name: 'saved-report-create',
        component: SavedReportPage,
      },
      {
        path: '/reports/:reportId',
        name: 'saved-report-view',
        component: SavedReportPage,
      },
      {
        path: '/reports/:reportId/edit',
        name: 'saved-report-edit',
        component: SavedReportPage,
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(SavedReportPage, {
    global: { plugins: [pinia, router], stubs },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('SavedReportPage', () => {
  beforeEach(() => resetMockReportingRepository());
  afterEach(() => vi.useRealTimers());

  it('previews and publishes an Event-backed Saved Report from one workbench', async () => {
    const { wrapper } = await mountPage('/reports/new');

    expect(wrapper.text()).toContain('Новый сохранённый отчёт');
    expect(wrapper.text()).toContain('Источник данных');
    expect(wrapper.text()).toContain('Продуктовые события');

    await wrapper.get('[data-action="preview"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('12 840 активных пользователей');
    expect(wrapper.text()).toContain('Точные данные');
    expect(wrapper.text()).toContain('Сохранить черновик');
    expect(wrapper.text()).toContain('Опубликовать');
  });

  it('opens a published report in a read-first viewer', async () => {
    const { wrapper } = await mountPage('/reports/report-active-users');

    expect(wrapper.text()).toContain('Активные пользователи');
    expect(wrapper.text()).toContain('Обновить');
    expect(wrapper.text()).toContain('Добавить в дашборд');
    expect(wrapper.text()).toContain('8–9 авг 2026 · 2 полных дня');
  });

  it('hides Add to Dashboard without its exact create Permission', async () => {
    const { wrapper } = await mountPage('/reports/report-active-users', [
      'project.analytics.read',
      'project.analytics.query.execute',
    ]);

    expect(wrapper.text()).not.toContain('Добавить в дашборд');
  });

  it('autosaves a governed Draft with its OCC version', async () => {
    vi.useFakeTimers();
    const { wrapper, router } = await mountPage('/reports/new');
    await wrapper.findAll('input')[0]?.setValue('Автосохранённый отчёт');

    await vi.advanceTimersByTimeAsync(810);
    await flushPromises();

    const reportId = String(router.currentRoute.value.params.reportId);
    const saved = await reportingRepository.getSavedReport('project-1', reportId);
    expect(saved.title).toBe('Автосохранённый отчёт');
  });
});
