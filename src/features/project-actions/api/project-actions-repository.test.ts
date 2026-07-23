import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  productActionsActionTypes,
  productActionsArchiveProjectAction,
  productActionsConfigureAiExposure,
  productActionsConfigureProjectAction,
  productActionsPreviewProjectAction,
  productActionsProjectActions,
} from '@/shared/api/generated/lola-backend'
import { projectActionsRepository } from './project-actions-repository'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  productActionsActionTypes: vi.fn(),
  productActionsArchiveProjectAction: vi.fn(),
  productActionsConfigureAiExposure: vi.fn(),
  productActionsConfigureProjectAction: vi.fn(),
  productActionsPreviewProjectAction: vi.fn(),
  productActionsProjectActions: vi.fn(),
}))

describe('Project Actions repository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes AI exposure through the owner-only generated contract', async () => {
    const projectAction = { id: 'action-1', code: 'OPEN_PAGE' }
    vi.mocked(productActionsActionTypes).mockResolvedValue([])
    vi.mocked(productActionsProjectActions).mockResolvedValue([projectAction] as never)
    vi.mocked(productActionsConfigureAiExposure).mockResolvedValue(projectAction as never)
    vi.mocked(productActionsArchiveProjectAction).mockResolvedValue(projectAction as never)
    vi.mocked(productActionsPreviewProjectAction).mockResolvedValue({ issues: [] } as never)

    await expect(projectActionsRepository.listActionTypes('project-1')).resolves.toEqual([])
    await expect(projectActionsRepository.listProjectActions('project-1')).resolves.toEqual([projectAction])
    await projectActionsRepository.configure('project-1', 'action-1', {
      aiEnabled: true,
      aiUsageDescription: 'Use when the user explicitly asks to open bonuses.',
      configuration: { pageCodes: ['bonuses'] },
      auditReason: 'Enable requested navigation to bonuses',
    })
    await projectActionsRepository.archive('project-1', 'action-1')
    await expect(projectActionsRepository.preview('project-1', 'action-1')).resolves.toEqual({
      tool: null,
      issues: [],
    })

    expect(productActionsConfigureAiExposure).toHaveBeenCalledWith('project-1', 'action-1', {
      aiEnabled: true,
      aiUsageDescription: 'Use when the user explicitly asks to open bonuses.',
      configuration: { pageCodes: ['bonuses'] },
      auditReason: 'Enable requested navigation to bonuses',
    })
    expect(productActionsConfigureProjectAction).not.toHaveBeenCalled()
    expect(productActionsArchiveProjectAction).toHaveBeenCalledWith('project-1', 'action-1')
    expect(productActionsPreviewProjectAction).toHaveBeenCalledWith('project-1', 'action-1')
  })

  it('keeps standard changes on the standard contract', async () => {
    const projectAction = { id: 'action-1', code: 'OPEN_PAGE' }
    vi.mocked(productActionsConfigureProjectAction).mockResolvedValue(projectAction as never)

    await projectActionsRepository.configure('project-1', 'action-1', {
      scenarioEnabled: true,
      configuration: { pageCodes: ['bonuses'] },
    })

    expect(productActionsConfigureProjectAction).toHaveBeenCalledWith('project-1', 'action-1', {
      scenarioEnabled: true,
      configuration: { pageCodes: ['bonuses'] },
    })
    expect(productActionsConfigureAiExposure).not.toHaveBeenCalled()
  })

  it('splits one editor save across the AI and standard contracts', async () => {
    const aiExposure = { id: 'action-1', code: 'OPEN_PAGE', aiEnabled: true }
    const authoritative = { ...aiExposure, scenarioEnabled: true }
    vi.mocked(productActionsConfigureAiExposure).mockResolvedValue(aiExposure as never)
    vi.mocked(productActionsConfigureProjectAction).mockResolvedValue(authoritative as never)

    await expect(projectActionsRepository.configure('project-1', 'action-1', {
      scenarioEnabled: true,
      aiEnabled: true,
      aiUsageDescription: 'Use when the user explicitly asks to open bonuses.',
      auditReason: 'Enable requested navigation to bonuses',
    })).resolves.toEqual(authoritative)

    expect(productActionsConfigureAiExposure).toHaveBeenCalledWith('project-1', 'action-1', {
      aiEnabled: true,
      aiUsageDescription: 'Use when the user explicitly asks to open bonuses.',
      auditReason: 'Enable requested navigation to bonuses',
    })
    expect(productActionsConfigureProjectAction).toHaveBeenCalledWith('project-1', 'action-1', {
      scenarioEnabled: true,
    })
  })
})
