import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import { toProjectActionError } from './project-action-error'

describe('Project Action errors', () => {
  it('preserves typed backend policy failures for safe UI rendering', () => {
    const error = toProjectActionError(new ApiError(
      409,
      'Project Action is referenced by active scenarios',
      { scenarioIds: ['scenario-1'] },
      'request-1',
      'PROJECT_ACTION_IN_USE',
    ))

    expect(error).toEqual({
      kind: 'conflict',
      code: 'PROJECT_ACTION_IN_USE',
      message: 'Действие используется активным сценарием и пока не может быть архивировано.',
      details: { scenarioIds: ['scenario-1'] },
      requestId: 'request-1',
      status: 409,
    })
  })
})
