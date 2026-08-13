import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { describe, expect, it, vi } from 'vitest';
import EventPicker, { type EventPickerPage } from './EventPicker.vue';

describe('EventPicker', () => {
  it('keeps a hidden field label available to assistive technology', () => {
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: '',
        label: 'Событие',
        hideLabel: true,
        placeholder: 'Выберите событие',
        load: vi.fn(),
      },
      global: { plugins: [PrimeVue] },
    });

    const label = wrapper.get('.catalog-picker__label');
    const trigger = wrapper.get('[data-testid="event-picker-trigger"]');

    expect(label.classes()).toContain('catalog-picker__label--visually-hidden');
    expect(trigger.attributes('aria-labelledby')).toContain(label.attributes('id'));
  });

  it('applies a single event only after explicit confirmation', async () => {
    const load = vi.fn().mockResolvedValue({
      items: [
        {
          value: 'payment.completed',
          name: 'Оплата завершена',
          code: 'payment.completed',
          description: 'Успешное завершение оплаты заказа',
          ingestion: 'BACKEND_ONLY',
        },
      ],
      nextCursor: null,
    });
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: '',
        label: 'Событие запуска',
        placeholder: 'Выберите событие',
        load,
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await flushPromises();
    const option = wrapper.get('[data-testid="event-picker-option"]');
    const accessibleOption = wrapper.get('[role="option"]');

    expect(wrapper.get('[role="listbox"]').attributes('aria-label')).toBe('Выберите событие');
    expect(accessibleOption.attributes('aria-selected')).toBe('false');
    expect(option.find('.catalog-picker__selection-mark').exists()).toBe(false);

    await option.trigger('click');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(accessibleOption.attributes('aria-selected')).toBe('true');

    await wrapper.get('[data-testid="event-picker-apply"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['payment.completed']]);
  });

  it('describes a required picker without invalid button aria', () => {
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: '',
        label: 'Событие запуска',
        placeholder: 'Выберите событие',
        required: true,
        load: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      },
      global: { plugins: [PrimeVue] },
    });

    const trigger = wrapper.get('[data-testid="event-picker-trigger"]');
    const descriptionId = trigger.attributes('aria-describedby');
    expect(trigger.attributes('aria-required')).toBeUndefined();
    expect(wrapper.get(`#${descriptionId}`).text()).toBe('Обязательное поле');
  });

  it('passes a debounced global query to the catalog loader', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: '',
        label: 'Событие',
        placeholder: 'Выберите событие',
        load,
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-search"]').setValue('успешное завершение');
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();

    expect(load).toHaveBeenLastCalledWith({
      query: 'успешное завершение',
      limit: 25,
    });
    vi.useRealTimers();
  });

  it('keeps loaded events while requesting the next cursor page', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ value: 'first', name: 'Первое', code: 'first' }],
        nextCursor: 'page-2',
      })
      .mockResolvedValueOnce({
        items: [{ value: 'second', name: 'Второе', code: 'second' }],
        nextCursor: null,
      });
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: '',
        label: 'Событие',
        placeholder: 'Выберите событие',
        load,
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-more"]').trigger('click');
    await flushPromises();

    expect(load).toHaveBeenLastCalledWith({
      query: '',
      cursor: 'page-2',
      limit: 25,
    });
    expect(wrapper.findAll('[data-testid="event-picker-option"]')).toHaveLength(2);
  });

  it('reloads the catalog when the ingestion filter changes', async () => {
    const load = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: '',
        label: 'Событие',
        placeholder: 'Выберите событие',
        load,
        showIngestionFilter: true,
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-filter-backend"]').trigger('click');
    await flushPromises();

    expect(load).toHaveBeenLastCalledWith({
      query: '',
      ingestion: 'BACKEND_ONLY',
      limit: 25,
    });
  });

  it('applies several events together in multiple mode', async () => {
    const load = vi.fn().mockResolvedValue({
      items: [
        { value: 'first', name: 'Первое', code: 'first' },
        { value: 'second', name: 'Второе', code: 'second' },
      ],
      nextCursor: null,
    });
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: [],
        multiple: true,
        label: 'События',
        placeholder: 'Выберите события',
        load,
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await flushPromises();
    const options = wrapper.findAll('[data-testid="event-picker-option"]');
    expect(options[0]?.find('.catalog-picker__selection-mark').exists()).toBe(true);
    for (const option of options) {
      await option.trigger('click');
    }
    await wrapper.get('[data-testid="event-picker-apply"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[['first', 'second']]]);
  });

  it('keeps draft selections made across different search results', async () => {
    vi.useFakeTimers();
    const first = { value: 'first', name: 'Первое', code: 'first' };
    const second = { value: 'second', name: 'Второе', code: 'second' };
    const load = vi.fn().mockImplementation(({ query }: { query: string }) =>
      Promise.resolve({
        items: query ? [second] : [first],
        nextCursor: null,
      }),
    );
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: [],
        multiple: true,
        label: 'События',
        placeholder: 'Выберите события',
        load,
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-option"]').trigger('click');
    await wrapper.get('[data-testid="event-picker-search"]').setValue('second');
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-option"]').trigger('click');
    await wrapper.get('[data-testid="event-picker-apply"]').trigger('click');

    expect(wrapper.emitted('select')).toEqual([[[first, second]]]);
    vi.useRealTimers();
  });

  it('keeps the dialog usable after a transient catalog error', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        items: [{ value: 'event', name: 'Событие', code: 'event' }],
        nextCursor: null,
      });
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: '',
        label: 'Событие',
        placeholder: 'Выберите событие',
        load,
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-retry"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Событие');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('can clear an optional multiple selection', async () => {
    const option = { value: 'first', name: 'Первое', code: 'first' };
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: ['first'],
        multiple: true,
        allowEmpty: true,
        selectedOptions: [option],
        label: 'События',
        placeholder: 'Все события',
        load: vi.fn().mockResolvedValue({ items: [option], nextCursor: null }),
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-option"]').trigger('click');
    await wrapper.get('[data-testid="event-picker-apply"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[[]]]);
  });

  it('can stage and apply clearing an optional single selection', async () => {
    const option = { value: 'first', name: 'Первое', code: 'first' };
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: 'first',
        allowEmpty: true,
        selectedOption: option,
        label: 'Событие',
        placeholder: 'Любое событие',
        load: vi.fn().mockResolvedValue({ items: [option], nextCursor: null }),
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await flushPromises();
    const clear = wrapper.findAll('button').find((button) => button.text() === 'Очистить');
    if (!clear) throw new Error('Clear button was not found');
    await clear.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.get('[data-testid="event-picker-apply"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['']]);
  });

  it('closes and invalidates loaded options when its scope changes', async () => {
    let resolveOldPage!: (page: EventPickerPage) => void;
    const load = vi.fn().mockReturnValue(
      new Promise<EventPickerPage>((resolve) => {
        resolveOldPage = resolve;
      }),
    );
    const wrapper = mount(EventPicker, {
      props: {
        modelValue: '',
        scopeKey: 'project-1',
        label: 'Событие',
        placeholder: 'Выберите событие',
        load,
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger('click');
    await wrapper.setProps({ scopeKey: 'project-2' });
    resolveOldPage({
      items: [{ value: 'old', name: 'Старое', code: 'old' }],
      nextCursor: null,
    });
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="event-picker-option"]').exists()).toBe(false);
  });
});
