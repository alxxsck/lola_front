import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import { eventDefinitionError } from './event-definition-error'

describe('eventDefinitionError', () => {
  it('describes scenarios broken by a schema update', () => {
    const error = new ApiError(409, 'Conflict', {
      scenarios: [{
        id: 'scenario-1',
        code: 'deposit_success',
        name: 'Успешный депозит',
        issues: [
          { conditionPath: 'event.payload.amount' },
          { position: 0 },
        ],
      }],
    }, undefined, 'EVENT_SCHEMA_BREAKS_SCENARIOS')

    expect(eventDefinitionError(error, 'Не удалось сохранить')).toEqual({
      message: 'Новую схему нельзя сохранить: из-за неё перестанут работать связанные сценарии. Сначала исправьте указанные места.',
      scenarios: [{
        id: 'scenario-1',
        code: 'deposit_success',
        name: 'Успешный депозит',
        status: undefined,
        issues: [
          'Условие использует поле «event.payload.amount».',
          'Шаг 1: шаблон не соответствует новой схеме события.',
        ],
      }],
    })
  })

  it('explains both deletion dependency types', () => {
    const error = new ApiError(409, 'Conflict', {
      eventLogCount: 3,
      scenarios: [{ id: 'scenario-1', code: 'deposit_success', name: 'Успешный депозит', status: 'ACTIVE' }],
    }, undefined, 'EVENT_DEFINITION_IN_USE')

    expect(eventDefinitionError(error, 'Не удалось удалить')).toMatchObject({
      eventLogCount: 3,
      scenarios: [{ name: 'Успешный депозит', status: 'ACTIVE' }],
    })
    expect(eventDefinitionError(error, 'Не удалось удалить').message).toContain('можно только выключить')
  })
})
