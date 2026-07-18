import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import {
  scenarioAuthoringCatalog,
  scenarioAuthoringPreview,
  scenarioAuthoringPublishScenario,
  scenarioAuthoringRollbackScenario,
  scenarioAuthoringValidate,
  scenarioRunsExplain,
} from '@/shared/api/generated/lola-backend'
import type {
  ConditionCatalogResponseDto,
  PublishScenarioResponseDto,
  ScenarioRuleDto,
  ScenarioRunExplainResponseDto,
} from '@/shared/api/generated/models'
import { ApiError } from '@/shared/api/http/api-error'

import { scenarioAuthoringRepository } from './index'
import type { ScenarioPublishInput } from './index'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  scenarioAuthoringCatalog: vi.fn(),
  scenarioAuthoringPreview: vi.fn(),
  scenarioAuthoringPublishScenario: vi.fn(),
  scenarioAuthoringRollbackScenario: vi.fn(),
  scenarioAuthoringValidate: vi.fn(),
  scenarioRunsExplain: vi.fn(),
}))

const catalog: ConditionCatalogResponseDto = {
  projectId: 'project-1',
  revision: 'catalog-revision-1',
  version: 1,
  events: [],
}

const rule: ScenarioRuleDto = {
  version: 1,
  root: {
    kind: 'eventField',
    eventCode: 'deposit.succeeded',
    fieldKey: 'deposit.currency',
    operator: 'eq',
    value: 'EUR',
  },
}

const publishDraft: ScenarioPublishInput = {
  catalogRevision: 'catalog-revision-1',
  deliveryPolicy: { kind: 'IMMEDIATE' },
  expectedCurrentRevisionId: null,
  rule,
}

const publishResponse: PublishScenarioResponseDto = {
  conflictMetadata: { currentRevisionId: 'scenario-revision-1', expectedCurrentRevisionId: null },
  cost: { aggregateLeaves: 0, class: 'LOW', historyWindowDays: 0, leaves: 1 },
  deliveryPolicy: { kind: 'IMMEDIATE' },
  dependencies: { actionTypes: [], conditionPaths: [], eventDefinitionRevisionIds: ['event-revision-1'] },
  revision: {
    catalogRevision: 'catalog-revision-1',
    contentHash: 'content-hash-1',
    id: 'scenario-revision-1',
    publishedAt: '2026-07-18T00:00:00.000Z',
    revisionNumber: 1,
    scenarioId: 'scenario-1',
    triggerEventDefinitionRevisionId: 'event-revision-1',
  },
  warnings: [],
}

const explainResponse: ScenarioRunExplainResponseDto = {
  actions: [],
  continuations: [],
  delivery: { policy: { kind: 'IMMEDIATE' }, waits: [] },
  eligibility: { decision: 'MATCHED', fidelity: 'LEGACY', root: { kind: 'legacy', matched: true } },
  goalResolutions: [],
  run: { id: 'run-1', startedAt: '2026-07-18T00:00:00.000Z', status: 'SUCCEEDED' },
  timeline: [],
  trigger: {
    code: 'deposit.succeeded',
    definitionRevisionId: 'event-revision-1',
    eventLogId: 'event-log-1',
    occurredAt: '2026-07-18T00:00:00.000Z',
    receivedAt: '2026-07-18T00:00:00.000Z',
    schemaVersion: 1,
    source: 'SERVER',
  },
}

describe('scenario authoring repository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the generated catalog through the normalized contract adapter', async () => {
    vi.mocked(scenarioAuthoringCatalog).mockResolvedValue(catalog)

    await expect(scenarioAuthoringRepository.getContract('project-1')).resolves.toEqual(catalog)
    expect(scenarioAuthoringCatalog).toHaveBeenCalledWith('project-1')
  })

  it('validates a generated rule DTO', async () => {
    const response = { valid: true, issues: [], dependencies: [], cost: null, warnings: [] }
    vi.mocked(scenarioAuthoringValidate).mockResolvedValue(response)

    await expect(scenarioAuthoringRepository.validateRule('project-1', rule)).resolves.toBe(response)
    expect(scenarioAuthoringValidate).toHaveBeenCalledWith('project-1', { rule })
  })

  it('previews a generated rule against an Event Log scope', async () => {
    const response = { valid: true, matched: true, issues: [], dependencies: [], cost: null, warnings: [] }
    vi.mocked(scenarioAuthoringPreview).mockResolvedValue(response)

    await expect(scenarioAuthoringRepository.previewRule('project-1', rule, { kind: 'eventLog', eventLogId: 'event-log-1' })).resolves.toBe(response)
    expect(scenarioAuthoringPreview).toHaveBeenCalledWith('project-1', {
      rule,
      scope: { kind: 'eventLog', eventLogId: 'event-log-1' },
    })
  })

  it('publishes through the atomic generated command', async () => {
    expectTypeOf<Parameters<typeof scenarioAuthoringRepository.publishScenario>[2]>().toEqualTypeOf<ScenarioPublishInput>()
    vi.mocked(scenarioAuthoringPublishScenario).mockResolvedValue(publishResponse)

    await expect(scenarioAuthoringRepository.publishScenario('project-1', 'scenario-1', publishDraft)).resolves.toBe(publishResponse)
    expect(scenarioAuthoringPublishScenario).toHaveBeenCalledWith('project-1', 'scenario-1', publishDraft)
  })

  it('rolls back a revision with the observed scenario head', async () => {
    vi.mocked(scenarioAuthoringRollbackScenario).mockResolvedValue(undefined)

    await expect(scenarioAuthoringRepository.rollbackScenario(
      'project-1',
      'scenario-1',
      'scenario-revision-1',
      'scenario-revision-2',
    )).resolves.toBeUndefined()
    expect(scenarioAuthoringRollbackScenario).toHaveBeenCalledWith(
      'project-1',
      'scenario-1',
      'scenario-revision-1',
      { expectedCurrentRevisionId: 'scenario-revision-2' },
    )
  })

  it('loads the generated explanation for a pinned run', async () => {
    vi.mocked(scenarioRunsExplain).mockResolvedValue(explainResponse)

    await expect(scenarioAuthoringRepository.explainRun('project-1', 'run-1')).resolves.toBe(explainResponse)
    expect(scenarioRunsExplain).toHaveBeenCalledWith('project-1', 'run-1')
  })

  it('maps generated client failures to the shared API error', async () => {
    vi.mocked(scenarioAuthoringValidate).mockRejectedValue(new Error('connection lost'))

    const request = scenarioAuthoringRepository.validateRule('project-1', rule)

    await expect(request).rejects.toBeInstanceOf(ApiError)
    await expect(request).rejects.toMatchObject({ status: 0, message: 'connection lost' })
  })
})
