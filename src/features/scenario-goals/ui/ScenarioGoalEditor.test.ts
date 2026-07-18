import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

import ScenarioGoalEditor from './ScenarioGoalEditor.vue'

const contract: ScenarioAuthoringContract = {
  projectId: 'project-1', revision: 'catalog-1', version: 1,
  events: [{
    code: 'deposit.succeeded', definitionId: 'deposit-1', definitionKeyId: 'deposit-key', name: 'Успешный депозит', schemaVersion: 1,
    aggregateMeasures: [],
    fields: [{
      fieldKey: 'deposit.amount', label: 'Сумма', path: 'event.payload.amount', required: true, valueType: 'number',
      semanticType: 'money_major', unit: 'EUR', control: { type: 'number' },
      capabilities: { eventField: { operators: ['eq'] }, aggregateFilter: { operators: ['eq'] }, aggregateMeasure: { measures: ['sum'] } },
    }, {
      fieldKey: 'deposit.currency', label: 'Валюта', path: 'event.payload.currency', required: true, valueType: 'string',
      semanticType: 'currency', control: { type: 'select', options: ['EUR', 'USD'] }, allowedValues: ['EUR', 'USD'],
      capabilities: { eventField: { operators: ['eq'] }, aggregateFilter: { operators: ['eq', 'in'] }, aggregateMeasure: { measures: [] } },
    }, {
      fieldKey: 'deposit.approved', label: 'Подтверждён', path: 'event.payload.approved', required: true, valueType: 'boolean',
      control: { type: 'select', options: [true, false] },
      capabilities: { eventField: { operators: ['eq'] }, aggregateFilter: { operators: ['eq'] }, aggregateMeasure: { measures: [] } },
    }],
  }],
}

describe('ScenarioGoalEditor', () => {
  it('authors a finite Goal/Timeout config without exposing JSON', async () => {
    const wrapper = mount(ScenarioGoalEditor, {
      props: {
        modelValue: {}, contract,
        targets: [{ label: 'Спасибо · deposit_done', value: 'deposit_done' }, { label: 'Напоминание · deposit_missing', value: 'deposit_missing' }],
      },
    })

    await wrapper.get('select[aria-label="Событие цели"]').setValue('deposit.succeeded')
    await wrapper.get('select[aria-label="Что считать для цели"]').setValue('sum')
    await wrapper.get('select[aria-label="Поле суммы цели"]').setValue('deposit.amount')
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 1"]').setValue('deposit.currency')
    await wrapper.get('select[aria-label="Оператор фильтра цели 1"]').setValue('eq')
    await wrapper.get('select[aria-label="Значение фильтра цели 1"]').setValue('EUR')
    await wrapper.get('input[aria-label="Порог цели"]').setValue('500.25')
    await wrapper.get('input[aria-label="Срок цели"]').setValue('2')
    await wrapper.get('select[aria-label="Единица срока цели"]').setValue('day')
    await wrapper.get('select[aria-label="Ветка при достижении цели"]').setValue('deposit_done')
    await wrapper.get('select[aria-label="Ветка по истечении срока"]').setValue('deposit_missing')

    const config = wrapper.emitted('update:modelValue')?.at(-1)?.[0]
    expect(config).toEqual({
      goal: {
        version: 1, eventCode: 'deposit.succeeded', measure: 'sum', numericFieldKey: 'deposit.amount',
        filters: [{ fieldKey: 'deposit.currency', operator: 'eq', value: 'EUR' }],
        compare: { operator: 'gte', value: '500.25' },
      },
      timeoutMs: 172_800_000, onGoal: 'deposit_done', onTimeout: 'deposit_missing',
    })
    expect(wrapper.text()).toContain('Срок цели')
    expect(wrapper.text()).toContain('не является сроком ожидания online')
    expect(wrapper.text()).not.toContain('{"')
  })

  it('keeps numeric filter values typed as numbers', async () => {
    const wrapper = mount(ScenarioGoalEditor, {
      props: {
        modelValue: {}, contract,
        targets: [{ label: 'Готово', value: 'done' }, { label: 'Срок истёк', value: 'timeout' }],
      },
    })

    await wrapper.get('select[aria-label="Событие цели"]').setValue('deposit.succeeded')
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 1"]').setValue('deposit.amount')
    await wrapper.get('input[aria-label="Значение фильтра цели 1"]').setValue('12.5')
    await wrapper.get('select[aria-label="Ветка при достижении цели"]').setValue('done')
    await wrapper.get('select[aria-label="Ветка по истечении срока"]').setValue('timeout')

    const config = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { goal: { filters: Array<{ value: unknown }> } }
    expect(config.goal.filters[0]?.value).toBe(12.5)
  })

  it('authors an in filter as a typed multi-value selection', async () => {
    const wrapper = mount(ScenarioGoalEditor, {
      props: {
        modelValue: {}, contract,
        targets: [{ label: 'Готово', value: 'done' }, { label: 'Срок истёк', value: 'timeout' }],
      },
    })

    await wrapper.get('select[aria-label="Событие цели"]').setValue('deposit.succeeded')
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 1"]').setValue('deposit.currency')
    await wrapper.get('select[aria-label="Оператор фильтра цели 1"]').setValue('in')
    expect(wrapper.get('select[aria-label="Оператор фильтра цели 1"]').findAll('option').map((option) => option.text())).toEqual(['равно', 'одно из'])
    await wrapper.get('select[aria-label="Значения фильтра цели 1"]').setValue(['EUR', 'USD'])
    await wrapper.get('select[aria-label="Ветка при достижении цели"]').setValue('done')
    await wrapper.get('select[aria-label="Ветка по истечении срока"]').setValue('timeout')

    const config = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { goal: { filters: Array<{ value: unknown }> } }
    expect(config.goal.filters[0]?.value).toEqual(['EUR', 'USD'])
  })

  it('parses boolean filters and numeric in lists using the catalog field type', async () => {
    const typedContract: ScenarioAuthoringContract = {
      ...contract,
      events: [{
        ...contract.events[0]!,
        fields: contract.events[0]!.fields.map((field) => field.fieldKey === 'deposit.amount'
          ? { ...field, capabilities: { ...field.capabilities, aggregateFilter: { operators: ['eq', 'in'] } } }
          : field),
      }],
    }
    const wrapper = mount(ScenarioGoalEditor, {
      props: { modelValue: {}, contract: typedContract, targets: [{ label: 'Готово', value: 'done' }, { label: 'Срок', value: 'timeout' }] },
    })
    await wrapper.get('select[aria-label="Событие цели"]').setValue('deposit.succeeded')
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 1"]').setValue('deposit.approved')
    await wrapper.get('select[aria-label="Значение фильтра цели 1"]').setValue('true')
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 2"]').setValue('deposit.amount')
    await wrapper.get('select[aria-label="Оператор фильтра цели 2"]').setValue('in')
    await wrapper.get('input[aria-label="Значения фильтра цели 2"]').setValue('10.5, 20')
    await wrapper.get('select[aria-label="Ветка при достижении цели"]').setValue('done')
    await wrapper.get('select[aria-label="Ветка по истечении срока"]').setValue('timeout')

    const config = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { goal: { filters: Array<{ value: unknown }> } }
    expect(config.goal.filters.map((filter) => filter.value)).toEqual([true, [10.5, 20]])
  })
})
