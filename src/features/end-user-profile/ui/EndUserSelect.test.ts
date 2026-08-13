import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PagedSearchSelect from '@/shared/ui/PagedSearchSelect.vue';
import EndUserSelect from './EndUserSelect.vue';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  profile: vi.fn(),
}));

vi.mock('@/features/end-user-profile/api/end-user-profile-repository', () => ({
  endUserProfileRepository: {
    list: mocks.list,
    profile: mocks.profile,
  },
}));
vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }));

describe('EndUserSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.mockResolvedValue({
      endUserId: 'user-1',
      locale: 'ru',
    });
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('shows a bounded internal identity for an existing selection', async () => {
    const wrapper = mount(EndUserSelect, {
      props: { projectId: 'project-1', modelValue: 'user-1' },
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="paged-search-trigger"]').text()).toContain(
      'Пользователь · user-1',
    );
    expect(mocks.profile).toHaveBeenCalledWith('project-1', 'user-1');
  });

  it('resolves an exact internal ID instead of filtering one list page', async () => {
    mocks.profile.mockResolvedValueOnce({ endUserId: 'user-off-page' });
    const wrapper = mount(EndUserSelect, {
      props: { projectId: 'project-1', modelValue: '' },
    });

    const result = await wrapper.getComponent(PagedSearchSelect).props('load')({
      query: 'user-off-page',
      limit: 20,
    });

    expect(mocks.profile).toHaveBeenCalledWith('project-1', 'user-off-page');
    expect(mocks.list).not.toHaveBeenCalled();
    expect(result).toEqual({
      items: [
        {
          value: 'user-off-page',
          label: 'Пользователь · user-off',
        },
      ],
      nextCursor: null,
    });
  });
});
