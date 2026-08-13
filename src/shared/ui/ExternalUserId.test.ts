import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExternalUserId from './ExternalUserId.vue';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
}));

describe('ExternalUserId', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('copies the complete product identifier, shows a toast and stops the row click', async () => {
    writeText.mockResolvedValue(undefined);
    const rowClick = vi.fn();
    const wrapper = mount(
      {
        components: { ExternalUserId },
        template:
          '<div data-testid="row" @click="rowClick"><ExternalUserId value="customer-42-full" /></div>',
        setup: () => ({ rowClick }),
      },
      {
        global: { mocks: { $toast: { add: mocks.toast } } },
      },
    );

    await wrapper
      .get('[aria-label="Скопировать внешний ID пользователя customer-42-full"]')
      .trigger('click');
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith('customer-42-full');
    expect(rowClick).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Внешний ID скопирован',
      detail: 'customer-42-full',
      life: 2200,
    });
  });

  it('reports clipboard failures without claiming success', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const wrapper = mount(ExternalUserId, {
      props: { value: 'customer-42' },
      global: { mocks: { $toast: { add: mocks.toast } } },
    });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(mocks.toast).toHaveBeenCalledWith({
      severity: 'error',
      summary: 'Не удалось скопировать внешний ID',
      life: 3000,
    });
  });

  it('can render only the copy action beside an existing identifier label', () => {
    const wrapper = mount(ExternalUserId, {
      props: { value: 'customer-42', iconOnly: true },
      global: { mocks: { $toast: { add: mocks.toast } } },
    });

    expect(wrapper.text()).toBe('');
    expect(wrapper.get('button').attributes('aria-label')).toContain('customer-42');
  });
});
