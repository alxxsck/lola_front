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

  it('normalizes the API error envelope with code and structured details', () => {
    const config = { headers: new AxiosHeaders() }
    const cause = new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
      data: {
        error: {
          code: 'EVENT_DEFINITION_IN_USE',
          message: 'Event definition is used',
          details: { eventLogCount: 3, scenarios: [{ id: 'scenario-1' }] },
          requestId: 'request-1',
        },
      },
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config,
    })

    const error = normalizeApiError(cause)

    expect(error).toMatchObject({
      status: 409,
      code: 'EVENT_DEFINITION_IN_USE',
      message: 'Event definition is used',
      details: { eventLogCount: 3, scenarios: [{ id: 'scenario-1' }] },
      requestId: 'request-1',
    })
  })
})
