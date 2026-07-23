import { isProxy, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { availableTargets, graphTransitions, normalizeScenarioActions, renameScenarioNode, rotateLinearScenarioStart, sortScenarioActions, toPlainScenarioAction, usesExplicitTransitions, validateScenarioGraph } from './scenario-graph'

describe('scenario graph model', () => {
  it('identifies actions whose transitions live outside nextNodeKey', () => {
    expect(usesExplicitTransitions('ASK_CHOICE')).toBe(true)
    expect(usesExplicitTransitions('CONDITION')).toBe(true)
    expect(usesExplicitTransitions('WAIT_FOR_GOAL')).toBe(true)
    expect(usesExplicitTransitions('SAY')).toBe(false)
  })

  it('rotates a linear graph to a new first action without deleting nodes', () => {
    const actions = [
      { position: 0, nodeKey: 'open_form', nextNodeKey: 'open_chat', type: 'OPEN_MODAL', config: {} },
      { position: 1, nodeKey: 'open_chat', nextNodeKey: 'say_hello', type: 'OPEN_CHAT', config: {} },
      { position: 2, nodeKey: 'say_hello', nextNodeKey: null, type: 'SAY', config: { text: 'Привет' } },
    ]

    const rotated = rotateLinearScenarioStart(actions, 'open_chat')
    expect(rotated).toEqual([
      expect.objectContaining({ position: 0, nodeKey: 'open_chat', nextNodeKey: 'say_hello' }),
      expect.objectContaining({ position: 1, nodeKey: 'say_hello', nextNodeKey: 'open_form' }),
      expect.objectContaining({ position: 2, nodeKey: 'open_form', nextNodeKey: null }),
    ])
    expect(validateScenarioGraph(rotated!)).toEqual([])
    expect(actions.map((action) => action.nodeKey)).toEqual([
      'open_form',
      'open_chat',
      'say_hello',
    ])
  })

  it('refuses to rewrite a branching graph when changing its first action', () => {
    const actions = normalizeScenarioActions([
      { position: 0, nodeKey: 'question', type: 'ASK_CHOICE', config: {
        message: 'Куда дальше?', timeoutMs: 30_000, onTimeout: 'finish',
        options: [{ id: 'finish', label: 'Дальше', nextNodeKey: 'finish' }],
      } },
      { position: 1, nodeKey: 'finish', type: 'SAY', config: { text: 'Готово' } },
    ])

    expect(rotateLinearScenarioStart(actions, 'finish')).toBeNull()
  })

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

  it('derives both durable WAIT_FOR_GOAL branches and validates their references', () => {
    const actions = normalizeScenarioActions([
      { position: 0, nodeKey: 'wait_for_deposit', type: 'WAIT_FOR_GOAL', config: {
        goal: { version: 1, eventCode: 'deposit.succeeded', measure: 'count', filters: [], compare: { operator: 'gte', value: '1' } },
        timeoutMs: 172_800_000, onGoal: 'deposit_done', onTimeout: 'deposit_missing',
      } },
      { position: 1, nodeKey: 'deposit_done', type: 'SAY', config: {} },
      { position: 2, nodeKey: 'deposit_missing', type: 'SAY', config: {} },
    ])

    expect(graphTransitions(actions)).toEqual([
      { source: 'wait_for_deposit', target: 'deposit_done', label: 'Цель достигнута', kind: 'goal' },
      { source: 'wait_for_deposit', target: 'deposit_missing', label: 'Срок истёк', kind: 'goal-timeout' },
    ])
    expect(validateScenarioGraph(actions)).toEqual([])

    actions[0]!.config.onTimeout = 'removed_node'
    expect(validateScenarioGraph(actions).map((issue) => issue.message)).toContain('Переход ведёт в неизвестный узел «removed_node»')
  })

  it('removes an invisible linear transition from WAIT_FOR_GOAL during normalization', () => {
    const [goal] = normalizeScenarioActions([{
      position: 0,
      nodeKey: 'wait_for_deposit',
      nextNodeKey: 'hidden_third_branch',
      type: 'WAIT_FOR_GOAL',
      config: { onGoal: 'done', onTimeout: 'timeout' },
    }])

    expect(goal?.nextNodeKey).toBeNull()
    expect(graphTransitions(goal ? [goal] : [])).toHaveLength(2)
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

  it('renames WAIT_FOR_GOAL and ordinary graph references atomically', () => {
    const actions = normalizeScenarioActions([
      { position: 0, nodeKey: 'start', nextNodeKey: 'wait', type: 'SAY', config: {} },
      { position: 1, nodeKey: 'wait', type: 'WAIT_FOR_GOAL', config: { onGoal: 'done', onTimeout: 'timeout' } },
      { position: 2, nodeKey: 'done', type: 'SAY', config: {} },
      { position: 3, nodeKey: 'timeout', type: 'SAY', config: {} },
    ])

    expect(renameScenarioNode(actions, 'done', 'deposit_done')).toBe(true)
    expect(actions[2]?.nodeKey).toBe('deposit_done')
    expect(actions[1]?.config.onGoal).toBe('deposit_done')
    expect(graphTransitions(actions).some((transition) => transition.target === 'done')).toBe(false)
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
