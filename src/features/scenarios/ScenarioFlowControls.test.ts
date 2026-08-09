import { shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import ScenarioFlowControls from './ScenarioFlowControls.vue'

vi.mock('@vue-flow/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vue-flow/core')>()),
  useVueFlow: () => ({
    fitView: vi.fn(),
    maxZoom: ref(1.6),
    minZoom: ref(0.25),
    viewport: ref({ x: 0, y: 0, zoom: 1 }),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
  }),
}))

describe('ScenarioFlowControls', () => {
  it('exposes an explicit auto-layout command and its pending state', async () => {
    const wrapper = shallowMount(ScenarioFlowControls, {
      props: { layouting: false, layoutFailed: false },
      global: {
        stubs: {
          Panel: { template: '<div><slot /></div>' },
        },
      },
    })

    const autoLayout = wrapper.get('.scenario-auto-layout')
    expect(autoLayout.attributes('aria-label')).toBe('Перестроить схему автоматически')
    await autoLayout.trigger('click')
    expect(wrapper.emitted('autoLayout')).toHaveLength(1)

    await wrapper.setProps({ layouting: true })
    expect(autoLayout.attributes('disabled')).toBeDefined()
    expect(autoLayout.attributes('aria-label')).toBe('Выполняется автораскладка')
    expect(autoLayout.find('.pi-spinner').exists()).toBe(true)
  })

  it('communicates that the fallback graph is currently shown', () => {
    const wrapper = shallowMount(ScenarioFlowControls, {
      props: { layoutFailed: true },
      global: {
        stubs: {
          Panel: { template: '<div><slot /></div>' },
        },
      },
    })

    const autoLayout = wrapper.get('.scenario-auto-layout')
    expect(autoLayout.classes()).toContain('layout-failed')
    expect(autoLayout.attributes('title')).toContain('резервная схема')
  })
})
