import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Scenario } from '@/shared/types/domain'

import ScenariosPage from './ScenariosPage.vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn(), getScenarios: vi.fn(), getEvents: vi.fn(), saveScenario: vi.fn(),
  ensureLoaded: vi.fn(), toast: vi.fn(), actionDefinitionsCapability: true, permissions: [
    'project.scenarios.read', 'project.scenarios.write', 'project.scenarios.publish',
    'project.event_catalog.read', 'project.actions.read',
  ] as string[],
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('@/features/auth/auth.store', () => ({ useAuthStore: () => ({ project: { id: 'project-1', get effectivePermissionCodes() { return mocks.permissions } } }) }))
vi.mock('@/features/actions/action-definitions.store', () => ({
  useActionDefinitionsStore: () => ({ forProject: () => [], ensureLoaded: mocks.ensureLoaded }),
}))
vi.mock('@/shared/api/repository', () => ({ repository: {
  capabilities: { get actionDefinitions() { return mocks.actionDefinitionsCapability } },
  getScenarios: mocks.getScenarios, getEvents: mocks.getEvents, saveScenario: mocks.saveScenario,
} }))

const scenario = {
  id: 'scenario-1', projectId: 'project-1', name: 'Welcome', code: 'welcome', description: '',
  eventDefinitionId: 'event-1', status: 'DRAFT', conversationPolicy: 'create_new', priority: 0,
  conditions: [], actions: [], updatedAt: '2026-07-20T10:00:00.000Z',
} as Scenario

describe('ScenariosPage V2 activation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = [
      'project.scenarios.read', 'project.scenarios.write', 'project.scenarios.publish',
      'project.event_catalog.read', 'project.actions.read',
    ]
    mocks.actionDefinitionsCapability = true
    mocks.getScenarios.mockResolvedValue([scenario])
    mocks.getEvents.mockResolvedValue([])
    mocks.ensureLoaded.mockResolvedValue([])
    mocks.saveScenario.mockImplementation(async (_projectId, payload) => ({ ...scenario, ...payload }))
  })

  it('routes inactive scenarios to Studio instead of activating through legacy save', async () => {
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    await (wrapper.vm as unknown as { toggleScenario: (value: Scenario) => Promise<void> }).toggleScenario(scenario)

    expect(mocks.saveScenario).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith({ name: 'scenario-edit', params: { scenarioId: 'scenario-1' } })
  })

  it('still allows an active scenario to be paused', async () => {
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    await (wrapper.vm as unknown as { toggleScenario: (value: Scenario) => Promise<void> }).toggleScenario({ ...scenario, status: 'ACTIVE' })

    expect(mocks.saveScenario).toHaveBeenCalledWith('project-1', expect.objectContaining({ status: 'PAUSED' }))
  })

  it('loads only the scenario collection for a scenarios-only reader and hides mutations', async () => {
    mocks.permissions = ['project.scenarios.read']
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    expect(mocks.getScenarios).toHaveBeenCalledWith('project-1')
    expect(mocks.getEvents).not.toHaveBeenCalled()
    expect(mocks.ensureLoaded).not.toHaveBeenCalled()
    expect(wrapper.find('button-stub[label="Создать сценарий"]').exists()).toBe(false)
    expect(wrapper.find('button-stub[aria-label="Удалить"]').exists()).toBe(false)

    await (wrapper.vm as unknown as { toggleScenario: (value: Scenario) => Promise<void> })
      .toggleScenario({ ...scenario, status: 'ACTIVE' })
    expect(mocks.saveScenario).not.toHaveBeenCalled()
  })

  it('keeps scenarios visible when the API repository has no action definitions capability', async () => {
    mocks.actionDefinitionsCapability = false
    mocks.ensureLoaded.mockRejectedValue(new Error('Backend capability "actionDefinitions" is not available'))
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    expect(mocks.ensureLoaded).not.toHaveBeenCalled()
    expect((wrapper.vm as unknown as { loadError: string }).loadError).toBe('')
    expect(wrapper.text()).toContain('1 из 1')
  })

  it('keeps scenarios visible when the optional action definitions request fails', async () => {
    mocks.ensureLoaded.mockRejectedValue(new Error('Action definitions request failed'))
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    expect(mocks.ensureLoaded).toHaveBeenCalledWith('project-1')
    expect((wrapper.vm as unknown as { loadError: string }).loadError).toBe('')
    expect(wrapper.text()).toContain('1 из 1')
  })

  it('does not enter publication without the separate publish Permission', async () => {
    mocks.permissions = ['project.scenarios.read', 'project.scenarios.write']
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    await (wrapper.vm as unknown as { toggleScenario: (value: Scenario) => Promise<void> })
      .toggleScenario(scenario)

    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.saveScenario).not.toHaveBeenCalled()
  })
})
