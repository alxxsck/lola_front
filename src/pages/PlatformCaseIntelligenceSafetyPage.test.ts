import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/auth.store';
import type {
  PlatformSafetyModelCatalog,
  PlatformSafetyState,
} from '@/features/platform-case-intelligence-safety/api/platform-case-intelligence-safety';
import { ApiError } from '@/shared/api/http/api-error';
import PlatformCaseIntelligenceSafetyPage from './PlatformCaseIntelligenceSafetyPage.vue';

const api = vi.hoisted(() => ({
  read: vi.fn(),
  catalog: vi.fn(),
  publish: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock(
  '@/features/platform-case-intelligence-safety/api/platform-case-intelligence-safety',
  () => ({
    readPlatformCaseIntelligenceSafety: api.read,
    readPlatformSafetyModelCatalog: api.catalog,
    publishPlatformCaseIntelligenceSafety: api.publish,
    lookupPlatformCaseIntelligenceSafetyCommand: api.lookup,
  }),
);

function publishedState(): PlatformSafetyState {
  return {
    version: 1,
    reconciliationState: 'IDLE',
    profile: {
      modelId: 'grok-4.5',
      displayName: 'Grok 4.5',
      reasoningEffort: 'medium',
    },
    coverage: {
      projects: 'ALL',
      locales: 'ALL',
      channels: ['TEXT', 'VOICE', 'TELEGRAM'],
    },
    riskClasses: [
      'SELF_HARM_OR_SUICIDE',
      'CREDIBLE_THREAT_OR_VIOLENCE',
      'HARM_INVOLVING_MINORS',
      'RESPONSIBLE_GAMING_CRISIS',
    ],
    publishedAt: '2026-08-11T10:00:00.000Z',
  };
}

function modelCatalog(): PlatformSafetyModelCatalog {
  return {
    stale: false,
    fetchedAt: '2026-08-11T09:59:00.000Z',
    maxStaleAt: '2026-08-11T10:04:00.000Z',
    items: [
      {
        id: 'grok-4.5',
        displayName: 'Grok 4.5',
        reasoningEfforts: ['medium', 'high'],
        reteniveTested: true,
        selectable: true,
        providerAvailable: true,
        inputPricePerMillion: '3',
        cachedInputPricePerMillion: '0.75',
        outputPricePerMillion: '15',
      },
      {
        id: 'grok-4.3',
        displayName: 'Grok 4.3',
        reasoningEfforts: ['medium', 'high'],
        reteniveTested: false,
        selectable: true,
        providerAvailable: true,
        inputPricePerMillion: '2',
        cachedInputPricePerMillion: '0.5',
        outputPricePerMillion: '10',
      },
    ],
  };
}

async function mountPage(): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.$patch({
    restored: true,
    phase: 'AUTHENTICATED',
    user: {
      id: 'operator-1',
      email: 'operator@example.com',
      name: 'Оператор',
      platformPermissionCodes: ['platform.case_intelligence.safety.manage'],
    },
    project: null,
    projects: [],
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/platform/case-intelligence/safety',
        name: 'platform-case-intelligence-safety',
        component: PlatformCaseIntelligenceSafetyPage,
      },
      {
        path: '/login',
        name: 'login',
        component: { template: '<div>login</div>' },
      },
    ],
  });
  await router.push('/platform/case-intelligence/safety');
  await router.isReady();
  const wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router, PrimeVue],
      stubs: {
        Select: {
          inheritAttrs: true,
          props: ['modelValue', 'options'],
          emits: ['update:modelValue', 'change'],
          template:
            '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value); $emit(\'change\')"><option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">{{ option.label }}</option></select>',
        },
        Dialog: {
          props: ['visible'],
          emits: ['update:visible'],
          template: '<div v-if="visible" role="dialog"><slot /><slot name="footer" /></div>',
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

async function completeForm(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-testid="safety-reason"]').setValue('Первичная активация');
}

describe('Platform Global Safety page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('00000000-0000-4000-8000-000000000010'),
    });
    api.read.mockResolvedValue(null);
    api.catalog.mockResolvedValue(modelCatalog());
    api.publish.mockResolvedValue(publishedState());
  });

  it('publishes one model profile for every project, language and channel', async () => {
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Нужна первичная активация');
    expect(wrapper.text()).toContain('Ничего добавлять вручную не нужно');
    expect(wrapper.text()).not.toContain('classifierRevisionId');
    expect(wrapper.text()).not.toContain('Sentinel dataset');
    await completeForm(wrapper);
    await wrapper.get('form').trigger('submit');

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain('для всех проектов, языков и каналов');
    await dialog.get('[data-testid="publish-safety"]').trigger('click');
    await flushPromises();

    expect(api.publish).toHaveBeenCalledOnce();
    expect(api.publish.mock.calls[0]![0]).toEqual({
      expectedVersion: 0,
      idempotencyKey: '00000000-0000-4000-8000-000000000010',
      modelId: 'grok-4.5',
      reasoningEffort: 'medium',
      reason: 'Первичная активация',
    });
    expect(wrapper.text()).toContain('Защита активна · версия 1');
  });

  it('requires a fresh MFA login without replaying publication', async () => {
    api.publish.mockRejectedValue(
      new ApiError(428, 'unsafe backend text', undefined, 'request-1', 'REAUTHENTICATION_REQUIRED'),
    );
    const wrapper = await mountPage();

    await completeForm(wrapper);
    await wrapper.get('form').trigger('submit');
    await wrapper.get('[data-testid="publish-safety"]').trigger('click');
    await flushPromises();

    expect(api.publish).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Требуется свежий вход с MFA');
    expect(wrapper.text()).not.toContain('unsafe backend text');
  });

  it('blocks publication while the provider catalog is stale', async () => {
    api.catalog.mockResolvedValue({ ...modelCatalog(), stale: true });
    const wrapper = await mountPage();

    await completeForm(wrapper);

    expect(wrapper.text()).toContain('Каталог xAI устарел');
    expect(
      wrapper.get('[data-testid="prepare-safety-publication"]').attributes('disabled'),
    ).toBeDefined();
  });
});
