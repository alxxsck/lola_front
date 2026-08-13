import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PagedSearchSelect from './PagedSearchSelect.vue';

describe('PagedSearchSelect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('keeps the active search when loading the next cursor page', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [{ value: 'event-1', label: 'Пополнение' }],
        nextCursor: 'events-page-2',
      })
      .mockResolvedValueOnce({
        items: [{ value: 'event-2', label: 'Повторное пополнение' }],
        nextCursor: null,
      });
    const wrapper = mount(PagedSearchSelect, {
      props: {
        modelValue: '',
        label: 'Событие',
        placeholder: 'Выберите событие',
        load,
      },
    });

    await wrapper.get('[data-testid="paged-search-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.get('input[type="search"]').setValue('пополнение');
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();

    expect(load).toHaveBeenLastCalledWith({
      query: 'пополнение',
      limit: 25,
    });

    await wrapper.get('[data-testid="paged-search-more"]').trigger('click');
    await flushPromises();

    expect(load).toHaveBeenLastCalledWith({
      query: 'пополнение',
      cursor: 'events-page-2',
      limit: 25,
    });
    expect(wrapper.text()).toContain('Пополнение');
    expect(wrapper.text()).toContain('Повторное пополнение');
  });

  it('ignores a slower response from an obsolete search', async () => {
    let resolveOld!: (value: unknown) => void;
    const oldResponse = new Promise((resolve) => {
      resolveOld = resolve;
    });
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce({
        items: [{ value: 'new', label: 'Новый результат' }],
        nextCursor: null,
      });
    const wrapper = mount(PagedSearchSelect, {
      props: {
        modelValue: '',
        label: 'Событие',
        placeholder: 'Выберите событие',
        load,
      },
    });

    await wrapper.get('[data-testid="paged-search-trigger"]').trigger('click');
    await flushPromises();
    const search = wrapper.get('input[type="search"]');
    await search.setValue('старый');
    await vi.advanceTimersByTimeAsync(250);
    await search.setValue('новый');
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    resolveOld({
      items: [{ value: 'old', label: 'Устаревший результат' }],
      nextCursor: null,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Новый результат');
    expect(wrapper.text()).not.toContain('Устаревший результат');
  });

  it('keeps the selected label when a later search returns other options', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ value: 'event-1', label: 'Пополнение' }],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [{ value: 'event-2', label: 'Регистрация' }],
        nextCursor: null,
      });
    const wrapper = mount(PagedSearchSelect, {
      props: {
        modelValue: '',
        label: 'Событие',
        placeholder: 'Выберите событие',
        load,
      },
    });

    await wrapper.get('[data-testid="paged-search-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.get('[role="option"]').trigger('click');
    await wrapper.setProps({ modelValue: 'event-1' });
    await wrapper.get('[data-testid="paged-search-trigger"]').trigger('click');
    await wrapper.get('input[type="search"]').setValue('регистрация');
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();

    expect(wrapper.get('[data-testid="paged-search-trigger"]').text()).toContain('Пополнение');
  });
});
