import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ConversationAISuspensionDialog from './ConversationAISuspensionDialog.vue'

const stubs = {
  Dialog: { props: ['visible'], template: '<div v-if="visible"><slot /></div>' },
  Button: { props: ['label', 'disabled'], template: '<button :disabled="disabled">{{ label }}</button>' },
  Textarea: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  Message: { template: '<div><slot /></div>' },
  DatePicker: { template: '<input />' },
}

describe('окно управления приостановкой AI', () => {
  it('по умолчанию предлагает один час и отправляет одну команду с сохранённым ключом', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    const wrapper = mount(ConversationAISuspensionDialog, {
      props: {
        visible: true,
        mode: 'START',
        conversationLabel: 'Первый депозит · conv_1',
        current: null,
        serverOffsetMs: 0,
        busy: false,
        error: null,
      },
      global: { stubs },
    })
    await wrapper.get('select[name="reason"]').setValue('OPERATOR_TAKEOVER')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]).toEqual([{
      key: '11111111-1111-4111-8111-111111111111',
      command: { durationSeconds: 3600, reason: 'OPERATOR_TAKEOVER' },
    }])
    expect(wrapper.text()).toContain('Пользователь сможет писать сюда и общаться с AI в других диалогах')
  })

  it('не отправляет причину «другое» без пояснения', async () => {
    const wrapper = mount(ConversationAISuspensionDialog, {
      props: { visible: true, mode: 'START', conversationLabel: 'Диалог', current: null, serverOffsetMs: 0, busy: false, error: null },
      global: { stubs },
    })
    await wrapper.get('select[name="reason"]').setValue('OTHER')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Поясните причину')
  })

  it('не отправляет возобновление без подтверждённой версии состояния', async () => {
    const wrapper = mount(ConversationAISuspensionDialog, {
      props: { visible: true, mode: 'RESUME', conversationLabel: 'Диалог', current: null, serverOffsetMs: 0, busy: false, error: null },
      global: { stubs },
    })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Не удалось определить текущее состояние')
  })

  it('повторяет неизвестный запрос с тем же ключом, а изменённый запрос получает новый', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    const wrapper = mount(ConversationAISuspensionDialog, {
      props: { visible: true, mode: 'START', conversationLabel: 'Диалог', current: null, serverOffsetMs: 0, busy: false, error: null },
      global: { stubs },
    })
    await wrapper.get('select[name="reason"]').setValue('OPERATOR_TAKEOVER')
    await wrapper.get('form').trigger('submit')
    await wrapper.setProps({ error: { kind: 'NETWORK', message: 'Нет связи' } })
    await wrapper.get('form').trigger('submit')
    await wrapper.findAll('input[name="duration"]')[0]!.setValue()
    await wrapper.get('form').trigger('submit')

    const submissions = wrapper.emitted('submit') as Array<[{ key: string }]> | undefined
    expect(submissions?.map(([value]) => value.key)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ])
  })
})
