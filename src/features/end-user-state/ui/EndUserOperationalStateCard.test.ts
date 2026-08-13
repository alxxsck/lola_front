import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EndUserOperationalStateCard from './EndUserOperationalStateCard.vue';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  history: vi.fn(),
  put: vi.fn(),
}));
vi.mock('../api/end-user-state-repository', () => ({
  endUserStateRepository: mocks,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function state(projectId: string, endUserId: string, label: string) {
  return {
    projectId,
    endUserId,
    items: [
      {
        definition: {
          key: 'cms.tags',
          version: 1,
          owner: 'CMS_MANAGED',
          classification: 'INTERNAL',
          schema: { type: 'array', items: { type: 'string' } },
          label: { ru: label, en: label },
          description: { ru: 'Внутренние теги', en: 'Internal tags' },
          writable: true,
        },
        current: null,
      },
    ],
  } as const;
}

describe('EndUserOperationalStateCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders localized registry definitions and ignores a late prior-user response', async () => {
    const first = deferred<ReturnType<typeof state>>();
    const second = deferred<ReturnType<typeof state>>();
    mocks.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const wrapper = mount(EndUserOperationalStateCard, {
      props: { projectId: 'project-1', endUserId: 'user-1', canManage: true },
    });

    await wrapper.setProps({ endUserId: 'user-2' });
    second.resolve(state('project-1', 'user-2', 'Current user tags'));
    await flushPromises();
    first.resolve(state('project-1', 'user-1', 'Stale user tags'));
    await flushPromises();

    expect(wrapper.text()).toContain('Current user tags');
    expect(wrapper.text()).toContain('Internal tags');
    expect(wrapper.text()).not.toContain('Stale user tags');
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
  });

  it('shows a future-effective value as scheduled without presenting it as current', async () => {
    mocks.get.mockResolvedValue({
      ...state('project-1', 'user-1', 'Future tags'),
      items: [
        {
          ...state('project-1', 'user-1', 'Future tags').items[0],
          current: {
            version: 2,
            definitionVersion: 1,
            state: 'SCHEDULED',
            value: ['future-vip'],
            effectiveAt: '2099-08-01T00:00:00.000Z',
            expiresAt: null,
            actor: { type: 'CMS_USER', id: 'admin-1' },
            reason: 'Schedule future tags',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        },
      ],
    });

    const wrapper = mount(EndUserOperationalStateCard, {
      props: { projectId: 'project-1', endUserId: 'user-1', canManage: true },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Запланировано с');
    expect(wrapper.text()).not.toContain('future-vip');
  });

  it('closes the editor when manage permission is revoked', async () => {
    mocks.get.mockResolvedValue(state('project-1', 'user-1', 'Managed tags'));
    const wrapper = mount(EndUserOperationalStateCard, {
      props: { projectId: 'project-1', endUserId: 'user-1', canManage: true },
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
      .find((button) => button.text().includes('Изменить'))!
      .trigger('click');
    expect(wrapper.find('form').exists()).toBe(true);

    await wrapper.setProps({ canManage: false });

    expect(wrapper.find('form').exists()).toBe(false);
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
