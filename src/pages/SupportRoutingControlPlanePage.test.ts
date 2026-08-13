import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/auth.store';
import { useRoutingControlPlane } from '@/features/support-routing-control-plane/model/use-routing-control-plane';
import SupportRoutingControlPlanePage from './SupportRoutingControlPlanePage.vue';

vi.mock('@/features/support-routing-control-plane/model/use-routing-control-plane', () => ({
  useRoutingControlPlane: vi.fn(),
}));

function controller() {
  const error = ref<string | null>(null);
  const createPolicy = vi.fn(async () => {
    error.value = 'Некорректный запрос.';
    return false;
  });
  return {
    snapshot: shallowRef({
      teams: [],
      skills: [],
      operators: [],
      workforce: {
        actionEtag: '"workforce"',
        rootVersion: 1,
        currentRevisionNumber: 0,
        draft: null,
        published: null,
      },
      queues: [],
      policies: [],
      slots: [],
      slotActionEtag: '"slots"',
      readiness: [],
      activationsTruncated: false,
      readinessTruncated: false,
      catalogCursors: {
        teams: null,
        skills: null,
        operators: null,
        queues: null,
        slots: null,
      },
    }),
    decisions: ref([]),
    decisionNextCursor: ref(null),
    selectedDecision: shallowRef(null),
    shadowRun: shallowRef(null),
    shadowDecisionIds: ref([]),
    revisions: ref([]),
    revisionDiff: shallowRef(null),
    auditEvents: ref([]),
    loading: ref(false),
    saving: ref(false),
    error,
    announcement: ref(''),
    hasBlockingReadiness: computed(() => false),
    reload: vi.fn(),
    hydrateQueue: vi.fn(),
    hydratePolicy: vi.fn(),
    loadMoreCatalog: vi.fn(),
    loadMoreDecisions: vi.fn(),
    inspectDecision: vi.fn(),
    closeDecision: vi.fn(),
    createPolicy,
  };
}

const stubs = {
  Button: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
  },
  Dialog: {
    props: ['visible', 'header'],
    emits: ['update:visible'],
    template:
      '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
  },
  InputText: {
    props: ['modelValue', 'disabled', 'placeholder'],
    emits: ['update:modelValue', 'blur'],
    template:
      '<input :value="modelValue" :disabled="disabled" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\')" />',
  },
  InputNumber: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<input type="number" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
  Message: { template: '<div><slot /></div>' },
  MultiSelect: { template: "<button type='button'>выбор</button>" },
  Select: { template: "<button type='button'>список</button>" },
  Skeleton: { template: '<div />' },
  Tag: { props: ['value'], template: '<span>{{ value }}</span>' },
  Drawer: { template: '<div><slot /></div>' },
};

async function render() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().$patch({
    phase: 'AUTHENTICATED',
    user: { id: 'lead-1', email: 'lead@example.test' },
    project: {
      id: 'project-1',
      name: 'Project One',
      effectivePermissionCodes: ['project.support.routing.read', 'project.support.routing.manage'],
    },
    projects: [],
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/support/settings/routing/policies',
        name: 'support-routing-policies',
        component: SupportRoutingControlPlanePage,
      },
    ],
  });
  await router.push('/support/settings/routing/policies');
  await router.isReady();
  const app = mount(
    { template: '<router-view />' },
    {
      global: { plugins: [pinia, router], stubs },
    },
  );
  await flushPromises();
  return app.findComponent(SupportRoutingControlPlanePage);
}

describe('SupportRoutingControlPlanePage policies', () => {
  let mockController: ReturnType<typeof controller>;

  beforeEach(() => {
    mockController = controller();
    vi.mocked(useRoutingControlPlane).mockReturnValue(mockController as never);
  });

  it('explains a routing rule as an assignment sequence', async () => {
    const wrapper = await render();

    expect(wrapper.text()).toContain('Правила назначения операторов');
    expect(wrapper.text()).toContain('Отбирает подходящих');
    expect(wrapper.text()).toContain('Выбирает следующего');
    expect(wrapper.text()).toContain('Повторяет попытку');
    expect(wrapper.text()).not.toContain('Политики');
  });

  it('normalizes the identifier and keeps a creation error inside the dialog', async () => {
    const wrapper = await render();
    const openButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Создать правило');
    await openButton!.trigger('click');

    const dialog = wrapper.get('[role="dialog"]');
    const identifier = dialog.get('input[placeholder="payments-ru"]');
    await identifier.setValue('call_admin');
    await identifier.trigger('blur');

    expect((identifier.element as HTMLInputElement).value).toBe('call-admin');
    const createButton = dialog
      .findAll('button')
      .find((button) => button.text().includes('Создать правило'));
    await createButton!.trigger('click');
    await flushPromises();

    expect(mockController.createPolicy).toHaveBeenCalledWith('call-admin', expect.any(Object));
    expect(dialog.text()).toContain('Некорректный запрос.');
    expect(mockController.error.value).toBeNull();
  });
});
