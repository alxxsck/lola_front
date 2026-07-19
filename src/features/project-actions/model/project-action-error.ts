import { normalizeApiError } from '@/shared/api/http/api-error'

export type ProjectActionErrorKind = 'validation' | 'permission' | 'conflict' | 'network' | 'not-found' | 'unknown'

export interface ProjectActionError {
  kind: ProjectActionErrorKind
  code: string
  message: string
  status: number
  details?: unknown
  requestId?: string
}

const messages: Readonly<Record<string, string>> = {
  PROJECT_ACTION_NOT_FOUND: 'Действие проекта не найдено.',
  PROJECT_ACTION_ARCHIVED: 'Архивное действие нельзя изменить.',
  PROJECT_ACTION_IN_USE: 'Действие используется активным сценарием и пока не может быть архивировано.',
  INTEGRATION_ACTION_PROJECT_MISMATCH: 'Интеграционное действие принадлежит другому проекту.',
  ACTION_SURFACE_UNSUPPORTED: 'Выбранная поверхность не поддерживается этим типом действия.',
  AI_ACTION_DESCRIPTION_INVALID: 'Описание для AI должно содержать от 20 до 2000 символов.',
  AI_ACTION_DESCRIPTION_UNSAFE: 'Описание для AI содержит запрещённые технические данные.',
  PROJECT_ACTION_CONFIGURATION_INVALID: 'Конфигурация не соответствует контракту типа действия.',
  AI_ACTION_AUDIT_REASON_REQUIRED: 'Для включения или расширения доступа AI нужна причина изменения.',
  AI_ACTION_AUDIT_REASON_UNSAFE: 'Причина изменения содержит запрещённые технические данные.',
  AI_ACTION_TARGET_CATALOG_EMPTY: 'Сначала разрешите хотя бы одну безопасную UI-цель.',
  AI_ACTION_ACTOR_REQUIRED: 'Не удалось подтвердить владельца, выполняющего изменение.',
}

export function toProjectActionError(cause: unknown): ProjectActionError {
  const error = normalizeApiError(cause)
  const code = error.code ?? (error.status === 403 ? 'PROJECT_ACTION_OWNER_REQUIRED' : 'PROJECT_ACTION_REQUEST_FAILED')

  return {
    kind: errorKind(error.status),
    code,
    message: messages[code] ?? (error.status === 403
      ? 'Изменять и архивировать действия может только владелец проекта.'
      : error.message),
    status: error.status,
    ...(error.details === undefined ? {} : { details: error.details }),
    ...(error.requestId ? { requestId: error.requestId } : {}),
  }
}

function errorKind(status: number): ProjectActionErrorKind {
  if (status === 0) return 'network'
  if (status === 400 || status === 422) return 'validation'
  if (status === 401 || status === 403) return 'permission'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  return 'unknown'
}
