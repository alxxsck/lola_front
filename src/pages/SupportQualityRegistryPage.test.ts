import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';

const state = vi.hoisted(() => ({
  route: { name: 'support-quality-scorecards', query: {} as Record<string, string> },
  router: { push: vi.fn(), replace: vi.fn() },
  auth: null as {
    user: { id: string };
    project: { id: string; effectivePermissionCodes: string[] } | null;
  } | null,
}));
const quality = vi.hoisted(() => ({
  listScorecards: vi.fn(),
  listCalibrations: vi.fn(),
  readCalibration: vi.fn(),
  listDisputes: vi.fn(),
  createSamplingPolicy: vi.fn(),
  runSampling: vi.fn(),
  createScorecardRevision: vi.fn(),
  addCalibrationParticipant: vi.fn(),
  setCalibrationBaseline: vi.fn(),
}));
const presentations = vi.hoisted(() => ({ catalog: vi.fn(), resolve: vi.fn() }));

vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => state.router,
}));
vi.mock('@/features/auth/auth.store', async () => {
  const { reactive } = await import('vue');
  state.auth = reactive({
    user: { id: 'lead-1' },
    project: {
      id: 'project-1',
      effectivePermissionCodes: [
        'project.support.quality.read',
        'project.support.quality.manage',
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

import SupportQualityRegistryPage from './SupportQualityRegistryPage.vue';

enableAutoUnmount(afterEach);

const Button = {
  props: ['label', 'disabled', 'loading'],
  emits: ['click'],
  template:
    '<button :disabled="disabled" :data-loading="String(Boolean(loading))" @click="$emit(\'click\')">{{ label }}</button>',
};
const Dialog = {
  props: ['visible'],
  template: '<section v-if="visible"><slot /><slot name="footer" /></section>',
};
const stubs = {
  Button,
  Dialog,
  InputNumber: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
  InputText: {
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  RouterLink: { template: '<a><slot /></a>' },
  Select: true,
  Tag: { props: ['value'], template: '<span>{{ value }}</span>' },
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

function scorecard() {
  return {
    id: 'scorecard-1',
    code: 'QUALITY',
    name: 'Карта качества',
    state: 'ACTIVE',
    version: 2,
    currentRevisionId: 'scorecard-revision-2',
    currentRevisionNumber: 2,
    criticalFailureOutcome: 'NONE',
    sections: [],
  };
}

describe('SupportQualityRegistryPage hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.route.name = 'support-quality-scorecards';
    state.route.query = {};
    state.auth!.user.id = 'lead-1';
    state.auth!.project = {
      id: 'project-1',
      effectivePermissionCodes: [
        'project.support.quality.read',
        'project.support.quality.manage',
      ],
    };
    quality.listScorecards.mockResolvedValue([scorecard()]);
    quality.listCalibrations.mockResolvedValue({ items: [], nextCursor: null });
    quality.listDisputes.mockResolvedValue({ items: [], nextCursor: null });
    quality.createScorecardRevision.mockResolvedValue(scorecard());
    presentations.catalog.mockResolvedValue({ items: [], nextCursor: null });
    presentations.resolve.mockResolvedValue({ items: [] });
  });

  it('discards a late sampling policy after the project changes', async () => {
    const pending = deferred<Record<string, unknown>>();
    quality.createSamplingPolicy.mockReturnValue(pending.promise);
    const wrapper = mount(SupportQualityRegistryPage, { global: { stubs } });
    await vi.waitFor(() => expect(wrapper.text()).toContain('Карта качества'));

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Настроить выборку')!
      .trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Создать политику'));
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Создать политику')!
      .trigger('click');
    await vi.waitFor(() => expect(quality.createSamplingPolicy).toHaveBeenCalledOnce());

    state.auth!.project = {
      id: 'project-2',
      effectivePermissionCodes: [
        'project.support.quality.read',
        'project.support.quality.manage',
      ],
    };
    pending.resolve({ id: 'policy-project-1' });
    await vi.waitFor(() => expect(quality.listScorecards).toHaveBeenCalledWith('project-2', expect.any(AbortSignal)));

    expect(wrapper.text()).not.toContain('Политика выборки создана');
    expect(wrapper.text()).not.toContain('policy-project-1');
  });

  it('refreshes the calibration projection after an OCC conflict', async () => {
    state.route.name = 'support-quality-calibrations';
    state.route.query = { calibration: 'calibration-1' };
    const detail = {
      id: 'calibration-1',
      state: 'OPEN',
      version: 3,
      operatorCmsUserId: 'operator-1',
      minimumReviews: 2,
      agreementBasisPoints: null,
      peerReviewsVisible: false,
      participants: [],
    };
    quality.listCalibrations.mockResolvedValue({
      items: [{ ...detail, caseId: 'case-1' }],
      nextCursor: null,
    });
    quality.readCalibration.mockResolvedValue(detail);
    quality.setCalibrationBaseline.mockRejectedValue(new ApiError(409, 'Конфликт версии'));
    presentations.resolve.mockResolvedValue({
      items: [
        {
          cmsUserId: 'operator-1',
          displayName: 'Марина Соколова',
          membershipState: 'ACTIVE',
          selectable: true,
          presentationVersion: 1,
          avatar: null,
        },
      ],
    });

    const wrapper = mount(SupportQualityRegistryPage, { global: { stubs } });
    await vi.waitFor(() => expect(wrapper.find('.loading').exists()).toBe(false));
    expect(wrapper.text()).toContain('Марина Соколова');
    expect(wrapper.text()).toContain('Технические сведения');
    expect(wrapper.text()).not.toContain('calibration-1');
    expect(wrapper.text()).not.toContain('v3');
    await wrapper.get('input[placeholder="Технический идентификатор проверки"]').setValue('review-1');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Закрепить эталон')!
      .trigger('click');

    await vi.waitFor(() => expect(quality.setCalibrationBaseline).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(quality.readCalibration).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(wrapper.text()).toContain('Данные изменились на сервере'));
  });

  it('clears the busy state after a successful action refresh', async () => {
    const wrapper = mount(SupportQualityRegistryPage, { global: { stubs } });
    await vi.waitFor(() => expect(wrapper.text()).toContain('Карта качества'));
    const action = () =>
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'Создать новую ревизию')!;

    await action().trigger('click');

    await vi.waitFor(() => expect(quality.listScorecards).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(action().attributes('data-loading')).toBe('false'));
  });

  it('scrubs management dialogs, receipts and notices when manage authority is revoked', async () => {
    quality.createSamplingPolicy.mockResolvedValue({
      id: 'policy-private-id',
      code: 'WEEKLY_QUALITY',
      revisionNumber: 1,
      sampleBasisPoints: 1000,
    });
    const wrapper = mount(SupportQualityRegistryPage, { global: { stubs } });
    await vi.waitFor(() => expect(wrapper.text()).toContain('Карта качества'));
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Настроить выборку')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Создать политику')!
      .trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Политика выборки создана'));
    expect(wrapper.text()).toContain('WEEKLY_QUALITY');

    state.auth!.project!.effectivePermissionCodes = ['project.support.quality.read'];

    await vi.waitFor(() => expect(quality.listScorecards).toHaveBeenCalledTimes(2));
    expect(wrapper.text()).not.toContain('WEEKLY_QUALITY');
    expect(wrapper.text()).not.toContain('Политика выборки создана');
    expect(wrapper.text()).not.toContain('Детерминированная выборка проверок');
  });
});
