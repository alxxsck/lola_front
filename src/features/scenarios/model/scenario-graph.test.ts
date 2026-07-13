import { isProxy, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { availableTargets, graphTransitions, normalizeScenarioActions, sortScenarioActions, toPlainScenarioAction, validateScenarioGraph } from './scenario-graph'

describe('scenario graph model', () => {
  it('upgrades legacy linear actions without losing their order', () => {
    expect(normalizeScenarioActions([
      { position: 0, type: 'SAY', config: { text: 'Hi' } },
      { position: 1, type: 'COMPLETE_SCENARIO', config: {} },
    ])).toMatchObject([
      { nodeKey: 'step_0', nextNodeKey: 'step_1' },
      { nodeKey: 'step_1', nextNodeKey: null },
    ])
  })

  it('derives labelled choice and timeout transitions', () => {
    const actions = normalizeScenarioActions([
      { position: 0, nodeKey: 'question', type: 'ASK_CHOICE', config: {
        message: 'Continue?', timeoutMs: 30_000, onTimeout: 'no', options: [
          { id: 'yes', label: 'Да', nextNodeKey: 'yes' },
          { id: 'no', label: 'Нет', nextNodeKey: 'no' },
        ],
      } },
      { position: 1, nodeKey: 'yes', nextNodeKey: 'finish', type: 'SAY', config: {} },
      { position: 2, nodeKey: 'no', nextNodeKey: 'finish', type: 'SAY', config: {} },
      { position: 3, nodeKey: 'finish', type: 'COMPLETE_SCENARIO', config: {} },
    ])
    expect(graphTransitions(actions).map(({ target, label }) => ({ target, label }))).toEqual([
      { target: 'yes', label: 'Да' }, { target: 'no', label: 'Нет' }, { target: 'no', label: 'Timeout' },
      { target: 'finish', label: undefined }, { target: 'finish', label: undefined },
    ])
    expect(validateScenarioGraph(actions)).toEqual([])
  })

  it('accepts a question with one answer option', () => {
    const actions = normalizeScenarioActions([
      { position: 0, nodeKey: 'question', type: 'ASK_CHOICE', config: {
        message: 'Continue?', timeoutMs: 30_000, onTimeout: 'finish',
        options: [{ id: 'ok', label: 'Понятно', nextNodeKey: 'finish' }],
      } },
      { position: 1, nodeKey: 'finish', type: 'COMPLETE_SCENARIO', config: {} },
    ])
    expect(validateScenarioGraph(actions)).toEqual([])
  })

  it('reports backward, missing and unreachable transitions before save', () => {
    const actions = normalizeScenarioActions([
      { position: 0, nodeKey: 'start', nextNodeKey: 'missing', type: 'SAY', config: {} },
      { position: 1, nodeKey: 'orphan', nextNodeKey: 'start', type: 'SAY', config: {} },
    ])
    expect(validateScenarioGraph(actions).map((issue) => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('неизвестный узел'), expect.stringContaining('только вперёд'), expect.stringContaining('недостижим'),
    ]))
  })

  it('offers earlier nodes when they do not create a cycle and sorts them after the source', () => {
    const actions = normalizeScenarioActions([
      { position: 0, nodeKey: 'start', nextNodeKey: 'question', type: 'SAY', config: {} },
      { position: 1, nodeKey: 'answer', nextNodeKey: null, type: 'SAY', config: {} },
      { position: 2, nodeKey: 'question', type: 'ASK_CHOICE', config: { message: 'Choose', options: [], timeoutMs: 30_000 } },
    ])
    expect(availableTargets(actions, actions[2]).map((target) => target.value)).toEqual(['answer'])

    actions[2].config.options = [{ id: 'yes', label: 'Да', nextNodeKey: 'answer' }]
    const sorted = sortScenarioActions(actions)
    expect(sorted.map((action) => action.nodeKey)).toEqual(['start', 'question', 'answer'])
    expect(sorted.map((action) => action.position)).toEqual([0, 1, 2])
  })

  it('does not offer an ancestor as a transition target', () => {
    const actions = normalizeScenarioActions([
      { position: 0, nodeKey: 'start', nextNodeKey: 'question', type: 'SAY', config: {} },
      { position: 1, nodeKey: 'question', nextNodeKey: null, type: 'SAY', config: {} },
    ])
    expect(availableTargets(actions, actions[1])).toEqual([])
  })

  it('converts nested reactive action config to plain JSON data', () => {
    const action = reactive({
      position: 0,
      nodeKey: 'question',
      type: 'ASK_CHOICE' as const,
      config: { options: [{ id: 'yes', nextNodeKey: 'finish' }] },
    })
    expect(isProxy(action.config.options[0])).toBe(true)

    const plain = toPlainScenarioAction(action)
    expect(plain).toEqual({
      position: 0,
      nodeKey: 'question',
      type: 'ASK_CHOICE',
      config: { options: [{ id: 'yes', nextNodeKey: 'finish' }] },
    })
    expect(isProxy(plain.config.options[0])).toBe(false)
  })
})
