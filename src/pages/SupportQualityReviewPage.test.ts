import { enableAutoUnmount, flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';

const state = vi.hoisted(() => ({
  route: { params: { reviewId: 'review-private-id' } },
  router: { push: vi.fn() },
  auth: null as {
    user: { id: string };
    project: { id: string; effectivePermissionCodes: string[] } | null;
  } | null,
}));
const quality = vi.hoisted(() => ({
  readReviewBootstrap: vi.fn(),
  readEvidenceExcerpt: vi.fn(),
  saveDraft: vi.fn(),
}));
const presentations = vi.hoisted(() => ({ resolve: vi.fn() }));

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
      effectivePermissionCodes: ['project.support.quality.review'],
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

import SupportQualityReviewPage from './SupportQualityReviewPage.vue';

enableAutoUnmount(afterEach);

function review(summary = 'Серверный черновик') {
  return {
    id: 'review-private-id',
    caseId: 'case-42',
    operatorCmsUserId: 'operator-private-id',
    selectionReasonCode: 'RANDOM_SAMPLE',
    state: 'DRAFT',
    version: 7,
    summary,
    scores: [
      {
        itemCode: 'EMPATHY',
        itemLabel: 'Эмпатия',
        applicable: true,
        score: null,
        maximumScore: 4,
        rating: null,
        feedback: null,
        rootCause: null,
        coachingTheme: null,
      },
    ],
    evidence: [
      {
        messageId: 'message-1',
        messageContentVersion: 2,
        messageRevisionNumber: 1,
        rationale: null,
      },
    ],
    disputes: [],
    totalScore: 0,
    maximumScore: 10,
    criticalFailureOutcome: 'NONE',
  };
}

function bootstrap(summary = 'Серверный черновик') {
  return {
    review: review(summary),
    scorecard: {
      scorecardId: 'scorecard-1',
      scorecardCode: 'BASE',
      scorecardName: 'Основная карта',
      revisionId: 'revision-1',
      revisionNumber: 4,
      criticalFailureOutcome: 'FAIL_REVIEW',
      sections: [
        {
          code: 'COMMUNICATION',
          name: 'Коммуникация',
          description: 'Проверка ответа клиенту',
          sectionWeightBasisPoints: 10_000,
          criteria: [
            {
              code: 'EMPATHY',
              label: 'Эмпатия',
              guidance: 'Признайте ситуацию клиента и объясните следующий шаг.',
              ratingScale: 'FIVE_POINT',
              criticalFailure: true,
              applicability: 'ALWAYS',
              allowNotApplicable: false,
              maximumScore: 4,
            },
          ],
        },
      ],
    },
    rootCauseOptions: [{ code: 'PROCESS_GAP', label: 'Пробел в процессе' }],
    coachingThemeOptions: [{ code: 'EXPECTATION_SETTING', label: 'Управление ожиданиями' }],
    evidenceOptions: [
      {
        messageId: 'message-1',
        ordinal: 12,
        role: 'ADMIN',
        createdAt: '2026-08-12T10:00:00.000Z',
        messageContentVersion: 2,
        messageRevisionNumber: 1,
        selected: true,
      },
    ],
    evidenceWindowTruncated: false,
    submissionErrors: [{ field: 'scores.EMPATHY.score', code: 'REQUIRED' }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('SupportQualityReviewPage hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.route.params.reviewId = 'review-private-id';
    state.auth!.user.id = 'reviewer-1';
    state.auth!.project = {
      id: 'project-1',
      effectivePermissionCodes: ['project.support.quality.review'],
    };
    quality.readReviewBootstrap.mockResolvedValue(bootstrap());
    presentations.resolve.mockResolvedValue({
      items: [
        {
          cmsUserId: 'operator-private-id',
          displayName: 'Марина Соколова',
          membershipState: 'ACTIVE',
          selectable: true,
          presentationVersion: 1,
          avatar: null,
        },
      ],
    });
  });

  it('shows a presentation name and hides review, operator and OCC identifiers by default', async () => {
    const wrapper = shallowMount(SupportQualityReviewPage);

    await vi.waitFor(() => expect(wrapper.text()).toContain('Марина Соколова'));
    expect(wrapper.text()).not.toContain('operator-private-id');
    expect(wrapper.text()).not.toContain('review-private-id');
    expect(wrapper.text()).not.toContain('optimistic lock');
    expect(wrapper.text()).not.toContain('Версия7');
  });

  it('does not restore a previous actor draft after a stale conflict reload', async () => {
    const staleReload = deferred<ReturnType<typeof bootstrap>>();
    let readCount = 0;
    quality.readReviewBootstrap.mockImplementation(() => {
      readCount += 1;
      if (readCount === 1) return Promise.resolve(bootstrap());
      if (readCount === 2) return staleReload.promise;
      return Promise.resolve(bootstrap('Черновик второго пользователя'));
    });
    quality.saveDraft.mockRejectedValue(new ApiError(409, 'VERSION_CONFLICT', 'conflict'));
    const wrapper = shallowMount(SupportQualityReviewPage, {
      global: {
        stubs: {
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
          },
          Textarea: {
            props: ['modelValue', 'placeholder', 'disabled'],
            emits: ['update:modelValue'],
            template:
              '<textarea :value="modelValue" :placeholder="placeholder" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
          Dialog: true,
          InputNumber: true,
          InputText: true,
          Tag: true,
        },
      },
    });

    const summary = () =>
      wrapper.get<HTMLTextAreaElement>('textarea[placeholder="Итог оценки и следующий шаг"]');
    await vi.waitFor(() => expect(summary().element.value).toBe('Серверный черновик'));
    await summary().setValue('Черновик первого пользователя');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Сохранить')!
      .trigger('click');
    await vi.waitFor(() => expect(quality.readReviewBootstrap).toHaveBeenCalledTimes(2));

    state.auth!.user.id = 'reviewer-2';
    await vi.waitFor(() => expect(quality.readReviewBootstrap).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(summary().element.value).toBe('Черновик второго пользователя'));
    staleReload.resolve(bootstrap('Устаревшее состояние'));
    await flushPromises();

    expect(summary().element.value).toBe('Черновик второго пользователя');
    expect(wrapper.text()).not.toContain('ваш черновик сохранён');
  });

  it('renders pinned criterion semantics, blocks N/A for ALWAYS and loads evidence text only on demand', async () => {
    quality.readEvidenceExcerpt.mockResolvedValue({
      messageId: 'message-1',
      messageContentVersion: 2,
      messageRevisionNumber: 1,
      excerpt: 'Закреплённый ответ оператора',
      truncated: false,
    });
    const wrapper = shallowMount(SupportQualityReviewPage, {
      global: {
        stubs: {
          Button: {
            props: ['label'],
            emits: ['click'],
            template: '<button @click="$emit(\'click\')">{{ label }}</button>',
          },
          Dialog: true,
          InputNumber: true,
          InputText: true,
          Textarea: true,
          Select: true,
          Tag: true,
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    await vi.waitFor(() => expect(wrapper.text()).toContain('Коммуникация'));
    expect(wrapper.text()).toContain('Признайте ситуацию клиента');
    expect(wrapper.text()).toContain('Пять уровней');
    expect(wrapper.text()).toContain('Критический критерий');
    expect(wrapper.text()).toContain('100%');
    expect(wrapper.text()).toContain('Заполните поле');
    expect(wrapper.find('input[type="checkbox"]').attributes('disabled')).toBeDefined();
    expect(quality.readEvidenceExcerpt).not.toHaveBeenCalled();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Показать фрагмент')!
      .trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Закреплённый ответ оператора'));
    expect(quality.readEvidenceExcerpt).toHaveBeenCalledWith(
      'project-1',
      'review-private-id',
      'message-1',
      expect.any(AbortSignal),
    );
  });
});
