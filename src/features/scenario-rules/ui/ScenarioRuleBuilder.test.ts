import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'
import { createRuleDraft, serializeRuleDraft, type RuleDomainContext, type RuleDraft } from '../model'
import ScenarioRuleBuilder from './ScenarioRuleBuilder.vue'

const contract: ScenarioAuthoringContract = {
  projectId: 'project-1',
  revision: 'catalog-1',
  version: 1,
  events: [{
    code: 'page.opened', definitionId: 'event-page', definitionKeyId: 'key-page', name: 'Открыта страница', schemaVersion: 1,
    aggregateMeasures: [
      { measure: 'count', field: 'none', resultType: 'integer', compareValueType: 'integer', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'sum', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
    ],
    fields: [{
      fieldKey: 'page.name', label: 'Страница', path: 'event.payload.page', required: true, valueType: 'string',
      control: { type: 'select', options: ['promotions', 'profile'] }, allowedValues: ['promotions', 'profile'],
      capabilities: { eventField: { operators: ['eq', 'neq', 'in'] }, aggregateFilter: { operators: ['eq', 'neq', 'in'] }, aggregateMeasure: { measures: [] } },
    }],
  }, {
    code: 'deposit.succeeded', definitionId: 'event-deposit', definitionKeyId: 'key-deposit', name: 'Успешный депозит', schemaVersion: 1,
    aggregateMeasures: [
      { measure: 'count', field: 'none', resultType: 'integer', compareValueType: 'integer', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'sum', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
    ],
    fields: [{
      fieldKey: 'deposit.amount', label: 'Сумма', path: 'event.payload.amount', required: true, valueType: 'number', semanticType: 'money', unit: 'EUR',
      control: { type: 'number' },
      capabilities: { eventField: { operators: ['eq', 'gte'] }, aggregateFilter: { operators: ['eq'] }, aggregateMeasure: { measures: ['sum'] } },
    }, {
      fieldKey: 'deposit.currency', label: 'Валюта', path: 'event.payload.currency', required: true, valueType: 'string', semanticType: 'currency',
      control: { type: 'select', options: ['EUR', 'USD'] }, allowedValues: ['EUR', 'USD'],
      capabilities: { eventField: { operators: ['eq', 'in'] }, aggregateFilter: { operators: ['eq', 'in'] }, aggregateMeasure: { measures: [] } },
    }],
  }],
}

const context: RuleDomainContext = { triggerEventDefinitionId: 'event-page', triggerEventCode: 'page.opened', mode: 'initialEligibility', contract }

function mountBuilder() {
  return mount(defineComponent({
    components: { ScenarioRuleBuilder },
    setup() {
      const draft = ref<RuleDraft>(createRuleDraft())
      const ruleContext = ref<RuleDomainContext>(context)
      return { context: ruleContext, draft }
    },
    template: '<ScenarioRuleBuilder v-model="draft" :context="context" />',
  }), {
    attachTo: document.body,
    global: {
      stubs: {
        teleport: true,
        Drawer: {
          props: ['visible'],
          emits: ['update:visible', 'show'],
          template: '<aside v-if="visible" role="dialog"><slot name="header" /><slot /></aside>',
        },
      },
    },
  })
}

async function addSource(wrapper: ReturnType<typeof mountBuilder>, source: string) {
  await wrapper.get('button[aria-label="Добавить условие в группу Должны выполняться все условия"]').trigger('click')
  await wrapper.get(`[data-source="${source}"]`).trigger('click')
}

describe('ScenarioRuleBuilder', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('names group logic as a clear outcome', () => {
    const wrapper = mountBuilder()

    expect(wrapper.get('button[aria-label="Должны выполняться все условия"]').text()).toBe('Должны выполняться все условия')
    expect(wrapper.get('button[aria-label="Достаточно одного условия"]').text()).toBe('Достаточно одного условия')
    expect(wrapper.text()).toContain('Как работают группы условий?')
  })

  it('creates a current Event condition from catalog controls without exposing raw paths', async () => {
    const wrapper = mountBuilder()
    await addSource(wrapper, 'eventField')

    expect(wrapper.text()).toContain('Событие запуска: Открыта страница')
    expect(wrapper.text()).not.toContain('event.payload.page')
    await wrapper.get('select[aria-label="Поле события запуска"]').setValue('page.name')
    await wrapper.get('select[aria-label="Оператор поля Страница"]').setValue('eq')
    await wrapper.get('select[aria-label="Значение поля Страница"]').setValue('promotions')
    await wrapper.get('button[aria-label="Применить условие"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Страница')
    expect(wrapper.text()).toContain('promotions')
    expect(wrapper.find('button[aria-label^="Изменить условие"]').exists()).toBe(true)
  })

  it('offers editable recipes, plain-language glossary and visible limit counters', async () => {
    const wrapper = mountBuilder()

    expect(wrapper.text()).toContain('Как работают группы условий?')
    expect(wrapper.text()).toContain('1/100 узлов')
    await wrapper.get('[data-recipe="streak"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('активен не менее 3 дней подряд')
    expect(wrapper.find('button[aria-label^="Изменить условие:"]').exists()).toBe(true)
  })

  it('keeps aggregate choices catalog-compatible and never offers sinceTrigger', async () => {
    const wrapper = mountBuilder()
    await addSource(wrapper, 'eventAggregate')

    await wrapper.get('select[aria-label="Событие из истории"]').setValue('deposit.succeeded')
    expect(wrapper.find('option[value="distinct_count"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('С момента запуска')
    await wrapper.get('select[aria-label="Что посчитать"]').setValue('sum')
    await wrapper.get('select[aria-label="Поле для расчёта"]').setValue('deposit.amount')
    await wrapper.get('button[aria-label="Добавить фильтр события"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра 1"]').setValue('deposit.currency')
    await wrapper.get('select[aria-label="Оператор фильтра 1"]').setValue('eq')
    await wrapper.get('select[aria-label="Значение фильтра 1"]').setValue('EUR')
    await wrapper.get('input[aria-label="Период истории"]').setValue('30')
    await wrapper.get('select[aria-label="Единица периода"]').setValue('day')
    await wrapper.get('select[aria-label="Сравнение результата"]').setValue('gte')
    await wrapper.get('input[aria-label="Значение сравнения"]').setValue('500')
    await wrapper.get('button[aria-label="Применить условие"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Успешный депозит')
    expect(wrapper.text()).toContain('30')
    expect(wrapper.text()).toContain('500')
    const moneyDraft = (wrapper.vm as unknown as { draft: RuleDraft }).draft
    const serializedMoney = serializeRuleDraft(moneyDraft, context)
    expect(serializedMoney.ok).toBe(true)
    if (serializedMoney.ok && serializedMoney.value.root.kind === 'all' && serializedMoney.value.root.children[0]?.kind === 'eventAggregate') {
      expect(serializedMoney.value.root.children[0].compare.value).toBe('500')
      expect(serializedMoney.value.root.children[0].filters).toEqual([{ fieldKey: 'deposit.currency', operator: 'eq', value: 'EUR' }])
    }

    await wrapper.get('button[aria-label^="Изменить условие:"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('select[aria-label="Событие из истории"]').element).toHaveProperty('value', 'deposit.succeeded')
    await wrapper.get('button[aria-label="Отменить редактирование условия"]').trigger('click')
  })

  it('discards a local leaf buffer and restores focus to its opener', async () => {
    const wrapper = mountBuilder()
    const opener = wrapper.get('button[aria-label="Добавить условие в группу Должны выполняться все условия"]')
    await opener.trigger('click')
    await wrapper.get('[data-source="activityDayStreak"]').trigger('click')
    await wrapper.get('input[aria-label="Количество активных дней подряд"]').setValue('4')
    expect(wrapper.getComponent(ScenarioRuleBuilder).emitted('editing-dirty')?.at(-1)).toEqual([true])

    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.get('button[aria-label="Отменить редактирование условия"]').trigger('click')
    expect(wrapper.find('input[aria-label="Количество активных дней подряд"]').exists()).toBe(true)

    confirmation.mockReturnValue(true)
    await wrapper.get('button[aria-label="Отменить редактирование условия"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('input[aria-label="Количество активных дней подряд"]').exists()).toBe(false)
    expect(wrapper.getComponent(ScenarioRuleBuilder).emitted('editing-dirty')?.at(-1)).toEqual([false])
    expect(document.activeElement).toBe(opener.element)
    expect(wrapper.text()).not.toContain('4 дня подряд')
  })

  it('supports group logic, negation and keyboard-safe removal with focus recovery', async () => {
    const wrapper = mountBuilder()
    await wrapper.get('button[aria-label="Добавить группу в Должны выполняться все условия"]').trigger('click')
    await wrapper.get('button[aria-label="Достаточно одного условия"]').trigger('click')
    expect(wrapper.get('button[aria-label="Достаточно одного условия"]').attributes('aria-pressed')).toBe('true')

    const nestedAdd = wrapper.findAll('button[aria-label="Добавить условие в группу Достаточно одного условия"]')[0]!
    await nestedAdd.trigger('click')
    await wrapper.get('[data-source="activityDayStreak"]').trigger('click')
    await wrapper.get('input[aria-label="Количество активных дней подряд"]').setValue('2')
    await wrapper.get('button[aria-label="Применить условие"]').trigger('click')
    await flushPromises()

    const moveUp = wrapper.get('button[aria-label^="Переместить вверх:"]')
    expect(moveUp.attributes()).not.toHaveProperty('disabled')
    await moveUp.trigger('click')
    await flushPromises()

    await wrapper.get('button[aria-label^="Исключить пользователей по условию:"]').trigger('click')
    expect(wrapper.text()).toContain('Исключение')
    const remove = wrapper.get('button[aria-label^="Удалить условие:"]')
    await remove.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(nestedAdd.element)
  })

  it('keeps the local buffer visible when a catalog refresh removes its dependency', async () => {
    const wrapper = mountBuilder()
    await addSource(wrapper, 'eventField')
    await wrapper.get('select[aria-label="Поле события запуска"]').setValue('page.name')
    await wrapper.get('select[aria-label="Оператор поля Страница"]').setValue('eq')
    await wrapper.get('select[aria-label="Значение поля Страница"]').setValue('promotions')

    const refreshedContract: ScenarioAuthoringContract = {
      ...contract,
      revision: 'catalog-2',
      events: contract.events.map((event) => event.code === 'page.opened' ? { ...event, fields: [] } : event),
    }
    ;(wrapper.vm as unknown as { context: RuleDomainContext }).context = { ...context, contract: refreshedContract }
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('page.name')
    expect(wrapper.text()).toContain('больше не доступно')
    expect((wrapper.get('select[aria-label="Поле события запуска"]').element as HTMLSelectElement).value).toBe('page.name')
    expect(wrapper.get('button[aria-label="Применить условие"]').attributes()).toHaveProperty('disabled')
  })

  it('uses the exact trigger revision for fields and operators when event codes are duplicated', async () => {
    const wrapper = mountBuilder()
    const duplicateContract: ScenarioAuthoringContract = {
      ...contract,
      events: [{ ...contract.events[0]!, definitionId: 'event-page-old', fields: [] }, ...contract.events],
    }
    ;(wrapper.vm as unknown as { context: RuleDomainContext }).context = { ...context, contract: duplicateContract }
    await wrapper.vm.$nextTick()
    await addSource(wrapper, 'eventField')

    await wrapper.get('select[aria-label="Поле события запуска"]').setValue('page.name')
    await wrapper.get('select[aria-label="Оператор поля Страница"]').setValue('eq')
    await wrapper.get('select[aria-label="Значение поля Страница"]').setValue('promotions')

    expect(wrapper.get('button[aria-label="Применить условие"]').attributes()).not.toHaveProperty('disabled')
  })

  it('opens the exact leaf control requested by a backend issue', async () => {
    const wrapper = mountBuilder()
    await addSource(wrapper, 'activityDayStreak')
    await wrapper.get('input[aria-label="Количество активных дней подряд"]').setValue('2')
    await wrapper.get('button[aria-label="Применить условие"]').trigger('click')
    await flushPromises()
    const draft = (wrapper.vm as unknown as { draft: RuleDraft }).draft
    const nodeId = draft.root.kind === 'all' ? draft.root.children[0]!.nodeId : ''

    wrapper.getComponent(ScenarioRuleBuilder).vm.focusIssue({ nodeId, fieldPath: 'compare.value', message: 'Укажите целое число дней.' })
    await flushPromises()

    const threshold = wrapper.get('input[aria-label="Количество активных дней подряд"]')
    expect(document.activeElement).toBe(threshold.element)
    expect(threshold.attributes('aria-invalid')).toBe('true')
    expect(threshold.attributes('aria-describedby')).toBe('rule-leaf-active-issue')
    expect(wrapper.get('#rule-leaf-active-issue').text()).toContain('Укажите целое число дней')
  })

  it('does not create an empty group whose maximum depth prevents adding a child', async () => {
    const wrapper = mountBuilder()
    for (let depth = 0; depth < 3; depth += 1) {
      const buttons = wrapper.findAll('button[aria-label^="Добавить группу в"]')
      await buttons.at(0)!.trigger('click')
      await flushPromises()
    }

    const deepestGroupButton = wrapper.findAll('button[aria-label^="Добавить группу в"]').at(0)!
    const deepestConditionButton = wrapper.findAll('button[aria-label^="Добавить условие в группу"]').at(0)!
    expect(deepestGroupButton.attributes()).toHaveProperty('disabled')
    expect(deepestGroupButton.attributes('title')).toContain('Новая группа не сможет содержать условия')
    expect(deepestConditionButton.attributes()).not.toHaveProperty('disabled')
  })

  it('reopens an existing leaf from its edit button', async () => {
    const wrapper = mountBuilder()
    await addSource(wrapper, 'activityDayStreak')
    await wrapper.get('input[aria-label="Количество активных дней подряд"]').setValue('3')
    await wrapper.get('button[aria-label="Применить условие"]').trigger('click')
    await flushPromises()

    await wrapper.get('button[aria-label^="Изменить условие:"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('input[aria-label="Количество активных дней подряд"]').element).toHaveProperty('value', '3')
  })

  it('authors catalog in-operators as typed arrays for fields and aggregate filters', async () => {
    const fieldWrapper = mountBuilder()
    await addSource(fieldWrapper, 'eventField')
    await fieldWrapper.get('select[aria-label="Поле события запуска"]').setValue('page.name')
    await fieldWrapper.get('select[aria-label="Оператор поля Страница"]').setValue('in')
    await fieldWrapper.get('select[aria-label="Значение поля Страница"]').setValue(['promotions', 'profile'])
    await fieldWrapper.get('button[aria-label="Применить условие"]').trigger('click')
    await flushPromises()
    expect(serializeRuleDraft((fieldWrapper.vm as unknown as { draft: RuleDraft }).draft, context).ok).toBe(true)

    const filterWrapper = mountBuilder()
    await addSource(filterWrapper, 'eventAggregate')
    await filterWrapper.get('select[aria-label="Событие из истории"]').setValue('deposit.succeeded')
    await filterWrapper.get('button[aria-label="Добавить фильтр события"]').trigger('click')
    await filterWrapper.get('select[aria-label="Поле фильтра 1"]').setValue('deposit.currency')
    await filterWrapper.get('select[aria-label="Оператор фильтра 1"]').setValue('in')
    await filterWrapper.get('select[aria-label="Значение фильтра 1"]').setValue(['EUR', 'USD'])
    await filterWrapper.get('select[aria-label="Что посчитать"]').setValue('count')
    await filterWrapper.get('select[aria-label="Сравнение результата"]').setValue('gte')
    await filterWrapper.get('input[aria-label="Значение сравнения"]').setValue('1')
    await filterWrapper.get('button[aria-label="Применить условие"]').trigger('click')
    await flushPromises()
    expect(serializeRuleDraft((filterWrapper.vm as unknown as { draft: RuleDraft }).draft, context).ok).toBe(true)
  })

  it('does not turn an empty aggregate threshold into zero or accept a fractional streak', async () => {
    const aggregateWrapper = mountBuilder()
    await addSource(aggregateWrapper, 'eventAggregate')
    await aggregateWrapper.get('select[aria-label="Событие из истории"]').setValue('deposit.succeeded')
    await aggregateWrapper.get('select[aria-label="Что посчитать"]').setValue('count')
    await aggregateWrapper.get('select[aria-label="Сравнение результата"]').setValue('gte')
    const threshold = aggregateWrapper.get('input[aria-label="Значение сравнения"]')
    await threshold.setValue('2')
    expect(aggregateWrapper.get('button[aria-label="Применить условие"]').attributes()).not.toHaveProperty('disabled')
    await threshold.setValue('')
    expect(aggregateWrapper.get('button[aria-label="Применить условие"]').attributes()).toHaveProperty('disabled')

    await threshold.setValue('2')
    await aggregateWrapper.get('button[aria-label="Добавить фильтр события"]').trigger('click')
    await aggregateWrapper.get('select[aria-label="Поле фильтра 1"]').setValue('deposit.amount')
    await aggregateWrapper.get('select[aria-label="Оператор фильтра 1"]').setValue('eq')
    const numericFilter = aggregateWrapper.get('input[aria-label="Значение фильтра 1"]')
    expect(numericFilter.attributes('type')).toBe('number')
    await numericFilter.setValue('not-a-number')
    expect(aggregateWrapper.get('button[aria-label="Применить условие"]').attributes()).toHaveProperty('disabled')

    const streakWrapper = mountBuilder()
    await addSource(streakWrapper, 'activityDayStreak')
    await streakWrapper.get('input[aria-label="Количество активных дней подряд"]').setValue('1.5')
    expect(streakWrapper.get('button[aria-label="Применить условие"]').attributes()).toHaveProperty('disabled')
  })
})
