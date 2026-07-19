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

  const translationMessages: Record<string, string> = {
    TRANSLATION_DISABLED: 'AI-перевод временно недоступен. Заполните переводы вручную.',
    TRANSLATION_LOCALE_UNSUPPORTED: 'Один из языков больше не поддерживается. Обновите каталог и повторите перевод — введённый текст сохранён.',
    TRANSLATION_BUDGET_EXCEEDED: 'Лимит AI-переводов проекта исчерпан. Проверьте бюджет в статистике AI в настройках проекта.',
    TRANSLATION_GLOBAL_BUDGET_EXCEEDED: 'Общий лимит AI-переводов исчерпан. Проверьте бюджет в статистике AI в настройках проекта.',
    TRANSLATION_IDEMPOTENCY_CONFLICT: 'Запрос перевода изменился. Проверьте исходный текст и запустите перевод ещё раз.',
    TRANSLATION_JOB_CONTENT_EXPIRED: 'Результат больше не хранится. Запустите новый перевод.',
    PLACEHOLDER_CORRUPTED: 'Перевод не применён: шаблонные переменные повреждены.',
    PROVIDER_OUTCOME_UNKNOWN: 'Результат перевода неизвестен. Повторите перевод для этого языка.',
  }
  if (cause.code && translationMessages[cause.code]) return translationMessages[cause.code]
  if (cause.code?.startsWith('TRANSLATION_')) {
    const supportId = cause.requestId ? ` Код обращения: ${cause.requestId}.` : ''
    return `Не удалось выполнить перевод.${supportId}`
  }

  return cause.message || fallback
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}
