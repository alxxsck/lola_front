import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import leadGuideSource from '../../docs/cms-support-lead-guide.ru.md?raw'
import operatorGuideSource from '../../docs/cms-support-operator-guide.ru.md?raw'
import SupportLeadGuidePage from './SupportLeadGuidePage.vue'
import SupportOperatorGuidePage from './SupportOperatorGuidePage.vue'

const routerLink = {
  props: ['to'],
  template: '<a :data-route="to.name"><slot /></a>',
}

describe('support onboarding guides', () => {
  it('keeps operational copy in plain Russian and explains unavoidable terms', () => {
    const source = `${operatorGuideSource}\n${leadGuideSource}`
    const forbidden = [
      /\bExternal Work\b/i,
      /\bpending\b/i,
      /\bunknown\b/i,
      /\bevidence\b/i,
      /\bbackend\b/i,
      /\bfrontend\b/i,
      /\bdashboard\b/i,
      /\bworkflow\b/i,
      /\bclaimant\b/i,
      /\breplay\b/i,
    ]

    expect(forbidden.flatMap((pattern) => source.match(pattern) ?? [])).toEqual([])
    expect(source).toContain('SLA — согласованный срок')
    expect(source).not.toMatch(/rollout|Запуск и возврат/i)
    expect(source).toContain('JSM или HelpDesk')
  })

  it('gives a new operator a short, indexed route through the whole shift', () => {
    const wrapper = mount(SupportOperatorGuidePage, {
      global: { stubs: { RouterLink: routerLink } },
    })

    expect(wrapper.get('h1').text()).toBe('Работа оператора поддержки')
    expect(wrapper.findAll('.guide-nav nav a').length).toBeGreaterThanOrEqual(14)
    expect(wrapper.text()).toContain('Начало смены: короткий маршрут')
    expect(wrapper.text()).toContain('Обращение и чат — не одно и то же')
    expect(wrapper.text()).toContain('Как ответить и не потерять черновик')
    expect(wrapper.text()).toContain('Словарь оператора')
    expect(wrapper.get('.guide-screen').attributes('aria-label')).toContain('Рабочее место оператора')
    expect(wrapper.get('.guide-content footer a').attributes('data-route')).toBe('support-inbox')
  })

  it('explains lead-only control, settings and access boundaries', () => {
    const wrapper = mount(SupportLeadGuidePage, {
      global: { stubs: { RouterLink: routerLink } },
    })

    expect(wrapper.get('h1').text()).toBe('Работа лида поддержки')
    expect(wrapper.findAll('.guide-nav nav a').length).toBeGreaterThanOrEqual(14)
    expect(wrapper.text()).toContain('Что лид видит дополнительно')
    expect(wrapper.text()).toContain('Операционный обзор')
    expect(wrapper.text()).not.toContain('Запуск и возврат')
    expect(wrapper.text()).toContain('SLA')
    expect(wrapper.text()).toContain('Права выдаются отдельно')
    expect(wrapper.text()).toContain('Словарь лида')
    expect(wrapper.get('.guide-screen').attributes('aria-label')).toContain('Панель лида')
    expect(wrapper.get('.guide-content footer a').attributes('data-route')).toBe('support-control')
  })
})
