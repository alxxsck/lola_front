import { computed, onScopeDispose, ref } from 'vue'
import { ApiError } from '@/shared/api/http/api-error'

const MAX_RETRY_AFTER_SECONDS = 3_600

const PASSWORD_POLICY_MESSAGES = {
  MIN_LENGTH: 'Пароль должен содержать не менее 15 символов.',
  MAX_LENGTH: 'Пароль превышает допустимую длину. Сократите его.',
  MAX_BYTES: 'Пароль занимает слишком много места. Сократите его.',
  BLOCKLISTED: 'Этот пароль слишком распространён. Выберите другой.',
} as const

type PasswordPolicyReason = keyof typeof PASSWORD_POLICY_MESSAGES

function structuredReason(details: unknown): PasswordPolicyReason | undefined {
  if (!details || typeof details !== 'object' || !('reason' in details)) return undefined
  const reason = details.reason
  return typeof reason === 'string' && reason in PASSWORD_POLICY_MESSAGES
    ? reason as PasswordPolicyReason
    : undefined
}

function boundedRetryAfterSeconds(error: ApiError): number {
  const fromDetails = error.details && typeof error.details === 'object' && 'retryAfterSeconds' in error.details
    ? Number(error.details.retryAfterSeconds)
    : Number.NaN
  const candidate = error.retryAfterSeconds ?? fromDetails
  if (!Number.isFinite(candidate)) return 1
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Math.ceil(candidate)))
}

function safeMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiError)) return cause instanceof Error ? cause.message : fallback
  if (cause.code === 'AUTHENTICATION_FAILED') return 'Неверный email или пароль.'
  if (cause.code === 'PASSWORD_SETUP_TOKEN_INVALID') {
    return 'Сессия установки пароля недоступна. Войдите ещё раз.'
  }
  if (cause.code === 'PASSWORD_POLICY_REJECTED') {
    const reason = structuredReason(cause.details)
    return reason ? PASSWORD_POLICY_MESSAGES[reason] : 'Этот пароль нельзя использовать. Выберите другой.'
  }
  return cause.message || fallback
}

export function useAuthErrorFeedback() {
  const message = ref('')
  const retryAfterSeconds = ref(0)
  const rateLimited = ref(false)
  let countdown: ReturnType<typeof setInterval> | undefined

  const retryBlocked = computed(() => retryAfterSeconds.value > 0)
  const displayMessage = computed(() => {
    if (!rateLimited.value) return message.value
    if (retryAfterSeconds.value > 0) {
      return `Слишком много попыток. Повторите через ${retryAfterSeconds.value} сек.`
    }
    return 'Слишком много попыток. Теперь можно повторить.'
  })

  function stopCountdown() {
    if (countdown !== undefined) clearInterval(countdown)
    countdown = undefined
  }

  function clear() {
    stopCountdown()
    message.value = ''
    retryAfterSeconds.value = 0
    rateLimited.value = false
  }

  function show(messageText: string) {
    clear()
    message.value = messageText
  }

  function present(cause: unknown, fallback: string) {
    clear()
    if (cause instanceof ApiError && cause.code === 'RATE_LIMITED') {
      rateLimited.value = true
      retryAfterSeconds.value = boundedRetryAfterSeconds(cause)
      countdown = setInterval(() => {
        retryAfterSeconds.value = Math.max(0, retryAfterSeconds.value - 1)
        if (retryAfterSeconds.value === 0) stopCountdown()
      }, 1_000)
      return
    }
    message.value = safeMessage(cause, fallback)
  }

  onScopeDispose(stopCountdown)

  return { clear, displayMessage, message, present, retryBlocked, show }
}
