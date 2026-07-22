import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  projectMfaPolicyGet,
  projectMfaPolicyUpdate,
} from '@/shared/api/generated/lola-backend'
import { projectMfaPolicyApi } from './project-mfa-policy.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  projectMfaPolicyGet: vi.fn(),
  projectMfaPolicyUpdate: vi.fn(),
}))

describe('project MFA policy API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the project-scoped generated read operation', async () => {
    const response = {
      projectId: '00000000-0000-4000-8000-000000000001',
      mode: 'OPTIONAL' as const,
      version: 0,
      updatedAt: null,
    }
    vi.mocked(projectMfaPolicyGet).mockResolvedValue(response)

    await expect(projectMfaPolicyApi.get(response.projectId)).resolves.toEqual(response)
    expect(projectMfaPolicyGet).toHaveBeenCalledWith(response.projectId)
  })

  it('sends mode, optimistic version and the operator audit reason', async () => {
    const projectId = '00000000-0000-4000-8000-000000000001'
    vi.mocked(projectMfaPolicyUpdate).mockResolvedValue({
      projectId,
      mode: 'REQUIRED',
      version: 4,
      updatedAt: '2026-07-21T12:00:00.000Z',
    })

    await projectMfaPolicyApi.update(projectId, {
      mode: 'REQUIRED',
      expectedVersion: 3,
      reason: 'Require MFA for support operators',
    })

    expect(projectMfaPolicyUpdate).toHaveBeenCalledWith(projectId, {
      mode: 'REQUIRED',
      expectedVersion: 3,
      reason: 'Require MFA for support operators',
    })
  })
})
