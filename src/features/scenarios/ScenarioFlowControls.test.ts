import { shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import ScenarioFlowControls from './ScenarioFlowControls.vue';

const mocks = vi.hoisted(() => ({
  fitView: vi.fn(),
  setCenter: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomTo: vi.fn(),
}));

vi.mock('@vue-flow/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vue-flow/core')>()),
  useVueFlow: () => ({
    findNode: vi.fn((id: string) =>
      id === 'decision'
        ? {
            computedPosition: { x: 400, y: 260 },
            dimensions: { width: 228, height: 120 },
          }
        : undefined,
    ),
    fitView: mocks.fitView,
    maxZoom: ref(1.6),
    minZoom: ref(0.25),
    viewport: ref({ x: 0, y: 0, zoom: 0.82 }),
    setCenter: mocks.setCenter,
    zoomIn: mocks.zoomIn,
    zoomOut: mocks.zoomOut,
    zoomTo: mocks.zoomTo,
  }),
}));

function mountControls(props: Record<string, unknown> = {}) {
  return shallowMount(ScenarioFlowControls, {
    props,
    global: {
      stubs: { Panel: { template: '<div><slot /></div>' } },
    },
  });
}

describe('ScenarioFlowControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('offers named viewport commands without depending on edit or layout mode', async () => {
    const wrapper = mountControls({
      selectedNodeId: 'decision',
      branchNodeIds: ['decision', 'yes', 'no'],
      largeGraph: true,
      minimapVisible: true,
    });

    wrapper.get('[role="group"][aria-label="Масштаб схемы"]');
    wrapper.get('[role="group"][aria-label="Навигация по схеме"]');
    expect(wrapper.get('[aria-label="Скрыть мини-карту"]').attributes()).toMatchObject({
      'aria-controls': 'scenario-graph-minimap',
      'aria-expanded': 'true',
    });
    expect(wrapper.get('[aria-label="Текущий масштаб 82%. Сбросить до 100%"]').text()).toBe('82%');
    await wrapper.get('[aria-label="Текущий масштаб 82%. Сбросить до 100%"]').trigger('click');
    await wrapper.get('[aria-label="Показать всю схему"]').trigger('click');
    await wrapper.get('[aria-label="Показать выбранную ветку"]').trigger('click');
    await wrapper.get('[aria-label="Центрировать выбранное действие"]').trigger('click');
    await wrapper.get('[aria-label="Скрыть мини-карту"]').trigger('click');

    expect(mocks.zoomTo).toHaveBeenCalledWith(1, { duration: 0 });
    expect(mocks.fitView).toHaveBeenNthCalledWith(1, { padding: 0.16, duration: 0 });
    expect(mocks.fitView).toHaveBeenNthCalledWith(2, {
      nodes: ['decision', 'yes', 'no'],
      padding: 0.22,
      duration: 0,
    });
    expect(mocks.setCenter).toHaveBeenCalledWith(514, 320, {
      zoom: 0.82,
      duration: 0,
    });
    expect(wrapper.emitted('toggle-minimap')).toHaveLength(1);
    expect(wrapper.find('.scenario-auto-layout').exists()).toBe(false);
  });

  it('disables selection commands and omits the minimap toggle for a small graph', () => {
    const wrapper = mountControls();

    expect(
      wrapper.get('[aria-label="Показать выбранную ветку"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.get('[aria-label="Центрировать выбранное действие"]').attributes('disabled'),
    ).toBeDefined();
    expect(wrapper.find('[aria-label="Показать мини-карту"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Скрыть мини-карту"]').exists()).toBe(false);
  });
});
