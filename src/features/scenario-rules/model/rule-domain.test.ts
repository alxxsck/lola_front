import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

import {
  createRuleDraft,
  deserializeRule,
  serializeRuleDraft,
  type RuleDomainContext,
  type RuleDraftNode,
} from './index'

const contract: ScenarioAuthoringContract = {
  projectId: 'project-1',
  revision: 'catalog-1',
  version: 1,
  events: [
    {
      code: 'page.opened',
      definitionId: 'page-revision-1',
      definitionKeyId: 'page-key',
      name: 'Открыта страница',
      schemaVersion: 1,
      aggregateMeasures: [
        { measure: 'exists', field: 'none', resultType: 'boolean', compareValueType: 'boolean', compareOperators: ['eq', 'neq'] },
        { measure: 'count', field: 'none', resultType: 'integer', compareValueType: 'integer', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      ],
      fields: [{
        capabilities: {
          eventField: { operators: ['eq', 'neq', 'in', 'exists', 'not_exists'] },
          aggregateFilter: { operators: ['eq', 'neq', 'in', 'exists'] },
          aggregateMeasure: { measures: [] },
        },
        control: { type: 'select', options: ['promotions'] },
        fieldKey: 'page.code',
        label: 'Страница',
        path: 'event.payload.page.code',
        required: true,
        valueType: 'string',
      }],
    },
  ],
}

const context: RuleDomainContext = {
  triggerEventDefinitionId: 'page-revision-1',
  triggerEventCode: 'page.opened',
  mode: 'initialEligibility',
  contract,
}

function child(node: RuleDraftNode, index: number): RuleDraftNode {
  if (node.kind !== 'all' && node.kind !== 'any') throw new Error('Expected a group')
  const value = node.children[index]
  if (!value) throw new Error(`Missing child ${index}`)
  return value
}

describe('Rule domain serialization', () => {
  it('creates an editable empty root group', () => {
    const draft = createRuleDraft()

    expect(draft).toMatchObject({ version: 1, root: { kind: 'all', children: [] } })
    expect(draft.root.nodeId).toMatch(/^rule_node_/)
  })

  it('round-trips nested all, any and not nodes without leaking local ids', () => {
    const dto = {
      version: 1,
      root: {
        kind: 'all',
        children: [
          { kind: 'eventField', eventCode: 'page.opened', fieldKey: 'page.code', operator: 'eq', value: 'promotions' },
          {
            kind: 'not',
            child: {
              kind: 'any',
              children: [
                { kind: 'activityDayStreak', compare: { operator: 'gte', value: 2 } },
              ],
            },
          },
        ],
      },
    }

    const parsed = deserializeRule(dto, context)
    const result = serializeRuleDraft(parsed.draft, context)

    expect(parsed.issues).toEqual([])
    expect(result).toMatchObject({ ok: true, value: dto })
    expect(JSON.stringify(result.ok ? result.value : null)).not.toContain('nodeId')
  })

  it('preserves an unknown subtree opaquely and blocks serialization', () => {
    const source = { kind: 'futureScore', model: 'risk-v2', config: { threshold: 0.73 } }
    const parsed = deserializeRule({ version: 1, root: { kind: 'all', children: [source] } }, context)
    const opaque = child(parsed.draft.root, 0)

    expect(opaque).toMatchObject({ kind: 'opaque', reportedKind: 'futureScore', source })
    expect(parsed.issues[0]).toMatchObject({ nodeId: opaque.nodeId, code: 'unsupported-node' })

    source.config.threshold = 0
    expect(opaque.kind === 'opaque' ? opaque.source : undefined).toEqual({
      kind: 'futureScore', model: 'risk-v2', config: { threshold: 0.73 },
    })

    const result = serializeRuleDraft(parsed.draft, context)
    expect(result).toMatchObject({ ok: false, issues: [{ nodeId: opaque.nodeId, code: 'unsupported-node' }] })
  })

  it('resolves fields from the exact trigger Event revision when codes are duplicated', () => {
    const exactContext: RuleDomainContext = {
      ...context,
      contract: {
        ...contract,
        events: [{ ...contract.events[0]!, definitionId: 'page-revision-old', fields: [] }, ...contract.events],
      },
    }
    const parsed = deserializeRule({
      version: 1,
      root: { kind: 'eventField', eventCode: 'page.opened', fieldKey: 'page.code', operator: 'eq', value: 'promotions' },
    }, exactContext)

    expect(serializeRuleDraft(parsed.draft, exactContext)).toMatchObject({ ok: true })
  })
})
