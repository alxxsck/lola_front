<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import type { CmsSessionSummaryDto } from '@/shared/api/generated/models'
import { securitySettingsApi } from '@/features/security-settings/security-settings.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { normalizeApiError } from '@/shared/api/http/api-error'

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
const canSubmitPassword = computed(() =>
  Boolean(currentPassword.value && newPassword.value && passwordConfirmation.value),
)

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

function clearFeedback() {
  actionError.value = ''
  actionSuccess.value = ''
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value))
}

onMounted(loadSessions)
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
.security-page{display:flex;flex-direction:column;gap:22px;max-width:1040px;margin:0 auto}.security-page>header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.security-page h1{margin:6px 0 8px;font-size:2rem}.security-page header p,.section-heading p{margin:0;color:var(--muted)}.security-card{padding:24px;border:1px solid var(--line);border-radius:20px;background:var(--surface-card);box-shadow:var(--shadow-card)}.section-heading{display:flex;align-items:flex-start;gap:13px;margin-bottom:20px}.section-heading>i,.device-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--status-violet);color:var(--on-status-violet)}.section-heading h2{margin:0 0 4px;font-size:1.12rem}.password-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:end}.password-form label{display:flex;flex-direction:column;gap:7px;font-size:.76rem;font-weight:700}.password-form :deep(.p-button){grid-column:3}.session-list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}.session-list li{display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--border-subtle);border-radius:15px;background:var(--surface-subtle)}.device-icon{flex:0 0 auto;background:var(--surface-card);color:var(--status-violet-text)}.session-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.session-copy strong span{margin-left:6px;padding:3px 7px;border-radius:999px;background:var(--status-success-soft);color:var(--status-success-text);font-size:.62rem}.session-copy small{color:var(--muted)}.state{display:flex;align-items:center;gap:8px;color:var(--muted)}.state-error{justify-content:space-between;color:var(--status-danger-text)}
@media(max-width:760px){.security-page>header{align-items:stretch;flex-direction:column}.password-form{grid-template-columns:1fr}.password-form :deep(.p-button){grid-column:auto}.session-list li{align-items:flex-start;flex-wrap:wrap}.session-copy{min-width:calc(100% - 58px)}}
</style>
