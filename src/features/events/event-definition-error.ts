import { ApiError } from '@/shared/api/http/api-error'

interface ErrorDetails extends Record<string, unknown> {
  eventLogCount?: unknown
  scenarios?: unknown
}

interface RawScenario extends Record<string, unknown> {
  id?: unknown
  code?: unknown
  name?: unknown
  status?: unknown
  issues?: unknown
}

interface RawIssue extends Record<string, unknown> {
  conditionPath?: unknown
  position?: unknown
}

export interface EventErrorScenario {
  id: string
  code: string
  name: string
  status?: string
  issues: string[]
}

export interface EventDefinitionError {
  message: string
  scenarios: EventErrorScenario[]
  eventLogCount?: number
}

export function eventDefinitionError(cause: unknown, fallback: string): EventDefinitionError {
  const error = cause instanceof ApiError ? cause : undefined
  const details = asRecord(error?.details) as ErrorDetails | undefined
  const scenarios = readScenarios(details?.scenarios)
  const eventLogCount = typeof details?.eventLogCount === 'number' ? details.eventLogCount : undefined

  if (error?.code === 'EVENT_SCHEMA_BREAKS_SCENARIOS') {
    return {
      message: 'Новую схему нельзя сохранить: из-за неё перестанут работать связанные сценарии. Сначала исправьте указанные места.',
      scenarios,
    }
  }

  if (error?.code === 'EVENT_DEFINITION_IN_USE') {
    return {
      message: deleteConflictMessage(scenarios.length, eventLogCount),
      scenarios,
      eventLogCount,
    }
  }

  if (error?.code === 'RESOURCE_IN_USE') {
    return {
      message: 'Событие связано с другими данными и пока не может быть удалено.',
      scenarios: [],
    }
  }

  return {
    message: cause instanceof Error ? cause.message : fallback,
    scenarios: [],
  }
}

function deleteConflictMessage(scenarioCount: number, eventLogCount?: number): string {
  if (scenarioCount && eventLogCount) {
    return 'Событие используется в сценариях и уже попадало в историю. Сначала удалите или перевяжите сценарии. Из-за сохранённой истории событие можно только выключить.'
  }
  if (eventLogCount) return 'По событию уже есть история, поэтому удалить его нельзя. Выключите событие, чтобы сохранить данные.'
  return 'Событие используется в сценариях. Удалите или перевяжите их, затем повторите удаление.'
}

function readScenarios(value: unknown): EventErrorScenario[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const scenario = asRecord(item) as RawScenario | undefined
    if (!scenario) return []
    return [{
      id: stringValue(scenario.id),
      code: stringValue(scenario.code),
      name: stringValue(scenario.name) || stringValue(scenario.code) || 'Сценарий',
      status: stringValue(scenario.status) || undefined,
      issues: readIssues(scenario.issues),
    }]
  })
}

function readIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const issue = asRecord(item) as RawIssue | undefined
    if (!issue) return []
    if (typeof issue.conditionPath === 'string') return [`Условие использует поле «${issue.conditionPath}».`]
    if (typeof issue.position === 'number') return [`Шаг ${issue.position + 1}: шаблон не соответствует новой схеме события.`]
    return []
  })
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
