<script setup lang="ts">
import { nextTick, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { passwordRecoveryApi } from '@/features/password-recovery/password-recovery.api'

const email = ref('')
const state = ref<'READY' | 'PENDING' | 'SUCCESS' | 'ERROR'>('READY')
const errorElement = ref<HTMLElement | null>(null)

async function submit() {
  if (state.value === 'PENDING' || state.value === 'SUCCESS') return
  const normalizedEmail = email.value.trim()
  if (!normalizedEmail || normalizedEmail.length > 255) {
    state.value = 'ERROR'
    email.value = ''
    await focusError()
    return
  }

  state.value = 'PENDING'
  try {
    await passwordRecoveryApi.request(normalizedEmail)
    email.value = ''
    state.value = 'SUCCESS'
  } catch {
    email.value = ''
    state.value = 'ERROR'
    await focusError()
  }
}

async function focusError() {
  await nextTick()
  errorElement.value?.focus()
}
</script>

<template>
  <main class="recovery-page">
    <section class="recovery-card" aria-live="polite">
      <div class="brand"><span>L</span><strong>Lola CMS</strong></div>

      <template v-if="state === 'SUCCESS'">
        <div class="state-icon"><i class="pi pi-envelope" /></div>
        <h1>Проверьте почту</h1>
        <p>Если аккаунт подходит для восстановления, письмо отправлено.</p>
        <a class="safe-link" href="/login">Вернуться ко входу</a>
      </template>

      <template v-else>
        <span class="eyebrow">Восстановление доступа</span>
        <h1>Сбросить пароль</h1>
        <p>Введите email аккаунта. Результат запроса не раскрывает, существует ли такой аккаунт.</p>
        <form :aria-busy="state === 'PENDING'" @submit.prevent="submit">
          <div class="field">
            <label for="recovery-email">Email</label>
            <InputText
              id="recovery-email"
              v-model="email"
              type="email"
              autocomplete="email"
              size="large"
              autofocus
              :aria-invalid="state === 'ERROR'"
              :aria-describedby="state === 'ERROR' ? 'recovery-error' : undefined"
            />
          </div>
          <div v-if="state === 'ERROR'" id="recovery-error" ref="errorElement" tabindex="-1">
            <Message severity="error">Не удалось отправить запрос. Попробуйте ещё раз.</Message>
          </div>
          <Button type="submit" label="Отправить ссылку" icon="pi pi-arrow-right" icon-pos="right" :loading="state === 'PENDING'" />
        </form>
        <a class="safe-link" href="/login">Вернуться ко входу</a>
      </template>
    </section>
  </main>
</template>

<style scoped>
.recovery-page{display:grid;min-height:100dvh;place-items:center;padding:24px;background:var(--surface-canvas)}.recovery-card{display:flex;width:min(500px,100%);flex-direction:column;align-items:stretch;padding:34px;border:1px solid var(--border-default);border-radius:24px;background:var(--surface-card);box-shadow:var(--shadow-dialog)}.brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:32px}.brand span{display:grid;width:38px;height:38px;place-items:center;border-radius:12px;background:var(--brand);color:var(--on-brand);font-weight:800;transform:rotate(-3deg)}.brand strong{font-family:var(--font-display);font-size:1.05rem}.recovery-card h1{margin:8px 0 10px;font-size:clamp(1.7rem,5vw,2.25rem);text-align:center}.recovery-card p{margin:0 0 22px;color:var(--muted);line-height:1.5;text-align:center}.recovery-card form{display:flex;flex-direction:column;gap:18px}.field{display:flex;flex-direction:column;gap:8px}.recovery-card :deep(.p-button){justify-content:center}.safe-link{align-self:center;margin-top:18px;padding:8px;color:var(--text-link);font-weight:700}.state-icon{display:grid;width:58px;height:58px;place-items:center;margin:0 auto 12px;border-radius:18px;background:var(--status-success-soft);color:var(--status-success-text);font-size:1.25rem}
@media(max-width:520px){.recovery-page{padding:12px}.recovery-card{padding:28px 20px;border-radius:20px}}
</style>
