import { isProxy, reactive } from 'vue'
import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

import {
  applyRuleCommand,
  createRuleDraft,
  deserializeRule,
  type RuleCommandResult,
  type RuleDomainContext,
  type RuleDraft,
  type RuleGroupDraftNode,
} from './index'

const contract: ScenarioAuthoringContract = {
  projectId: 'project-1', revision: 'catalog-1', version: 1,
  events: [{
    code: 'page.opened', definitionId: 'event-1', definitionKeyId: 'event-key-1', name: 'Открыта страница', schemaVersion: 1,
    aggregateMeasures: [{ measure: 'count', field: 'none', resultType: 'integer', compareValueType: 'integer', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] }],
    fields: [{
      capabilities: {
        eventField: { operators: ['eq', 'exists'] },
        aggregateFilter: { operators: ['eq', 'exists'] },
        aggregateMeasure: { measures: [] },
      },
      control: { type: 'select', options: ['promotions'] },
      fieldKey: 'page.code', label: 'Страница', path: 'event.payload.page.code', required: true, valueType: 'string',
    }],
  }],
}

const context: RuleDomainContext = { triggerEventDefinitionId: 'event-1', triggerEventCode: 'page.opened', mode: 'initialEligibility', contract }

function value(result: RuleCommandResult): RuleDraft {
  if (!result.ok) throw new Error(result.error.message)
  return result.draft
}

function group(draft: RuleDraft, nodeId = draft.root.nodeId): RuleGroupDraftNode {
  const pending = [draft.root]
  while (pending.length) {
    const node = pending.shift()!
    if (node.nodeId === nodeId && (node.kind === 'all' || node.kind === 'any')) return node
    if (node.kind === 'all' || node.kind === 'any') pending.push(...node.children)
    if (node.kind === 'not') pending.push(node.child)
  }
  throw new Error(`Missing group ${nodeId}`)
}

describe('Rule domain commands', () => {
  it('applies add, replace, move, wrap, unwrap, group change and remove immutably', () => {
    const initial = createRuleDraft()
    const rootId = initial.root.nodeId
    const addedLeaf = applyRuleCommand(initial, { type: 'add', parentNodeId: rootId, node: { kind: 'empty' } }, context)
    expect(addedLeaf.ok).toBe(true)
    expect(group(initial).children).toEqual([])
    const leafId = addedLeaf.ok ? addedLeaf.focusNodeId : ''

    let draft = value(addedLeaf)
    draft = value(applyRuleCommand(draft, {
      type: 'replaceLeaf',
      nodeId: leafId,
      leaf: { kind: 'eventField', eventCode: 'wrong.event', fieldKey: 'page.code', operator: 'eq', value: 'promotions' },
    }, context))
    expect(group(draft).children[0]).toMatchObject({ nodeId: leafId, kind: 'eventField', eventCode: 'page.opened' })

    const addedGroup = applyRuleCommand(draft, { type: 'add', parentNodeId: rootId, node: { kind: 'all' } }, context)
    const nestedId = addedGroup.ok ? addedGroup.focusNodeId : ''
    draft = value(addedGroup)
    draft = value(applyRuleCommand(draft, { type: 'move', nodeId: leafId, toParentNodeId: nestedId, toIndex: 0 }, context))
    expect(group(draft, nestedId).children[0]?.nodeId).toBe(leafId)

    const wrapped = applyRuleCommand(draft, { type: 'wrap', nodeId: leafId, wrapper: 'not' }, context)
    const wrapperId = wrapped.ok ? wrapped.focusNodeId : ''
    draft = value(wrapped)
    expect(group(draft, nestedId).children[0]).toMatchObject({ nodeId: wrapperId, kind: 'not', child: { nodeId: leafId } })

    draft = value(applyRuleCommand(draft, { type: 'unwrap', nodeId: wrapperId }, context))
    expect(group(draft, nestedId).children[0]?.nodeId).toBe(leafId)
    draft = value(applyRuleCommand(draft, { type: 'changeGroup', nodeId: nestedId, kind: 'any' }, context))
    expect(group(draft, nestedId).kind).toBe('any')
    draft = value(applyRuleCommand(draft, { type: 'remove', nodeId: leafId }, context))
    expect(group(draft, nestedId).children).toEqual([])
  })

  it('rejects moving a group into its descendant without changing the draft', () => {
    const draft = deserializeRule({
      version: 1,
      root: { kind: 'all', children: [{ kind: 'any', children: [{ kind: 'all', children: [] }] }] },
    }, context).draft
    const outer = group(draft).children[0]!
    const inner = outer.kind === 'any' ? outer.children[0]! : undefined

    const result = applyRuleCommand(draft, {
      type: 'move', nodeId: outer.nodeId, toParentNodeId: inner?.nodeId ?? '', toIndex: 0,
    }, context)

    expect(result).toMatchObject({ ok: false, draft, error: { code: 'move-cycle', nodeId: outer.nodeId } })
    expect(result.draft).toBe(draft)
    expect(result.ok ? '' : result.error.message).toContain('собственную вложенную группу')
  })

  it('moves a condition down within the same group using the final target index', () => {
    const draft = deserializeRule({
      version: 1,
      root: {
        kind: 'all',
        children: [
          { kind: 'eventField', eventCode: 'page.opened', fieldKey: 'page.code', operator: 'eq', value: 'promotions' },
          { kind: 'eventField', eventCode: 'page.opened', fieldKey: 'page.code', operator: 'exists' },
        ],
      },
    }, context).draft
    const [first, second] = group(draft).children

    const result = applyRuleCommand(draft, {
      type: 'move', nodeId: first!.nodeId, toParentNodeId: draft.root.nodeId, toIndex: 1,
    }, context)

    expect(result.ok).toBe(true)
    expect(result.ok ? group(result.draft).children.map((node) => node.nodeId) : []).toEqual([second!.nodeId, first!.nodeId])
  })

  it('rejects wrapping a depth-four leaf with an actionable depth error', () => {
    const draft = deserializeRule({
      version: 1,
      root: { kind: 'all', children: [{ kind: 'not', child: { kind: 'all', children: [{ kind: 'not', child: {
        kind: 'eventField', eventCode: 'page.opened', fieldKey: 'page.code', operator: 'exists',
      } }] } }] },
    }, context).draft
    const levelOne = group(draft).children[0]!
    const levelTwo = levelOne.kind === 'not' ? levelOne.child : levelOne
    const levelThree = levelTwo.kind === 'all' ? levelTwo.children[0]! : levelTwo
    const leaf = levelThree.kind === 'not' ? levelThree.child : levelThree

    const result = applyRuleCommand(draft, { type: 'wrap', nodeId: leaf.nodeId, wrapper: 'not' }, context)

    expect(result).toMatchObject({ ok: false, error: { code: 'depth-limit', nodeId: leaf.nodeId, limit: 4 } })
    expect(result.ok ? '' : result.error.message).toContain('не более 4')
  })

  it('allows ten aggregate leaves and rejects the eleventh', () => {
    let draft = createRuleDraft()
    const rootId = draft.root.nodeId
    const aggregate = {
      kind: 'eventAggregate' as const,
      eventCode: 'page.opened',
      measure: 'count' as const,
      filters: [],
      window: { kind: 'last' as const, durationMs: 86_400_000, boundary: 'beforeTrigger' as const },
      compare: { operator: 'gte' as const, value: 1 },
    }
    for (let index = 0; index < 10; index += 1) {
      draft = value(applyRuleCommand(draft, { type: 'add', parentNodeId: rootId, node: aggregate }, context))
    }

    const result = applyRuleCommand(draft, { type: 'add', parentNodeId: rootId, node: aggregate }, context)

    expect(result).toMatchObject({ ok: false, error: { code: 'aggregate-limit', limit: 10 } })
    expect(result.ok ? '' : result.error.message).toContain('не более 10')
  })

  it('accepts reactive UI buffers and returns a plain immutable draft', () => {
    const draft = reactive(createRuleDraft())
    const leaf = reactive({
      kind: 'eventField' as const,
      eventCode: 'page.opened',
      fieldKey: 'page.code',
      operator: 'eq' as const,
      value: 'promotions',
    })

    const result = applyRuleCommand(draft, { type: 'add', parentNodeId: draft.root.nodeId, node: leaf }, context)

    expect(result.ok).toBe(true)
    expect(result.ok && isProxy(result.draft.root)).toBe(false)
    expect(group(draft).children).toEqual([])
  })

  it('can remove an inversion wrapper from the root condition', () => {
    const draft = deserializeRule({
      version: 1,
      root: { kind: 'eventField', eventCode: 'page.opened', fieldKey: 'page.code', operator: 'exists' },
    }, context).draft
    const originalRootId = draft.root.nodeId
    const wrapped = applyRuleCommand(draft, { type: 'wrap', nodeId: originalRootId, wrapper: 'not' }, context)
    if (!wrapped.ok) throw new Error(wrapped.error.message)

    const result = applyRuleCommand(wrapped.draft, { type: 'unwrap', nodeId: wrapped.focusNodeId }, context)

    expect(result).toMatchObject({ ok: true, focusNodeId: originalRootId, draft: { root: { nodeId: originalRootId, kind: 'eventField' } } })
  })
})
