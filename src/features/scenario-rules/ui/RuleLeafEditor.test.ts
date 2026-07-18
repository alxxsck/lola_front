import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { RuleDomainContext, RuleDraftNode } from '../model'
import RuleLeafEditor from './RuleLeafEditor.vue'

const context = {
  triggerEventDefinitionId: 'event-revision-1',
  triggerEventCode: 'deposit.succeeded',
  mode: 'initialEligibility',
  contract: {
    projectId: 'project-1', revision: 'catalog-1', version: 1,
    events: [{
      code: 'deposit.succeeded', definitionId: 'event-revision-1', definitionKeyId: 'event-key-1', name: 'Депозит', schemaVersion: 1,
      aggregateMeasures: [],
      fields: [{
        fieldKey: 'deposit.amount', path: 'event.payload.amountMinor', label: 'Сумма', description: null,
        valueType: 'integer', semanticType: 'money', unit: 'minor', required: true, sensitive: false,
        display: { scale: 0.01, precision: 2, conversion: 'MULTIPLY' },
        control: { type: 'number' },
        capabilities: {
          eventField: { operators: ['eq'] }, aggregateFilter: { operators: ['eq'] }, aggregateMeasure: { measures: ['sum'], resultType: 'number' },
        },
      }],
    }],
  },
} as RuleDomainContext

describe('RuleLeafEditor money contract', () => {
  it('shows display units but emits the exact backend value', async () => {
    const node = {
      nodeId: 'amount-rule', kind: 'eventField', eventCode: 'deposit.succeeded', fieldKey: 'deposit.amount', operator: 'eq', value: 125,
    } as RuleDraftNode
    const wrapper = mount(RuleLeafEditor, {
      props: { visible: true, kind: 'eventField', context, node },
      global: { stubs: { Drawer: { template: '<div><slot name="header"/><slot/></div>' } } },
    })
    await flushPromises()

    const input = wrapper.get('[aria-label="Значение поля Сумма"]')
    expect((input.element as HTMLInputElement).value).toBe('1.25')
    await input.setValue('2.50')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('apply')?.[0]?.[0]).toMatchObject({ value: 250 })
    expect(wrapper.text()).toContain('масштабом 0.01')
  })
})
