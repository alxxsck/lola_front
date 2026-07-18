import type { ScenarioAction } from '@/shared/types/domain'

export function normalizeScenarioActions(actions: ScenarioAction[]): ScenarioAction[] {
  return actions.map((action, position) => ({ ...action, position }))
}
