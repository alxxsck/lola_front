import { ApiError } from '@/shared/api/http/api-error'

export function adminMessageError(cause: unknown): string {
  const raw = cause instanceof Error
    ? `${cause instanceof ApiError ? cause.code : ''} ${cause.message} ${JSON.stringify((cause as { details?: unknown }).details ?? '')}`
    : String(cause)
  if (raw.includes('USER_OFFLINE')) {
    return 'Пользователь сейчас офлайн. Сообщение не отправлено — попробуйте после его возвращения.'
  }
  return cause instanceof Error ? cause.message : 'Не удалось отправить сообщение'
}
