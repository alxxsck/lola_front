import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DocumentationPage from './DocumentationPage.vue'

describe('DocumentationPage', () => {
  it('lists all available administrator guides', () => {
    const wrapper = mount(DocumentationPage, {
      global: { stubs: { RouterLink: { props: ['to'], template: '<a :data-route="to.name"><slot /></a>' } } },
    })

    expect(wrapper.get('h1').text()).toBe('Документация Lola')
    expect(wrapper.findAll('.guide-card')).toHaveLength(3)
    expect(wrapper.get('.guide-card').attributes('data-route')).toBe('scenario-guide')
    expect(wrapper.text()).toContain('Как работают сценарии Lola')
    expect(wrapper.text()).toContain('Поля профиля пользователей')
    expect(wrapper.text()).toContain('Сегменты пользователей')
  })
})
