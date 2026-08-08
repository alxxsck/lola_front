import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'
import EventPicker from '@/features/events/EventPicker.vue'
import ScenarioActionTargetPicker, {
  type ScenarioActionTargetOption,
} from '@/features/actions/ScenarioActionTargetPicker.vue'

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

const target = (value: string, name: string): ScenarioActionTargetOption => ({
  value,
  name,
  code: value,
  kind: 'existing',
})

describe('ScenarioGoalEditor', () => {
  it('authors a finite Goal/Timeout config without exposing JSON', async () => {
    const wrapper = mount(ScenarioGoalEditor, {
      props: {
        modelValue: {}, contract,
        targets: [target('deposit_done', 'Спасибо'), target('deposit_missing', 'Напоминание')],
      },
    })

    wrapper.getComponent(EventPicker).vm.$emit('update:modelValue', 'deposit.succeeded')
    await wrapper.vm.$nextTick()
    await wrapper.get('select[aria-label="Что считать для цели"]').setValue('sum')
    await wrapper.get('select[aria-label="Поле суммы цели"]').setValue('deposit.amount')
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 1"]').setValue('deposit.currency')
    await wrapper.get('select[aria-label="Оператор фильтра цели 1"]').setValue('eq')
    await wrapper.get('select[aria-label="Значение фильтра цели 1"]').setValue('EUR')
    await wrapper.get('input[aria-label="Порог цели"]').setValue('500.25')
    await wrapper.get('input[aria-label="Срок цели"]').setValue('2')
    await wrapper.get('select[aria-label="Единица срока цели"]').setValue('day')
    const branches = wrapper.findAllComponents(ScenarioActionTargetPicker)
    branches[0]!.vm.$emit('update:modelValue', 'deposit_done')
    branches[1]!.vm.$emit('update:modelValue', 'deposit_missing')
    await wrapper.vm.$nextTick()

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
        targets: [target('done', 'Готово'), target('timeout', 'Срок истёк')],
      },
    })

    wrapper.getComponent(EventPicker).vm.$emit('update:modelValue', 'deposit.succeeded')
    await wrapper.vm.$nextTick()
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 1"]').setValue('deposit.amount')
    await wrapper.get('input[aria-label="Значение фильтра цели 1"]').setValue('12.5')
    const branches = wrapper.findAllComponents(ScenarioActionTargetPicker)
    branches[0]!.vm.$emit('update:modelValue', 'done')
    branches[1]!.vm.$emit('update:modelValue', 'timeout')
    await wrapper.vm.$nextTick()

    const config = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { goal: { filters: Array<{ value: unknown }> } }
    expect(config.goal.filters[0]?.value).toBe(12.5)
  })

  it('authors an in filter as a typed multi-value selection', async () => {
    const wrapper = mount(ScenarioGoalEditor, {
      props: {
        modelValue: {}, contract,
        targets: [target('done', 'Готово'), target('timeout', 'Срок истёк')],
      },
    })

    wrapper.getComponent(EventPicker).vm.$emit('update:modelValue', 'deposit.succeeded')
    await wrapper.vm.$nextTick()
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 1"]').setValue('deposit.currency')
    await wrapper.get('select[aria-label="Оператор фильтра цели 1"]').setValue('in')
    expect(wrapper.get('select[aria-label="Оператор фильтра цели 1"]').findAll('option').map((option) => option.text())).toEqual(['равно', 'одно из'])
    await wrapper.get('select[aria-label="Значения фильтра цели 1"]').setValue(['EUR', 'USD'])
    const branches = wrapper.findAllComponents(ScenarioActionTargetPicker)
    branches[0]!.vm.$emit('update:modelValue', 'done')
    branches[1]!.vm.$emit('update:modelValue', 'timeout')
    await wrapper.vm.$nextTick()

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
      props: { modelValue: {}, contract: typedContract, targets: [target('done', 'Готово'), target('timeout', 'Срок')] },
    })
    wrapper.getComponent(EventPicker).vm.$emit('update:modelValue', 'deposit.succeeded')
    await wrapper.vm.$nextTick()
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 1"]').setValue('deposit.approved')
    await wrapper.get('select[aria-label="Значение фильтра цели 1"]').setValue('true')
    await wrapper.get('button[aria-label="Добавить фильтр цели"]').trigger('click')
    await wrapper.get('select[aria-label="Поле фильтра цели 2"]').setValue('deposit.amount')
    await wrapper.get('select[aria-label="Оператор фильтра цели 2"]').setValue('in')
    await wrapper.get('input[aria-label="Значения фильтра цели 2"]').setValue('10.5, 20')
    const branches = wrapper.findAllComponents(ScenarioActionTargetPicker)
    branches[0]!.vm.$emit('update:modelValue', 'done')
    branches[1]!.vm.$emit('update:modelValue', 'timeout')
    await wrapper.vm.$nextTick()

    const config = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { goal: { filters: Array<{ value: unknown }> } }
    expect(config.goal.filters.map((filter) => filter.value)).toEqual([true, [10.5, 20]])
  })
})
