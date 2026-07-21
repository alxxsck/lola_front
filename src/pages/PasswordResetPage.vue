<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useAuthStore } from '@/features/auth/auth.store'
import { useAuthErrorFeedback } from '@/features/auth/use-auth-error-feedback'
import {
  clearEmailActionCapability,
  hasEmailActionCapability,
  peekEmailActionCapability,
} from '@/features/email-identity/email-action-capability'
import { passwordRecoveryApi } from '@/features/password-recovery/password-recovery.api'
import { ApiError } from '@/shared/api/http/api-error'

const router = useRouter()
const auth = useAuthStore()
const newPassword = ref('')
const passwordConfirmation = ref('')
const state = ref<'READY' | 'PENDING' | 'INVALID' | 'MISSING'>(
  hasEmailActionCapability('password-reset') ? 'READY' : 'MISSING',
)
const errorElement = ref<HTMLElement | null>(null)
const {
  clear: clearError,
  displayMessage: error,
  present: presentError,
  retryBlocked,
  show: showError,
} = useAuthErrorFeedback()

function clearSensitiveState() {
  newPassword.value = ''
  passwordConfirmation.value = ''
}

async function submit() {
  if (state.value !== 'READY' || retryBlocked.value) return
  clearError()
  if (!newPassword.value) {
    showError('Введите новый пароль')
    await focusError()
    return
  }
  if (newPassword.value !== passwordConfirmation.value) {
    showError('Пароли не совпадают')
    await focusError()
    return
  }
  const token = peekEmailActionCapability('password-reset')
  if (!token) {
    state.value = 'MISSING'
    clearSensitiveState()
    return
  }

  state.value = 'PENDING'
  try {
    const result = await passwordRecoveryApi.complete({
      token,
      newPassword: newPassword.value,
      passwordConfirmation: passwordConfirmation.value,
    })
    if (result.kind !== 'PASSWORD_RESET_COMPLETED' || result.next !== 'LOGIN') {
      throw new ApiError(502, 'Unexpected password reset response')
    }
    clearEmailActionCapability('password-reset')
    clearSensitiveState()
    auth.finishExternalPasswordReset()
    await router.replace({ name: 'login', query: { passwordReset: 'success' } })
  } catch (cause) {
    state.value = 'READY'
    if (cause instanceof ApiError && cause.code === 'PASSWORD_CONFIRMATION_MISMATCH') {
      showError('Пароли не совпадают')
      await focusError()
      return
    }
    if (isRecoverableValidation(cause) || isRetryableFailure(cause)) {
      if (isRetryableFailure(cause) && !(cause instanceof ApiError && cause.code === 'RATE_LIMITED')) {
        showError('Не удалось изменить пароль. Попробуйте ещё раз.')
      } else {
        presentError(cause, 'Не удалось изменить пароль. Попробуйте ещё раз.')
      }
      await focusError()
      return
    }
    clearEmailActionCapability('password-reset')
    clearSensitiveState()
    clearError()
    state.value = 'INVALID'
  }
}

function isRecoverableValidation(cause: unknown): boolean {
  return cause instanceof ApiError && (
    cause.code === 'PASSWORD_POLICY_REJECTED'
  )
}

function isRetryableFailure(cause: unknown): boolean {
  return cause instanceof ApiError && (
    cause.code === 'RATE_LIMITED'
    || cause.status === 0
    || cause.status >= 500
  )
}

async function focusError() {
  await nextTick()
  errorElement.value?.focus()
}

onBeforeRouteLeave(() => {
  clearSensitiveState()
  clearEmailActionCapability('password-reset')
})
</script>

<template>
  <main class="reset-page">
    <section class="reset-card" aria-live="polite">
      <div class="brand"><span>L</span><strong>Lola CMS</strong></div>

      <template v-if="state === 'MISSING' || state === 'INVALID'">
        <span class="eyebrow">Восстановление доступа</span>
        <h1>Ссылка недоступна</h1>
        <Message severity="warn" role="alert">
          {{ state === 'INVALID'
            ? 'Ссылка недействительна или уже использована. Запросите новое письмо.'
            : 'Ссылка недоступна. Откройте полную ссылку из последнего письма.' }}
        </Message>
        <a class="safe-link" href="/forgot-password">Запросить новую ссылку</a>
      </template>

      <template v-else>
        <span class="eyebrow">Восстановление доступа</span>
        <h1>Создайте новый пароль</h1>
        <p>Пароль изменится только после отправки формы. Затем войдите в аккаунт обычным способом.</p>
        <form :aria-busy="state === 'PENDING'" @submit.prevent="submit">
          <div class="field">
            <label for="reset-new-password">Новый пароль</label>
            <InputText id="reset-new-password" v-model="newPassword" type="password" autocomplete="new-password" size="large" autofocus :aria-invalid="Boolean(error)" :aria-describedby="error ? 'reset-password-rules password-reset-error' : 'reset-password-rules'" />
            <small id="reset-password-rules">Не менее 15 символов. Можно использовать длинную фразу и вставку из менеджера паролей.</small>
          </div>
          <div class="field">
            <label for="reset-password-confirmation">Повторите новый пароль</label>
            <InputText id="reset-password-confirmation" v-model="passwordConfirmation" type="password" autocomplete="new-password" size="large" :aria-invalid="Boolean(error)" :aria-describedby="error ? 'password-reset-error' : undefined" />
          </div>
          <div v-if="error" id="password-reset-error" ref="errorElement" tabindex="-1">
            <Message severity="error">{{ error }}</Message>
          </div>
          <Button type="submit" label="Изменить пароль" icon="pi pi-arrow-right" icon-pos="right" :loading="state === 'PENDING'" :disabled="retryBlocked" />
        </form>
        <small class="inert-note">Открытие страницы само по себе ничего не изменяет.</small>
      </template>
    </section>
  </main>
</template>

<style scoped>
.reset-page{display:grid;min-height:100dvh;place-items:center;padding:24px;background:var(--surface-canvas)}.reset-card{display:flex;width:min(540px,100%);flex-direction:column;align-items:stretch;padding:34px;border:1px solid var(--border-default);border-radius:24px;background:var(--surface-card);box-shadow:var(--shadow-dialog)}.brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:32px}.brand span{display:grid;width:38px;height:38px;place-items:center;border-radius:12px;background:var(--brand);color:var(--on-brand);font-weight:800;transform:rotate(-3deg)}.brand strong{font-family:var(--font-display);font-size:1.05rem}.reset-card h1{margin:8px 0 10px;font-size:clamp(1.7rem,5vw,2.25rem);text-align:center}.reset-card>p{margin:0 0 22px;color:var(--muted);line-height:1.5;text-align:center}.reset-card form{display:flex;flex-direction:column;gap:18px}.field{display:flex;flex-direction:column;gap:8px}.field small,.inert-note{color:var(--muted);line-height:1.4}.reset-card :deep(.p-button){justify-content:center}.safe-link{align-self:center;margin-top:18px;padding:8px;color:var(--text-link);font-weight:700}.inert-note{margin-top:14px;text-align:center}
@media(max-width:520px){.reset-page{padding:12px}.reset-card{padding:28px 20px;border-radius:20px}}
</style>
