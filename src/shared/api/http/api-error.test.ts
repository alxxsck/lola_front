import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { normalizeApiError } from './api-error'

describe('normalizeApiError', () => {
  it('normalizes Nest validation arrays and request id', () => {
    const config = { headers: new AxiosHeaders({ 'x-request-id': 'request-from-client' }) }
    const cause = new AxiosError('Bad request', 'ERR_BAD_REQUEST', config, undefined, {
      data: { message: ['email must be valid', 'password is required'], requestId: 'request-from-api' },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config,
    })

    const error = normalizeApiError(cause)

    expect(error).toMatchObject({
      status: 400,
      message: 'email must be valid. password is required',
      requestId: 'request-from-api',
    })
  })
})
