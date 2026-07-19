import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import { scenarioApiErrorMessage } from './scenario-api-error'

describe('scenarioApiErrorMessage', () => {
  it('names a condition field absent from the event schema', () => {
    const error = new ApiError(400, 'Bad request', { path: 'event.payload.promoCode' }, undefined, 'SCENARIO_CONDITION_FIELD_NOT_FOUND')

    expect(scenarioApiErrorMessage(error)).toBe('Поле условия «event.payload.promoCode» отсутствует в схеме события. Выберите существующее поле.')
  })

  it('explains where to add a default for an optional template field', () => {
    const error = new ApiError(400, 'Bad request', { position: 1, path: 'event.payload.promoCode' }, undefined, 'SCENARIO_TEMPLATE_DEFAULT_REQUIRED')

    expect(scenarioApiErrorMessage(error)).toBe('Шаг 2: необязательное поле «event.payload.promoCode» требует значения по умолчанию. Добавьте в шаблон | default: "…".')
  })

  it('uses stable safe copy for translation budget and unknown provider errors', () => {
    expect(scenarioApiErrorMessage(new ApiError(402, 'raw provider text', undefined, 'req-1', 'TRANSLATION_BUDGET_EXCEEDED'))).toContain('Лимит AI-переводов проекта исчерпан')
    expect(scenarioApiErrorMessage(new ApiError(500, 'raw provider text', undefined, 'req-2', 'TRANSLATION_PROVIDER_FAILURE'))).toBe('Не удалось выполнить перевод. Код обращения: req-2.')
  })
})
