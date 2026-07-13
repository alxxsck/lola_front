import { ref } from 'vue'
import { defineStore } from 'pinia'
import { repository } from '@/shared/api/repository'
import type { ScenarioActionDefinition } from '@/shared/types/domain'

export const useActionDefinitionsStore = defineStore('action-definitions', () => {
  const definitionsByProject = ref<Record<string, ScenarioActionDefinition[]>>({})
  const loadingByProject = ref<Record<string, boolean>>({})
  const errorsByProject = ref<Record<string, string | null>>({})
  const loadedAtByProject = ref<Record<string, number>>({})
  const inFlight = new Map<string, Promise<ScenarioActionDefinition[]>>()
  const generations = new Map<string, number>()
  const cacheTtlMs = 60_000

  function forProject(projectId: string): ScenarioActionDefinition[] {
    return definitionsByProject.value[projectId] ?? []
  }

  function enabledForProject(projectId: string): ScenarioActionDefinition[] {
    return forProject(projectId).filter((definition) => definition.enabled)
  }

  function load(projectId: string, force: boolean): Promise<ScenarioActionDefinition[]> {
    const loadedAt = loadedAtByProject.value[projectId] ?? 0
    if (!force && definitionsByProject.value[projectId] && Date.now() - loadedAt < cacheTtlMs) return Promise.resolve(forProject(projectId))
    const pending = inFlight.get(projectId)
    if (pending) return pending

    loadingByProject.value = { ...loadingByProject.value, [projectId]: true }
    errorsByProject.value = { ...errorsByProject.value, [projectId]: null }
    const generation = generations.get(projectId) ?? 0
    const request = repository.getActionDefinitions(projectId)
      .then((definitions) => {
        if ((generations.get(projectId) ?? 0) !== generation) return definitions
        definitionsByProject.value = { ...definitionsByProject.value, [projectId]: definitions }
        loadedAtByProject.value = { ...loadedAtByProject.value, [projectId]: Date.now() }
        return definitions
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить каталог действий'
        errorsByProject.value = { ...errorsByProject.value, [projectId]: message }
        throw error
      })
      .finally(() => {
        if ((generations.get(projectId) ?? 0) === generation) {
          loadingByProject.value = { ...loadingByProject.value, [projectId]: false }
        }
        if (inFlight.get(projectId) === request) inFlight.delete(projectId)
      })
    inFlight.set(projectId, request)
    return request
  }

  function ensureLoaded(projectId: string): Promise<ScenarioActionDefinition[]> {
    return load(projectId, false)
  }

  function refresh(projectId: string): Promise<ScenarioActionDefinition[]> {
    return load(projectId, true)
  }

  function clear(projectId?: string) {
    if (!projectId) {
      for (const key of new Set([...Object.keys(definitionsByProject.value), ...inFlight.keys()])) generations.set(key, (generations.get(key) ?? 0) + 1)
      definitionsByProject.value = {}
      errorsByProject.value = {}
      loadedAtByProject.value = {}
      inFlight.clear()
      return
    }
    generations.set(projectId, (generations.get(projectId) ?? 0) + 1)
    inFlight.delete(projectId)
    const remainingDefinitions = { ...definitionsByProject.value }
    const remainingErrors = { ...errorsByProject.value }
    const remainingLoadedAt = { ...loadedAtByProject.value }
    delete remainingDefinitions[projectId]
    delete remainingErrors[projectId]
    delete remainingLoadedAt[projectId]
    definitionsByProject.value = remainingDefinitions
    errorsByProject.value = remainingErrors
    loadedAtByProject.value = remainingLoadedAt
  }

  return {
    definitionsByProject,
    loadingByProject,
    errorsByProject,
    forProject,
    enabledForProject,
    ensureLoaded,
    refresh,
    clear,
  }
})
