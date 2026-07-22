<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useAuthStore } from '@/features/auth/auth.store'
import { useAuthErrorFeedback } from '@/features/auth/use-auth-error-feedback'

const auth = useAuthStore()
const router = useRouter()
const newPassword = ref('')
const passwordConfirmation = ref('')
const loading = ref(false)
const errorElement = ref<HTMLElement | null>(null)
const { clear: clearError, displayMessage: error, present: presentError, retryBlocked, show: showError } = useAuthErrorFeedback()

function clearSensitiveFields() {
  newPassword.value = ''
  passwordConfirmation.value = ''
}

async function submit() {
  if (retryBlocked.value || loading.value) return
  clearError()
  if (newPassword.value !== passwordConfirmation.value) {
    showError('Пароли не совпадают')
    await focusError()
    return
  }
  loading.value = true
  try {
    await auth.completePasswordSetup(newPassword.value, passwordConfirmation.value)
    clearSensitiveFields()
    await router.replace({ name: 'login' })
  } catch (cause) {
    if (!auth.requiresPasswordSetup) {
      clearSensitiveFields()
      await router.replace({ name: 'login' })
    } else {
      presentError(cause, 'Не удалось установить пароль')
      await focusError()
    }
  } finally {
    loading.value = false
  }
}

async function focusError() {
  await nextTick()
  errorElement.value?.focus()
}

async function cancel() {
  clearSensitiveFields()
  auth.cancelPasswordSetup()
  await router.replace({ name: 'login' })
}

onBeforeRouteLeave(() => {
  clearSensitiveFields()
  if (auth.requiresPasswordSetup) auth.cancelPasswordSetup()
})
</script>

<template>
  <main class="setup-page">
    <section class="setup-card">
      <div class="brand"><span>Lo</span><strong>Lola</strong></div>
      <div>
        <div class="eyebrow">Защита учётной записи</div>
        <h1>Создайте постоянный пароль</h1>
        <p>После сохранения вернитесь ко входу и используйте новый пароль.</p>
      </div>

      <form class="setup-form" :aria-busy="loading" @submit.prevent="submit">
        <div class="field">
          <label for="new-password">Новый пароль</label>
          <InputText
            id="new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            size="large"
            autofocus
            :aria-invalid="Boolean(error)"
            :aria-describedby="error ? 'password-rules password-setup-error' : 'password-rules'"
          />
          <small id="password-rules">Не менее 15 символов. Можно использовать длинную фразу и вставку из менеджера паролей.</small>
        </div>
        <div class="field">
          <label for="password-confirmation">Повторите новый пароль</label>
          <InputText
            id="password-confirmation"
            v-model="passwordConfirmation"
            type="password"
            autocomplete="new-password"
            size="large"
            :aria-invalid="Boolean(error)"
            :aria-describedby="error ? 'password-setup-error' : undefined"
          />
        </div>
        <div v-if="error" id="password-setup-error" ref="errorElement" tabindex="-1"><Message severity="error" size="small">{{ error }}</Message></div>
        <div class="actions">
          <Button type="button" label="Отмена" severity="secondary" outlined :disabled="loading" @click="cancel" />
          <Button type="submit" label="Сохранить пароль" icon="pi pi-arrow-right" icon-pos="right" :loading="loading" :disabled="retryBlocked" />
        </div>
      </form>
    </section>
  </main>
</template>

<style scoped>
.setup-page{min-height:100vh;display:grid;place-items:center;padding:28px;background:var(--surface-ground)}
.setup-card{width:min(560px,100%);display:flex;flex-direction:column;gap:28px;padding:36px;background:var(--surface-card);border:1px solid var(--line);border-radius:24px;box-shadow:var(--shadow-raised)}
.brand{display:flex;align-items:center;gap:11px;font:700 1.2rem var(--font-display)}.brand span{display:grid;place-items:center;width:40px;height:40px;background:var(--accent);color:var(--surface-emphasis);border-radius:13px;transform:rotate(-4deg)}
h1{margin:8px 0 10px;font-size:2rem}p{margin:0;color:var(--muted);line-height:1.5}.setup-form{display:flex;flex-direction:column;gap:20px}.field{display:flex;flex-direction:column;gap:8px}.field small{color:var(--muted);line-height:1.4}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:4px}
@media(max-width:600px){.setup-page{padding:16px}.setup-card{padding:24px}.actions{flex-direction:column-reverse}.actions :deep(.p-button){width:100%}}
</style>
