import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ScenarioGuidePage from './ScenarioGuidePage.vue'

describe('ScenarioGuidePage', () => {
  it('renders the CMS Markdown as an indexed administrator guide', () => {
    const wrapper = mount(ScenarioGuidePage, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })

    expect(wrapper.get('h1').text()).toBe('Как работают сценарии Lola')
    expect(wrapper.get('.guide-back').text()).toContain('Вся документация')
    expect(wrapper.findAll('.guide-nav nav a').length).toBeGreaterThan(20)
    expect(wrapper.get('.skip-guide').attributes('href')).toBe('#guide-content')
    expect(wrapper.get('#guide-content').element.tagName).toBe('SECTION')
    expect(wrapper.text()).toContain('Event Definition: описание события')
    expect(wrapper.text()).not.toContain('Project — отдельный продукт')
    expect(wrapper.text()).toContain('Три полных примера')
    expect(wrapper.findAll('figure.code-example').length).toBeGreaterThanOrEqual(3)
    expect(wrapper.findAll('figure.code-example pre').every((example) => example.attributes('tabindex') === '0')).toBe(true)
  })
})
