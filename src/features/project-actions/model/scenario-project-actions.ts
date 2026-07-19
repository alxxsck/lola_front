import type { ScenarioActionDefinition } from '@/shared/types/domain'
import type { ProjectAction } from './project-action'

export function scenarioEligibleActionDefinitions(
  definitions: readonly ScenarioActionDefinition[],
  projectActions: readonly ProjectAction[],
): ScenarioActionDefinition[] {
  const eligibleCodes = new Set(projectActions.filter((action) =>
    action.lifecycle === 'ACTIVE'
    && action.scenarioEnabled
    && action.actionTypeRevision.supportedSurfaces.includes('SCENARIO'),
  ).map((action) => action.code))

  return definitions.filter((definition) => definition.enabled && eligibleCodes.has(definition.type))
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
