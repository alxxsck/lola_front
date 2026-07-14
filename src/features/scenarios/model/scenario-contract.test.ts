import { describe, expect, it } from 'vitest'
import type { SaveScenario } from '@/shared/api/repository/contracts'
import { serializeApiScenarioActions, toCreateScenarioDto, toUpdateScenarioDto } from '@/shared/api/repository/scenario-contract'

const scenario = (actions: SaveScenario['actions']): SaveScenario => ({
  id: 'scenario-1',
  code: 'welcome_flow',
  name: ' Welcome flow ',
  description: ' Greets a user ',
  eventDefinitionId: 'event-1',
  status: 'ACTIVE',
  priority: 20,
  conditions: [{ path: 'user.segment', operator: 'eq', value: 'new' }],
  cooldownSeconds: 60,
  maxRunsPerUser: 2,
  activeFrom: '2026-07-01T08:00:00.000Z',
  activeTo: '2026-08-01T08:00:00.000Z',
  actions,
})

describe('scenario API contract', () => {
  it('serializes action order and preserves backend-driven config keys', () => {
    expect(serializeApiScenarioActions([
      { id: '2', position: 1, nodeKey: 'cta', nextNodeKey: null, type: 'SHOW_CTA', config: { label: 'Open', action: 'open_modal', modalId: 'bonus_modal', target: 'must-not-leak' } },
      { id: '1', position: 0, nodeKey: 'open', nextNodeKey: 'cta', type: 'OPEN_PAGE', config: { pageId: 'offers', target: 'must-not-leak' } },
      { id: '3', position: 2, type: 'COMPLETE_SCENARIO', config: { result: 'converted', internal: true } },
    ])).toEqual([
      { position: 0, nodeKey: 'open', nextNodeKey: 'cta', type: 'OPEN_PAGE', config: { pageId: 'offers', target: 'must-not-leak' } },
      { position: 1, nodeKey: 'cta', nextNodeKey: null, type: 'SHOW_CTA', config: { label: 'Open', action: 'open_modal', modalId: 'bonus_modal', target: 'must-not-leak' } },
      { position: 2, type: 'COMPLETE_SCENARIO', config: { result: 'converted', internal: true } },
    ])
  })

  it('builds distinct Create and Update DTOs without domain-only fields', () => {
    const value = scenario([{ id: 'action-1', position: 4, type: 'SAY', config: { text: 'Hello', draft: true } }])
    expect(toCreateScenarioDto(value)).toEqual({
      code: 'welcome_flow', name: 'Welcome flow', description: 'Greets a user', eventDefinitionId: 'event-1',
      status: 'ACTIVE', priority: 20, conditions: [{ path: 'user.segment', operator: 'eq', value: 'new' }],
      cooldownSeconds: 60, maxRunsPerUser: 2, activeFrom: '2026-07-01T08:00:00.000Z',
      activeTo: '2026-08-01T08:00:00.000Z', actions: [{ position: 0, type: 'SAY', config: { text: 'Hello', draft: true } }],
    })
    expect(toUpdateScenarioDto(value)).not.toHaveProperty('code')
    expect(toUpdateScenarioDto(value).actions?.[0]).not.toHaveProperty('id')
  })

  it('keeps an empty conditions array in the update DTO', () => {
    const value = scenario([{ position: 0, type: 'SAY', config: { text: 'Hello' } }])
    value.conditions = []

    expect(toUpdateScenarioDto(value)).toHaveProperty('conditions', [])
  })

  it('accepts new backend action types without a frontend allowlist', () => {
    expect(serializeApiScenarioActions([
      { position: 0, type: 'CUSTOM_BACKEND_ACTION', config: { nested: { enabled: true } } },
      { position: 1, type: 'WAIT_FOR', config: { durationMs: 1000 } },
    ])).toEqual([
      { position: 0, type: 'CUSTOM_BACKEND_ACTION', config: { nested: { enabled: true } } },
      { position: 1, type: 'WAIT_FOR', config: { durationMs: 1000 } },
    ])
  })

  it('serializes the voice conversation step with its optional policy', () => {
    expect(serializeApiScenarioActions([{
      position: 0,
      nodeKey: 'start_voice',
      nextNodeKey: 'highlight_target',
      type: 'START_VOICE_CONVERSATION',
      config: {
        text: 'Привет! Давай я помогу тебе с настройкой.',
        voice: 'marin',
        onUnavailable: 'continue',
      },
    }])).toEqual([{
      position: 0,
      nodeKey: 'start_voice',
      nextNodeKey: 'highlight_target',
      type: 'START_VOICE_CONVERSATION',
      config: {
        text: 'Привет! Давай я помогу тебе с настройкой.',
        voice: 'marin',
        onUnavailable: 'continue',
      },
    }])
  })

  it('serializes SPEAK_TEXT without waiting for playback completion', () => {
    expect(serializeApiScenarioActions([{
      position: 0,
      type: 'SPEAK_TEXT',
      config: { text: 'Привет!', voice: 'marin', waitForCompletion: false, timeoutMs: 60_000 },
    }])).toEqual([{
      position: 0,
      type: 'SPEAK_TEXT',
      config: { text: 'Привет!', voice: 'marin', waitForCompletion: false, timeoutMs: 60_000 },
    }])
  })

  it('creates a plain JSON payload from reactive-compatible object shapes', () => {
    const config = Object.create({ inherited: true }) as Record<string, unknown>
    config.payload = { amount: 10, omitted: undefined }
    expect(serializeApiScenarioActions([{ position: 0, type: 'TRACK', config }]))
      .toEqual([{ position: 0, type: 'TRACK', config: { payload: { amount: 10 } } }])
  })
})
