import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import { suspensionError } from './suspension-error'

describe('понятные ошибки управления AI', () => {
  it.each([
    [new ApiError(403, 'forbidden'), 'FORBIDDEN'],
    [new ApiError(409, 'conflict', undefined, undefined, 'VERSION_CONFLICT'), 'VERSION_CONFLICT'],
    [new ApiError(409, 'active', undefined, undefined, 'ALREADY_ACTIVE'), 'ALREADY_ACTIVE'],
    [new ApiError(409, 'inactive', undefined, undefined, 'NOT_ACTIVE'), 'NOT_ACTIVE'],
    [new ApiError(404, 'missing'), 'NOT_FOUND'],
    [new ApiError(422, 'invalid'), 'INVALID'],
    [new ApiError(429, 'rate', undefined, undefined, undefined, 45), 'RATE_LIMITED'],
    [new ApiError(503, 'down'), 'UNAVAILABLE'],
    [new ApiError(0, 'network'), 'NETWORK'],
  ] as const)('сопоставляет ответ сервера %s с видом %s', (cause, kind) => {
    expect(suspensionError(cause)).toMatchObject({ kind })
  })

  it('показывает время ожидания и номер обращения без внутренних подробностей', () => {
    expect(suspensionError(new ApiError(429, 'stack trace', undefined, 'request-7', undefined, 45))).toEqual({
      kind: 'RATE_LIMITED',
      message: 'Слишком много действий. Повторите через 45 сек.',
      retryAfterSeconds: 45,
      requestId: 'request-7',
    })
  })
})
