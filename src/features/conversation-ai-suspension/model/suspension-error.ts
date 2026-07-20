import { ApiError } from '@/shared/api/http/api-error'

export type SuspensionErrorKind =
  | 'FORBIDDEN'
  | 'VERSION_CONFLICT'
  | 'ALREADY_ACTIVE'
  | 'NOT_ACTIVE'
  | 'CONVERSATION_CLOSED'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNAVAILABLE'
  | 'UNKNOWN'

export interface SuspensionError {
  kind: SuspensionErrorKind
  message: string
  retryAfterSeconds?: number
  requestId?: string
}

export function suspensionError(cause: unknown): SuspensionError {
  const error = cause instanceof ApiError ? cause : new ApiError(0, 'Не удалось связаться с сервером')
  const code = error.code ?? ''
  let kind: SuspensionErrorKind = 'UNKNOWN'
  let message = 'Не удалось выполнить действие. Попробуйте ещё раз.'

  if (error.status === 403) {
    kind = 'FORBIDDEN'
    message = 'У вас больше нет прав на управление AI в этом проекте.'
  } else if (code.includes('VERSION_CONFLICT')) {
    kind = 'VERSION_CONFLICT'
    message = 'Состояние изменил другой администратор. Мы загрузим актуальные данные.'
  } else if (code.includes('ALREADY_ACTIVE')) {
    kind = 'ALREADY_ACTIVE'
    message = 'AI уже приостановлен другим администратором.'
  } else if (code.includes('NOT_ACTIVE')) {
    kind = 'NOT_ACTIVE'
    message = 'AI уже возобновил ответы.'
  } else if (code.includes('CONVERSATION_CLOSED')) {
    kind = 'CONVERSATION_CLOSED'
    message = 'Диалог закрыт. Обновите список диалогов.'
  } else if (error.status === 404) {
    kind = 'NOT_FOUND'
    message = 'Диалог больше недоступен. Обновляем список диалогов.'
  } else if (error.status === 400 || error.status === 422) {
    kind = 'INVALID'
    message = 'Проверьте срок, причину и комментарий.'
  } else if (error.status === 429) {
    kind = 'RATE_LIMITED'
    message = error.retryAfterSeconds
      ? `Слишком много действий. Повторите через ${error.retryAfterSeconds} сек.`
      : 'Слишком много действий. Повторите немного позже.'
  } else if (error.status === 0) {
    kind = 'NETWORK'
    message = 'Нет связи с сервером. Введённые данные сохранены, можно повторить запрос.'
  } else if (error.status >= 500) {
    kind = 'UNAVAILABLE'
    message = 'Сервис временно недоступен. Попробуйте ещё раз.'
  }

  return {
    kind,
    message,
    ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    ...(error.requestId ? { requestId: error.requestId } : {}),
  }
}
