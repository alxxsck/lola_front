import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Scenario } from '@/shared/types/domain'

import ScenariosPage from './ScenariosPage.vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn(), getScenarios: vi.fn(), getEvents: vi.fn(), updateScenarioMetadata: vi.fn(),
  toast: vi.fn(), permissions: [
    'project.scenarios.read', 'project.scenarios.write', 'project.scenarios.publish',
    'project.event_catalog.read',
  ] as string[],
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('@/features/auth/auth.store', () => ({ useAuthStore: () => ({ project: { id: 'project-1', get effectivePermissionCodes() { return mocks.permissions } } }) }))
vi.mock('@/shared/api/repository', () => ({ repository: {
  getScenarios: mocks.getScenarios, getEvents: mocks.getEvents, updateScenarioMetadata: mocks.updateScenarioMetadata,
} }))

const scenario = {
  id: 'scenario-1', projectId: 'project-1', name: 'Welcome', code: 'welcome', description: '',
  eventDefinitionId: 'event-1', status: 'DRAFT', conversationPolicy: 'create_new', priority: 0,
  updatedAt: '2026-07-20T10:00:00.000Z',
} as Scenario

describe('ScenariosPage V2 activation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = [
      'project.scenarios.read', 'project.scenarios.write', 'project.scenarios.publish',
      'project.event_catalog.read',
    ]
    mocks.getScenarios.mockResolvedValue([scenario])
    mocks.getEvents.mockResolvedValue([])
    mocks.updateScenarioMetadata.mockImplementation(async (_projectId, _scenarioId, payload) => ({ ...scenario, ...payload }))
  })

  it('routes inactive scenarios to Studio for atomic publication', async () => {
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    await (wrapper.vm as unknown as { toggleScenario: (value: Scenario) => Promise<void> }).toggleScenario(scenario)

    expect(mocks.updateScenarioMetadata).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith({ name: 'scenario-edit', params: { scenarioId: 'scenario-1' } })
  })

  it('still allows an active scenario to be paused', async () => {
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    await (wrapper.vm as unknown as { toggleScenario: (value: Scenario) => Promise<void> }).toggleScenario({ ...scenario, status: 'ACTIVE' })

    expect(mocks.updateScenarioMetadata).toHaveBeenCalledWith(
      'project-1',
      'scenario-1',
      {
        status: 'PAUSED',
        expectedUpdatedAt: scenario.updatedAt,
        reason: 'Pause scenario from CMS list',
      },
    )
  })

  it('does not present action counts that are absent from the scenario summary contract', async () => {
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    expect(wrapper.find('column-stub[header="Поток"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('действий настроено')
    expect(wrapper.text()).not.toContain('Без действий')
  })

  it('loads only the scenario collection for a scenarios-only reader and hides mutations', async () => {
    mocks.permissions = ['project.scenarios.read']
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    expect(mocks.getScenarios).toHaveBeenCalledWith('project-1')
    expect(mocks.getEvents).not.toHaveBeenCalled()
    expect(wrapper.find('button-stub[label="Создать сценарий"]').exists()).toBe(false)
    expect(wrapper.find('button-stub[aria-label="Удалить"]').exists()).toBe(false)

    await (wrapper.vm as unknown as { toggleScenario: (value: Scenario) => Promise<void> })
      .toggleScenario({ ...scenario, status: 'ACTIVE' })
    expect(mocks.updateScenarioMetadata).not.toHaveBeenCalled()
  })

  it('does not enter publication without the separate publish Permission', async () => {
    mocks.permissions = ['project.scenarios.read', 'project.scenarios.write']
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    await (wrapper.vm as unknown as { toggleScenario: (value: Scenario) => Promise<void> })
      .toggleScenario(scenario)

    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.updateScenarioMetadata).not.toHaveBeenCalled()
  })
})
