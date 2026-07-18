import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScenarioRuleBuilder } from '@/features/scenario-rules/ui'
import type { RuleDraft } from '@/features/scenario-rules/model'
import RuleValidationPreview from '@/features/scenario-publishing/ui/RuleValidationPreview.vue'
import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'
import ScenarioEditorPage from './ScenarioEditorPage.vue'

const mocks = vi.hoisted(() => ({
  route: { params: { scenarioId: 'scenario-1' } } as { params: { scenarioId: string } },
  push: vi.fn(),
  getScenarios: vi.fn(),
  getEvents: vi.fn(),
  getElements: vi.fn(),
  saveScenario: vi.fn(),
  getContract: vi.fn(),
  ensureLoaded: vi.fn(),
  guardDirty: null as { value: boolean } | null,
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({ project: { id: 'project-1' } }),
}))

vi.mock('@/features/actions/action-definitions.store', () => ({
  useActionDefinitionsStore: () => ({ forProject: () => [], ensureLoaded: mocks.ensureLoaded }),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    getScenarios: mocks.getScenarios,
    getEvents: mocks.getEvents,
    getElements: mocks.getElements,
    saveScenario: mocks.saveScenario,
  },
}))

vi.mock('@/shared/api/repository/scenario-authoring', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api/repository/scenario-authoring')>()
  return { ...original, scenarioAuthoringRepository: { getContract: mocks.getContract } }
})

vi.mock('@/shared/lib/use-unsaved-changes-guard', () => ({
  useUnsavedChangesGuard: (dirty: { value: boolean }) => {
    mocks.guardDirty = dirty
    return { confirmDiscard: () => true }
  },
}))

vi.mock('@/features/scenarios/model/scenario-graph', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/scenarios/model/scenario-graph')>(),
  validateScenarioGraph: () => [],
}))

const event = {
  id: 'event-revision-1', projectId: 'project-1', code: 'page.opened', name: 'Открыта страница',
  version: 1, payloadSchema: { type: 'object' }, clientIngestible: true, countsAsActivity: true, enabled: true,
}

const scenario = {
  id: 'scenario-1', projectId: 'project-1', code: 'welcome', name: 'Welcome', eventDefinitionId: event.id,
  status: 'DRAFT', conversationPolicy: 'create_new', priority: 0, conditions: [], actions: [],
}

const contract: ScenarioAuthoringContract = {
  projectId: 'project-1', revision: 'catalog-1', version: 1,
  events: [{
    code: event.code, definitionId: event.id, definitionKeyId: 'event-key-1', name: event.name, schemaVersion: 1,
    fields: [], aggregateMeasures: [],
  }],
}

function mountPage() {
  return shallowMount(ScenarioEditorPage, {
    global: {
      stubs: {
        VueFlow: { template: '<div><slot /></div>' },
        Background: true,
        Controls: true,
        Message: { template: '<div class="message-stub"><slot /></div>' },
      },
    },
  })
}

function stageButton(wrapper: ReturnType<typeof mountPage>, label: string) {
  return wrapper.findAll('.studio-stages button').find((button) => button.find('strong').text() === label)!
}

describe('ScenarioEditorPage V2 rule journey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route.params.scenarioId = 'scenario-1'
    mocks.getScenarios.mockResolvedValue([scenario])
    mocks.getEvents.mockResolvedValue([event])
    mocks.getElements.mockResolvedValue([])
    mocks.ensureLoaded.mockResolvedValue([])
    mocks.getContract.mockResolvedValue(contract)
    mocks.saveScenario.mockResolvedValue(scenario)
  })

  it('keeps Trigger, Audience, Eligibility, Actions and Delivery as explicit stages', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('.studio-stages button strong').map((item) => item.text())).toEqual([
      'Запуск',
      'Аудитория',
      'Условия',
      'Действия',
      'Доставка',
    ])
    expect(wrapper.text()).toContain('Событие запуска')

    await stageButton(wrapper, 'Аудитория').trigger('click')
    expect(wrapper.text()).toContain('BE-FE-05/06')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('opens the Rule Builder only for the exact catalog Event revision', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await stageButton(wrapper, 'Условия').trigger('click')

    const builder = wrapper.getComponent(ScenarioRuleBuilder)
    const preview = wrapper.getComponent(RuleValidationPreview)
    expect(builder.props('context')).toMatchObject({ triggerEventDefinitionId: 'event-revision-1', triggerEventCode: 'page.opened', contract: { revision: 'catalog-1' } })
    expect(preview.props()).toMatchObject({ projectId: 'project-1', draftRevision: 0 })
  })

  it('counts a changed Rule draft in the page dirty guard and never loses it after legacy save', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await stageButton(wrapper, 'Условия').trigger('click')
    const nextDraft: RuleDraft = {
      version: 1,
      root: { nodeId: 'root', kind: 'all', children: [{ nodeId: 'streak', kind: 'activityDayStreak', compare: { operator: 'gte', value: 2 } }] },
    }
    wrapper.getComponent(ScenarioRuleBuilder).vm.$emit('update:modelValue', nextDraft)
    await wrapper.vm.$nextTick()

    expect(mocks.guardDirty?.value).toBe(true)
    expect(wrapper.getComponent(RuleValidationPreview).props('draftRevision')).toBe(1)
    await wrapper.find('button-stub[label="Сохранить"]').trigger('click')
    await flushPromises()

    expect(mocks.saveScenario).toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalledWith('/scenarios')
    expect(wrapper.text()).toContain('Условия V2 остаются в этой вкладке')
  })

  it('protects unsaved edits inside the condition drawer before changing stages', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await stageButton(wrapper, 'Условия').trigger('click')
    wrapper.getComponent(ScenarioRuleBuilder).vm.$emit('editing-dirty', true)
    await wrapper.vm.$nextTick()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await stageButton(wrapper, 'Аудитория').trigger('click')

    expect(confirm).toHaveBeenCalledWith('В условии есть несохранённые изменения. Закрыть его и перейти к другому этапу?')
    expect(stageButton(wrapper, 'Условия').classes()).toContain('active')
    expect(mocks.guardDirty?.value).toBe(true)
    confirm.mockRestore()
  })

  it('keeps the legacy editor usable when the authoring catalog is temporarily unavailable', async () => {
    mocks.getContract.mockRejectedValue(new Error('catalog offline'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('Welcome')
    await stageButton(wrapper, 'Условия').trigger('click')
    expect(wrapper.text()).toContain('Не удалось загрузить каталог условий')
    expect(wrapper.findComponent(ScenarioRuleBuilder).exists()).toBe(false)
  })

  it('keeps Trigger and Eligibility usable when the Actions catalog is incompatible', async () => {
    mocks.ensureLoaded.mockRejectedValue(new Error('unsupported action uiSchema'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('Событие запуска')
    await stageButton(wrapper, 'Условия').trigger('click')
    expect(wrapper.findComponent(ScenarioRuleBuilder).exists()).toBe(true)

    await stageButton(wrapper, 'Действия').trigger('click')
    expect(wrapper.text()).toContain('Не удалось загрузить каталог действий')
  })
})
