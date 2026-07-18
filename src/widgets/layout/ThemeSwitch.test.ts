import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from '@/shared/theme/theme'
import ThemeSwitch from './ThemeSwitch.vue'

describe('ThemeSwitch', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
  })

  it('lets the user switch the application to the dark theme', async () => {
    const wrapper = mount(ThemeSwitch)

    await wrapper.get('input[type="checkbox"]').setValue(true)

    expect({
      label: wrapper.text(),
      storedTheme: localStorage.getItem(THEME_STORAGE_KEY),
      hasDarkClass: document.documentElement.classList.contains('lola-dark'),
    }).toEqual({ label: 'ТемаТёмная', storedTheme: 'dark', hasDarkClass: true })
  })
})
