import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectActionsRepository } from '../api/project-actions-repository'
import type { ProjectAction } from './project-action'
import { useProjectActionsStore } from './project-actions.store'

vi.mock('../api/project-actions-repository', () => ({
  projectActionsRepository: {
    listActionTypes: vi.fn(),
    listProjectActions: vi.fn(),
    configure: vi.fn(),
    archive: vi.fn(),
    preview: vi.fn(),
  },
}))

const action = {
  id: 'action-1',
  projectId: 'project-1',
  code: 'OPEN_PAGE',
  aiEnabled: false,
  scenarioEnabled: true,
} as unknown as ProjectAction

describe('Project Actions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('deduplicates concurrent authoritative catalog loads by project', async () => {
    let resolveActions!: (value: ProjectAction[]) => void
    vi.mocked(projectActionsRepository.listActionTypes).mockResolvedValue([])
    vi.mocked(projectActionsRepository.listProjectActions).mockReturnValue(new Promise((resolve) => {
      resolveActions = resolve
    }))
    const store = useProjectActionsStore()

    const first = store.ensureLoaded('project-1')
    const second = store.ensureLoaded('project-1')
    expect(projectActionsRepository.listActionTypes).toHaveBeenCalledTimes(1)
    expect(projectActionsRepository.listProjectActions).toHaveBeenCalledTimes(1)
    resolveActions([action])
    await Promise.all([first, second])
    await store.ensureLoaded('project-1')

    expect(projectActionsRepository.listProjectActions).toHaveBeenCalledTimes(1)
    expect(store.actionsForProject('project-1')).toEqual([action])
  })

  it('reconciles mutation responses and invalidates list and preview caches', async () => {
    const configured = { ...action, aiEnabled: true }
    vi.mocked(projectActionsRepository.listActionTypes).mockResolvedValue([])
    vi.mocked(projectActionsRepository.listProjectActions).mockResolvedValue([action])
    vi.mocked(projectActionsRepository.preview).mockResolvedValue({ tool: null, issues: [] })
    vi.mocked(projectActionsRepository.configure).mockResolvedValue(configured)
    const store = useProjectActionsStore()
    await store.ensureLoaded('project-1')
    await store.loadPreview('project-1', 'action-1')

    await store.configure('project-1', 'action-1', { aiEnabled: true })

    expect(store.actionsForProject('project-1')).toEqual([configured])
    expect(store.previewByAction['action-1']).toBeUndefined()
    await store.ensureLoaded('project-1')
    expect(projectActionsRepository.listProjectActions).toHaveBeenCalledTimes(2)
  })

  it('clears authoritative Project Action caches on session teardown', async () => {
    vi.mocked(projectActionsRepository.listActionTypes).mockResolvedValue([])
    vi.mocked(projectActionsRepository.listProjectActions).mockResolvedValue([action])
    vi.mocked(projectActionsRepository.preview).mockResolvedValue({ tool: null, issues: [] })
    const store = useProjectActionsStore()
    await store.ensureLoaded('project-1')
    await store.loadPreview('project-1', 'action-1')

    store.clear()

    expect(store.actionsForProject('project-1')).toEqual([])
    expect(store.catalogForProject('project-1')).toEqual([])
    expect(store.previewByAction).toEqual({})
    await store.ensureLoaded('project-1')
    expect(projectActionsRepository.listProjectActions).toHaveBeenCalledTimes(2)
  })

  it('does not repopulate a cleared session from an older in-flight request', async () => {
    let resolveActions!: (value: ProjectAction[]) => void
    vi.mocked(projectActionsRepository.listActionTypes).mockResolvedValue([])
    vi.mocked(projectActionsRepository.listProjectActions).mockReturnValue(new Promise((resolve) => {
      resolveActions = resolve
    }))
    const store = useProjectActionsStore()
    const pending = store.ensureLoaded('project-1')

    store.clear()
    resolveActions([action])
    await pending

    expect(store.actionsForProject('project-1')).toEqual([])
  })

  it('does not repopulate preview or mutation state after session teardown', async () => {
    let resolvePreview!: (value: { tool: null; issues: never[] }) => void
    let resolveConfigure!: (value: ProjectAction) => void
    vi.mocked(projectActionsRepository.preview).mockReturnValue(new Promise((resolve) => {
      resolvePreview = resolve
    }))
    vi.mocked(projectActionsRepository.configure).mockReturnValue(new Promise((resolve) => {
      resolveConfigure = resolve
    }))
    const store = useProjectActionsStore()
    const preview = store.loadPreview('project-1', 'action-1')
    const configure = store.configure('project-1', 'action-1', { aiEnabled: true })

    store.clear()
    resolvePreview({ tool: null, issues: [] })
    resolveConfigure(action)
    await Promise.all([preview, configure])

    expect(store.previewByAction).toEqual({})
    expect(store.previewLoadingByAction).toEqual({})
    expect(store.actionsForProject('project-1')).toEqual([])
    expect(store.mutatingByAction).toEqual({})
  })
})
