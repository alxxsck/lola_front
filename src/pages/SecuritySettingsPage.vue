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
import { notificationPreferencesApi } from '@/features/notification-preferences/notification-preferences.api'
import type { EmailAIProposalPreferenceResponseDto } from '@/shared/api/generated/models'

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
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showPasswordConfirmation = ref(false)
const passwordCurrentError = ref('')
const passwordConfirmationError = ref('')
const verificationRequesting = ref(false)
const emailChangeSubmitting = ref(false)
const emailChangeCancelling = ref(false)
const verificationSeconds = ref(Math.max(0, auth.user?.emailVerificationRetryAfterSeconds ?? 0))
const pendingEmail = ref(auth.user?.pendingEmail ?? null)
const showEmailChangeForm = ref(!pendingEmail.value)
const newEmail = ref('')
const emailChangePassword = ref('')
const showEmailChangePassword = ref(false)
const emailChangeFieldError = ref('')
const emailChangePasswordError = ref('')
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
const emailPreference = ref<EmailAIProposalPreferenceResponseDto | null>(null)
const emailPreferenceLoading = ref(true)
const emailPreferenceSaving = ref(false)
const emailPreferenceError = ref('')
const emailPreferenceBlocked = computed(() => {
  const reason = emailPreference.value?.ineligibilityReason
  return !emailPreference.value || reason === 'EMAIL_UNVERIFIED' || reason === 'USER_INACTIVE'
})
const emailPreferenceStatus = computed(() => {
  if (emailPreferenceError.value) return emailPreferenceError.value
  const preference = emailPreference.value
  if (!preference) return 'Загружаем настройку…'
  if (preference.ineligibilityReason === 'EMAIL_UNVERIFIED') return 'Сначала подтвердите текущий email.'
  if (preference.ineligibilityReason === 'EMAIL_CHANGED') return 'Email изменён. Включите подписку для нового подтверждённого адреса.'
  if (preference.ineligibilityReason === 'USER_INACTIVE') return 'Подписка недоступна для неактивного аккаунта.'
  return preference.subscribed ? 'Подписка включена' : 'Подписка выключена'
})

async function loadEmailPreference() {
  emailPreferenceLoading.value = true
  emailPreferenceError.value = ''
  try {
    emailPreference.value = await notificationPreferencesApi.getEmailAIProposals()
  } catch {
    emailPreference.value = null
    emailPreferenceError.value = 'Не удалось загрузить настройку email-уведомлений.'
  } finally {
    emailPreferenceLoading.value = false
  }
}

async function toggleEmailPreference() {
  if (!emailPreference.value || emailPreferenceBlocked.value) return
  clearFeedback()
  emailPreferenceSaving.value = true
  try {
    emailPreference.value = await notificationPreferencesApi.setEmailAIProposals(
      !emailPreference.value.subscribed,
    )
    actionSuccess.value = emailPreference.value.subscribed
      ? 'Подписка на предложения Lola включена.'
      : 'Подписка на предложения Lola отключена.'
  } catch {
    actionError.value = 'Не удалось изменить подписку. Обновите страницу и повторите.'
  } finally {
    emailPreferenceSaving.value = false
  }
}

async function loadMfaSummary() {
  factorsLoading.value = true
  if (auth.mode === 'mock') {
    passkeys.value = [{
      id: 'demo-passkey',
      label: 'Рабочий MacBook',
      deviceType: 'multiDevice',
      backupEligible: true,
      backedUp: true,
      createdAt: '2026-07-21T08:00:00.000Z',
      lastUsedAt: '2026-07-23T10:00:00.000Z',
    }]
    recoveryCodesRemaining.value = 10
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
    passwordConfirmationError.value = 'Пароли не совпадают. Проверьте повтор нового пароля.'
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
    if (error.code === 'CURRENT_PASSWORD_INVALID') {
      passwordCurrentError.value = 'Текущий пароль указан неверно.'
    } else {
      actionError.value = error.message || 'Не удалось изменить пароль.'
    }
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
    if (error.code === 'EMAIL_CHANGE_REAUTHENTICATION_FAILED') {
      emailChangePasswordError.value = 'Текущий пароль указан неверно.'
    } else if (error.code === 'EMAIL_ALREADY_IN_USE') {
      emailChangeFieldError.value = 'Этот email уже используется.'
    } else {
      actionError.value = 'Не удалось начать смену email.'
    }
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
  emailChangeFieldError.value = ''
  emailChangePasswordError.value = ''
  passwordCurrentError.value = ''
  passwordConfirmationError.value = ''
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value))
}

onMounted(() => {
  void loadSessions()
  void loadMfaSummary()
  void loadEmailPreference()
  countdownTimer = setInterval(() => {
    if (verificationSeconds.value > 0) verificationSeconds.value -= 1
  }, 1_000)
})

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
  <main class="page security-page">
    <header class="page-header security-header">
      <div class="security-header__copy">
        <span class="eyebrow">Настройки аккаунта</span>
        <h1>Безопасность аккаунта</h1>
        <p>Управляйте email, паролем, способами входа и активными сессиями.</p>
      </div>
    </header>

    <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>
    <Message v-if="actionSuccess" severity="success" role="status">{{ actionSuccess }}</Message>

    <section class="security-card identity-card" aria-labelledby="identity-heading">
      <div class="section-heading">
        <i class="pi pi-envelope" />
        <div><h2 id="identity-heading">Email и уведомления</h2><p>Адрес для входа, восстановления доступа и писем от Lola.</p></div>
      </div>

      <div class="identity-summary">
        <div class="identity-avatar">{{ auth.user?.name?.slice(0, 1) || '?' }}</div>
        <div class="identity-copy">
          <strong>{{ auth.user?.name }}</strong>
          <span>{{ canonicalEmail }}</span>
        </div>
        <div class="identity-actions">
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

      <form v-if="showEmailChangeForm" class="settings-form email-change-form" @submit.prevent="requestEmailChange">
        <div class="settings-form__fields">
          <div class="settings-field">
            <label for="security-new-email">Новый email</label>
            <InputText
              id="security-new-email"
              v-model="newEmail"
              type="email"
              autocomplete="email"
              :aria-invalid="Boolean(emailChangeFieldError)"
              :aria-describedby="emailChangeFieldError ? 'security-new-email-error' : undefined"
            />
            <small v-if="emailChangeFieldError" id="security-new-email-error" class="field-error">{{ emailChangeFieldError }}</small>
          </div>
          <div class="settings-field">
            <label for="security-email-password">Текущий пароль для смены email</label>
            <div class="password-field">
              <InputText
                id="security-email-password"
                v-model="emailChangePassword"
                :type="showEmailChangePassword ? 'text' : 'password'"
                autocomplete="current-password"
                :aria-invalid="Boolean(emailChangePasswordError)"
                :aria-describedby="emailChangePasswordError ? 'security-email-password-error' : undefined"
              />
              <button
                type="button"
                :aria-label="showEmailChangePassword ? 'Скрыть пароль для смены email' : 'Показать пароль для смены email'"
                @click="showEmailChangePassword = !showEmailChangePassword"
              >
                <i :class="showEmailChangePassword ? 'pi pi-eye-slash' : 'pi pi-eye'" />
              </button>
            </div>
            <small v-if="emailChangePasswordError" id="security-email-password-error" class="field-error">{{ emailChangePasswordError }}</small>
          </div>
        </div>
        <div class="settings-form__actions">
          <Button
            type="submit"
            :label="pendingEmail ? 'Отправить новое письмо' : 'Изменить email'"
            icon="pi pi-arrow-right"
            :loading="emailChangeSubmitting"
            :disabled="!canSubmitEmailChange"
          />
        </div>
      </form>

      <div class="notification-preference" aria-labelledby="ai-proposal-email-heading">
        <div>
          <strong id="ai-proposal-email-heading">Предложения Lola по email</strong>
          <span>Получайте новые запросы внимания по текущему подтверждённому адресу.</span>
          <small :class="emailPreferenceBlocked ? 'preference-warning' : ''">{{ emailPreferenceStatus }}</small>
        </div>
        <div class="item-actions">
          <Button
            v-if="!emailPreferenceError"
            data-testid="ai-proposal-email-toggle"
            :label="emailPreference?.subscribed ? 'Отключить' : 'Подписаться'"
            :icon="emailPreference?.subscribed ? 'pi pi-bell-slash' : 'pi pi-bell'"
            :severity="emailPreference?.subscribed ? 'secondary' : 'primary'"
            :outlined="Boolean(emailPreference?.subscribed)"
            :loading="emailPreferenceLoading || emailPreferenceSaving"
            :disabled="emailPreferenceLoading || emailPreferenceSaving || emailPreferenceBlocked"
            @click="toggleEmailPreference"
          />
          <Button
            v-else
            data-testid="ai-proposal-email-retry"
            label="Повторить"
            icon="pi pi-refresh"
            outlined
            :loading="emailPreferenceLoading"
            @click="loadEmailPreference"
          />
        </div>
      </div>
    </section>

    <section class="security-card" aria-labelledby="password-heading">
      <div class="section-heading">
        <i class="pi pi-key" />
        <div><h2 id="password-heading">Изменить пароль</h2><p>После изменения все прежние сессии будут завершены.</p></div>
      </div>
      <form class="settings-form password-form" @submit.prevent="changePassword">
        <div class="settings-form__fields">
          <div class="settings-field">
            <label for="security-current-password">Текущий пароль</label>
            <div class="password-field">
              <InputText
                id="security-current-password"
                v-model="currentPassword"
                :type="showCurrentPassword ? 'text' : 'password'"
                autocomplete="current-password"
                :aria-invalid="Boolean(passwordCurrentError)"
                :aria-describedby="passwordCurrentError ? 'security-current-password-error' : undefined"
              />
              <button
                type="button"
                :aria-label="showCurrentPassword ? 'Скрыть текущий пароль' : 'Показать текущий пароль'"
                @click="showCurrentPassword = !showCurrentPassword"
              >
                <i :class="showCurrentPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" />
              </button>
            </div>
            <small v-if="passwordCurrentError" id="security-current-password-error" class="field-error">{{ passwordCurrentError }}</small>
          </div>
          <div class="settings-field">
            <label for="security-new-password">Новый пароль</label>
            <div class="password-field">
              <InputText
                id="security-new-password"
                v-model="newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                autocomplete="new-password"
              />
              <button
                type="button"
                :aria-label="showNewPassword ? 'Скрыть новый пароль' : 'Показать новый пароль'"
                @click="showNewPassword = !showNewPassword"
              >
                <i :class="showNewPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" />
              </button>
            </div>
          </div>
          <div class="settings-field">
            <label for="security-password-confirmation">Повторите новый пароль</label>
            <div class="password-field">
              <InputText
                id="security-password-confirmation"
                v-model="passwordConfirmation"
                :type="showPasswordConfirmation ? 'text' : 'password'"
                autocomplete="new-password"
                :aria-invalid="Boolean(passwordConfirmationError)"
                :aria-describedby="passwordConfirmationError ? 'security-password-confirmation-error' : undefined"
              />
              <button
                type="button"
                :aria-label="showPasswordConfirmation ? 'Скрыть повтор нового пароля' : 'Показать повтор нового пароля'"
                @click="showPasswordConfirmation = !showPasswordConfirmation"
              >
                <i :class="showPasswordConfirmation ? 'pi pi-eye-slash' : 'pi pi-eye'" />
              </button>
            </div>
            <small v-if="passwordConfirmationError" id="security-password-confirmation-error" class="field-error">{{ passwordConfirmationError }}</small>
          </div>
        </div>
        <div class="settings-form__actions">
          <Button type="submit" label="Сохранить пароль" icon="pi pi-check" :loading="changingPassword" :disabled="!canSubmitPassword" />
        </div>
      </form>
    </section>

    <section class="security-card" aria-labelledby="mfa-heading">
      <div class="section-heading">
        <i class="pi pi-shield" />
        <div><h2 id="mfa-heading">Способы входа</h2><p>Добавляйте passkeys и храните recovery-коды на случай потери устройств.</p></div>
      </div>
      <p v-if="factorsLoading" class="state"><i class="pi pi-spin pi-spinner" /> Загружаем passkeys…</p>
      <template v-else>
        <ul class="passkey-list">
          <li v-for="(passkey, passkeyIndex) in passkeys" :key="passkey.id" class="passkey-item" :data-passkey-id="passkey.id">
            <div class="passkey-copy"><strong>{{ passkey.label }}</strong><small>Добавлен {{ formatDate(passkey.createdAt) }}<template v-if="passkey.lastUsedAt"> · использован {{ formatDate(passkey.lastUsedAt) }}</template></small></div>
            <div class="item-actions">
              <span v-if="passkey.backedUp" class="verification-badge verified">Синхронизирован</span>
              <Button
                label="Удалить"
                :aria-label="`Удалить passkey ${passkey.label}, номер ${passkeyIndex + 1}`"
                severity="danger"
                text
                :loading="factorPending"
                @click="removePasskey(passkey)"
              />
            </div>
          </li>
        </ul>
        <form class="settings-form passkey-add" @submit.prevent="addPasskey">
          <div class="settings-form__fields">
            <div class="settings-field">
              <label for="security-passkey-label">Название нового passkey</label>
              <InputText id="security-passkey-label" v-model="passkeyLabel" maxlength="100" placeholder="Например, рабочий MacBook" />
            </div>
          </div>
          <div class="settings-form__actions">
            <Button type="submit" label="Добавить passkey" icon="pi pi-plus" :loading="factorPending" />
          </div>
        </form>
        <div class="recovery-summary">
          <div><strong>Осталось recovery-кодов: {{ recoveryCodesRemaining }}</strong><small>Ротация немедленно отменит все прежние коды.</small></div>
          <div class="item-actions">
            <Button label="Создать новые коды" outlined :loading="factorPending" @click="rotateRecoveryCodes" />
          </div>
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
        <div><h2 id="sessions-heading">Активные сессии</h2><p>Проверяйте устройства с доступом к CMS и завершайте незнакомые сеансы.</p></div>
      </div>
      <p v-if="loading" class="state"><i class="pi pi-spin pi-spinner" /> Загружаем сессии…</p>
      <div v-else-if="listError" class="state state-error" role="alert">
        <span>{{ listError }}</span><Button label="Повторить" icon="pi pi-refresh" outlined @click="loadSessions" />
      </div>
      <ul v-else class="session-list">
        <li v-for="(session, sessionIndex) in sessions" :key="session.id" class="session-item" :data-session-id="session.id">
          <div class="device-icon"><i class="pi pi-desktop" /></div>
          <div class="session-copy">
            <strong>{{ session.device }} <span v-if="session.current">Текущая</span></strong>
            <small>Последняя активность: {{ formatDate(session.lastSeenAt) }}</small>
            <small>Истекает: {{ formatDate(session.expiresAt) }}</small>
          </div>
          <div class="item-actions">
            <Button
              :label="session.current ? 'Выйти' : 'Завершить'"
              severity="danger"
              text
              :loading="revokingId === session.id"
              :aria-label="`${session.current ? 'Завершить текущую' : 'Завершить'} сессию ${session.device}, номер ${sessionIndex + 1}`"
              @click="revokeSession(session)"
            />
          </div>
        </li>
      </ul>
      <div class="section-footer">
        <Button
          data-testid="revoke-other-sessions"
          label="Завершить остальные"
          icon="pi pi-sign-out"
          severity="danger"
          outlined
          :loading="revokingOthers"
          :disabled="sessions.length <= 1"
          @click="revokeOthers"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.security-page {
  display: flex;
  width: 100%;
  max-width: 1120px;
  flex-direction: column;
  gap: 24px;
}

.security-header {
  align-items: flex-end;
  margin-bottom: 4px;
}

.security-header__copy {
  min-width: 0;
}

.security-header h1 {
  margin-top: 6px;
  overflow-wrap: anywhere;
}

.security-header p,
.section-heading p {
  margin: 8px 0 0;
  color: var(--text-secondary);
}

.security-card {
  padding: 28px;
  border: 1px solid var(--border-default);
  border-radius: 20px;
  background: var(--surface-card);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--text-primary) 2%, transparent);
}

.security-page :deep(.p-button) {
  min-height: 44px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 24px;
}

.section-heading > i,
.device-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  place-items: center;
  border-radius: 12px;
  background: var(--status-violet);
  color: var(--on-status-violet);
}

.section-heading > div {
  min-width: 0;
}

.section-heading h2 {
  margin: 0;
  font-size: var(--font-size-heading-small);
  line-height: 1.3;
}

.section-heading p {
  max-width: 760px;
  font-size: var(--font-size-body);
}

.identity-summary {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.identity-avatar {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 14px;
  background: var(--brand-soft);
  color: var(--text-brand);
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 800;
}

.identity-copy,
.passkey-copy,
.session-copy,
.notification-preference > div,
.recovery-summary > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.identity-copy span {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.identity-actions,
.item-actions,
.pending-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.verification-badge {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: var(--font-size-caption);
  font-weight: 700;
  white-space: nowrap;
}

.verification-badge.verified {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}

.verification-badge.unverified {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}

.pending-email {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 24px;
  padding: 16px;
  border: 1px solid var(--status-violet);
  border-radius: 14px;
  background: var(--status-violet-soft);
}

.pending-email > div:first-child {
  min-width: 0;
}

.pending-email small,
.pending-email strong,
.pending-email span {
  display: block;
}

.pending-email small {
  color: var(--status-violet-text);
  font-size: var(--font-size-caption);
  font-weight: 800;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.pending-email strong {
  margin-top: 4px;
  overflow-wrap: anywhere;
}

.pending-email span {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
}

.settings-form {
  width: min(100%, 640px);
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-subtle);
}

.password-form {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.settings-form__fields {
  display: grid;
  gap: 16px;
}

.settings-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.settings-field label {
  color: var(--text-primary);
  font-size: var(--font-size-body-small);
  font-weight: 700;
  line-height: 1.35;
}

.settings-form :deep(.p-inputtext) {
  min-height: 44px;
  font-size: var(--font-size-control);
}

.password-field {
  position: relative;
}

.password-field :deep(.p-inputtext) {
  padding-right: 52px;
}

.password-field > button {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.password-field > button:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.password-field > button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.field-error {
  color: var(--status-danger-text);
  font-size: var(--font-size-caption);
  line-height: 1.4;
}

.settings-form__actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 16px;
}

.settings-form__actions :deep(.p-button) {
  min-width: 210px;
}

.notification-preference,
.recovery-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-subtle);
}

.notification-preference span,
.notification-preference small,
.passkey-list small,
.recovery-summary small,
.session-copy small {
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
  line-height: 1.45;
}

.notification-preference .preference-warning {
  color: var(--status-warning-text);
}

.passkey-list,
.session-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.passkey-item,
.session-item {
  display: grid;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-subtle);
}

.passkey-item {
  grid-template-columns: minmax(0, 1fr) auto;
}

.passkey-copy small,
.session-copy strong {
  overflow-wrap: anywhere;
}

.passkey-add .settings-form__fields {
  grid-template-columns: minmax(0, 1fr);
}

.rotated-codes {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--status-warning);
  border-radius: 14px;
}

.rotated-codes ol {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rotated-codes li {
  padding: 8px;
  border-radius: 8px;
  background: var(--surface-subtle);
  text-align: center;
}

.session-item {
  grid-template-columns: 42px minmax(0, 1fr) auto;
}

.device-icon {
  background: var(--surface-card);
  color: var(--status-violet-text);
}

.session-copy strong span {
  display: inline-flex;
  margin-left: 6px;
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--status-success-soft);
  color: var(--status-success-text);
  font-size: .6875rem;
  white-space: nowrap;
}

.section-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

.state {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.state-error {
  justify-content: space-between;
  color: var(--status-danger-text);
}

@media (max-width: 900px) {
  .security-page {
    gap: 20px;
  }

  .security-header {
    align-items: stretch;
    margin-bottom: 0;
  }
}

@media (max-width: 640px) {
  .security-page {
    padding: 20px 16px 40px;
    gap: 16px;
  }

  .security-header {
    gap: 18px;
  }

  .security-header h1 {
    font-size: 1.75rem;
    line-height: 1.12;
  }

  .security-header p {
    font-size: var(--font-size-body);
  }

  .security-card {
    padding: 20px;
    border-radius: 18px;
  }

  .section-heading {
    gap: 12px;
    margin-bottom: 20px;
  }

  .section-heading h2 {
    font-size: 1rem;
  }

  .section-heading p {
    margin-top: 4px;
    font-size: var(--font-size-body-small);
  }

  .identity-summary {
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .identity-actions {
    align-items: stretch;
    grid-column: 1 / -1;
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 4px;
  }

  .identity-actions .verification-badge {
    align-self: flex-start;
  }

  .identity-actions :deep(.p-button) {
    width: 100%;
  }

  .pending-email,
  .notification-preference,
  .recovery-summary {
    align-items: stretch;
    flex-direction: column;
  }

  .pending-actions,
  .notification-preference .item-actions,
  .recovery-summary .item-actions {
    justify-content: flex-start;
  }

  .notification-preference .item-actions :deep(.p-button),
  .recovery-summary .item-actions :deep(.p-button) {
    width: 100%;
  }

  .settings-form__actions :deep(.p-button) {
    width: 100%;
    min-width: 0;
  }

  .passkey-item {
    grid-template-columns: minmax(0, 1fr);
  }

  .passkey-item .item-actions {
    align-items: stretch;
    flex-direction: column;
    justify-content: flex-start;
  }

  .passkey-item .verification-badge {
    align-self: flex-start;
  }

  .passkey-item .item-actions :deep(.p-button) {
    width: 100%;
  }

  .session-item {
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: start;
  }

  .session-item .item-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }

  .session-item .item-actions :deep(.p-button) {
    width: 100%;
  }

  .section-footer {
    justify-content: stretch;
  }

  .section-footer :deep(.p-button) {
    width: 100%;
  }

  .state-error {
    align-items: stretch;
    flex-direction: column;
  }

  .state-error :deep(.p-button) {
    width: 100%;
  }

  .pending-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .pending-actions :deep(.p-button) {
    width: 100%;
  }

  .rotated-codes ol {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 380px) {
  .security-page {
    padding-inline: 12px;
  }

  .security-card {
    padding: 18px;
  }
}
</style>
