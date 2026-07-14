import { ApiError } from '@/shared/api/http/api-error'

export function scenarioApiErrorMessage(cause: unknown, fallback = 'Не удалось сохранить сценарий'): string {
  if (!(cause instanceof ApiError)) return cause instanceof Error ? cause.message : fallback
  const details = asRecord(cause.details)
  const path = typeof details?.path === 'string' ? details.path : undefined
  const position = typeof details?.position === 'number' ? details.position + 1 : undefined

  if (cause.code === 'SCENARIO_CONDITION_FIELD_NOT_FOUND') {
    return path
      ? `Поле условия «${path}» отсутствует в схеме события. Выберите существующее поле.`
      : 'Одно из условий использует поле, которого нет в схеме события.'
  }

  if (cause.code === 'SCENARIO_TEMPLATE_DEFAULT_REQUIRED') {
    const step = position ? `Шаг ${position}: ` : ''
    const field = path ? `необязательное поле «${path}»` : 'необязательное поле события'
    return `${step}${field} требует значения по умолчанию. Добавьте в шаблон | default: "…".`
  }

  return cause.message || fallback
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}
