import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringEvent } from '@/shared/api/repository/scenario-authoring'
import { parseEventSchema, serializeEventSchema } from '../model/event-schema'
import EventPayloadStudio from './EventPayloadStudio.vue'

function mountStudio(schema: Record<string, unknown>, options: { baseline?: Record<string, unknown>; event?: ScenarioAuthoringEvent; attach?: boolean } = {}) {
  return mount(defineComponent({
    components: { EventPayloadStudio },
    setup() {
      const draft = ref(parseEventSchema(schema))
      return { draft, options }
    },
    template: '<EventPayloadStudio v-model="draft" :baseline-schema="options.baseline" :catalog-event="options.event" />',
  }), options.attach ? { attachTo: document.body } : {})
}

describe('EventPayloadStudio', () => {
  it('keeps a generated stable field key while the user edits the wire contract', async () => {
    const wrapper = mountStudio({ type: 'object', additionalProperties: false, properties: {}, required: [] })

    await wrapper.get('[data-test="add-field"]').trigger('click')
    const studio = wrapper.getComponent(EventPayloadStudio)
    const initialFieldKey = studio.props('modelValue').fields[0]?.fieldKey

    await wrapper.get('[data-test="field-title"]').setValue('Сумма')
    await wrapper.get('[data-test="field-wire-key"]').setValue('amount')
    await wrapper.get('[data-test="field-type"]').setValue('integer')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('[data-test="field-details"]').trigger('click')
    expect(wrapper.findAll('[aria-label="Максимальное значение поля Сумма"]')).toHaveLength(1)
    await wrapper.get('[aria-label="Смысл данных поля Сумма"]').setValue('money')
    await wrapper.get('[aria-label="Способ хранения поля Сумма"]').setValue('minor')
    await wrapper.get('[data-test="money-display-scale"]').setValue('0.001')
    await wrapper.get('[data-test="money-display-precision"]').setValue('3')
    await wrapper.get('[data-test="field-wire-key"]').setValue('amountMinor')

    const draft = wrapper.getComponent(EventPayloadStudio).props('modelValue')
    expect(initialFieldKey).toMatch(/^field_/)
    expect(draft.fields[0]?.fieldKey).toBe(initialFieldKey)
    expect(serializeEventSchema(draft)).toMatchObject({
      properties: {
        amountMinor: {
          type: 'integer',
          title: 'Сумма',
          'x-lola-field-key': initialFieldKey,
          'x-lola-semantic-type': 'money',
          'x-lola-unit': 'minor',
          'x-lola-display-scale': 0.001,
          'x-lola-display-precision': 3,
        },
      },
      required: ['amountMinor'],
    })
  })

  it('applies advanced JSON without losing unknown keywords and shows catalog capabilities', async () => {
    const event: ScenarioAuthoringEvent = {
      code: 'deposit.succeeded',
      definitionId: 'event-1',
      definitionKeyId: 'event-key-1',
      name: 'Deposit',
      schemaVersion: 1,
      aggregateMeasures: [],
      fields: [{
        fieldKey: 'deposit.currency',
        label: 'Currency',
        path: 'event.payload.currency',
        required: true,
        valueType: 'string',
        control: { type: 'select', options: ['EUR'] },
        allowedValues: ['EUR'],
        semanticType: 'currency',
        sensitive: false,
        capabilities: {
          eventField: { operators: ['eq'] },
          aggregateFilter: { operators: ['eq'] },
          aggregateMeasure: { measures: [] },
        },
      }],
    }
    const wrapper = mountStudio({
      type: 'object',
      properties: { currency: { type: 'string', 'x-lola-field-key': 'deposit.currency' } },
    }, { event })

    expect(wrapper.text()).toContain('Событие запуска: можно сравнивать')
    await wrapper.get('[data-test="advanced-schema"]').trigger('click')
    await wrapper.get('[aria-label="JSON Schema"]').setValue(JSON.stringify({
      type: 'object',
      unevaluatedProperties: false,
      properties: {
        currency: {
          type: 'string',
          enum: ['EUR'],
          'x-lola-field-key': 'deposit.currency',
          'x-contract-extension': { owner: 'payments' },
        },
      },
    }))
    await wrapper.get('[data-test="review-advanced-schema"]').trigger('click')
    expect(wrapper.text()).toContain('Проверка пройдена')
    await wrapper.get('[data-test="apply-advanced-schema"]').trigger('click')

    expect(serializeEventSchema(wrapper.getComponent(EventPayloadStudio).props('modelValue'))).toEqual({
      type: 'object',
      unevaluatedProperties: false,
      properties: {
        currency: {
          type: 'string',
          enum: ['EUR'],
          'x-lola-field-key': 'deposit.currency',
          'x-contract-extension': { owner: 'payments' },
        },
      },
    })
  })

  it('validates a pasted sample payload against the current schema', async () => {
    const wrapper = mountStudio({
      type: 'object',
      required: ['amountMinor'],
      properties: { amountMinor: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    })

    await wrapper.get('summary').trigger('click')
    await wrapper.get('[aria-label="Пример данных для проверки"]').setValue('{"amountMinor":0,"extra":true}')
    await wrapper.get('[data-test="validate-sample"]').trigger('click')

    expect(wrapper.text()).toContain('Поле не описано')
    expect(wrapper.text()).toContain('/amountMinor')
    expect(wrapper.text()).toContain('Значение слишком маленькое')
  })

  it('edits string choices without asking the user to write JSON', async () => {
    const wrapper = mountStudio({
      type: 'object',
      properties: { currency: { type: 'string', enum: ['EUR'] } },
    })

    await wrapper.get('[data-test="field-details"]').trigger('click')
    expect(wrapper.text()).not.toContain('Enum JSON')
    await wrapper.get('[aria-label="Допустимые варианты поля currency"]').setValue('EUR\nUSD')

    expect(serializeEventSchema(wrapper.getComponent(EventPayloadStudio).props('modelValue'))).toMatchObject({
      properties: { currency: { enum: ['EUR', 'USD'] } },
    })
    expect(wrapper.find('[aria-label="Stable field key"]').exists()).toBe(false)
  })

  it('keeps an invalid advanced schema open and leaves the visual draft unchanged', async () => {
    const wrapper = mountStudio({ type: 'object', properties: { currency: { type: 'string' } } })

    await wrapper.get('[data-test="advanced-schema"]').trigger('click')
    expect(wrapper.find('[data-test="field-wire-key"]').exists()).toBe(false)
    await wrapper.get('[aria-label="JSON Schema"]').setValue('{"type":"object","properties":"bad"}')
    await wrapper.get('[data-test="review-advanced-schema"]').trigger('click')

    expect(wrapper.text()).toContain('properties должен быть объектом')
    expect(wrapper.find('[aria-label="JSON Schema"]').exists()).toBe(true)
    expect(serializeEventSchema(wrapper.getComponent(EventPayloadStudio).props('modelValue'))).toEqual({
      type: 'object',
      properties: { currency: { type: 'string' } },
    })
  })

  it('requires an explicit discard for unapplied advanced JSON', async () => {
    const wrapper = mountStudio({ type: 'object', properties: { currency: { type: 'string' } } })

    await wrapper.get('[data-test="advanced-schema"]').trigger('click')
    expect(wrapper.get('[data-test="advanced-schema"]').attributes('aria-expanded')).toBe('true')
    await wrapper.get('[aria-label="JSON Schema"]').setValue('{"type":"object","properties":{}}')
    await wrapper.get('[data-test="advanced-schema"]').trigger('click')

    expect(wrapper.find('[aria-label="JSON Schema"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('неприменённые изменения')
    await wrapper.get('[data-test="discard-advanced-schema"]').trigger('click')
    expect(wrapper.find('[aria-label="JSON Schema"]').exists()).toBe(false)
  })

  it('clears a successful sample result when the schema changes', async () => {
    const wrapper = mountStudio({ type: 'object', properties: { enabled: { type: 'boolean' } } })

    await wrapper.get('summary').trigger('click')
    await wrapper.get('[aria-label="Пример данных для проверки"]').setValue('{"enabled":true}')
    await wrapper.get('[data-test="validate-sample"]').trigger('click')
    expect(wrapper.text()).toContain('соответствует текущей настройке')

    await wrapper.get('[data-test="field-type"]').setValue('string')
    expect(wrapper.text()).not.toContain('соответствует текущей настройке')
  })

  it('moves focus to a new field and returns it to the neighbour after delete', async () => {
    const wrapper = mountStudio({ type: 'object', properties: {} }, { attach: true })

    await wrapper.get('[data-test="add-field"]').trigger('click')
    const firstTitle = wrapper.get('[data-test="field-title"]').element
    expect(document.activeElement).toBe(firstTitle)

    await wrapper.get('[data-test="add-field"]').trigger('click')
    await wrapper.findAll('.icon-button')[1]!.trigger('click')
    expect(document.activeElement).toBe(firstTitle)

    wrapper.unmount()
  })
})
