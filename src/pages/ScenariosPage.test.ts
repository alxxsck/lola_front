import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Scenario } from '@/shared/types/domain'

import ScenariosPage from './ScenariosPage.vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn(), getScenarios: vi.fn(), getEvents: vi.fn(), saveScenario: vi.fn(),
  ensureLoaded: vi.fn(), toast: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('@/features/auth/auth.store', () => ({ useAuthStore: () => ({ project: { id: 'project-1' } }) }))
vi.mock('@/features/actions/action-definitions.store', () => ({
  useActionDefinitionsStore: () => ({ forProject: () => [], ensureLoaded: mocks.ensureLoaded }),
}))
vi.mock('@/shared/api/repository', () => ({ repository: {
  getScenarios: mocks.getScenarios, getEvents: mocks.getEvents, saveScenario: mocks.saveScenario,
} }))

const scenario = {
  id: 'scenario-1', projectId: 'project-1', name: 'Welcome', code: 'welcome', description: '',
  eventDefinitionId: 'event-1', status: 'DRAFT', conversationPolicy: 'create_new', priority: 0,
  conditions: [], actions: [],
} as Scenario

describe('ScenariosPage V2 activation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
