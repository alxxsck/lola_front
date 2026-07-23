import { parseScenarioActionCatalogItem } from '@/shared/lib/scenario-action-catalog'
import type { ScenarioActionCatalogItem } from '@/shared/types/domain'
import type { ProjectAction } from './project-action'

export interface ScenarioActionCatalogProjection {
  catalog: ScenarioActionCatalogItem[]
  error: Error | null
}

function parseScenarioActionCatalog(
  projectActions: readonly ProjectAction[],
): ScenarioActionCatalogItem[] {
  return projectActions
    .filter((action) => action.actionTypeRevision.supportedSurfaces.includes('SCENARIO'))
    .map((action) => {
      const revision = action.actionTypeRevision
      return parseScenarioActionCatalogItem({
        id: revision.id,
        type: action.code,
        name: action.nameOverride ?? revision.name,
        description: action.descriptionOverride ?? revision.description,
        executor: revision.executorAdapter === 'FRONTEND_COMMAND' ? 'FRONTEND' : 'SERVER',
        configSchema: revision.inputSchema,
        uiSchema: revision.uiSchema,
        enabled: action.lifecycle === 'ACTIVE' && action.scenarioEnabled,
      })
    })
}

export function projectScenarioActionCatalog(
  projectActions: readonly ProjectAction[],
): ScenarioActionCatalogProjection {
  try {
    return {
      catalog: parseScenarioActionCatalog(projectActions),
      error: null,
    }
  } catch (cause: unknown) {
    return {
      catalog: [],
      error: cause instanceof Error ? cause : new Error(String(cause)),
    }
  }
}

export function scenarioAvailableActions(
  catalog: readonly ScenarioActionCatalogItem[],
): ScenarioActionCatalogItem[] {
  return catalog.filter((item) => item.enabled)
}

export function scenarioProjectActionAvailabilityIssue(
  code: string,
  projectActions: readonly ProjectAction[],
): string | null {
  const action = projectActions.find((item) => item.code === code)
  if (!action) return `Действие ${code} не зарегистрировано в Project Actions.`
  if (action.lifecycle !== 'ACTIVE') return `Действие ${code} архивировано и больше недоступно.`
  if (!action.actionTypeRevision.supportedSurfaces.includes('SCENARIO')) {
    return `Закреплённая ревизия действия ${code} не поддерживает сценарии.`
  }
  if (!action.scenarioEnabled) return `Действие ${code} выключено для сценариев.`
  return null
}
