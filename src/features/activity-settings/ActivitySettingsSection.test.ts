import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import ActivitySettingsSection from './ActivitySettingsSection.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), toast: vi.fn() }))

vi.mock('@/shared/api/repository', () => ({
  repository: { getActivitySettings: mocks.get, updateActivitySettings: mocks.update },
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: mocks.toast }) }))

const settings = {
  projectVersion: 7,
  timezone: 'Europe/Madrid', visitInactivitySeconds: 1800, reconnectGraceSeconds: 30,
  limits: { visitInactivitySeconds: { min: 60, max: 86400 }, reconnectGraceSeconds: { min: 1, max: 300 } },
  semantics: {
    timezone: 'IANA_TIME_ZONE_FOR_ACTIVITY_DAY' as const,
    visitInactivitySeconds: 'START_NEW_VISIT_AFTER_GAP' as const,
    reconnectGraceSeconds: 'DEFER_OFFLINE_TRANSITION' as const,
  },
}

describe('ActivitySettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(settings)
    mocks.update.mockResolvedValue({ ...settings, projectVersion: 8, timezone: 'UTC', visitInactivitySeconds: 900, reconnectGraceSeconds: 15 })
  })

  it('loads limits and saves the three independent activity semantics', async () => {
    const wrapper = shallowMount(ActivitySettingsSection, { props: { projectId: 'project-1', editable: true } })
    await flushPromises()

    expect(mocks.get).toHaveBeenCalledWith('project-1')
    expect(wrapper.text()).toContain('60–86400')

    wrapper.getComponent(InputText).vm.$emit('update:modelValue', 'UTC')
    const numbers = wrapper.findAllComponents(InputNumber)
    numbers[0]!.vm.$emit('update:modelValue', 900)
    numbers[1]!.vm.$emit('update:modelValue', 15)
    await wrapper.vm.$nextTick()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledWith('project-1', {
      expectedVersion: 7, timezone: 'UTC', visitInactivitySeconds: 900, reconnectGraceSeconds: 15,
    })
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ projectVersion: 8 })
  })
})
