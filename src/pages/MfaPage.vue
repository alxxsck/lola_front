<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useAuthStore } from '@/features/auth/auth.store'
import { normalizeApiError } from '@/shared/api/http/api-error'

const auth = useAuthStore()
const router = useRouter()
const error = ref('')
const recoveryCode = ref('')
const passkeyLabel = ref('')
const useRecovery = ref(false)
const codesSaved = ref(false)
const copied = ref(false)
const pending = computed(() => auth.phase === 'MFA_PENDING')
const enrollment = computed(() => auth.mfaChallenge?.kind === 'MFA_ENROLLMENT_REQUIRED')
const recoveryAvailable = computed(() => auth.mfaChallenge?.kind === 'MFA_REQUIRED'
  && auth.mfaChallenge.recoveryAvailable)
const showingCodes = computed(() => auth.phase === 'MFA_RECOVERY_CODES')

async function usePasskey() {
  error.value = ''
  try {
    const result = await auth.completeMfaPasskey(passkeyLabel.value.trim() || undefined)
    if (result === 'AUTHENTICATED') {
      await router.replace(auth.authenticatedLandingPath)
    }
  } catch (cause) {
    error.value = webAuthnError(cause)
  }
}

async function recover() {
  if (!recoveryCode.value.trim()) return
  error.value = ''
  try {
    await auth.completeMfaRecovery(
      recoveryCode.value.trim(),
      passkeyLabel.value.trim() || undefined,
    )
    recoveryCode.value = ''
  } catch (cause) {
    error.value = webAuthnError(cause)
  }
}

async function copyCodes() {
  await navigator.clipboard.writeText(auth.recoveryCodes.join('\n'))
  copied.value = true
}

async function finish() {
  if (!codesSaved.value) return
  auth.acknowledgeRecoveryCodes()
  await router.replace('/login')
}

async function cancel() {
  auth.cancelMfa()
  await router.replace('/login')
}

function webAuthnError(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
    return 'Проверка passkey отменена или истекло время ожидания.'
  }
  const normalized = normalizeApiError(cause)
  return normalized.code === 'MFA_CAPABILITY_INVALID'
    ? 'MFA-сессия истекла или уже использована. Войдите ещё раз.'
    : normalized.message || 'Не удалось завершить проверку passkey.'
}
</script>

<template>
  <main class="mfa-page">
    <section class="mfa-card">
      <div class="brand"><span>Lo</span><strong>Lola</strong></div>

      <template v-if="showingCodes">
        <div class="heading">
          <span class="icon success"><i class="pi pi-shield" /></span>
          <div><span class="eyebrow">Passkey подключён</span><h1>Сохраните recovery-коды</h1></div>
        </div>
        <Message severity="warn" :closable="false">
          Коды показаны один раз. Каждый код можно использовать только один раз для замены passkey.
        </Message>
        <ol class="recovery-codes" data-testid="mfa-recovery-codes">
          <li v-for="code in auth.recoveryCodes" :key="code"><code>{{ code }}</code></li>
        </ol>
        <Button
          :label="copied ? 'Скопировано' : 'Скопировать коды'"
          icon="pi pi-copy"
          outlined
          @click="copyCodes"
        />
        <label class="confirmation">
          <Checkbox v-model="codesSaved" binary input-id="codes-saved" />
          <span>Я сохранил коды в надёжном месте</span>
        </label>
        <Button label="Вернуться ко входу" :disabled="!codesSaved" @click="finish" />
      </template>

      <template v-else>
        <div class="heading">
          <span class="icon"><i class="pi pi-key" /></span>
          <div>
            <span class="eyebrow">Защищённый вход</span>
            <h1>{{ enrollment ? 'Создайте passkey' : 'Подтвердите вход' }}</h1>
          </div>
        </div>
        <p class="description">
          {{ enrollment
            ? 'Платформенным администраторам нужен phishing-resistant второй фактор.'
            : 'Используйте passkey этого аккаунта. Пароль сам по себе не создаёт сессию.' }}
        </p>
        <Message v-if="error" severity="error" role="alert">{{ error }}</Message>

        <template v-if="useRecovery">
          <form class="recovery-form" @submit.prevent="recover">
            <label for="recovery-code">Одноразовый recovery-код</label>
            <InputText
              id="recovery-code"
              v-model="recoveryCode"
              autocomplete="off"
              spellcheck="false"
              placeholder="lrc_…"
              autofocus
            />
            <label for="replacement-label">Название нового passkey (необязательно)</label>
            <InputText id="replacement-label" v-model="passkeyLabel" maxlength="100" />
            <Button type="submit" label="Заменить passkey" :loading="pending" :disabled="!recoveryCode.trim()" />
          </form>
          <Button label="Назад к passkey" text @click="useRecovery = false" />
        </template>
        <template v-else>
          <label v-if="enrollment" class="label-field" for="passkey-label">
            Название passkey (необязательно)
            <InputText id="passkey-label" v-model="passkeyLabel" maxlength="100" placeholder="Например, MacBook Work" />
          </label>
          <Button
            data-testid="mfa-passkey-action"
            :label="enrollment ? 'Создать passkey' : 'Продолжить с passkey'"
            icon="pi pi-key"
            size="large"
            :loading="pending"
            @click="usePasskey"
          />
          <Button
            v-if="recoveryAvailable"
            label="Использовать recovery-код"
            text
            @click="useRecovery = true"
          />
        </template>
        <Button label="Отменить вход" severity="secondary" text @click="cancel" />
      </template>
    </section>
  </main>
</template>

<style scoped>
.mfa-page{min-height:100vh;display:grid;place-items:center;padding:28px;background:var(--surface-emphasis)}.mfa-card{display:flex;width:min(520px,100%);flex-direction:column;gap:18px;padding:32px;border:1px solid var(--border-default);border-radius:24px;background:var(--surface-card);box-shadow:var(--shadow-raised)}.brand{display:flex;align-items:center;gap:9px;font:700 1rem var(--font-display)}.brand span{display:grid;width:34px;height:34px;place-items:center;border-radius:11px;background:var(--accent)}.heading{display:flex;align-items:center;gap:14px}.heading h1{margin:4px 0 0;font-size:1.8rem}.icon{display:grid;width:50px;height:50px;flex:0 0 auto;place-items:center;border-radius:15px;background:var(--status-violet);color:var(--on-status-violet);font-size:1.1rem}.icon.success{background:var(--status-success-soft);color:var(--status-success-text)}.description{margin:0;color:var(--muted);line-height:1.55}.label-field,.recovery-form{display:flex;flex-direction:column;gap:8px;font-size:.78rem;font-weight:700}.recovery-form{gap:10px}.recovery-codes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:0;list-style:none}.recovery-codes li{padding:9px;border:1px solid var(--border-subtle);border-radius:10px;background:var(--surface-subtle);text-align:center}.recovery-codes code{font-size:.78rem}.confirmation{display:flex;align-items:center;gap:10px;font-size:.78rem}@media(max-width:560px){.mfa-card{padding:22px}.recovery-codes{grid-template-columns:1fr}}
</style>
