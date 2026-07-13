import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { repository } from '@/shared/api/repository'
import { demoActionDefinitions } from '@/shared/api/mock-data'
import { useActionDefinitionsStore } from './action-definitions.store'

describe('action definitions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('deduplicates concurrent loads and caches definitions by project', async () => {
    let resolveRequest!: (value: typeof demoActionDefinitions) => void
    const request = new Promise<typeof demoActionDefinitions>((resolve) => { resolveRequest = resolve })
    const getDefinitions = vi.spyOn(repository, 'getActionDefinitions').mockReturnValue(request)
    const store = useActionDefinitionsStore()

    const first = store.ensureLoaded('project-1')
    const second = store.ensureLoaded('project-1')
    expect(getDefinitions).toHaveBeenCalledTimes(1)
    resolveRequest(demoActionDefinitions)
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    await store.ensureLoaded('project-1')

    expect(getDefinitions).toHaveBeenCalledTimes(1)
    expect(store.enabledForProject('project-1')).toHaveLength(demoActionDefinitions.length)
  })

  it('refreshes an existing project cache explicitly', async () => {
    const getDefinitions = vi.spyOn(repository, 'getActionDefinitions').mockResolvedValue(demoActionDefinitions)
    const store = useActionDefinitionsStore()
    await store.ensureLoaded('project-1')
    await store.refresh('project-1')
    expect(getDefinitions).toHaveBeenCalledTimes(2)
  })
})
