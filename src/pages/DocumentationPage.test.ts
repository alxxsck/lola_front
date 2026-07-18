import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DocumentationPage from './DocumentationPage.vue'

describe('DocumentationPage', () => {
  it('lists the available scenario guide', () => {
    const wrapper = mount(DocumentationPage, {
      global: { stubs: { RouterLink: { props: ['to'], template: '<a :data-route="to.name"><slot /></a>' } } },
    })

    expect(wrapper.get('h1').text()).toBe('Документация Lola')
    expect(wrapper.findAll('.guide-card')).toHaveLength(1)
    expect(wrapper.get('.guide-card').attributes('data-route')).toBe('scenario-guide')
    expect(wrapper.get('.guide-card').text()).toContain('Как работают сценарии Lola')
  })
})
