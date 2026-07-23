import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Scenario } from '@/shared/types/domain'

import ScenariosPage from './ScenariosPage.vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn(), getScenarios: vi.fn(), getEvents: vi.fn(), saveScenario: vi.fn(),
  ensureProjectActionsLoaded: vi.fn(), toast: vi.fn(), projectActions: [] as Array<
    import('@/features/project-actions/model/project-action').ProjectAction
  >, permissions: [
    'project.scenarios.read', 'project.scenarios.write', 'project.scenarios.publish',
    'project.event_catalog.read', 'project.actions.read',
  ] as string[],
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('@/features/auth/auth.store', () => ({ useAuthStore: () => ({ project: { id: 'project-1', get effectivePermissionCodes() { return mocks.permissions } } }) }))
vi.mock('@/features/project-actions/model/project-actions.store', () => ({
  useProjectActionsStore: () => ({
    actionsForProject: () => mocks.projectActions,
    ensureLoaded: mocks.ensureProjectActionsLoaded,
  }),
}))
vi.mock('@/shared/api/repository', () => ({ repository: {
  getScenarios: mocks.getScenarios, getEvents: mocks.getEvents, saveScenario: mocks.saveScenario,
} }))

const scenario = {
  id: 'scenario-1', projectId: 'project-1', name: 'Welcome', code: 'welcome', description: '',
  eventDefinitionId: 'event-1', status: 'DRAFT', conversationPolicy: 'create_new', priority: 0,
  conditions: [], actions: [], updatedAt: '2026-07-20T10:00:00.000Z',
} as Scenario

const cachedProjectAction = {
  id: 'action-cached', projectId: 'project-1', actionTypeId: 'type-cached',
  actionTypeRevisionId: 'revision-cached', code: 'CACHED_ACTION',
  nameOverride: 'Секретное имя из старой сессии', descriptionOverride: null,
  scenarioEnabled: true, aiEnabled: false, aiUsageDescription: null,
  configuration: {}, lifecycle: 'ACTIVE', createdAt: 'now', updatedAt: 'now',
  actionType: { key: 'CACHED_ACTION', origin: 'SYSTEM', ownerProjectId: null },
  actionTypeRevision: {
    id: 'revision-cached', version: 1, name: 'Cached', description: 'Cached',
    executorAdapter: 'FRONTEND_COMMAND',
    inputSchema: { type: 'object', properties: {}, required: [] },
    resultSchema: {}, projectConfigSchema: {}, uiSchema: { fields: [] },
    supportedSurfaces: ['SCENARIO'], risk: 'UI_EFFECT',
    confirmationPolicy: 'NEVER', multipleInstances: false,
  },
} as import('@/features/project-actions/model/project-action').ProjectAction

describe('ScenariosPage V2 activation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = [
      'project.scenarios.read', 'project.scenarios.write', 'project.scenarios.publish',
      'project.event_catalog.read', 'project.actions.read',
    ]
    mocks.projectActions = []
    mocks.getScenarios.mockResolvedValue([scenario])
    mocks.getEvents.mockResolvedValue([])
    mocks.ensureProjectActionsLoaded.mockResolvedValue(undefined)
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
    mocks.projectActions = [cachedProjectAction]
    mocks.getScenarios.mockResolvedValue([{
      ...scenario,
      actions: [{ position: 0, type: 'CACHED_ACTION', config: {} }],
    }])
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    expect(mocks.getScenarios).toHaveBeenCalledWith('project-1')
    expect(mocks.getEvents).not.toHaveBeenCalled()
    expect(mocks.ensureProjectActionsLoaded).not.toHaveBeenCalled()
    expect((wrapper.vm as unknown as {
      actionSummary: (actions: Scenario['actions']) => string
    }).actionSummary([{ position: 0, type: 'CACHED_ACTION', config: {} }]))
      .toBe('CACHED_ACTION')
    expect(wrapper.find('button-stub[label="Создать сценарий"]').exists()).toBe(false)
    expect(wrapper.find('button-stub[aria-label="Удалить"]').exists()).toBe(false)

    await (wrapper.vm as unknown as { toggleScenario: (value: Scenario) => Promise<void> })
      .toggleScenario({ ...scenario, status: 'ACTIVE' })
    expect(mocks.saveScenario).not.toHaveBeenCalled()
  })

  it('keeps scenarios visible when the optional Project Actions request fails', async () => {
    mocks.ensureProjectActionsLoaded.mockRejectedValue(new Error('Project Actions request failed'))
    const wrapper = shallowMount(ScenariosPage)
    await flushPromises()

    expect(mocks.ensureProjectActionsLoaded).toHaveBeenCalledWith('project-1')
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
