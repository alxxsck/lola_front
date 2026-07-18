import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RuleDomainContext, RuleDraft } from '@/features/scenario-rules/model'
import type { AudienceDomainContext, AudienceDraft } from '@/features/scenario-audience/model'
import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

import ScenarioPublishPanel from './ScenarioPublishPanel.vue'

const mocks = vi.hoisted(() => ({ publishScenario: vi.fn(), validateScenarioDraft: vi.fn() }))
vi.mock('@/shared/api/repository/scenario-authoring', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/shared/api/repository/scenario-authoring')>(),
  scenarioAuthoringRepository: { publishScenario: mocks.publishScenario, validateScenarioDraft: mocks.validateScenarioDraft },
}))

const contract: ScenarioAuthoringContract = {
  projectId: 'project-1', revision: 'catalog-42', version: 1,
  events: [{ code: 'page.opened', definitionId: 'event-1', definitionKeyId: 'event-key', name: 'Открыта страница', schemaVersion: 1, fields: [], aggregateMeasures: [] }],
}
const context: RuleDomainContext = { triggerEventDefinitionId: 'event-1', triggerEventCode: 'page.opened', mode: 'initialEligibility', contract }
const draft: RuleDraft = { version: 1, root: { nodeId: 'root', kind: 'activityDayStreak', compare: { operator: 'gte', value: 2 } } }
const audienceDraft: AudienceDraft = { version: 1, root: { nodeId: 'audience-root', kind: 'locale', operator: 'eq', value: 'ru-RU' } }
const audienceContext: AudienceDomainContext = {
  segments: [],
  catalog: {
    version: 1, revision: 'audience-catalog-9', locales: [{ code: 'ru-RU', language: 'ru', label: 'Русский' }],
    localeSource: { operators: ['eq'], control: 'SELECT', authoringAvailability: 'AVAILABLE' }, languageSource: { operators: ['eq'], control: 'SELECT', authoringAvailability: 'AVAILABLE' },
    country: { source: 'profile.country', valueType: 'countryCode', semantics: 'ISO_3166_1_ALPHA_2_UPPERCASE', operators: ['eq'], control: 'COUNTRY_CODE', authoringAvailability: 'AVAILABLE' },
    attributes: [], segmentSource: { operators: ['is_member'], searchEndpoint: '/segments', control: 'SEARCH', authoringAvailability: 'AVAILABLE' },
    snapshotPolicy: { initialEvaluation: 'RUN_START', missingOrNull: 'NO_MATCH_EXCEPT_NOT_EXISTS', deletedDefinition: 'PINNED_SNAPSHOT_CONTINUES', unavailableSource: 'PUBLISH_REJECTED_EXPLAIN_UNAVAILABLE', segmentRevision: 'PINNED_REVISION', persistence: 'SNAPSHOT_WITH_SEPARATE_LAST_RECHECK', recheckTrigger: 'DELIVERY_RECHECK_ELIGIBILITY' },
  },
}
const response = {
  revision: { id: 'revision-1', scenarioId: 'scenario-1', revisionNumber: 1, catalogRevision: 'catalog-42', contentHash: 'hash-1', publishedAt: '2026-07-18T10:00:00.000Z', triggerEventDefinitionRevisionId: 'event-1' },
  dependencies: { actionTypes: ['SAY'], conditionPaths: [], eventDefinitionRevisionIds: ['event-1'] },
  cost: { class: 'LOW', leaves: 1, aggregateLeaves: 0, historyWindowDays: 0 }, warnings: [],
  deliveryPolicy: { kind: 'IMMEDIATE' }, conflictMetadata: { currentRevisionId: 'revision-1', expectedCurrentRevisionId: null },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('ScenarioPublishPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.publishScenario.mockResolvedValue(response)
    mocks.validateScenarioDraft.mockResolvedValue({
      valid: true, issues: [],
      dependencies: [{ eventCode: 'page.opened', definitionKeyId: 'event-key', eventDefinitionRevisionId: 'event-1', schemaVersion: 1 }],
      cost: { class: 'LOW', leaves: 1, aggregateLeaves: 1, historyWindowDays: 2 },
      warnings: [{ code: 'HISTORY_WINDOW_NOTICE' }],
    })
  })

  it('publishes the reviewed session draft atomically and explains the immutable revision', async () => {
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })

    await flushPromises()
    expect(wrapper.text()).toContain('LOW')
    expect(wrapper.text()).toContain('page.opened · схема v1')
    expect(wrapper.text()).toContain('HISTORY_WINDOW_NOTICE')
    await wrapper.get('button[aria-label="Опубликовать immutable revision"]').trigger('click')
    await flushPromises()

    expect(mocks.publishScenario).toHaveBeenCalledWith('project-1', 'scenario-1', {
      catalogRevision: 'catalog-42', expectedCurrentRevisionId: null, deliveryPolicy: { kind: 'IMMEDIATE' },
      expectedDraftVersion: 1, rule: { version: 1, root: { kind: 'activityDayStreak', compare: { operator: 'gte', value: 2 } } },
    })
    expect(wrapper.text()).toContain('Неизменяемая версия №1 опубликована')
    expect(wrapper.text()).toContain('Новые запуски')
    expect(wrapper.emitted('published')?.at(-1)).toEqual(['revision-1', {
      ruleSnapshot: JSON.stringify(draft), deliverySnapshot: JSON.stringify({ kind: 'IMMEDIATE' }), authoringSnapshot: '',
    }])
    expect(wrapper.emitted('publishing')).toEqual([[true], [false]])
  })

  it('serializes reactive action configs before the backend draft review', async () => {
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context,
      actions: [{ position: 0, nodeKey: 'step_1', nextNodeKey: null, type: 'SHOW_ASSISTANT', config: { visible: true } }],
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })
    await flushPromises()

    expect(mocks.validateScenarioDraft).toHaveBeenCalledWith('project-1', 'scenario-1', expect.objectContaining({
      graph: { actions: [{ position: 0, nodeKey: 'step_1', nextNodeKey: null, type: 'SHOW_ASSISTANT', config: { visible: true } }] },
    }))
    expect(wrapper.get('button[aria-label="Опубликовать immutable revision"]').attributes()).not.toHaveProperty('disabled')
  })

  it('reviews and publishes Audience as a separate pinned contract', async () => {
    mocks.validateScenarioDraft.mockResolvedValue({
      valid: true, issues: [], dependencies: [], cost: null, warnings: [],
      audience: { valid: true, issues: [], dependencies: { attributeRevisionIds: ['attribute-revision-1'], segmentRevisionIds: ['segment-revision-2'] }, cost: { leaves: 1, segmentLeaves: 1 }, warnings: [] },
    })
    mocks.publishScenario.mockResolvedValue({
      ...response,
      dependencies: { ...response.dependencies, userAttributeRevisionIds: ['attribute-revision-1'], segmentRevisionIds: ['segment-revision-2'] },
      audienceCost: { leaves: 1, segmentLeaves: 1 }, audiencePolicy: audienceContext.catalog.snapshotPolicy,
    })
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context, audienceDraft, audienceContext,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })
    await flushPromises()
    expect(mocks.validateScenarioDraft).toHaveBeenCalledWith('project-1', 'scenario-1', expect.objectContaining({ audience: { version: 1, root: { kind: 'locale', operator: 'eq', value: 'ru-RU' } } }))
    expect(wrapper.text()).toContain('Зависимости аудитории')
    expect(wrapper.text()).toContain('1 атрибутов · 1 сегментов')

    await wrapper.get('button[aria-label="Опубликовать immutable revision"]').trigger('click')
    await flushPromises()
    expect(mocks.publishScenario).toHaveBeenCalledWith('project-1', 'scenario-1', expect.objectContaining({
      audience: { version: 1, root: { kind: 'locale', operator: 'eq', value: 'ru-RU' } },
    }))
    expect(wrapper.text()).toContain('Снимок аудитории')
  })

  it('shows Audience validation issues and warnings in the publish review', async () => {
    mocks.validateScenarioDraft.mockResolvedValue({
      valid: false, issues: [], dependencies: [], cost: null, warnings: [],
      audience: {
        valid: false,
        issues: [{ code: 'AUDIENCE_VALUE_INVALID', path: 'root.value', message: 'Выберите допустимый locale' }],
        dependencies: { attributeRevisionIds: [], segmentRevisionIds: [] },
        cost: null,
        warnings: [{ code: 'AUDIENCE_SOURCE_DEPRECATED' }],
      },
    })
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context, audienceDraft, audienceContext,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })
    await flushPromises()

    expect(wrapper.text()).toContain('Выберите допустимый locale')
    expect(wrapper.text()).toContain('AUDIENCE_SOURCE_DEPRECATED')
    await wrapper.get('.validation-issue').trigger('click')
    expect(wrapper.emitted('focus-issue')).toEqual([[{
      code: 'AUDIENCE_VALUE_INVALID', path: 'audience.root.value', message: 'Выберите допустимый locale',
    }]])
    expect(wrapper.get('button[aria-label="Опубликовать immutable revision"]').attributes()).toHaveProperty('disabled')
  })

  it('keeps technical identifiers compact in the operator review', () => {
    const longRevision = '8fe4fdb384716110172abb467f2dff7831452e13150d891a7ab84f69e96df323'
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft,
      context: { ...context, contract: { ...contract, revision: longRevision } },
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })

    expect(wrapper.text()).toContain('каталог 8fe4fdb3…f323')
    expect(wrapper.text()).not.toContain(longRevision)
  })

  it('refreshes a stale catalog without losing the draft or publishing automatically', async () => {
    const stale = new (await import('@/shared/api/http/api-error')).ApiError(409, 'Catalog stale', { currentCatalogRevision: 'catalog-43' }, undefined, 'CATALOG_REVISION_STALE')
    mocks.publishScenario.mockRejectedValueOnce(stale)
    const refreshed = { ...contract, revision: 'catalog-43' }
    const refreshCatalog = vi.fn().mockResolvedValue(refreshed)
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog,
    } })
    await flushPromises()

    await wrapper.get('button[aria-label="Опубликовать immutable revision"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Каталог условий изменился')

    await wrapper.get('button[aria-label="Обновить каталог"]').trigger('click')
    await flushPromises()

    expect(refreshCatalog).toHaveBeenCalledTimes(1)
    expect(mocks.publishScenario).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('каталог catalog-43')
    expect(wrapper.text()).toContain('снова сохраните черновик')
    expect(wrapper.emitted('resave-required')).toEqual([[]])
    expect(wrapper.get('button[aria-label="Опубликовать immutable revision"]').attributes()).toHaveProperty('disabled')
  })

  it('does not overwrite an unknown concurrent head automatically', async () => {
    const conflict = new (await import('@/shared/api/http/api-error')).ApiError(409, 'Head changed', { currentRevisionId: 'revision-2' }, undefined, 'SCENARIO_REVISION_CONFLICT')
    mocks.publishScenario.mockRejectedValueOnce(conflict)
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: 'revision-1', expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })
    await flushPromises()

    await wrapper.get('button[aria-label="Опубликовать immutable revision"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Автоматическое объединение недоступно')
    expect(mocks.publishScenario).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button[aria-label="Опубликовать immutable revision"]').attributes()).toHaveProperty('disabled')
  })

  it('ignores an outdated successful review after the draft becomes locally invalid', async () => {
    let resolveReview!: (value: Awaited<ReturnType<typeof mocks.validateScenarioDraft>>) => void
    mocks.validateScenarioDraft.mockImplementationOnce(() => new Promise((resolve) => { resolveReview = resolve }))
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })
    await flushPromises()

    await wrapper.setProps({ draft: { version: 1, root: { nodeId: 'broken-root', kind: 'incomplete', leaf: { kind: 'eventField' } } } })
    await flushPromises()
    resolveReview({
      valid: true, issues: [], dependencies: [],
      cost: { class: 'LOW', leaves: 1, aggregateLeaves: 0, historyWindowDays: 0 }, warnings: [],
    })
    await flushPromises()

    expect(wrapper.get('button[aria-label="Опубликовать immutable revision"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.text()).not.toContain('СтоимостьLOW')
  })

  it('keeps edits made during publish dirty and makes them publishable again', async () => {
    const pending = deferred<typeof response>()
    mocks.publishScenario.mockReturnValueOnce(pending.promise)
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })
    await flushPromises()

    await wrapper.get('button[aria-label="Опубликовать immutable revision"]').trigger('click')
    await flushPromises()
    await wrapper.setProps({ deliveryPolicy: { kind: 'SKIP_IF_OFFLINE' } })
    await flushPromises()
    pending.resolve(response)
    await flushPromises()

    expect(wrapper.emitted('published')?.at(-1)).toEqual(['revision-1', {
      ruleSnapshot: JSON.stringify(draft),
      deliverySnapshot: JSON.stringify({ kind: 'IMMEDIATE' }),
      authoringSnapshot: '',
    }])
    expect(wrapper.get('button[aria-label="Опубликовать immutable revision"]').attributes()).not.toHaveProperty('disabled')
  })

  it('rechecks the document gate after the asynchronous backend review', async () => {
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })
    await flushPromises()
    const pendingReview = deferred<Awaited<ReturnType<typeof mocks.validateScenarioDraft>>>()
    mocks.validateScenarioDraft.mockReturnValueOnce(pendingReview.promise)

    await wrapper.get('button[aria-label="Опубликовать immutable revision"]').trigger('click')
    await wrapper.setProps({ blockedReason: 'Graph изменился' })
    pendingReview.resolve({ valid: true, issues: [], dependencies: [], cost: null, warnings: [] })
    await flushPromises()

    expect(mocks.publishScenario).not.toHaveBeenCalled()
  })

  it('omits an optional empty eligibility rule from validation and publication', async () => {
    const emptyDraft: RuleDraft = { version: 1, root: { nodeId: 'empty', kind: 'empty' } }
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft: emptyDraft, context,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })
    await flushPromises()

    expect(mocks.validateScenarioDraft.mock.calls.at(-1)?.[2]).not.toHaveProperty('rule')
    await wrapper.get('button[aria-label="Опубликовать immutable revision"]').trigger('click')
    await flushPromises()
    expect(mocks.publishScenario.mock.calls.at(-1)?.[2]).not.toHaveProperty('rule')
  })

  it('emits the exact server issue so the editor can focus the failing stage', async () => {
    const issue = { code: 'DELIVERY_POLICY_INVALID', path: 'deliveryPolicy.expiryMs', message: 'Срок доставки недопустим' }
    mocks.validateScenarioDraft.mockResolvedValueOnce({ valid: false, issues: [issue], dependencies: [], cost: null, warnings: [] })
    const wrapper = mount(ScenarioPublishPanel, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', draft, context,
      deliveryPolicy: { kind: 'IMMEDIATE' }, expectedCurrentRevisionId: null, expectedDraftVersion: 1, refreshCatalog: vi.fn(),
    } })
    await flushPromises()

    await wrapper.get('.validation-issue').trigger('click')
    expect(wrapper.emitted('focus-issue')).toEqual([[issue]])
    expect(wrapper.text()).toContain('DELIVERY_POLICY_INVALID · deliveryPolicy.expiryMs')
  })
})
