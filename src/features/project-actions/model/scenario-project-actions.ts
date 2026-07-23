import type { ScenarioActionDefinition } from '@/shared/types/domain'
import type { ProjectAction } from './project-action'

export function scenarioActionDefinitionsForProject(
  projectActions: readonly ProjectAction[],
  legacyDefinitions: readonly ScenarioActionDefinition[],
): ScenarioActionDefinition[] {
  if (!projectActions.length) return [...legacyDefinitions]

  const legacyByCode = new Map(legacyDefinitions.map((definition) => [definition.type, definition]))

  return projectActions.map((action) => {
    const revision = action.actionTypeRevision
    const frontend = revision.executorAdapter === 'FRONTEND_COMMAND'
    const projected: ScenarioActionDefinition = {
      id: revision.id,
      projectId: action.projectId,
      type: action.code,
      name: action.nameOverride ?? revision.name,
      description: action.descriptionOverride ?? revision.description,
      executor: frontend ? 'FRONTEND' : 'SERVER',
      serverHandler: frontend ? null : action.code,
      commandType: frontend ? action.code : null,
      configSchema: revision.inputSchema as unknown as ScenarioActionDefinition['configSchema'],
      uiSchema: revision.uiSchema as unknown as ScenarioActionDefinition['uiSchema'],
      enabled: action.lifecycle === 'ACTIVE'
        && action.scenarioEnabled
        && revision.supportedSurfaces.includes('SCENARIO'),
      builtIn: action.actionType.origin === 'SYSTEM',
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
    }
    const legacy = legacyByCode.get(action.code)
    if (!legacy) return projected

    return {
      ...legacy,
      id: projected.id,
      projectId: projected.projectId,
      type: projected.type,
      enabled: projected.enabled,
      builtIn: projected.builtIn,
      createdAt: projected.createdAt,
      updatedAt: projected.updatedAt,
    }
  })
}

export function scenarioEligibleActionDefinitions(
  definitions: readonly ScenarioActionDefinition[],
  projectActions: readonly ProjectAction[],
): ScenarioActionDefinition[] {
  return scenarioActionDefinitionsForProject(projectActions, definitions)
    .filter((definition) => definition.enabled)
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
