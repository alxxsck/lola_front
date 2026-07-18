import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DeliveryPolicyEditor from './DeliveryPolicyEditor.vue'

describe('DeliveryPolicyEditor', () => {
  it('explains outcomes and reveals finite controls only for online waiting', async () => {
    const wrapper = mount(DeliveryPolicyEditor, { props: { modelValue: { kind: 'IMMEDIATE' } } })

    expect(wrapper.text()).toContain('Выполнить сразу')
    expect(wrapper.text()).toContain('Пропустить, если пользователь не в сети')
    expect(wrapper.find('input[aria-label="Срок ожидания появления в сети"]').exists()).toBe(false)

    await wrapper.get('input[value="WAIT_UNTIL_ONLINE"]').setValue(true)
    await wrapper.get('input[aria-label="Срок ожидания появления в сети"]').setValue('2')
    await wrapper.get('select[aria-label="Единица срока ожидания появления в сети"]').setValue('day')
    await wrapper.get('input[aria-label="Повторно проверить условия перед доставкой"]').setValue(true)

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      kind: 'WAIT_UNTIL_ONLINE', expiryMs: 172_800_000, recheckEligibility: true,
    })
    expect(wrapper.text()).toContain('не продлевает срок цели')
  })
})
