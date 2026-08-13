import { config, flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import AiAllowanceJournalPanel from './AiAllowanceJournalPanel.vue';
import AiAllowanceLimitsPanel from './AiAllowanceLimitsPanel.vue';

const mocks = vi.hoisted(() => ({
  projectPolicy: vi.fn(),
  planRevisions: vi.fn(),
  journal: vi.fn(),
  putDefaultPlan: vi.fn(),
  putPlan: vi.fn(),
  putCohortAssignment: vi.fn(),
  translationCreate: vi.fn(),
  translationGet: vi.fn(),
  translationCancel: vi.fn(),
  translationRetryTarget: vi.fn(),
  reconcile: vi.fn(),
  reconciliationQueue: vi.fn(),
  resolveAttempt: vi.fn(),
  endUserBalance: vi.fn(),
  correct: vi.fn(),
}));
vi.mock('../api/ai-allowance-repository', () => ({
  aiAllowanceRepository: {
    projectPolicy: mocks.projectPolicy,
    planRevisions: mocks.planRevisions,
    journal: mocks.journal,
    putDefaultPlan: mocks.putDefaultPlan,
    putPlan: mocks.putPlan,
    putCohortAssignment: mocks.putCohortAssignment,
    reconcile: mocks.reconcile,
    reconciliationQueue: mocks.reconciliationQueue,
    resolveAttempt: mocks.resolveAttempt,
    endUserBalance: mocks.endUserBalance,
    correct: mocks.correct,
  },
}));
vi.mock('@/features/scenario-localization/api/translation-repository', () => ({
  translationRepository: {
    create: mocks.translationCreate,
    get: mocks.translationGet,
    cancel: mocks.translationCancel,
    retryTarget: mocks.translationRetryTarget,
  },
}));

const policy = {
  projectPolicyVersion: '4',
  localization: {
    defaultLocale: 'ru-RU',
    supportedLocales: ['ru-RU', 'en-US', 'es-ES'],
    translationSupportedLocales: ['ru-RU', 'en-US', 'es-ES'],
  },
  policy: {
    projectId: 'project-1',
    enforcementMode: 'SOFT',
    timezone: 'Europe/Madrid',
    warningContent: { mode: 'SYSTEM' },
    lowThresholdMode: 'PERCENT',
    lowThresholdValue: '10.000000000000',
    exhaustedContent: { mode: 'SYSTEM' },
    showEndUserExactUsd: false,
    version: '1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  plans: [
    {
      id: 'plan-1',
      key: 'project-default',
      name: 'Project default',
      status: 'ACTIVE',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      revisions: [
        {
          id: 'revision-1',
          planId: 'plan-1',
          revisionNumber: 1,
          periodKind: 'DAY',
          recurringAmountUsd: '5.000000000001',
          dailyCapUsd: null,
          effectiveFrom: '2026-08-01T00:00:00.000Z',
          changeReason: 'Initial limit',
          createdAt: '2026-08-01T00:00:00.000Z',
          categoryRules: [],
        },
      ],
      revisionsPageInfo: { hasMore: false, nextCursor: null },
    },
  ],
  plansPageInfo: { hasMore: false, nextCursor: null },
  defaultAssignment: {
    id: '33333333-3333-4333-8333-333333333333',
    scope: 'PROJECT_DEFAULT',
    endUserId: null,
    planId: 'plan-1',
    effectiveFrom: '2026-08-01T00:00:00.000Z',
    effectiveUntil: null,
    version: '1',
    reason: 'Initial limit',
  },
  runtimeGates: { hardEnforcementApproved: true, emergencyDisabled: false },
} as const;

function journalPage(reason: string) {
  return {
    items: [
      {
        id: `entry-${reason}`,
        entryType: 'GRANT',
        costQuality: null,
        deltaAvailableUsd: '1.000000000000',
        deltaReservedUsd: '0.000000000000',
        deltaSettledUsd: '0.000000000000',
        deltaUnknownUsd: '0.000000000000',
        deltaOverageUsd: '0.000000000000',
        periodId: null,
        reservationId: null,
        grantId: null,
        usageRecordId: null,
        correctsEntryId: null,
        actorType: 'SYSTEM',
        actorId: 'test',
        reason,
        occurredAt: '2026-08-02T10:00:00.000Z',
        createdAt: '2026-08-02T10:00:00.000Z',
      },
    ],
    pageInfo: { hasMore: false, nextCursor: null },
  } as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('allowance admin panels', () => {
  beforeEach(() => {
    sessionStorage.clear();
    config.global.stubs.Select = {
      inheritAttrs: false,
      props: ['modelValue', 'options', 'optionLabel', 'optionValue'],
      emits: ['update:modelValue'],
      template:
        '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option[optionValue]" :value="option[optionValue]">{{ option[optionLabel] }}</option></select>',
    };
    vi.clearAllMocks();
    mocks.projectPolicy.mockResolvedValue(policy);
    mocks.journal.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    mocks.reconcile.mockResolvedValue({ replayed: false });
    mocks.reconciliationQueue.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    mocks.resolveAttempt.mockResolvedValue({ replayed: false });
    mocks.endUserBalance.mockResolvedValue({
      account: {
        projectId: 'project-1',
        endUserId: 'user-1',
        currency: 'USD',
        availableUsd: '3.000000000000',
        reservedUsd: '0.000000000000',
        settledUsd: '1.000000000000',
        unknownHeldUsd: '0.000000000000',
        overageUsd: '0.000000000000',
        version: '7',
      },
      currentPeriod: null,
      currentPeriodSpend: null,
      pendingBaseAllocationUsd: '0.000000000000',
      activeGrants: [],
      grantsPageInfo: { hasMore: false, nextCursor: null },
      endUserAssignment: null,
    });
    mocks.correct.mockResolvedValue({ replayed: false });
    mocks.putDefaultPlan.mockResolvedValue({
      projectPolicyVersion: '5',
      replayed: false,
    });
    mocks.putPlan.mockResolvedValue({
      projectPolicyVersion: '5',
      replayed: false,
    });
    mocks.putCohortAssignment.mockResolvedValue({
      projectPolicyVersion: '5',
      replayed: false,
    });
    mocks.translationCreate.mockResolvedValue({
      jobId: 'translation-job-1',
      createdAt: '2026-08-03T10:00:00.000Z',
    });
    mocks.translationGet.mockResolvedValue({
      jobId: 'translation-job-1',
      status: 'COMPLETED',
      sourceHash: 'source-hash',
      createdAt: '2026-08-03T10:00:00.000Z',
      sourceLocale: 'ru-RU',
      targets: [
        {
          targetLocale: 'en-US',
          status: 'SUCCESS',
          outputUnits: [
            {
              key: 'allowance.warning',
              text: 'Your AI allowance is almost exhausted.',
            },
          ],
          errorCode: null,
        },
      ],
    });
  });

  it('permission-gates the policy read without issuing a request', async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: false,
        canManage: false,
        canReconcile: false,
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('project.ai_allowance.read');
    expect(mocks.projectPolicy).not.toHaveBeenCalled();
  });

  it('shows the warning threshold without internal terminology', async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: false,
        canReconcile: false,
      },
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="allowance-low-threshold-summary"]').text()).toBe(
      '10% от базового лимита',
    );
    expect(wrapper.text()).toContain('Лимиты для пользователей');
    expect(wrapper.text()).not.toContain('LOW');
    expect(wrapper.text()).not.toContain('project default');
    expect(wrapper.text()).not.toContain('Настроить общий лимит');
  });

  it('shows exact default allowance and exposes mutations only with manage permission', async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
        defaultLocale: 'es',
        supportedLocales: ['ru', 'en', 'es'],
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('5,00 $');
    expect(wrapper.get('button').text()).toContain('Настроить общий лимит');
    expect(mocks.projectPolicy).toHaveBeenCalledWith('project-1');
  });

  it('composes grant and policy permissions without hiding either workspace', async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canGrant: true,
        canReconcile: false,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Начислить дополнительный лимит');
    expect(wrapper.text()).toContain('Общий лимит проекта');
    expect(wrapper.text()).toContain('Настроить общий лимит');
  });

  it('makes the universal limit the primary action for an unconfigured project', async () => {
    mocks.projectPolicy.mockResolvedValueOnce({
      projectPolicyVersion: '0',
      localization: {
        defaultLocale: 'ru',
        supportedLocales: ['ru', 'en'],
        translationSupportedLocales: ['ru', 'en'],
      },
      policy: null,
      plans: [],
      plansPageInfo: { hasMore: false, nextCursor: null },
      defaultAssignment: null,
      runtimeGates: {
        hardEnforcementApproved: false,
        emergencyDisabled: true,
      },
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canGrant: true,
        canReconcile: false,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Общий лимит проекта');
    expect(wrapper.text()).toContain('Настроить общий лимит');
    expect(wrapper.text().indexOf('Общий лимит проекта')).toBeLessThan(
      wrapper.text().indexOf('Начислить дополнительный лимит'),
    );
  });

  it('never hides the universal limit workspace when its policy request fails', async () => {
    mocks.projectPolicy.mockRejectedValueOnce(new Error('Политика временно недоступна'));
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canGrant: true,
        canReconcile: false,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Общий лимит проекта');
    expect(wrapper.text()).toContain('Политика временно недоступна');
    expect(wrapper.text().indexOf('Общий лимит проекта')).toBeLessThan(
      wrapper.text().indexOf('Начислить дополнительный лимит'),
    );
  });

  it('blocks HARD submission until the explicit risk confirmation', async () => {
    mocks.putDefaultPlan.mockResolvedValue({
      projectPolicyVersion: '5',
      replayed: false,
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');
    await wrapper.get('input[type="radio"][value="HARD"]').setValue(true);
    await wrapper.findAll('textarea').at(-1)!.setValue('Enable approved hard limit');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain('Подтвердите, что AI-операции можно блокировать');
    expect(mocks.putDefaultPlan).not.toHaveBeenCalled();

    await wrapper.get('#hard-enforcement-confirmation').setValue(true);
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(mocks.putDefaultPlan).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        expectedProjectPolicyVersion: '4',
        enforcementMode: 'HARD',
        amountUsd: '5.000000000001',
      }),
      expect.any(String),
    );
  });

  it('disables HARD when runtime approval is absent or emergency disable is active', async () => {
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      runtimeGates: { hardEnforcementApproved: true, emergencyDisabled: true },
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Блокировка расходов временно отключена');
    expect(wrapper.text()).toContain('Расходы продолжают учитываться, но AI не остановится');
    expect(wrapper.text()).not.toContain('Emergency');
    expect(wrapper.text()).not.toContain('Approval');
    expect(wrapper.find('.runtime-gates').exists()).toBe(false);
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');
    expect(wrapper.get('input[type="radio"][value="HARD"]').attributes('disabled')).toBeDefined();
  });

  it('edits the exact end-user USD visibility gate only through the managed policy form', async () => {
    mocks.putDefaultPlan.mockResolvedValue({
      projectPolicyVersion: '5',
      replayed: false,
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');
    expect((wrapper.get('#show-end-user-exact-usd').element as HTMLInputElement).checked).toBe(
      false,
    );

    await wrapper.get('#show-end-user-exact-usd').setValue(true);
    await wrapper.findAll('textarea').at(-1)!.setValue('Enable exact USD visibility');
    await wrapper.get('form.allowance-form').trigger('submit');
    await flushPromises();

    expect(mocks.putDefaultPlan).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        expectedProjectPolicyVersion: '4',
        lowThresholdMode: 'PERCENT',
        lowThresholdValue: '10.000000000000',
        showEndUserExactUsd: true,
      }),
      expect.any(String),
    );
  });

  it('loads the assigned DEFAULT directly when it is outside the plans page', async () => {
    const defaultPlan = policy.plans[0]!;
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      plans: [],
      plansPageInfo: { hasMore: true, nextCursor: 'cursor-50' },
    });
    mocks.planRevisions.mockResolvedValue({
      projectPolicyVersion: policy.projectPolicyVersion,
      plan: {
        id: defaultPlan.id,
        key: defaultPlan.key,
        name: defaultPlan.name,
        status: defaultPlan.status,
        createdAt: defaultPlan.createdAt,
        updatedAt: defaultPlan.updatedAt,
      },
      revisions: defaultPlan.revisions,
      pageInfo: defaultPlan.revisionsPageInfo,
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
    });
    await flushPromises();

    expect(mocks.planRevisions).toHaveBeenCalledWith('project-1', 'DEFAULT', {
      limit: 1,
    });
    expect(wrapper.text()).toContain('5,00 $');
    expect(wrapper.text()).toContain('Общий лимит проекта');
    expect(wrapper.text()).toContain('project-default');
  });

  it('saves a configurable LOW threshold and rejects an invalid percentage', async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');

    await wrapper.get('#allowance-low-threshold-value').setValue('101');
    await wrapper.findAll('textarea').at(-1)!.setValue('Configure warning threshold');
    await wrapper.get('form.allowance-form').trigger('submit');
    expect(wrapper.text()).toContain('процент от 0,01 до 100');
    expect(mocks.putDefaultPlan).not.toHaveBeenCalled();

    await wrapper.get('#allowance-low-threshold-mode').setValue('ABSOLUTE_USD');
    await wrapper.get('#allowance-low-threshold-value').setValue('1.25');
    await wrapper.get('form.allowance-form').trigger('submit');
    await flushPromises();

    expect(mocks.putDefaultPlan).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        lowThresholdMode: 'ABSOLUTE_USD',
        lowThresholdValue: '1.25',
      }),
      expect.any(String),
    );
  });

  it('shows a compact, Russian-language base plan form with advanced settings collapsed', async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');

    const form = wrapper.get('form.allowance-form');
    expect(form.get('[data-testid="primary-limit-card"]')).toBeTruthy();
    expect(form.text()).not.toContain('Главная настройка');
    expect(form.findAll('.help-tip').every((tip) => tip.find('.pi-question-circle').exists())).toBe(
      true,
    );
    expect(form.get('.settings-grid').findAll(':scope > label')).toHaveLength(4);
    expect(form.text()).toContain('Часовой пояс');
    expect(form.text()).toContain('Порог предупреждения');
    expect(form.text()).toContain('Что делать после исчерпания лимита');
    expect(form.text()).not.toContain('Timezone');
    expect(form.text()).not.toContain('LOW');
    expect(form.text()).not.toContain('Idempotency-Key');
    expect((form.get('#allowance-low-threshold-value').element as HTMLInputElement).value).toBe(
      '10',
    );
    expect(form.get('[data-testid="allowance-timezone-select"]')).toBeTruthy();
    expect(form.get('[data-testid="allowance-period-select"]')).toBeTruthy();
    expect(form.get('[data-testid="allowance-threshold-mode-select"]')).toBeTruthy();
    expect(form.get('.mode-options')).toBeTruthy();
    expect(form.get('button[aria-label="Подсказка о значении порога"]')).toBeTruthy();
    expect(form.text()).not.toContain('От 0,01 до 100, не более двух знаков после запятой.');
    expect(form.get('[data-testid="allowance-amount-suffix"]').text()).toBe('$');
    expect(
      form.get('[data-testid="allowance-warning-content"]').attributes('open'),
    ).toBeUndefined();
    expect(
      form.get('[data-testid="allowance-exhausted-content"]').attributes('open'),
    ).toBeUndefined();
  });

  it('lets an operator add no more than two category exceptions', async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Создать вариант'))!
      .trigger('click');

    const form = wrapper.get('form.allowance-form');
    const addButton = form.get('[data-testid="add-category-rule"]');
    expect(form.findAll('[data-testid="category-rule"]')).toHaveLength(0);

    await addButton.trigger('click');
    await addButton.trigger('click');

    expect(form.findAll('[data-testid="category-rule"]')).toHaveLength(2);
    expect(addButton.attributes('disabled')).toBeDefined();
    expect(form.text()).toContain('Не более двух исключений');
    expect(form.text()).toContain('обычного текстового диалога');
    expect(form.text()).not.toContain('cap USD');
    expect(form.text()).not.toContain('AI_REVIEW');
  });

  it('preserves legacy category exceptions beyond the two visible editor slots', async () => {
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      plans: [
        {
          ...policy.plans[0],
          revisions: [
            {
              ...policy.plans[0].revisions[0],
              categoryRules: [
                {
                  category: 'CHAT',
                  responsibility: 'PROJECT_SPONSORED',
                  capUsd: null,
                },
                {
                  category: 'VOICE',
                  responsibility: 'PROJECT_SPONSORED',
                  capUsd: '2.000000000000',
                },
                {
                  category: 'MEMORY',
                  responsibility: 'PROJECT_SPONSORED',
                  capUsd: '1.000000000000',
                },
              ],
            },
          ],
        },
      ],
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Изменить вариант'))!
      .trigger('click');

    const form = wrapper.get('form.allowance-form');
    expect(form.findAll('[data-testid="category-rule"]')).toHaveLength(2);
    expect(form.text()).toContain('Старые исключения (1) сохранятся');
    await form.get('textarea').setValue('Сохраняем старые исключения');
    await form.trigger('submit');
    await flushPromises();

    expect(mocks.putPlan).toHaveBeenCalledWith(
      'project-1',
      'PROJECT-DEFAULT',
      expect.objectContaining({
        categoryRules: expect.arrayContaining([
          expect.objectContaining({ category: 'CHAT' }),
          expect.objectContaining({ category: 'VOICE' }),
          expect.objectContaining({ category: 'MEMORY' }),
        ]),
      }),
      expect.any(String),
    );
    expect(mocks.putPlan.mock.calls[0]?.[2]?.categoryRules).toHaveLength(3);
  });

  it('round-trips backend-owned standard messages as SYSTEM', async () => {
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      policy: {
        ...policy.policy,
        warningContent: { mode: 'SYSTEM' },
        exhaustedContent: { mode: 'SYSTEM' },
      },
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');

    const form = wrapper.get('form.allowance-form');
    expect(
      (form.get('[data-testid="use-system-warning"]').element as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (form.get('[data-testid="use-system-exhausted"]').element as HTMLInputElement).checked,
    ).toBe(true);
    await form.get('textarea').setValue('Проверка стандартных сообщений');
    await form.trigger('submit');
    await flushPromises();

    expect(mocks.putDefaultPlan).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        warningContent: { mode: 'SYSTEM' },
        exhaustedContent: { mode: 'SYSTEM' },
      }),
      expect.any(String),
    );
  });

  it('recovers a pending translation only after the matching draft is hydrated', async () => {
    const sourceText = 'Особое предупреждение проекта.';
    sessionStorage.setItem(
      'retenive:translation-jobs:project-1:allowance-policy',
      JSON.stringify([
        {
          jobId: 'translation-job-1',
          fieldPath: 'allowance.warning',
          sourceLocale: 'ru-RU',
          sourceText,
          unitKeys: ['allowance.warning'],
          targets: ['en-US'],
          targetValues: { 'en-US': '' },
          startedAt: '2026-08-03T10:00:00.000Z',
        },
      ]),
    );
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      policy: {
        ...policy.policy,
        warningContent: {
          mode: 'CUSTOM',
          defaultLocale: 'ru-RU',
          translations: { 'ru-RU': sourceText },
        },
      },
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    expect(mocks.translationGet).not.toHaveBeenCalled();

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');
    await flushPromises();

    expect(mocks.translationGet).toHaveBeenCalledWith('project-1', 'translation-job-1');
    await wrapper
      .get('[data-field-path="allowance.warning"] [data-coverage-trigger]')
      .trigger('click');
    expect(
      (wrapper.get('textarea[aria-label*="перевод en-US"]').element as HTMLTextAreaElement).value,
    ).toBe('Your AI allowance is almost exhausted.');
  });

  it('translates both custom messages to every project locale in one AI job', async () => {
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      policy: {
        ...policy.policy,
        warningContent: {
          mode: 'CUSTOM',
          defaultLocale: 'ru-RU',
          translations: {
            'ru-RU': 'В проекте почти закончился AI-бюджет.',
          },
        },
        exhaustedContent: {
          mode: 'CUSTOM',
          defaultLocale: 'ru-RU',
          translations: {
            'ru-RU': 'AI-бюджет проекта исчерпан.',
          },
        },
      },
    });
    mocks.translationGet.mockResolvedValue({
      jobId: 'translation-job-1',
      status: 'COMPLETED',
      sourceHash: 'source-hash',
      createdAt: '2026-08-03T10:00:00.000Z',
      sourceLocale: 'ru-RU',
      targets: [
        {
          targetLocale: 'en-US',
          status: 'SUCCESS',
          outputUnits: [
            {
              key: 'allowance.warning',
              text: "The project's AI budget is almost exhausted.",
            },
            {
              key: 'allowance.exhausted',
              text: "The project's AI budget is exhausted.",
            },
          ],
          errorCode: null,
        },
        {
          targetLocale: 'es-ES',
          status: 'SUCCESS',
          outputUnits: [
            {
              key: 'allowance.warning',
              text: 'El presupuesto de IA del proyecto está casi agotado.',
            },
            {
              key: 'allowance.exhausted',
              text: 'El presupuesto de IA del proyecto está agotado.',
            },
          ],
          errorCode: null,
        },
      ],
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');

    await wrapper.get('[data-testid="translate-allowance-content"]').trigger('click');
    await flushPromises();

    expect(mocks.translationCreate).toHaveBeenCalledWith(
      'project-1',
      {
        sourceLocale: 'ru-RU',
        targetLocales: ['en-US', 'es-ES'],
        units: [
          {
            key: 'allowance.warning',
            text: 'В проекте почти закончился AI-бюджет.',
          },
          {
            key: 'allowance.exhausted',
            text: 'AI-бюджет проекта исчерпан.',
          },
        ],
      },
      { idempotencyKey: expect.any(String) },
    );
    await wrapper
      .get('[data-field-path="allowance.warning"] [data-coverage-trigger]')
      .trigger('click');
    expect(
      (wrapper.get('textarea[aria-label*="перевод en-US"]').element as HTMLTextAreaElement).value,
    ).toBe("The project's AI budget is almost exhausted.");
    expect(
      (wrapper.get('textarea[aria-label*="перевод es-ES"]').element as HTMLTextAreaElement).value,
    ).toBe('El presupuesto de IA del proyecto está casi agotado.');
    const exhaustedField = wrapper.get('[data-field-path="allowance.exhausted"]');
    await exhaustedField.get('[data-coverage-trigger]').trigger('click');
    expect(
      (exhaustedField.get('textarea[aria-label*="перевод en-US"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("The project's AI budget is exhausted.");

    const form = wrapper.get('form.allowance-form');
    await form
      .get('textarea[placeholder="Например: увеличили лимит для нового тарифа"]')
      .setValue('Добавили переводы предупреждения');
    await form.trigger('submit');
    await flushPromises();

    expect(mocks.putDefaultPlan).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        warningContent: {
          mode: 'CUSTOM',
          defaultLocale: 'ru-RU',
          translations: {
            'ru-RU': 'В проекте почти закончился AI-бюджет.',
            'en-US': "The project's AI budget is almost exhausted.",
            'es-ES': 'El presupuesto de IA del proyecto está casi agotado.',
          },
        },
        exhaustedContent: {
          mode: 'CUSTOM',
          defaultLocale: 'ru-RU',
          translations: {
            'ru-RU': 'AI-бюджет проекта исчерпан.',
            'en-US': "The project's AI budget is exhausted.",
            'es-ES': 'El presupuesto de IA del proyecto está agotado.',
          },
        },
      }),
      expect.any(String),
    );
  });

  it('keeps the policy draft open after an OCC conflict', async () => {
    mocks.putDefaultPlan.mockRejectedValue(
      new ApiError(
        409,
        'Conflict',
        undefined,
        undefined,
        'AI_ALLOWANCE_CONFIGURATION_VERSION_CONFLICT',
      ),
    );
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');
    const form = wrapper.get('form.allowance-form');
    await form.findAll('textarea').at(-1)!.setValue('Keep policy draft');
    await form.trigger('submit');
    await flushPromises();

    expect(wrapper.find('form.allowance-form').exists()).toBe(true);
    expect(wrapper.text()).toContain('Конфигурация лимитов уже изменилась');
    expect(wrapper.text()).toContain('Загрузить актуальную версию');
    expect(wrapper.findAll('textarea').at(-1)!.element.value).toBe('Keep policy draft');
  });

  it.each([
    { family: 'default plan', mutation: 'default' as const },
    { family: 'named plan', mutation: 'named' as const },
    { family: 'cohort assignment', mutation: 'cohort' as const },
  ])('requires one fresh login for $family without replaying it', async ({ mutation }) => {
    const protectedMutation =
      mutation === 'default'
        ? mocks.putDefaultPlan
        : mutation === 'named'
          ? mocks.putPlan
          : mocks.putCohortAssignment;
    protectedMutation.mockRejectedValue(
      new ApiError(
        428,
        'unsafe backend text',
        undefined,
        'step-up-request',
        'REAUTHENTICATION_REQUIRED',
      ),
    );
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    const openLabel =
      mutation === 'default'
        ? 'Настроить общий лимит'
        : mutation === 'named'
          ? 'Создать вариант'
          : 'Назначить группе';
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes(openLabel))!
      .trigger('click');
    const form = wrapper.get('form.allowance-form');
    if (mutation === 'named') {
      const inputs = form.findAll('input');
      await inputs[0]!.setValue('VIP_NEW');
      await inputs[1]!.setValue('VIP New');
      await inputs[2]!.setValue('10');
    }
    if (mutation === 'cohort') {
      form
        .findComponent({ name: 'SegmentSelect' })
        .vm.$emit('update:modelValue', '33333333-3333-4333-8333-333333333333');
      await flushPromises();
    }
    await form.findAll('textarea').at(-1)!.setValue('Protected allowance mutation');
    await form.trigger('submit');
    await flushPromises();

    expect(wrapper.find('form.allowance-form').exists()).toBe(true);
    expect(wrapper.text()).toContain('не будут повторены автоматически');
    expect(wrapper.text()).not.toContain('unsafe backend text');
    await wrapper.get('[data-testid="allowance-fresh-login"]').trigger('click');
    expect(wrapper.emitted('fresh-login')).toEqual([[]]);
    expect(protectedMutation).toHaveBeenCalledOnce();
  });

  it('does not merge a late plans page from the previous project', async () => {
    const projectView = (projectId: string, name: string, hasMore: boolean) => ({
      ...policy,
      policy: { ...policy.policy, projectId },
      plans: [
        {
          ...policy.plans[0],
          id: `plan-${projectId}`,
          name,
          revisions: [{ ...policy.plans[0].revisions[0], planId: `plan-${projectId}` }],
        },
      ],
      plansPageInfo: {
        hasMore,
        nextCursor: hasMore ? `cursor-${projectId}` : null,
      },
      defaultAssignment: {
        ...policy.defaultAssignment,
        planId: `plan-${projectId}`,
      },
    });
    const stalePage = deferred<ReturnType<typeof projectView>>();
    mocks.projectPolicy.mockImplementation((projectId: string, query?: { planCursor?: string }) => {
      if (projectId === 'project-1' && query) return stalePage.promise;
      return Promise.resolve(
        projectId === 'project-1'
          ? projectView(projectId, 'Tenant one plan', true)
          : projectView(projectId, 'Tenant two plan', false),
      );
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Показать остальные варианты'))!
      .trigger('click');

    await wrapper.setProps({ projectId: 'project-2' });
    await flushPromises();
    expect(wrapper.text()).toContain('Tenant two plan');

    stalePage.resolve(projectView('project-1', 'Stale tenant plan', false));
    await flushPromises();

    expect(wrapper.text()).toContain('Tenant two plan');
    expect(wrapper.text()).not.toContain('Stale tenant plan');
  });

  it('closes policy mutation forms when manage permission is revoked', async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Настроить общий лимит'))!
      .trigger('click');
    expect(wrapper.find('form.allowance-form').exists()).toBe(true);

    await wrapper.setProps({ canManage: false });

    expect(wrapper.find('form.allowance-form').exists()).toBe(false);
    expect(mocks.putDefaultPlan).not.toHaveBeenCalled();
  });

  it('does not let a pre-revocation mutation close a new policy draft', async () => {
    const previousMutation = deferred<{
      projectPolicyVersion: string;
      replayed: boolean;
    }>();
    mocks.putDefaultPlan.mockReturnValue(previousMutation.promise);
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    const open = () =>
      wrapper.findAll('button').find((button) => button.text().includes('Настроить общий лимит'))!;
    await open().trigger('click');
    const previousForm = wrapper.get('form.allowance-form');
    await previousForm.findAll('textarea').at(-1)!.setValue('Previous draft');
    void previousForm.trigger('submit');
    await flushPromises();
    expect(mocks.putDefaultPlan).toHaveBeenCalledOnce();

    await wrapper.setProps({ canManage: false });
    await wrapper.setProps({ canManage: true });
    await open().trigger('click');
    const currentForm = wrapper.get('form.allowance-form');
    await currentForm.findAll('textarea').at(-1)!.setValue('Current draft');

    previousMutation.resolve({ projectPolicyVersion: '5', replayed: false });
    await flushPromises();

    expect(wrapper.find('form.allowance-form').exists()).toBe(true);
    expect(wrapper.findAll('textarea').at(-1)!.element.value).toBe('Current draft');
  });

  it('finishes a pending policy read across manage revoke and regrant', async () => {
    const pendingPolicy = deferred<typeof policy>();
    mocks.projectPolicy.mockReturnValue(pendingPolicy.promise);
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
    });

    await wrapper.setProps({ canManage: false });
    await wrapper.setProps({ canManage: true });
    pendingPolicy.resolve(policy);
    await flushPromises();

    expect(wrapper.text()).toContain('5,00');
    expect(wrapper.text()).toContain('Настроить общий лимит');
  });

  it('selects a published segment instead of asking for its UUID', async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Назначить группе'))!
      .trigger('click');
    const form = wrapper.get('form.allowance-form');

    expect(form.findComponent({ name: 'SegmentSelect' }).exists()).toBe(true);
    expect(form.find('input[placeholder*="xxxxxxxx-xxxx"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Выберите опубликованный сегмент');
  });

  it('loads a user-scoped cursor page and never calls a global journal', async () => {
    mount(AiAllowanceJournalPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canReconcile: true,
        endUserId: 'user-1',
        cursor: 'cursor-1',
      },
    });
    await flushPromises();
    expect(mocks.journal).toHaveBeenCalledWith('project-1', 'user-1', {
      limit: 50,
      cursor: 'cursor-1',
    });
  });

  it('searches users by product ID and explains the journal in Russian', async () => {
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canReconcile: true,
        canSearchUsers: true,
        endUserId: '',
        cursor: '',
      },
    });
    await flushPromises();

    expect(wrapper.findComponent({ name: 'EndUserSelect' }).exists()).toBe(true);
    expect(wrapper.text()).toContain('внутреннему ID');
    expect(wrapper.text()).not.toContain('End User');
    expect(wrapper.text()).not.toContain('Immutable');
    expect(wrapper.text()).not.toContain('attempts');
    expect(wrapper.text()).not.toContain('Evidence');
    expect(wrapper.text()).not.toContain('break-glass');
  });

  it('does not load account version or expose corrections without reconcile permission', async () => {
    mocks.journal.mockResolvedValue(journalPage('read-only entry'));
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canReconcile: false,
        endUserId: 'user-1',
        cursor: '',
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('read-only entry');
    expect(wrapper.text()).not.toContain('Корректировать');
    expect(mocks.endUserBalance).not.toHaveBeenCalled();
  });

  it('creates an exact optimistic correction from a journal entry', async () => {
    mocks.journal.mockResolvedValue({
      items: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          entryType: 'UNKNOWN_HELD',
          costQuality: 'UNKNOWN',
          deltaAvailableUsd: '0.000000000000',
          deltaReservedUsd: '-1.000000000000',
          deltaSettledUsd: '0.000000000000',
          deltaUnknownUsd: '1.000000000000',
          deltaOverageUsd: '0.000000000000',
          periodId: null,
          reservationId: '44444444-4444-4444-8444-444444444444',
          grantId: null,
          usageRecordId: null,
          correctsEntryId: null,
          actorType: 'SYSTEM',
          actorId: 'reconciler',
          reason: 'Provider outcome unknown',
          occurredAt: '2026-08-02T10:00:00.000Z',
          createdAt: '2026-08-02T10:00:00.000Z',
        },
      ],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canReconcile: true,
        endUserId: 'user-1',
        cursor: '',
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Корректировать'))!
      .trigger('click');
    const form = wrapper.get('form.correction-form');
    await form.get('input[inputmode="decimal"]').setValue('0.1234567890123');
    await form.get('textarea').setValue('Correct audited allowance entry');
    await form.trigger('submit');
    expect(wrapper.text()).toContain('не более 12 знаков после запятой');
    expect(mocks.correct).not.toHaveBeenCalled();

    await form.get('input[inputmode="decimal"]').setValue('1.000000000001');
    await form.get('input[type="datetime-local"]').setValue('2099-08-03T10:00');
    expect(form.find('input[readonly]').exists()).toBe(false);
    await form.trigger('submit');
    await flushPromises();
    expect(mocks.correct).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      {
        correctsEntryId: '33333333-3333-4333-8333-333333333333',
        deltaAvailableUsd: '1.000000000001',
        expectedAccountVersion: '7',
        expiresAt: new Date('2099-08-03T10:00').toISOString(),
        reason: 'Correct audited allowance entry',
      },
      expect.any(String),
    );
    expect(wrapper.emitted('changed')).toEqual([[]]);
  });

  it('requires a fresh login for a correction without replaying it', async () => {
    mocks.journal.mockResolvedValue(journalPage('protected correction'));
    mocks.correct.mockRejectedValue(
      new ApiError(
        428,
        'unsafe backend text',
        undefined,
        'step-up-request',
        'REAUTHENTICATION_REQUIRED',
      ),
    );
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canReconcile: true,
        endUserId: 'user-1',
        cursor: '',
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Корректировать'))!
      .trigger('click');
    const form = wrapper.get('form.correction-form');
    await form.get('input[inputmode="decimal"]').setValue('-1');
    await form.get('textarea').setValue('Reverse incorrect allowance entry');
    await form.trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('не будут повторены автоматически');
    expect(wrapper.text()).not.toContain('unsafe backend text');
    await wrapper.get('[data-testid="allowance-fresh-login"]').trigger('click');
    expect(wrapper.emitted('fresh-login')).toEqual([[]]);
    expect(mocks.correct).toHaveBeenCalledOnce();
  });

  it('omits expiry for a negative correction and drops mutation feedback after tenant change', async () => {
    mocks.journal.mockResolvedValue({
      ...journalPage('correction target'),
      items: [
        {
          ...journalPage('correction target').items[0],
          id: '33333333-3333-4333-8333-333333333333',
        },
      ],
    });
    mocks.endUserBalance.mockImplementation((projectId: string, endUserId: string) =>
      Promise.resolve({
        account: {
          projectId,
          endUserId,
          currency: 'USD',
          availableUsd: '3.000000000000',
          reservedUsd: '0.000000000000',
          settledUsd: '1.000000000000',
          unknownHeldUsd: '0.000000000000',
          overageUsd: '0.000000000000',
          version: '8',
        },
        currentPeriod: null,
        currentPeriodSpend: null,
        pendingBaseAllocationUsd: '0.000000000000',
        activeGrants: [],
        grantsPageInfo: { hasMore: false, nextCursor: null },
        endUserAssignment: null,
      }),
    );
    const pending = deferred<{ replayed: boolean }>();
    mocks.correct.mockReturnValueOnce(pending.promise);
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canReconcile: true,
        endUserId: 'user-1',
        cursor: '',
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Корректировать'))!
      .trigger('click');
    const form = wrapper.get('form.correction-form');
    await form.get('input[inputmode="decimal"]').setValue('-1.000000000000');
    await form.get('textarea').setValue('Remove incorrect available allowance');
    await form.trigger('submit');

    expect(mocks.correct).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      expect.not.objectContaining({ expiresAt: expect.anything() }),
      expect.any(String),
    );
    await wrapper.setProps({ projectId: 'project-2', endUserId: 'user-2' });
    pending.resolve({ replayed: false });
    await flushPromises();

    expect(wrapper.text()).not.toContain('Корректировка записана');
  });

  it('does not restore the previous user or cursor page when a reload fails', async () => {
    mocks.journal.mockResolvedValueOnce(journalPage('previous journal row'));
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canReconcile: false,
        endUserId: 'user-1',
        cursor: 'cursor-1',
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('previous journal row');

    mocks.journal.mockRejectedValueOnce(new Error('new cursor failed'));
    await wrapper.setProps({
      projectId: 'project-2',
      endUserId: 'user-2',
      cursor: 'cursor-2',
    });
    await flushPromises();

    expect(wrapper.text()).toContain('new cursor failed');
    expect(wrapper.text()).not.toContain('previous journal row');
  });

  it('ignores a late journal response from a previous full context', async () => {
    const previous = deferred<ReturnType<typeof journalPage>>();
    mocks.journal
      .mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce(journalPage('current journal row'));
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: 'project-1',
        canRead: true,
        canReconcile: false,
        endUserId: 'user-1',
        cursor: 'cursor-1',
      },
    });

    await wrapper.setProps({ endUserId: 'user-2', cursor: 'cursor-2' });
    await flushPromises();
    previous.resolve(journalPage('stale journal row'));
    await flushPromises();

    expect(wrapper.text()).toContain('current journal row');
    expect(wrapper.text()).not.toContain('stale journal row');
  });
});
