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
  it('keeps viewport navigation available independently from layout mode', () => {
    const wrapper = shallowMount(ScenarioFlowControls, {
      global: {
        stubs: {
          Panel: { template: '<div><slot /></div>' },
        },
      },
    })

    wrapper.get('[aria-label="Увеличить схему"]')
    wrapper.get('[aria-label="Уменьшить схему"]')
    wrapper.get('[aria-label="Показать всю схему"]')
    expect(wrapper.find('.scenario-auto-layout').exists()).toBe(false)
  })
})
