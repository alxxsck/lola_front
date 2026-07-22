<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import type { CmsSessionSummaryDto } from '@/shared/api/generated/models'
import { securitySettingsApi } from '@/features/security-settings/security-settings.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { normalizeApiError } from '@/shared/api/http/api-error'
import { emailIdentityApi } from '@/features/email-identity/email-identity.api'
import { mfaManagementApi, type MfaPasskeySummary } from '@/features/auth/mfa.api'

const auth = useAuthStore()
const router = useRouter()
const sessions = ref<CmsSessionSummaryDto[]>([])
const loading = ref(true)
const listError = ref('')
const actionError = ref('')
const actionSuccess = ref('')
const revokingId = ref<string | null>(null)
const revokingOthers = ref(false)
const changingPassword = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const passwordConfirmation = ref('')
const verificationRequesting = ref(false)
const emailChangeSubmitting = ref(false)
const emailChangeCancelling = ref(false)
const verificationSeconds = ref(Math.max(0, auth.user?.emailVerificationRetryAfterSeconds ?? 0))
const pendingEmail = ref(auth.user?.pendingEmail ?? null)
const showEmailChangeForm = ref(!pendingEmail.value)
const newEmail = ref('')
const emailChangePassword = ref('')
let countdownTimer: ReturnType<typeof setInterval> | undefined
const canonicalEmail = computed(() => auth.user?.email ?? '')
const emailVerified = computed(() => Boolean(auth.user?.emailVerifiedAt))
const verificationButtonLabel = computed(() => verificationSeconds.value > 0
  ? `Повторить через ${verificationSeconds.value} с`
  : 'Отправить письмо')
const canSubmitEmailChange = computed(() => Boolean(newEmail.value && emailChangePassword.value))
const canSubmitPassword = computed(() =>
  Boolean(currentPassword.value && newPassword.value && passwordConfirmation.value),
)
const passkeys = ref<MfaPasskeySummary[]>([])
const recoveryCodesRemaining = ref(0)
const factorsLoading = ref(true)
const factorPending = ref(false)
const passkeyLabel = ref('')
const oneTimeRecoveryCodes = ref<string[]>([])
const recoveryCodesSaved = ref(false)

async function loadMfaSummary() {
  factorsLoading.value = true
  if (auth.mode === 'mock') {
    passkeys.value = []
    recoveryCodesRemaining.value = 0
    factorsLoading.value = false
    return
  }
  try {
    const summary = await mfaManagementApi.summary()
    passkeys.value = summary.passkeys
    recoveryCodesRemaining.value = summary.recoveryCodesRemaining
  } catch (cause) {
    actionError.value = normalizeApiError(cause).message || 'Не удалось загрузить passkeys.'
  } finally {
    factorsLoading.value = false
  }
}

async function addPasskey() {
  clearFeedback()
  factorPending.value = true
  try {
    await mfaManagementApi.addPasskey(passkeyLabel.value.trim() || undefined)
    passkeyLabel.value = ''
    actionSuccess.value = 'Новый passkey добавлен.'
    await loadMfaSummary()
  } catch (cause) {
    actionError.value = factorError(cause)
  } finally {
    factorPending.value = false
  }
}

async function removePasskey(passkey: MfaPasskeySummary) {
  if (!window.confirm(`Удалить passkey «${passkey.label}»? Все сессии будут завершены.`)) return
  clearFeedback()
  factorPending.value = true
  try {
    await mfaManagementApi.removePasskey(passkey.id)
    await auth.logout()
    await router.replace('/login')
  } catch (cause) {
    actionError.value = factorError(cause)
  } finally {
    factorPending.value = false
  }
}

async function rotateRecoveryCodes() {
  if (!window.confirm('Сделать прежние recovery-коды недействительными и создать новые?')) return
  clearFeedback()
  factorPending.value = true
  try {
    const response = await mfaManagementApi.rotateRecoveryCodes()
    oneTimeRecoveryCodes.value = [...response.recoveryCodes]
    recoveryCodesRemaining.value = response.recoveryCodes.length
    recoveryCodesSaved.value = false
  } catch (cause) {
    actionError.value = factorError(cause)
  } finally {
    factorPending.value = false
  }
}

function dismissRecoveryCodes() {
  if (!recoveryCodesSaved.value) return
  oneTimeRecoveryCodes.value = []
  recoveryCodesSaved.value = false
  actionSuccess.value = 'Новые recovery-коды сохранены.'
}

function factorError(cause: unknown) {
  const error = normalizeApiError(cause)
  if (error.code === 'LAST_MFA_FACTOR_REQUIRED') return 'Нельзя удалить последний passkey.'
  if (error.code === 'MFA_REQUIRED' || error.code === 'REAUTHENTICATION_REQUIRED') {
    return 'Для действия нужен свежий вход с passkey. Выйдите и войдите снова.'
  }
  if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
    return 'Создание passkey отменено или истекло время ожидания.'
  }
  return error.message || 'Не удалось изменить MFA-настройки.'
}

async function loadSessions() {
  loading.value = true
  listError.value = ''
  try {
    sessions.value = await securitySettingsApi.listSessions()
  } catch (cause) {
    listError.value = normalizeApiError(cause).message || 'Не удалось загрузить активные сессии.'
  } finally {
    loading.value = false
  }
}

async function revokeSession(session: CmsSessionSummaryDto) {
  if (!window.confirm(session.current ? 'Завершить текущую сессию?' : 'Завершить выбранную сессию?')) return
  clearFeedback()
  revokingId.value = session.id
  try {
    await securitySettingsApi.revokeSession(session.id)
    if (session.current) {
      await auth.logout()
      await router.replace('/login')
      return
    }
    sessions.value = sessions.value.filter(({ id }) => id !== session.id)
    actionSuccess.value = 'Сессия завершена.'
  } catch (cause) {
    actionError.value = normalizeApiError(cause).message || 'Не удалось завершить сессию.'
  } finally {
    revokingId.value = null
  }
}

async function revokeOthers() {
  if (!window.confirm('Завершить все остальные сессии?')) return
  clearFeedback()
  revokingOthers.value = true
  try {
    await securitySettingsApi.revokeOtherSessions()
    sessions.value = sessions.value.filter(({ current }) => current)
    actionSuccess.value = 'Все остальные сессии завершены.'
  } catch (cause) {
    actionError.value = normalizeApiError(cause).message || 'Не удалось завершить остальные сессии.'
  } finally {
    revokingOthers.value = false
  }
}

async function changePassword() {
  clearFeedback()
  if (newPassword.value !== passwordConfirmation.value) {
    actionError.value = 'Новый пароль и подтверждение не совпадают.'
    return
  }
  changingPassword.value = true
  try {
    await securitySettingsApi.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      passwordConfirmation: passwordConfirmation.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    passwordConfirmation.value = ''
    actionSuccess.value = 'Пароль изменён. Остальные сессии завершены.'
    await loadSessions()
  } catch (cause) {
    const error = normalizeApiError(cause)
    actionError.value = error.code === 'CURRENT_PASSWORD_INVALID'
      ? 'Текущий пароль указан неверно.'
      : error.message || 'Не удалось изменить пароль.'
  } finally {
    changingPassword.value = false
  }
}

async function requestEmailVerification() {
  if (verificationSeconds.value > 0 || emailVerified.value) return
  clearFeedback()
  verificationRequesting.value = true
  try {
    const response = await emailIdentityApi.requestVerification()
    startVerificationCountdown(response.retryAfterSeconds)
    actionSuccess.value = 'Письмо для подтверждения отправлено.'
  } catch {
    actionError.value = 'Не удалось отправить письмо. Повторите позже.'
  } finally {
    verificationRequesting.value = false
  }
}

async function requestEmailChange() {
  if (!canSubmitEmailChange.value) return
  clearFeedback()
  emailChangeSubmitting.value = true
  try {
    const response = await emailIdentityApi.requestEmailChange({
      newEmail: newEmail.value,
      currentPassword: emailChangePassword.value,
    })
    pendingEmail.value = response.pendingEmail
    if (auth.user) auth.user.pendingEmail = response.pendingEmail
    newEmail.value = ''
    emailChangePassword.value = ''
    showEmailChangeForm.value = false
    actionSuccess.value = 'Письмо отправлено на новый адрес. Текущий email пока не изменён.'
  } catch (cause) {
    const error = normalizeApiError(cause)
    actionError.value = error.code === 'EMAIL_CHANGE_REAUTHENTICATION_FAILED'
      ? 'Текущий пароль указан неверно.'
      : error.code === 'EMAIL_ALREADY_IN_USE'
        ? 'Этот email уже используется.'
        : 'Не удалось начать смену email.'
  } finally {
    emailChangeSubmitting.value = false
  }
}

async function cancelEmailChange() {
  if (!window.confirm('Отменить смену email?')) return
  clearFeedback()
  emailChangeCancelling.value = true
  try {
    await emailIdentityApi.cancelEmailChange()
    pendingEmail.value = null
    if (auth.user) auth.user.pendingEmail = null
    showEmailChangeForm.value = true
    newEmail.value = ''
    emailChangePassword.value = ''
    actionSuccess.value = 'Смена email отменена.'
  } catch {
    actionError.value = 'Не удалось отменить смену email.'
  } finally {
    emailChangeCancelling.value = false
  }
}

function restartEmailChange() {
  newEmail.value = pendingEmail.value ?? ''
  emailChangePassword.value = ''
  showEmailChangeForm.value = true
  clearFeedback()
}

function startVerificationCountdown(seconds: number) {
  verificationSeconds.value = Math.max(0, Math.ceil(seconds))
  if (auth.user) auth.user.emailVerificationRetryAfterSeconds = verificationSeconds.value
}

function clearFeedback() {
  actionError.value = ''
  actionSuccess.value = ''
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value))
}

onMounted(() => {
  void loadSessions()
  void loadMfaSummary()
  countdownTimer = setInterval(() => {
    if (verificationSeconds.value > 0) verificationSeconds.value -= 1
  }, 1_000)
})

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
  <main class="security-page">
    <header>
      <div>
        <span class="eyebrow">Безопасность аккаунта</span>
        <h1>Пароль и активные сессии</h1>
        <p>Управляйте входами в CMS и завершайте доступ на потерянных устройствах.</p>
      </div>
      <Button
        label="Завершить остальные"
        icon="pi pi-sign-out"
        severity="danger"
        outlined
        :loading="revokingOthers"
        :disabled="sessions.length <= 1"
        @click="revokeOthers"
      />
    </header>

    <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>
    <Message v-if="actionSuccess" severity="success" role="status">{{ actionSuccess }}</Message>

    <section class="security-card identity-card" aria-labelledby="identity-heading">
      <div class="section-heading">
        <i class="pi pi-envelope" />
        <div><h2 id="identity-heading">Email аккаунта</h2><p>Подтверждённый адрес используется для восстановления доступа и уведомлений.</p></div>
      </div>

      <div class="identity-summary">
        <div class="identity-avatar">{{ auth.user?.name?.slice(0, 1) || '?' }}</div>
        <div class="identity-copy">
          <strong>{{ auth.user?.name }}</strong>
          <span>{{ canonicalEmail }}</span>
        </div>
        <span class="verification-badge" :class="emailVerified ? 'verified' : 'unverified'">
          <i :class="emailVerified ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'" />
          {{ emailVerified ? 'Подтверждён' : 'Не подтверждён' }}
        </span>
        <Button
          v-if="!emailVerified"
          data-testid="email-verification-action"
          :label="verificationButtonLabel"
          icon="pi pi-send"
          outlined
          :loading="verificationRequesting"
          :disabled="verificationSeconds > 0"
          @click="requestEmailVerification"
        />
      </div>

      <div v-if="pendingEmail" class="pending-email">
        <div>
          <small>Смена email</small>
          <strong>Ожидает подтверждения: {{ pendingEmail }}</strong>
          <span>До подтверждения вход выполняется с {{ canonicalEmail }}.</span>
        </div>
        <div class="pending-actions">
          <Button data-testid="restart-email-change" label="Начать заново" text @click="restartEmailChange" />
          <Button
            data-testid="cancel-email-change"
            label="Отменить"
            severity="danger"
            text
            :loading="emailChangeCancelling"
            @click="cancelEmailChange"
          />
        </div>
      </div>

      <form v-if="showEmailChangeForm" class="email-change-form" @submit.prevent="requestEmailChange">
        <label>Новый email<InputText v-model="newEmail" type="email" autocomplete="email" /></label>
        <label>Текущий пароль для смены email<InputText v-model="emailChangePassword" type="password" autocomplete="current-password" /></label>
        <Button
          type="submit"
          :label="pendingEmail ? 'Отправить новое письмо' : 'Изменить email'"
          icon="pi pi-arrow-right"
          :loading="emailChangeSubmitting"
          :disabled="!canSubmitEmailChange"
        />
      </form>
    </section>

    <section class="security-card" aria-labelledby="password-heading">
      <div class="section-heading">
        <i class="pi pi-key" />
        <div><h2 id="password-heading">Изменить пароль</h2><p>После изменения все прежние сессии будут завершены.</p></div>
      </div>
      <form class="password-form" @submit.prevent="changePassword">
        <label>Текущий пароль<InputText v-model="currentPassword" type="password" autocomplete="current-password" /></label>
        <label>Новый пароль<InputText v-model="newPassword" type="password" autocomplete="new-password" /></label>
        <label>Повторите новый пароль<InputText v-model="passwordConfirmation" type="password" autocomplete="new-password" /></label>
        <Button type="submit" label="Сохранить новый пароль" icon="pi pi-check" :loading="changingPassword" :disabled="!canSubmitPassword" />
      </form>
    </section>

    <section class="security-card" aria-labelledby="mfa-heading">
      <div class="section-heading">
        <i class="pi pi-shield" />
        <div><h2 id="mfa-heading">Passkeys и recovery-коды</h2><p>Passkey защищает вход от фишинга. Recovery-коды нужны только при потере всех устройств.</p></div>
      </div>
      <p v-if="factorsLoading" class="state"><i class="pi pi-spin pi-spinner" /> Загружаем passkeys…</p>
      <template v-else>
        <ul class="passkey-list">
          <li v-for="passkey in passkeys" :key="passkey.id" :data-passkey-id="passkey.id">
            <div><strong>{{ passkey.label }}</strong><small>Добавлен {{ formatDate(passkey.createdAt) }}<template v-if="passkey.lastUsedAt"> · использован {{ formatDate(passkey.lastUsedAt) }}</template></small></div>
            <span v-if="passkey.backedUp" class="verification-badge verified">Синхронизирован</span>
            <Button label="Удалить" severity="danger" text :loading="factorPending" @click="removePasskey(passkey)" />
          </li>
        </ul>
        <form class="passkey-add" @submit.prevent="addPasskey">
          <label>Название нового passkey<InputText v-model="passkeyLabel" maxlength="100" placeholder="Например, рабочий MacBook" /></label>
          <Button type="submit" label="Добавить passkey" icon="pi pi-plus" :loading="factorPending" />
        </form>
        <div class="recovery-summary">
          <div><strong>Осталось recovery-кодов: {{ recoveryCodesRemaining }}</strong><small>Ротация немедленно отменит все прежние коды.</small></div>
          <Button label="Создать новые коды" outlined :loading="factorPending" @click="rotateRecoveryCodes" />
        </div>
        <div v-if="oneTimeRecoveryCodes.length" class="rotated-codes" data-testid="rotated-recovery-codes">
          <Message severity="warn" :closable="false">Сохраните новые коды сейчас: повторно они не показываются.</Message>
          <ol><li v-for="code in oneTimeRecoveryCodes" :key="code"><code>{{ code }}</code></li></ol>
          <label><input v-model="recoveryCodesSaved" type="checkbox" /> Я сохранил новые коды</label>
          <Button label="Скрыть коды" :disabled="!recoveryCodesSaved" @click="dismissRecoveryCodes" />
        </div>
      </template>
    </section>

    <section class="security-card" aria-labelledby="sessions-heading">
      <div class="section-heading">
        <i class="pi pi-desktop" />
        <div><h2 id="sessions-heading">Активные сессии</h2><p>Идентификаторы сессий стабильны при безопасной ротации cookie.</p></div>
      </div>
      <p v-if="loading" class="state"><i class="pi pi-spin pi-spinner" /> Загружаем сессии…</p>
      <div v-else-if="listError" class="state state-error" role="alert">
        <span>{{ listError }}</span><Button label="Повторить" size="small" text @click="loadSessions" />
      </div>
      <ul v-else class="session-list">
        <li v-for="session in sessions" :key="session.id" :data-session-id="session.id">
          <div class="device-icon"><i class="pi pi-desktop" /></div>
          <div class="session-copy">
            <strong>{{ session.device }} <span v-if="session.current">Текущая</span></strong>
            <small>Последняя активность: {{ formatDate(session.lastSeenAt) }}</small>
            <small>Истекает: {{ formatDate(session.expiresAt) }}</small>
          </div>
          <Button
            :label="session.current ? 'Выйти' : 'Завершить'"
            severity="danger"
            text
            :loading="revokingId === session.id"
            :aria-label="`${session.current ? 'Завершить текущую' : 'Завершить'} сессию ${session.device}`"
            @click="revokeSession(session)"
          />
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.security-page{display:flex;flex-direction:column;gap:22px;max-width:1040px;margin:0 auto}.security-page>header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.security-page h1{margin:6px 0 8px;font-size:2rem}.security-page header p,.section-heading p{margin:0;color:var(--muted)}.security-card{padding:24px;border:1px solid var(--line);border-radius:20px;background:var(--surface-card);box-shadow:var(--shadow-card)}.section-heading{display:flex;align-items:flex-start;gap:13px;margin-bottom:20px}.section-heading>i,.device-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--status-violet);color:var(--on-status-violet)}.section-heading h2{margin:0 0 4px;font-size:1.12rem}.identity-summary{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:14px}.identity-avatar{display:grid;width:48px;height:48px;place-items:center;border-radius:15px;background:var(--brand-soft);color:var(--text-brand);font-family:var(--font-display);font-size:1.1rem;font-weight:800}.identity-copy{display:flex;min-width:0;flex-direction:column;gap:3px}.identity-copy span{overflow:hidden;color:var(--muted);text-overflow:ellipsis}.verification-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;font-size:.7rem;font-weight:700}.verification-badge.verified{background:var(--status-success-soft);color:var(--status-success-text)}.verification-badge.unverified{background:var(--status-warning-soft);color:var(--status-warning-text)}.pending-email{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:18px;padding:15px;border:1px solid var(--status-violet);border-radius:15px;background:var(--status-violet-soft)}.pending-email small,.pending-email strong,.pending-email span{display:block}.pending-email small{color:var(--status-violet-text);font-weight:800;text-transform:uppercase;letter-spacing:.08em}.pending-email strong{margin-top:4px}.pending-email span{margin-top:4px;color:var(--muted);font-size:.72rem}.pending-actions{display:flex;align-items:center;gap:4px}.email-change-form,.password-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:end}.email-change-form{margin-top:18px;padding-top:18px;border-top:1px solid var(--border-subtle)}.email-change-form label,.password-form label{display:flex;flex-direction:column;gap:7px;font-size:.76rem;font-weight:700}.email-change-form :deep(.p-button),.password-form :deep(.p-button){grid-column:3}.session-list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}.session-list li{display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--border-subtle);border-radius:15px;background:var(--surface-subtle)}.device-icon{flex:0 0 auto;background:var(--surface-card);color:var(--status-violet-text)}.session-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.session-copy strong span{margin-left:6px;padding:3px 7px;border-radius:999px;background:var(--status-success-soft);color:var(--status-success-text);font-size:.62rem}.session-copy small{color:var(--muted)}.state{display:flex;align-items:center;gap:8px;color:var(--muted)}.state-error{justify-content:space-between;color:var(--status-danger-text)}
.passkey-list{display:flex;flex-direction:column;gap:9px;margin:0;padding:0;list-style:none}.passkey-list li{display:flex;align-items:center;gap:12px;padding:13px;border:1px solid var(--border-subtle);border-radius:14px}.passkey-list li>div{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.passkey-list small,.recovery-summary small{color:var(--muted)}.passkey-add{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:12px;margin-top:14px}.passkey-add label{display:flex;flex-direction:column;gap:7px;font-size:.76rem;font-weight:700}.recovery-summary{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:18px;padding-top:18px;border-top:1px solid var(--border-subtle)}.recovery-summary div{display:flex;flex-direction:column;gap:4px}.rotated-codes{display:flex;flex-direction:column;gap:12px;margin-top:14px;padding:15px;border:1px solid var(--status-warning);border-radius:14px}.rotated-codes ol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0;padding:0;list-style:none}.rotated-codes li{padding:8px;border-radius:8px;background:var(--surface-subtle);text-align:center}
@media(max-width:760px){.security-page>header{align-items:stretch;flex-direction:column}.identity-summary{grid-template-columns:auto minmax(0,1fr)}.identity-summary :deep(.p-button),.verification-badge{grid-column:2;justify-self:start}.pending-email{align-items:flex-start;flex-direction:column}.pending-actions{flex-wrap:wrap}.email-change-form,.password-form,.passkey-add{grid-template-columns:1fr}.email-change-form :deep(.p-button),.password-form :deep(.p-button){grid-column:auto}.passkey-list li,.recovery-summary{align-items:flex-start;flex-wrap:wrap}.session-list li{align-items:flex-start;flex-wrap:wrap}.session-copy{min-width:calc(100% - 58px)}.rotated-codes ol{grid-template-columns:1fr}}
</style>
