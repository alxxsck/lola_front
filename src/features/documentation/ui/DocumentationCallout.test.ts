import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DocumentationCallout from './DocumentationCallout.vue'

describe('DocumentationCallout', () => {
  it('links contextual help to the scenario guide by route name', () => {
    const wrapper = mount(DocumentationCallout, {
      props: { text: 'Разберитесь в событиях и сценариях.' },
      global: { stubs: { RouterLink: { props: ['to'], template: '<a :data-route="to.name"><slot /></a>' } } },
    })

    expect(wrapper.get('a').attributes('data-route')).toBe('scenario-guide')
    expect(wrapper.text()).toContain('Разберитесь в событиях и сценариях.')
  })
})
