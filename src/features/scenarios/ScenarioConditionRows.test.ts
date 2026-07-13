import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScenarioConditionRows from './ScenarioConditionRows.vue'

describe('ScenarioConditionRows', () => {
  it('removes the selected condition from the model', async () => {
    const conditions = [
      { path: 'user.segment', operator: 'eq' as const, value: 'new' },
      { path: 'event.payload.amount', operator: 'gt' as const, value: 0 },
    ]
    const wrapper = shallowMount(ScenarioConditionRows, {
      props: { modelValue: conditions, paths: conditions.map((condition) => condition.path) },
      global: {
        stubs: {
          Button: { template: '<button><slot /></button>' },
        },
      },
    })

    await wrapper.findAll('button[aria-label="Удалить условие"]')[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[[conditions[1]]]])
  })
})
