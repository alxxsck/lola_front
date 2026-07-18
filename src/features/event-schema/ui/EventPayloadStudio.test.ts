import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringEvent } from '@/shared/api/repository/scenario-authoring'
import { parseEventSchema, serializeEventSchema } from '../model/event-schema'
import EventPayloadStudio from './EventPayloadStudio.vue'

function mountStudio(schema: Record<string, unknown>, options: { baseline?: Record<string, unknown>; event?: ScenarioAuthoringEvent } = {}) {
  return mount(defineComponent({
    components: { EventPayloadStudio },
    setup() {
      const draft = ref(parseEventSchema(schema))
      return { draft, options }
    },
    template: '<EventPayloadStudio v-model="draft" :baseline-schema="options.baseline" :catalog-event="options.event" />',
  }))
}

describe('EventPayloadStudio', () => {
  it('keeps a generated stable field key while the user edits the wire contract', async () => {
    const wrapper = mountStudio({ type: 'object', additionalProperties: false, properties: {}, required: [] })

    await wrapper.get('[data-test="add-field"]').trigger('click')
    const studio = wrapper.getComponent(EventPayloadStudio)
    const initialFieldKey = studio.props('modelValue').fields[0]?.fieldKey

    await wrapper.get('[aria-label="Название поля"]').setValue('Сумма')
    await wrapper.get('[aria-label="Wire key"]').setValue('amount')
    await wrapper.get('[aria-label="Тип поля"]').setValue('integer')
    await wrapper.get('[aria-label="Обязательное поле"]').setValue(true)
    await wrapper.get('[data-test="field-details"]').trigger('click')
    await wrapper.get('[aria-label="Семантический тип"]').setValue('money')
    await wrapper.get('[aria-label="Единица измерения"]').setValue('minor')
    await wrapper.get('[aria-label="Wire key"]').setValue('amountMinor')

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

    expect(wrapper.text()).toContain('Можно фильтровать')
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

    await wrapper.get('[aria-label="Sample payload"]').setValue('{"amountMinor":0,"extra":true}')
    await wrapper.get('[data-test="validate-sample"]').trigger('click')

    expect(wrapper.text()).toContain('must NOT have additional properties')
    expect(wrapper.text()).toContain('/amountMinor')
    expect(wrapper.text()).toContain('must be >= 1')
  })
})
