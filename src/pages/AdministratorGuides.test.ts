import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProfileFieldsGuidePage from './ProfileFieldsGuidePage.vue'
import SegmentsGuidePage from './SegmentsGuidePage.vue'

const routerLink = { props: ['to'], template: '<a :data-route="to.name"><slot /></a>' }

describe('administrator guides', () => {
  it('renders the profile fields source as an indexed practical guide', () => {
    const wrapper = mount(ProfileFieldsGuidePage, { global: { stubs: { RouterLink: routerLink } } })

    expect(wrapper.get('h1').text()).toBe('Как настроить поля профиля пользователей')
    expect(wrapper.findAll('.guide-nav nav a').length).toBeGreaterThanOrEqual(20)
    expect(wrapper.text()).toContain('Полный пример: поля для игрового продукта')
    expect(wrapper.text()).toContain('Проверочный список перед публикацией')
    expect(wrapper.findAll('figure.code-example').length).toBeGreaterThanOrEqual(5)
    expect(wrapper.get('.guide-content footer a').attributes('data-route')).toBe('project-user-attributes')
  })

  it('renders the segments source with examples and a semantic table', () => {
    const wrapper = mount(SegmentsGuidePage, { global: { stubs: { RouterLink: routerLink } } })

    expect(wrapper.get('h1').text()).toBe('Как создавать и использовать сегменты')
    expect(wrapper.findAll('.guide-nav nav a').length).toBeGreaterThan(20)
    expect(wrapper.text()).toContain('Пример 5: сегмент и условие сценария вместе')
    expect(wrapper.text()).toContain('Сохранится ли незаконченный черновик')
    expect(wrapper.findAll('.table-frame table')).toHaveLength(1)
    expect(wrapper.get('.guide-note').text()).toContain('не изменяет уже опубликованные сценарии')
    expect(wrapper.get('.guide-content footer a').attributes('data-route')).toBe('segments')
  })
})
