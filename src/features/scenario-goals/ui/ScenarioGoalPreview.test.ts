import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScenarioGoalPreview from './ScenarioGoalPreview.vue'
import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

const mocks = vi.hoisted(() => ({ eventLogs: vi.fn(), preview: vi.fn() }))
vi.mock('@/shared/api/repository', () => ({ repository: { getEventLogPage: mocks.eventLogs } }))
vi.mock('@/shared/api/repository/scenario-authoring', () => ({ scenarioAuthoringRepository: { previewGoal: mocks.preview } }))

const contract = {
  revision: 'catalog-7',
  events: [{ code: 'deposit.succeeded', label: 'Deposit', definitionId: 'event-1', aggregateMeasures: ['count'], fields: [] }],
  userFields: [],
} as unknown as ScenarioAuthoringContract
const config = {
  goal: { version: 1, eventCode: 'deposit.succeeded', measure: 'count', filters: [], compare: { operator: 'gte', value: '2' } },
  timeoutMs: 86_400_000,
  onGoal: 'success',
  onTimeout: 'timeout',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('ScenarioGoalPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eventLogs.mockResolvedValue({
      items: [{ id: 'log-1', eventCode: 'session.started', userExternalId: 'customer-1', receivedAt: '2026-07-18T10:00:00Z' }],
      nextCursor: null,
    })
    mocks.preview.mockResolvedValue({
      valid: true, matched: false, matchedCount: '1', issues: [],
      actual: { visibility: 'REDACTED', value: 'secret-value-must-not-render' },
      dependency: { definitionKeyId: 'event-key-1', eventDefinitionRevisionId: 'event-revision-4', eventCode: 'deposit.succeeded', schemaVersion: 4 },
      window: { from: '2026-07-18T10:00:00Z', to: '2026-07-19T10:00:00Z', deadlineAt: '2026-07-19T10:00:00Z', deadlineReached: false },
    })
  })

  it('previews a typed goal against an Event Log and never renders a redacted actual value', async () => {
    const wrapper = shallowMount(ScenarioGoalPreview, { props: { projectId: 'project-1', config, contract } })
    await flushPromises()
    await wrapper.find('button-stub[label="Проверить цель"]').trigger('click')
    await flushPromises()

    expect(mocks.preview).toHaveBeenCalledWith('project-1', {
      goal: config.goal,
      timeoutMs: 86_400_000,
      scope: { kind: 'eventLog', eventLogId: 'log-1' },
    })
    expect(wrapper.text()).toContain('Данные скрыты политикой доступа')
    expect(wrapper.text()).not.toContain('secret-value-must-not-render')
    expect(wrapper.text()).toContain('event-revision-4')
    expect(wrapper.text()).toContain('схема v4')
  })

  it('ignores a stale preview response after the goal configuration changes', async () => {
    const pending = deferred<Awaited<ReturnType<typeof mocks.preview>>>()
    mocks.preview.mockReturnValueOnce(pending.promise)
    const wrapper = shallowMount(ScenarioGoalPreview, { props: { projectId: 'project-1', config, contract } })
    await flushPromises()
    await wrapper.find('button-stub[label="Проверить цель"]').trigger('click')
    await wrapper.setProps({ config: { ...config, timeoutMs: 172_800_000 } })

    pending.resolve({
      valid: true, matched: true, matchedCount: 'stale-count', issues: [],
      actual: { visibility: 'VISIBLE', value: 'stale-value' },
      dependency: null,
      window: null,
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('stale-count')
    expect(wrapper.text()).not.toContain('stale-value')
  })
})
