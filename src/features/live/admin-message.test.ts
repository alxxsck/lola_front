import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import { adminMessageError } from './admin-message'

describe('adminMessageError', () => {
  it('explains USER_OFFLINE without exposing backend internals', () => {
    const error = new ApiError(409, 'Command failed', { code: 'USER_OFFLINE' })
    expect(adminMessageError(error)).toContain('Пользователь сейчас офлайн')
    expect(adminMessageError(error)).not.toContain('USER_OFFLINE')
  })
})
