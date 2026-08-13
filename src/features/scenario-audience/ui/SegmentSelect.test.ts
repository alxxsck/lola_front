import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SegmentSelect from './SegmentSelect.vue';

const mocks = vi.hoisted(() => ({ searchSegments: vi.fn() }));

vi.mock('@/shared/api/repository/scenario-authoring/scenario-authoring-repository', () => ({
  scenarioAuthoringRepository: {
    searchSegments: mocks.searchSegments,
  },
}));

describe('SegmentSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchSegments.mockResolvedValue({
      items: [
        {
          segmentId: 'draft-only',
          key: 'draft',
          name: 'Только черновик',
          currentRevision: null,
        },
        {
          segmentId: 'published',
          key: 'paying_users',
          name: 'Платящие пользователи',
          currentRevision: { revisionId: 'revision-1' },
        },
      ],
      nextCursor: null,
    });
  });

  it('offers only segments with a published revision', async () => {
    const wrapper = mount(SegmentSelect, {
      props: { projectId: 'project-1', modelValue: '' },
    });
    await wrapper.get('[data-testid="paged-search-trigger"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Платящие пользователи');
    expect(wrapper.text()).not.toContain('Только черновик');
  });
});
