import type { ScenarioAction } from '@/shared/types/domain'

export interface ScenarioGraphFixture {
  name: string
  actions: ScenarioAction[]
}

function action(
  position: number,
  nodeKey: string,
  nextNodeKey: string | null,
  type = 'SAY',
  config: Record<string, unknown> = {},
): ScenarioAction {
  return { position, nodeKey, nextNodeKey, type, config }
}

function linearFixture(name: string, size: number): ScenarioGraphFixture {
  return {
    name,
    actions: Array.from({ length: size }, (_, index) => action(
      index,
      `step_${index + 1}`,
      index === size - 1 ? null : `step_${index + 2}`,
      index === size - 1 ? 'COMPLETE_SCENARIO' : 'SAY',
    )),
  }
}

export const longChainFixture = linearFixture('long-chain', 12)
export const largeGraphFixture = linearFixture('large-graph', 40)

export const choiceTimeoutParallelFixture: ScenarioGraphFixture = {
  name: 'choice-timeout-parallel',
  actions: [
    action(0, 'question', null, 'ASK_CHOICE', {
      message: 'Продолжить?',
      timeoutMs: 30_000,
      onTimeout: 'finish',
      options: [
        { id: 'yes', label: 'Да', nextNodeKey: 'finish' },
        { id: 'no', label: 'Нет', nextNodeKey: 'finish' },
      ],
    }),
    action(1, 'finish', null, 'COMPLETE_SCENARIO'),
  ],
}

export const splitJoinFixture: ScenarioGraphFixture = {
  name: 'split-join',
  actions: [
    action(0, 'split', null, 'CONDITION', {
      branches: [
        { conditions: [{ path: 'user.tier', operator: 'eq', value: 'gold' }], nextNodeKey: 'gold' },
        { conditions: [{ path: 'user.tier', operator: 'eq', value: 'silver' }], nextNodeKey: 'silver' },
      ],
      fallbackNodeKey: 'standard',
    }),
    action(1, 'gold', 'join'),
    action(2, 'silver', 'join'),
    action(3, 'standard', 'join'),
    action(4, 'join', null, 'COMPLETE_SCENARIO'),
  ],
}

export const nestedQuestionsFixture: ScenarioGraphFixture = {
  name: 'nested-questions',
  actions: [
    action(0, 'channel', null, 'ASK_CHOICE', {
      message: 'Канал?', timeoutMs: 30_000, onTimeout: 'finish',
      options: [
        { id: 'chat', label: 'Чат', nextNodeKey: 'chat_question' },
        { id: 'email', label: 'Почта', nextNodeKey: 'email_question' },
      ],
    }),
    action(1, 'chat_question', null, 'ASK_CHOICE', {
      message: 'Открыть чат?', timeoutMs: 30_000, onTimeout: 'finish',
      options: [{ id: 'open', label: 'Открыть', nextNodeKey: 'finish' }],
    }),
    action(2, 'email_question', null, 'ASK_CHOICE', {
      message: 'Отправить письмо?', timeoutMs: 30_000, onTimeout: 'finish',
      options: [{ id: 'send', label: 'Отправить', nextNodeKey: 'finish' }],
    }),
    action(3, 'finish', null, 'COMPLETE_SCENARIO'),
  ],
}

export const auditBranchSwapFixture: ScenarioGraphFixture = {
  name: 'audit-branch-swap',
  actions: [
    action(0, 'question', null, 'ASK_CHOICE', {
      message: 'Продолжить?', timeoutMs: 30_000, onTimeout: 'timeout_path',
      options: [
        { id: 'yes', label: 'Да', nextNodeKey: 'yes_path' },
        { id: 'no', label: 'Нет', nextNodeKey: 'no_path' },
      ],
    }),
    action(1, 'timeout_path', 'finish'),
    action(2, 'no_path', 'finish'),
    action(3, 'yes_path', 'finish'),
    action(4, 'finish', null, 'COMPLETE_SCENARIO'),
  ],
}

export const scenarioGraphFixtures = [
  longChainFixture,
  choiceTimeoutParallelFixture,
  splitJoinFixture,
  nestedQuestionsFixture,
  auditBranchSwapFixture,
  largeGraphFixture,
] as const
