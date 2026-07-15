import { reactive } from 'vue'
import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScenarioEditorDrawer from './ScenarioEditorDrawer.vue'
import type { Scenario, ScenarioActionDefinition } from '@/shared/types/domain'

describe('ScenarioEditorDrawer', () => {
  const actionDefinitions: ScenarioActionDefinition[] = [{
    id: 'definition-1',
    projectId: 'project-1',
    type: 'SAY',
    name: 'Сказать текст',
    description: 'Добавляет сообщение Lola в чат.',
    executor: 'SERVER',
    serverHandler: 'SAY',
    commandType: null,
    configSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1 } }, required: ['text'] },
    uiSchema: { fields: [{ key: 'text', label: 'Сообщение', control: 'textarea' }] },
    enabled: true,
    builtIn: true,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  }]

  const scenario = () => reactive<Scenario>({
    id: 'scenario-1',
    projectId: 'project-1',
    code: 'successful_deposit',
    name: 'Поздравление после депозита',
    status: 'ACTIVE',
    conversationPolicy: 'create_new',
    eventDefinitionId: 'event-1',
    priority: 100,
    conditions: [{ path: 'event.payload.amount', operator: 'gt', value: 0 }],
    actions: [{
      id: 'action-1',
      position: 0,
      type: 'SAY',
      config: { text: 'Поздравляем!' },
    }],
  })

  it('opens an existing reactive scenario without cloning Vue proxies', () => {
    expect(() => shallowMount(ScenarioEditorDrawer, {
      props: {
        visible: true,
        scenario: scenario(),
        events: [],
        elements: [],
        actionDefinitions,
      },
    })).not.toThrow()
  })

  it('submits reactive actions as plain payload data', () => {
    const wrapper = shallowMount(ScenarioEditorDrawer, {
      props: {
        visible: true,
        scenario: scenario(),
        events: [],
        elements: [],
        actionDefinitions,
      },
    })

    expect(() => (wrapper.vm as unknown as { submit: () => void }).submit()).not.toThrow()
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('blocks submit while a JSON action field contains an invalid draft', async () => {
    const jsonDefinition: ScenarioActionDefinition = {
      ...actionDefinitions[0],
      id: 'definition-json',
      type: 'TRACK',
      name: 'Записать событие',
      configSchema: { type: 'object', properties: { payload: { type: 'object' } }, required: [] },
      uiSchema: { fields: [{ key: 'payload', label: 'Payload', control: 'json' }] },
    }
    const trackScenario = scenario()
    trackScenario.actions = [{ id: 'action-json', position: 0, type: 'TRACK', config: { payload: {} } }]
    const wrapper = shallowMount(ScenarioEditorDrawer, {
      props: { visible: true, scenario: trackScenario, events: [], elements: [], actionDefinitions: [jsonDefinition] },
    })

    const editor = wrapper.vm as unknown as {
      setActionConfigValidity: (action: Scenario['actions'][number], valid: boolean) => void
      submit: () => void
    }
    editor.setActionConfigValidity(trackScenario.actions[0], false)
    editor.submit()

    expect(wrapper.emitted('save')).toBeUndefined()
  })
})
