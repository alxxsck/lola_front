import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IntegrationEventSummary from './IntegrationEventSummary.vue';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./integration-event-summary.api', () => ({
  integrationEventSummaryApi: api,
}));

const summary = (overrides: Record<string, unknown> = {}) => ({
  eventDefinitionKeyId: 'event-definition-1',
  ingressPolicy: {
    mode: 'SINGLE_SOURCE',
    authoritativeRouteId: 'route-inbound',
    policyRevisionId: null,
  },
  routes: [
    {
      routeId: 'route-inbound',
      connectionId: 'connection-1',
      direction: 'INBOUND',
      provider: 'AMPLITUDE',
      connectionDisplayName: 'Amplitude production',
      connectionLifecycle: 'ACTIVE',
      connectionHealth: 'DEGRADED',
      routeLifecycle: 'ACTIVE',
      enabled: true,
      publishedRevision: 2,
      schemaCompatibility: 'REQUIRES_REPUBLISH',
      warnings: ['CONNECTION_UNHEALTHY', 'EVENT_SCHEMA_REVISION_STALE'],
    },
  ],
  manageTarget: { workspace: 'PROJECT_INTEGRATIONS' },
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function mountSummary(
  props: Partial<{
    projectId: string;
    eventDefinitionKeyId: string;
    canRead: boolean;
  }> = {},
) {
  return mount(IntegrationEventSummary, {
    props: {
      projectId: 'project-1',
      eventDefinitionKeyId: 'event-definition-1',
      canRead: true,
      ...props,
    },
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template:
            '<a data-test="manage-integrations-link" :data-to="JSON.stringify(to)"><slot /></a>',
        },
      },
    },
  });
}

describe('IntegrationEventSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(summary());
  });

  it('is fully hidden and does not query when both read permissions are absent', async () => {
    const wrapper = mountSummary({ canRead: false });
    await flushPromises();

    expect(wrapper.html()).toBe('<!--v-if-->');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('renders read-only policy, health, schema warnings and only an Integrations deep link', async () => {
    const wrapper = mountSummary();
    await flushPromises();

    expect(wrapper.text()).toContain('Единственный источник');
    expect(wrapper.text()).toContain('Авторитетный источник');
    expect(wrapper.text()).toContain('Amplitude production');
    expect(wrapper.text()).toContain('Требуется перепубликация');
    expect(wrapper.text()).toContain('Подключение работает нестабильно');
    expect(wrapper.find('button[data-action]').exists()).toBe(false);
    const target = JSON.parse(
      wrapper.get('[data-test="manage-integrations-link"]').attributes('data-to') ?? '{}',
    );
    expect(target).toEqual({
      name: 'project-integrations',
      query: { eventDefinitionKeyId: 'event-definition-1' },
    });
  });

  it('shows explicit loading, empty and error states', async () => {
    const first = deferred<ReturnType<typeof summary>>();
    api.get.mockReturnValueOnce(first.promise);
    const wrapper = mountSummary();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Загружаем интеграции события');
    first.resolve(
      summary({
        routes: [],
        ingressPolicy: {
          mode: 'NONE',
          authoritativeRouteId: null,
          policyRevisionId: null,
        },
      }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain('Маршруты интеграций не настроены');

    api.get.mockRejectedValueOnce(new Error('network'));
    await wrapper.setProps({ eventDefinitionKeyId: 'event-definition-2' });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Не удалось загрузить интеграции события',
    );
  });

  it('does not render a late response from the previous Project', async () => {
    const oldRequest = deferred<ReturnType<typeof summary>>();
    api.get.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(
      summary({
        eventDefinitionKeyId: 'event-definition-2',
        routes: [],
        ingressPolicy: {
          mode: 'NONE',
          authoritativeRouteId: null,
          policyRevisionId: null,
        },
      }),
    );
    const wrapper = mountSummary();
    await wrapper.setProps({
      projectId: 'project-2',
      eventDefinitionKeyId: 'event-definition-2',
    });
    await flushPromises();
    oldRequest.resolve(summary());
    await flushPromises();

    expect(api.get).toHaveBeenNthCalledWith(2, 'project-2', 'event-definition-2');
    expect(wrapper.text()).toContain('Маршруты интеграций не настроены');
    expect(wrapper.text()).not.toContain('Amplitude production');
  });
});
