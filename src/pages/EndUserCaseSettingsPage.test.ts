import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  project: {
    id: 'project-1',
    effectivePermissionCodes: ['project.cases.settings.manage', 'project.ai_usage.read'],
  } as { id: string; effectivePermissionCodes: string[] } | null,
}));
const repository = vi.hoisted(() => ({
  policy: vi.fn(),
  cost: vi.fn(),
  previewPolicy: vi.fn(),
  savePolicy: vi.fn(),
  publishPolicy: vi.fn(),
}));

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => state,
}));
vi.mock('@/features/end-user-cases/api/end-user-cases-repository', () => ({
  endUserCasesRepository: repository,
}));

import EndUserCaseSettingsPage from './EndUserCaseSettingsPage.vue';

const published = {
  id: 'policy-1',
  version: 3,
  status: 'PUBLISHED',
  compiledPolicy: {
    groups: [
      { code: 'UNMAPPED', title: 'Fallback' },
      { code: 'DEPOSIT', title: 'Депозиты' },
    ],
    priorityFloors: [{ groupCode: 'DEPOSIT', priority: 'HIGH' }],
    scheduling: { quietPeriodSeconds: 60 },
  },
};

function mountPage() {
  return mount(EndUserCaseSettingsPage, {
    global: {
      mocks: { $router: { push: vi.fn() } },
      stubs: {
        Button: {
          props: ['label', 'disabled', 'loading'],
          emits: ['click'],
          template:
            '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Message: { template: '<div><slot /></div>' },
        Textarea: {
          props: ['modelValue', 'disabled'],
          emits: ['update:modelValue'],
          template:
            '<textarea :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
      },
    },
  });
}

describe('EndUserCaseSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.project = {
      id: 'project-1',
      effectivePermissionCodes: ['project.cases.settings.manage', 'project.ai_usage.read'],
    };
    repository.policy.mockResolvedValue({ published, draft: null });
    repository.cost.mockResolvedValue({
      requestCount: 7,
      totalTokens: 1200,
      billedCostUsd: '0.014000',
      budget: {
        projectDailyTokenHardCap: 50000,
        emergencyPaused: false,
        backlogCount: 0,
        oldestPendingAt: null,
        degradedReasons: [],
      },
    });
    repository.previewPolicy.mockResolvedValue({
      compilerVersion: 'case-policy-v1',
      compiledPolicyHash: '1234567890abcdef',
      compiledPolicy: { groups: [{ code: 'DEPOSIT' }] },
    });
    repository.savePolicy.mockResolvedValue({});
    repository.publishPolicy.mockResolvedValue({});
  });

  it('loads the published policy and cost without exposing the synthetic fallback group', async () => {
    const wrapper = mountPage();
    await vi.waitFor(() => expect(repository.policy).toHaveBeenCalledWith('project-1'));
    await flushPromises();

    expect(repository.cost).toHaveBeenCalledWith('project-1');
    expect(wrapper.text()).toContain('0,014');
    expect(wrapper.get('textarea').element.value).toContain('"code": "DEPOSIT"');
    expect(wrapper.get('textarea').element.value).not.toContain('UNMAPPED');
    expect(wrapper.text()).toContain('Версия 3');
    expect(wrapper.get('.advanced-editor').attributes('open')).toBeDefined();
    expect(wrapper.get('.advanced-editor summary').text()).toBe('Редактирование правил');
  });

  it('shows a project-level backlog warning without exposing technical reason codes', async () => {
    repository.cost.mockResolvedValue({
      requestCount: 7,
      totalTokens: '1200',
      billedCostUsd: '0.014000',
      estimatedCostUsd: '0.014000',
      calculatedAt: '2026-07-27T10:00:00.000Z',
      operations: [],
      budget: {
        projectDailyTokenHardCap: '50000',
        emergencyPaused: false,
        backlogCount: 3,
        oldestPendingAt: '2026-07-27T09:00:00.000Z',
        degradedReasons: ['CASE_INTELLIGENCE_PROJECT_BUDGET_EXCEEDED'],
      },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('В очереди анализа 3 сигнала');
    expect(wrapper.text()).toContain('Новые сообщения сохраняются');
    expect(wrapper.text()).not.toContain('CASE_INTELLIGENCE_PROJECT_BUDGET_EXCEEDED');
  });

  it('previews and saves only a parsed, bounded policy draft', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get('textarea').setValue(
      JSON.stringify({
        groups: [{ code: 'PAYMENT', title: 'Payments' }],
        priorityRules: [{ groupCode: 'PAYMENT', priority: 'HIGH' }],
        scheduling: { quietPeriodSeconds: 90 },
      }),
    );

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Проверить')!
      .trigger('click');
    await vi.waitFor(() =>
      expect(repository.previewPolicy).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          groups: [{ code: 'PAYMENT', title: 'Payments' }],
          scheduling: { quietPeriodSeconds: 90 },
        }),
      ),
    );
    expect(wrapper.text()).toContain('Проверка не изменила');
    expect(wrapper.text()).toContain('case-policy-v1');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Сохранить черновик')!
      .trigger('click');
    await vi.waitFor(() =>
      expect(repository.savePolicy).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          expectedVersion: 3,
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(repository.policy).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed or structurally incomplete JSON before any mutation', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get('textarea').setValue('{"groups":[]}');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Сохранить черновик')!
      .trigger('click');

    expect(wrapper.text()).toContain(
      'В настройках должны быть списки категорий и правил приоритета',
    );
    expect(repository.savePolicy).not.toHaveBeenCalled();
  });

  it('publishes only an existing draft and omits cost for unauthorized users', async () => {
    state.project = {
      id: 'project-1',
      effectivePermissionCodes: ['project.cases.settings.manage'],
    };
    repository.policy.mockResolvedValue({
      published,
      draft: { ...published, id: 'draft-1', version: 4, status: 'DRAFT' },
    });
    const wrapper = mountPage();
    await flushPromises();

    expect(repository.cost).not.toHaveBeenCalled();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Опубликовать')!
      .trigger('click');
    await vi.waitFor(() =>
      expect(repository.publishPolicy).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          expectedVersion: 4,
          reason: 'Publish Case taxonomy and priority policy from CMS',
        }),
      ),
    );
  });

  it('shows repository failures without leaving the page in a loading state', async () => {
    repository.policy.mockRejectedValue(new Error('policy unavailable'));
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('policy unavailable');
    expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined();
  });
});
