import axios from 'axios'

interface NestErrorBody {
  message?: string | string[]
  error?: string
  requestId?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly requestId?: string
  readonly details?: unknown

  constructor(status: number, message: string, details?: unknown, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
    this.requestId = requestId
  }
}

function errorMessage(body: NestErrorBody | undefined, fallback: string): string {
  if (Array.isArray(body?.message)) return body.message.join('. ')
  if (typeof body?.message === 'string') return body.message
  if (typeof body?.error === 'string') return body.error
  return fallback
}

export function normalizeApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause
  if (!axios.isAxiosError(cause)) {
    return new ApiError(0, cause instanceof Error ? cause.message : 'Неизвестная ошибка', cause)
  }

  const body = cause.response?.data as NestErrorBody | undefined
  const status = cause.response?.status ?? 0
  const requestHeaders = cause.config?.headers
  const requestId = body?.requestId
    ?? cause.response?.headers?.['x-request-id']
    ?? requestHeaders?.get?.('x-request-id')
    ?? requestHeaders?.['x-request-id']
  const fallback = status ? `API error ${status}` : 'Не удалось связаться с сервером'

  return new ApiError(status, errorMessage(body, fallback), body, requestId)
}
