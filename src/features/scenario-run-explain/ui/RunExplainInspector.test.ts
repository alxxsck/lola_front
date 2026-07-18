import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RunExplainInspector from './RunExplainInspector.vue'

const mocks = vi.hoisted(() => ({ explainRun: vi.fn() }))
vi.mock('@/shared/api/repository/scenario-authoring', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/shared/api/repository/scenario-authoring')>(),
  scenarioAuthoringRepository: { explainRun: mocks.explainRun },
}))

const response = {
  run: { id: 'run-1', status: 'COMPLETED', startedAt: '2026-07-18T10:00:00.000Z', finishedAt: '2026-07-18T10:03:00.000Z' },
  scenarioRevision: { revisionId: 'revision-7', scenarioId: 'scenario-1', revisionNumber: 7, catalogRevision: 'catalog-42', contentHash: 'hash-7', publishedAt: '2026-07-18T09:00:00.000Z' },
  trigger: { code: 'page.opened', definitionRevisionId: 'event-revision-3', eventLogId: 'event-log-1', occurredAt: '2026-07-18T09:59:58.000Z', receivedAt: '2026-07-18T10:00:00.000Z', schemaVersion: 3, source: 'SERVER' },
  eligibility: { decision: 'MATCHED', fidelity: 'SNAPSHOT', lastRecheck: { decision: 'MATCHED', fidelity: 'TYPED', evaluatedAt: '2026-07-18T10:02:58.000Z' }, root: { kind: 'eventField', matched: true, actual: { visibility: 'REDACTED', value: 'secret' }, expected: { visibility: 'VISIBLE', value: 'promotions' } } },
  audience: {
    decision: 'MATCHED', fidelity: 'SNAPSHOT', evaluatedAt: '2026-07-18T10:00:01.000Z',
    root: { kind: 'all', matched: true, children: [{ kind: 'userAttribute', matched: true, definitionId: 'vip-tier', actual: { visibility: 'REDACTED', value: 'audience-secret' }, expected: { visibility: 'VISIBLE', value: 'gold' } }, { kind: 'segmentMembership', matched: true, segmentId: 'vip', segmentRevisionId: 'segment-revision-4' }] },
    segmentRevisionIds: ['segment-revision-4'], attributeRevisionIds: ['attribute-revision-8'],
    lastRecheck: { decision: 'NOT_MATCHED', evaluatedAt: '2026-07-18T10:02:59.000Z', root: { kind: 'segmentMembership', matched: false, segmentId: 'vip', segmentRevisionId: 'segment-revision-4' } },
  },
  goalResolutions: [{ waitId: 'wait-1', outcome: 'TIMED_OUT', winner: 'DEADLINE', selectedBranch: 'onTimeout', targetNodeKey: 'reminder' }],
  delivery: { policy: { kind: 'IMMEDIATE' }, waits: [] },
  actions: [], continuations: [], timeline: [{ id: 'timeline-1', type: 'GOAL_TIMED_OUT', occurredAt: '2026-07-18T10:03:00.000Z' }],
}

describe('RunExplainInspector', () => {
  beforeEach(() => mocks.explainRun.mockResolvedValue(response))

  it('shows pinned execution facts, redaction and the Goal race winner', async () => {
    const wrapper = mount(RunExplainInspector, { props: { projectId: 'project-1', runId: 'run-1' } })
    await flushPromises()

    expect(mocks.explainRun).toHaveBeenCalledWith('project-1', 'run-1')
    expect(wrapper.text()).toContain('Зафиксированная версия №7')
    expect(wrapper.text()).toContain('Победил Deadline')
    expect(wrapper.text()).toContain('Скрыто: чувствительные данные')
    expect(wrapper.text()).not.toContain('secret')
    expect(wrapper.text()).toContain('Фактический Run')
  })

  it('shows the initial Audience snapshot and delivery recheck as separate decisions', async () => {
    const wrapper = mount(RunExplainInspector, { props: { projectId: 'project-1', runId: 'run-1' } })
    await flushPromises()

    expect(wrapper.text()).toContain('Audience при запуске')
    expect(wrapper.text()).toContain('Сохранённый снимок')
    expect(wrapper.text()).toContain('1 segment revision')
    expect(wrapper.text()).toContain('1 attribute revision')
    expect(wrapper.text()).toContain('segment-revision-4')
    expect(wrapper.text()).toContain('attribute-revision-8')
    expect(wrapper.text()).toContain('Повторная проверка перед доставкой')
    expect(wrapper.text()).toContain('Eligibility recheck')
    expect(wrapper.text()).toContain('Audience recheck')
    expect(wrapper.text()).toContain('Условия не выполнены')
    expect(wrapper.text()).toContain('не изменяет первоначальный снимок')
    expect(wrapper.text()).not.toContain('audience-secret')
  })

  it('renders unavailable Audience as missing evidence, not a mismatch', async () => {
    mocks.explainRun.mockResolvedValueOnce({
      ...response,
      audience: { decision: 'UNAVAILABLE', fidelity: 'UNAVAILABLE', evaluatedAt: null, root: { kind: 'unavailable', matched: false }, segmentRevisionIds: [], attributeRevisionIds: [], lastRecheck: null },
    })
    const wrapper = mount(RunExplainInspector, { props: { projectId: 'project-1', runId: 'run-1' } })
    await flushPromises()

    expect(wrapper.text()).toContain('Audience при запуске')
    expect(wrapper.text()).toContain('Данные недоступны')
    expect(wrapper.text()).not.toContain('Повторная проверка перед доставкой')
  })
})
