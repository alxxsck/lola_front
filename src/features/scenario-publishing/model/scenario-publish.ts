import { ApiError } from '@/shared/api/http/api-error'
import type { PublishScenarioResponseDto, ScenarioPublishInput } from '@/shared/api/repository/scenario-authoring'

export type ScenarioPublishState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'published'; response: PublishScenarioResponseDto; currentRevisionId: string }
  | { status: 'conflict'; kind: 'head'; error: ApiError; draft: ScenarioPublishInput; currentRevisionId?: string }
  | { status: 'conflict'; kind: 'draft'; error: ApiError; draft: ScenarioPublishInput }
  | { status: 'conflict'; kind: 'catalog'; error: ApiError; draft: ScenarioPublishInput; currentCatalogRevision?: string }
  | { status: 'error'; error: unknown; draft: ScenarioPublishInput }

export interface ScenarioPublishStateMachine {
  getState: () => ScenarioPublishState
  subscribe: (listener: (state: ScenarioPublishState) => void) => () => void
  publish: (draft: ScenarioPublishInput) => Promise<void>
  reset: () => void
}

function conflictHead(error: ApiError): string | undefined {
  if (!error.details || typeof error.details !== 'object' || !('currentRevisionId' in error.details)) return undefined
  return typeof error.details.currentRevisionId === 'string' ? error.details.currentRevisionId : undefined
}

function conflictCatalog(error: ApiError): string | undefined {
  if (!error.details || typeof error.details !== 'object' || !('currentCatalogRevision' in error.details)) return undefined
  return typeof error.details.currentCatalogRevision === 'string' ? error.details.currentCatalogRevision : undefined
}

export function createScenarioPublishStateMachine(
  execute: (draft: ScenarioPublishInput) => Promise<PublishScenarioResponseDto>,
): ScenarioPublishStateMachine {
  let state: ScenarioPublishState = { status: 'idle' }
  let inFlight: Promise<void> | null = null
  const listeners = new Set<(state: ScenarioPublishState) => void>()

  function transition(next: ScenarioPublishState) {
    state = next
    listeners.forEach((listener) => listener(state))
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    publish(draft) {
      if (inFlight) return inFlight
      transition({ status: 'pending' })
      let execution: Promise<PublishScenarioResponseDto>
      try {
        execution = execute(draft)
      } catch (error) {
        execution = Promise.reject(error)
      }
      inFlight = execution
        .then((response) => {
          transition({ status: 'published', response, currentRevisionId: response.revision.id })
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 409) {
            if (error.code === 'CATALOG_REVISION_STALE') {
              transition({ status: 'conflict', kind: 'catalog', error, draft, ...(conflictCatalog(error) ? { currentCatalogRevision: conflictCatalog(error) } : {}) })
            } else if (error.code === 'SCENARIO_DRAFT_CONFLICT') {
              transition({ status: 'conflict', kind: 'draft', error, draft })
            } else {
              transition({ status: 'conflict', kind: 'head', error, draft, ...(conflictHead(error) ? { currentRevisionId: conflictHead(error) } : {}) })
            }
          } else {
            transition({ status: 'error', error, draft })
          }
        })
        .finally(() => { inFlight = null })
      return inFlight
    },
    reset() {
      if (!inFlight) transition({ status: 'idle' })
    },
  }
}
