import { defineStore } from 'pinia'
import { ref } from 'vue'
import { projectActionsRepository } from '../api/project-actions-repository'
import type { ActionTypeCatalogItem, AiCapabilityPreview, ProjectAction } from './project-action'
import { toProjectActionError, type ProjectActionError } from './project-action-error'
import type { ConfigureProjectActionInput } from './project-action'

const CACHE_TTL_MS = 60_000

export const useProjectActionsStore = defineStore('project-actions', () => {
  const catalogByProject = ref<Record<string, ActionTypeCatalogItem[]>>({})
  const actionsByProject = ref<Record<string, ProjectAction[]>>({})
  const loadingByProject = ref<Record<string, boolean>>({})
  const errorsByProject = ref<Record<string, ProjectActionError | null>>({})
  const loadedAtByProject = ref<Record<string, number>>({})
  const previewByAction = ref<Record<string, AiCapabilityPreview>>({})
  const previewErrorsByAction = ref<Record<string, ProjectActionError | null>>({})
  const previewLoadingByAction = ref<Record<string, boolean>>({})
  const mutationErrorsByAction = ref<Record<string, ProjectActionError | null>>({})
  const mutatingByAction = ref<Record<string, boolean>>({})
  const inFlight = new Map<string, Promise<void>>()
  let generation = 0

  function catalogForProject(projectId: string): ActionTypeCatalogItem[] {
    return catalogByProject.value[projectId] ?? []
  }

  function actionsForProject(projectId: string): ProjectAction[] {
    return actionsByProject.value[projectId] ?? []
  }

  function load(projectId: string, force: boolean): Promise<void> {
    const loadedAt = loadedAtByProject.value[projectId] ?? 0
    if (!force && actionsByProject.value[projectId] && Date.now() - loadedAt < CACHE_TTL_MS) {
      return Promise.resolve()
    }
    const pending = inFlight.get(projectId)
    if (pending) return pending

    loadingByProject.value = { ...loadingByProject.value, [projectId]: true }
    errorsByProject.value = { ...errorsByProject.value, [projectId]: null }
    const requestGeneration = generation
    const request = Promise.all([
      projectActionsRepository.listActionTypes(projectId),
      projectActionsRepository.listProjectActions(projectId),
    ]).then(([catalog, actions]) => {
      if (requestGeneration !== generation) return
      catalogByProject.value = { ...catalogByProject.value, [projectId]: catalog }
      actionsByProject.value = { ...actionsByProject.value, [projectId]: actions }
      loadedAtByProject.value = { ...loadedAtByProject.value, [projectId]: Date.now() }
    }).catch((cause: unknown) => {
      if (requestGeneration === generation) {
        errorsByProject.value = { ...errorsByProject.value, [projectId]: toProjectActionError(cause) }
      }
      throw cause
    }).finally(() => {
      if (requestGeneration === generation) {
        loadingByProject.value = { ...loadingByProject.value, [projectId]: false }
      }
      if (inFlight.get(projectId) === request) inFlight.delete(projectId)
    })
    inFlight.set(projectId, request)
    return request
  }

  function ensureLoaded(projectId: string): Promise<void> {
    return load(projectId, false)
  }

  function refresh(projectId: string): Promise<void> {
    return load(projectId, true)
  }

  async function loadPreview(projectId: string, actionId: string, force = false): Promise<AiCapabilityPreview> {
    const cached = previewByAction.value[actionId]
    if (cached && !force) return cached
    const requestGeneration = generation
    previewLoadingByAction.value = { ...previewLoadingByAction.value, [actionId]: true }
    previewErrorsByAction.value = { ...previewErrorsByAction.value, [actionId]: null }
    try {
      const preview = await projectActionsRepository.preview(projectId, actionId)
      if (requestGeneration === generation) {
        previewByAction.value = { ...previewByAction.value, [actionId]: preview }
      }
      return preview
    } catch (cause: unknown) {
      if (requestGeneration === generation) {
        previewErrorsByAction.value = { ...previewErrorsByAction.value, [actionId]: toProjectActionError(cause) }
      }
      throw cause
    } finally {
      if (requestGeneration === generation) {
        previewLoadingByAction.value = { ...previewLoadingByAction.value, [actionId]: false }
      }
    }
  }

  async function configure(
    projectId: string,
    actionId: string,
    input: ConfigureProjectActionInput,
  ): Promise<ProjectAction> {
    return mutate(projectId, actionId, () => projectActionsRepository.configure(projectId, actionId, input))
  }

  async function archive(projectId: string, actionId: string): Promise<ProjectAction> {
    return mutate(projectId, actionId, () => projectActionsRepository.archive(projectId, actionId))
  }

  async function mutate(
    projectId: string,
    actionId: string,
    request: () => Promise<ProjectAction>,
  ): Promise<ProjectAction> {
    const requestGeneration = generation
    mutatingByAction.value = { ...mutatingByAction.value, [actionId]: true }
    mutationErrorsByAction.value = { ...mutationErrorsByAction.value, [actionId]: null }
    try {
      const authoritative = await request()
      if (requestGeneration !== generation) return authoritative
      const current = actionsForProject(projectId)
      const index = current.findIndex((action) => action.id === authoritative.id)
      const actions = [...current]
      if (index >= 0) actions.splice(index, 1, authoritative)
      else actions.push(authoritative)
      actionsByProject.value = { ...actionsByProject.value, [projectId]: actions }
      loadedAtByProject.value = { ...loadedAtByProject.value, [projectId]: 0 }
      const previews = { ...previewByAction.value }
      delete previews[actionId]
      previewByAction.value = previews
      return authoritative
    } catch (cause: unknown) {
      if (requestGeneration === generation) {
        mutationErrorsByAction.value = { ...mutationErrorsByAction.value, [actionId]: toProjectActionError(cause) }
      }
      throw cause
    } finally {
      if (requestGeneration === generation) {
        mutatingByAction.value = { ...mutatingByAction.value, [actionId]: false }
      }
    }
  }

  function clear() {
    generation += 1
    catalogByProject.value = {}
    actionsByProject.value = {}
    loadingByProject.value = {}
    errorsByProject.value = {}
    loadedAtByProject.value = {}
    previewByAction.value = {}
    previewErrorsByAction.value = {}
    previewLoadingByAction.value = {}
    mutationErrorsByAction.value = {}
    mutatingByAction.value = {}
    inFlight.clear()
  }

  return {
    catalogByProject,
    actionsByProject,
    loadingByProject,
    errorsByProject,
    previewByAction,
    previewErrorsByAction,
    previewLoadingByAction,
    mutationErrorsByAction,
    mutatingByAction,
    catalogForProject,
    actionsForProject,
    ensureLoaded,
    refresh,
    loadPreview,
    configure,
    archive,
    clear,
  }
})
