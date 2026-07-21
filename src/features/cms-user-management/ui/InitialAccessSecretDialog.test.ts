import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InitialAccessSecretDialog from './InitialAccessSecretDialog.vue'

describe('one-time Initial Access Secret dialog', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('copies the secret, requires acknowledgement and removes it after closing', async () => {
    const wrapper = mount(InitialAccessSecretDialog, {
      props: {
        secret: 'lia_one-time-secret',
        expiresAt: '2026-07-22T10:00:00.000Z',
        status: 'PENDING_SETUP',
      },
      global: {
        stubs: {
          Dialog: { template: '<section><slot /><slot name="footer" /></section>' },
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('lia_one-time-secret')
    await wrapper.get('[data-testid="copy-secret"]').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('lia_one-time-secret')
    expect(wrapper.text()).toContain('Секрет скопирован')

    const close = wrapper.get('[data-testid="acknowledge-secret"]')
    expect(close.attributes('disabled')).toBeDefined()
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await close.trigger('click')

    expect(wrapper.emitted('acknowledged')).toHaveLength(1)
  })

  it('keeps a selectable secret and safe copy failure message', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
    const wrapper = mount(InitialAccessSecretDialog, {
      props: {
        secret: 'lia_manual-copy',
        expiresAt: '2026-07-22T10:00:00.000Z',
        status: 'SUSPENDED',
      },
      global: {
        stubs: {
          Dialog: { template: '<section><slot /><slot name="footer" /></section>' },
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
          },
        },
      },
    })

    await wrapper.get('[data-testid="copy-secret"]').trigger('click')

    expect(wrapper.get('[data-testid="secret-value"]').attributes('tabindex')).toBe('0')
    expect(wrapper.text()).toContain('Выделите и скопируйте секрет вручную')
    expect(wrapper.text()).not.toContain('denied')
  })
})
