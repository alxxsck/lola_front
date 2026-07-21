<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useAuthStore } from '@/features/auth/auth.store'
import { cmsUserManagementApi } from '@/features/cms-user-management/api/cms-user-management.api'
import InitialAccessSecretDialog from '@/features/cms-user-management/ui/InitialAccessSecretDialog.vue'
import {
  availableCmsUserActions,
  useCmsUserDirectory,
  type CmsUserAction,
  type CmsUserStatusFilter,
} from '@/features/cms-user-management/model/use-cms-user-directory'
import type { CmsUserSummaryDto } from '@/shared/api/generated/models'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const directory = useCmsUserDirectory(cmsUserManagementApi)
const {
  items,
  nextCursor,
  status,
  loading,
  loadingMore,
  listError,
  detail,
  detailLoading,
  detailError,
  operation,
  secret,
} = directory

const pendingAction = ref<Exclude<CmsUserAction, 'EDIT'> | null>(null)
const reason = ref('')
const reasonError = ref('')
const editing = ref(false)
const givenName = ref('')
const familyName = ref('')

const statusOptions: Array<{ label: string; value: CmsUserStatusFilter }> = [
  { label: 'Все состояния', value: 'ALL' },
  { label: 'Ожидает настройки', value: 'PENDING_SETUP' },
  { label: 'Активен', value: 'ACTIVE' },
  { label: 'Приостановлен', value: 'SUSPENDED' },
  { label: 'Деактивирован', value: 'DEACTIVATED' },
]

const permissions = computed(() => auth.user?.platformPermissionCodes ?? [])
const actions = computed(() =>
  detail.value
    ? availableCmsUserActions(detail.value, permissions.value, auth.user?.id)
    : [],
)
const reasonTitle = computed(() => ({
  SUSPEND: 'Приостановить доступ?',
  DEACTIVATE: 'Деактивировать CMS User?',
  REACTIVATE: 'Реактивировать CMS User?',
  RESET_CREDENTIALS: 'Сбросить учётные данные?',
})[pendingAction.value ?? 'SUSPEND'])

async function openUser(user: CmsUserSummaryDto): Promise<void> {
  await directory.open(user.id)
  if (detail.value) {
    await router.replace({
      name: 'platform-cms-users',
      params: { cmsUserId: user.id },
    })
  }
}

function closeDetail(): void {
  directory.close()
  editing.value = false
  void router.replace({ name: 'platform-cms-users' })
}

function beginEdit(): void {
  if (!detail.value) return
  givenName.value = detail.value.givenName
  familyName.value = detail.value.familyName
  editing.value = true
}

async function saveProfile(): Promise<void> {
  if (!givenName.value.trim() || !familyName.value.trim()) return
  await directory.updateProfile(givenName.value, familyName.value)
  if (operation.value.kind === 'SUCCESS') editing.value = false
}

function beginLifecycle(action: Exclude<CmsUserAction, 'EDIT'>): void {
  pendingAction.value = action
  reason.value = ''
  reasonError.value = ''
}

async function submitLifecycle(): Promise<void> {
  const action = pendingAction.value
  if (!action) return
  const normalized = reason.value.trim().normalize('NFC')
  if (normalized.length < 10) {
    reasonError.value = 'Укажите причину минимум 10 символов.'
    return
  }
  if (normalized.length > 500) {
    reasonError.value = 'Причина должна быть не длиннее 500 символов.'
    return
  }
  reasonError.value = ''
  await directory.execute(action, normalized)
  pendingAction.value = null
  reason.value = ''
}

async function requireFreshLogin(): Promise<void> {
  await auth.logout()
  await router.replace({ name: 'login', query: { redirect: '/platform/cms-users' } })
}

function statusLabel(value: string): string {
  return ({
    PENDING_SETUP: 'Ожидает настройки',
    ACTIVE: 'Активен',
    SUSPENDED: 'Приостановлен',
    DEACTIVATED: 'Деактивирован',
  } as Record<string, string>)[value] ?? value
}

function statusSeverity(value: string): 'success' | 'warn' | 'danger' | 'secondary' {
  if (value === 'ACTIVE') return 'success'
  if (value === 'PENDING_SETUP' || value === 'SUSPENDED') return 'warn'
  return value === 'DEACTIVATED' ? 'danger' : 'secondary'
}

function actionLabel(action: CmsUserAction): string {
  return ({
    EDIT: 'Изменить профиль',
    SUSPEND: 'Приостановить',
    DEACTIVATE: 'Деактивировать',
    REACTIVATE: 'Реактивировать',
    RESET_CREDENTIALS: 'Сбросить доступ',
  })[action]
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : '—'
}

onMounted(async () => {
  await directory.load()
  const cmsUserId = route.params.cmsUserId
  if (typeof cmsUserId === 'string') await directory.open(cmsUserId)
})
</script>

<template>
  <section class="page platform-users-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Control plane</div>
        <h1>CMS Users</h1>
        <p class="subtitle">Глобальные identities и их доступ к административным поверхностям Lola.</p>
      </div>
      <Button label="Обновить" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="directory.load()" />
    </header>

    <Message v-if="listError" severity="error" :closable="false">
      <span>{{ listError }}</span>
      <Button label="Повторить" size="small" text @click="directory.load()" />
    </Message>

    <div class="filters card">
      <label>
        <span>Состояние</span>
        <Select
          :model-value="status"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          aria-label="Состояние CMS User"
          @update:model-value="directory.setStatus($event)"
        />
      </label>
      <span class="filter-note">Список фильтруется сервером; курсор действует только внутри выбранного состояния.</span>
    </div>

    <div class="card table-card">
      <div v-if="loading" class="loading-list"><Skeleton v-for="row in 7" :key="row" height="58px" /></div>
      <DataTable
        v-else
        :value="items"
        data-key="id"
        row-hover
        :pt="{ tableContainer: { tabindex: 0, role: 'region', 'aria-label': 'CMS Users' } }"
        @row-click="openUser($event.data)"
      >
        <template #empty><div class="empty"><i class="pi pi-users" /><strong>CMS Users не найдены</strong></div></template>
        <Column header="CMS User">
          <template #body="{ data }"><div class="identity"><span>{{ data.displayName.slice(0, 1) }}</span><div><strong>{{ data.displayName }}</strong><small>{{ data.email }}</small></div></div></template>
        </Column>
        <Column header="Состояние"><template #body="{ data }"><Tag :value="statusLabel(data.status)" :severity="statusSeverity(data.status)" /></template></Column>
        <Column header="Email"><template #body="{ data }"><Tag :value="data.emailVerified ? 'Подтверждён' : 'Не подтверждён'" :severity="data.emailVerified ? 'success' : 'warn'" /></template></Column>
        <Column field="projectCount" header="Projects" class="mobile-hide" />
        <Column header="Последний вход" class="mobile-hide"><template #body="{ data }">{{ formatDate(data.lastLoginAt) }}</template></Column>
        <Column header="Открыть"><template #body="{ data }"><Button icon="pi pi-chevron-right" text rounded severity="secondary" :aria-label="`Открыть ${data.displayName}`" @click.stop="openUser(data)" /></template></Column>
      </DataTable>
      <div v-if="!loading && nextCursor" class="load-more"><Button label="Загрузить ещё" severity="secondary" outlined :loading="loadingMore" @click="directory.load(true)" /></div>
    </div>
  </section>

  <Drawer aria-labelledby="cms-user-detail-title" :visible="Boolean(detail || detailLoading)" position="right" :style="{ width: 'min(620px, 100vw)' }" @update:visible="!$event && closeDetail()">
    <template #header><div><small>CMS User</small><h2 id="cms-user-detail-title">{{ detail?.displayName ?? 'Загрузка…' }}</h2></div></template>
    <div v-if="detailLoading" class="loading-list"><Skeleton v-for="row in 5" :key="row" height="52px" /></div>
    <Message v-else-if="detailError" severity="error" :closable="false">{{ detailError }}</Message>
    <div v-else-if="detail" class="detail-stack">
      <Message v-if="operation.kind === 'VERSION_CONFLICT'" severity="warn" :closable="false">Данные уже изменились другим оператором. Загружена актуальная версия; проверьте её перед повторным действием.</Message>
      <Message v-else-if="operation.kind === 'STEP_UP_REQUIRED'" severity="warn" :closable="false"><div class="message-action"><span><strong>Требуется свежий вход.</strong> Действие не повторялось.</span><Button label="Войти заново" size="small" @click="requireFreshLogin" /></div></Message>
      <Message v-else-if="operation.kind === 'MFA_REQUIRED'" severity="warn" :closable="false">Для действия требуется MFA. Действие не повторялось.</Message>
      <Message v-else-if="operation.kind === 'OUTCOME_UNKNOWN'" severity="warn" :closable="false">Результат запроса неизвестен. Не повторяйте его вслепую: проверьте состояние и при необходимости осознанно перевыпустите доступ.</Message>
      <Message v-else-if="operation.kind === 'ERROR'" severity="error" :closable="false">{{ operation.message }}</Message>

      <div class="detail-hero"><div><span>Состояние</span><Tag :value="statusLabel(detail.status)" :severity="statusSeverity(detail.status)" /></div><div><span>Email</span><strong>{{ detail.email }}</strong></div><div><span>Версия</span><strong>{{ detail.version }}</strong></div></div>

      <section class="detail-section">
        <div class="section-heading"><h3>Профиль</h3><Button v-if="actions.includes('EDIT') && !editing" label="Изменить" text size="small" @click="beginEdit" /></div>
        <form v-if="editing" class="profile-form" @submit.prevent="saveProfile">
          <label><span>Имя</span><InputText v-model="givenName" maxlength="100" /></label>
          <label><span>Фамилия</span><InputText v-model="familyName" maxlength="100" /></label>
          <div><Button type="button" label="Отмена" severity="secondary" text @click="editing = false" /><Button type="submit" label="Сохранить" :loading="operation.kind === 'SUBMITTING'" /></div>
        </form>
        <dl v-else><div><dt>Имя</dt><dd>{{ detail.givenName }}</dd></div><div><dt>Фамилия</dt><dd>{{ detail.familyName }}</dd></div><div><dt>Последний вход</dt><dd>{{ formatDate(detail.lastLoginAt) }}</dd></div><div><dt>Projects</dt><dd>{{ detail.projectCount }}</dd></div></dl>
      </section>

      <section class="detail-section"><h3>Platform authority</h3><div class="tag-list"><Tag v-for="role in detail.platformRoleKeys" :key="role" :value="role" severity="info" /><span v-if="!detail.platformRoleKeys.length">Роли не назначены</span></div><ul class="permission-list"><li v-for="permission in detail.platformPermissionCodes" :key="permission"><code>{{ permission }}</code></li></ul></section>

      <section v-if="detail.deactivationReason" class="detail-section"><h3>Деактивация</h3><p>{{ detail.deactivationReason }}</p><small>{{ formatDate(detail.deactivatedAt) }}</small></section>

      <section v-if="actions.some((action) => action !== 'EDIT')" class="detail-section"><h3>Управление доступом</h3><div class="action-grid"><Button v-for="action in actions.filter((item) => item !== 'EDIT')" :key="action" :data-action="action" :label="actionLabel(action)" :severity="action === 'DEACTIVATE' || action === 'RESET_CREDENTIALS' ? 'danger' : 'secondary'" outlined @click="beginLifecycle(action as Exclude<CmsUserAction, 'EDIT'>)" /></div></section>
      <Message v-else-if="detail.id === auth.user?.id" severity="info" :closable="false">Собственный доступ нельзя приостановить, деактивировать или сбросить через operator flow.</Message>
    </div>
  </Drawer>

  <Dialog :visible="Boolean(pendingAction)" modal :closable="operation.kind !== 'SUBMITTING'" :header="reasonTitle" :style="{ width: 'min(520px, calc(100vw - 28px))' }" @update:visible="!$event && (pendingAction = null)">
    <div class="reason-dialog"><p>Причина попадёт в security audit. Не указывайте пароли, токены и другие секреты.</p><label><span>Причина</span><Textarea v-model="reason" data-testid="audit-reason" rows="4" maxlength="500" autofocus :aria-invalid="Boolean(reasonError)" /></label><small>{{ reason.length }}/500</small><Message v-if="reasonError" severity="error" :closable="false">{{ reasonError }}</Message></div>
    <template #footer><Button label="Отмена" severity="secondary" text :disabled="operation.kind === 'SUBMITTING'" @click="pendingAction = null" /><Button data-testid="submit-lifecycle" :label="pendingAction ? actionLabel(pendingAction) : 'Продолжить'" :severity="pendingAction === 'DEACTIVATE' || pendingAction === 'RESET_CREDENTIALS' ? 'danger' : undefined" :loading="operation.kind === 'SUBMITTING'" @click="submitLifecycle" /></template>
  </Dialog>

  <InitialAccessSecretDialog v-if="secret" :secret="secret.value" :expires-at="secret.expiresAt" :status="secret.status" @acknowledged="directory.acknowledgeSecret" />
</template>

<style scoped>
.filters { display: flex; align-items: end; gap: 18px; margin: 16px 0; padding: 14px 16px; }
.filters label { display: grid; gap: 6px; min-width: 220px; }
.filters label > span, .filter-note { color: var(--muted); font-size: .68rem; }
.filter-note { padding-bottom: 9px; }
.table-card { overflow: hidden; }
.loading-list { display: grid; gap: 9px; padding: 18px; }
.identity { display: flex; align-items: center; gap: 11px; }
.identity > span { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 11px; background: var(--status-violet-soft); color: var(--status-violet-text); font-weight: 800; }
.identity strong, .identity small { display: block; }
.identity small { margin-top: 3px; color: var(--muted); }
.load-more { display: flex; justify-content: center; padding: 14px; border-top: 1px solid var(--line); }
.detail-stack { display: grid; gap: 18px; }
.detail-hero { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 14px; border-radius: 14px; background: var(--surface-subtle); }
.detail-hero span, .detail-hero strong { display: block; }
.detail-hero span { margin-bottom: 5px; color: var(--muted); font-size: .62rem; text-transform: uppercase; }
.detail-section { padding: 16px; border: 1px solid var(--line); border-radius: 15px; }
.detail-section h3 { margin: 0 0 12px; font-size: .9rem; }
.section-heading, .message-action { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-heading h3 { margin: 0; }
dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; }
dl div { min-width: 0; } dt { color: var(--muted); font-size: .65rem; } dd { margin: 4px 0 0; font-size: .78rem; overflow-wrap: anywhere; }
.profile-form { display: grid; gap: 12px; margin-top: 14px; }
.profile-form label, .reason-dialog label { display: grid; gap: 6px; }
.profile-form label span, .reason-dialog label span { color: var(--muted); font-size: .68rem; font-weight: 700; }
.profile-form > div { display: flex; justify-content: flex-end; gap: 8px; }
.tag-list, .action-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.permission-list { display: grid; gap: 6px; margin: 13px 0 0; padding-left: 18px; font-size: .7rem; }
.reason-dialog { display: grid; gap: 10px; }
.reason-dialog p, .reason-dialog small { margin: 0; color: var(--muted); font-size: .72rem; line-height: 1.45; }
.reason-dialog textarea { width: 100%; }
@media (max-width: 700px) { .filters { align-items: stretch; flex-direction: column; } .filters label { min-width: 0; } .detail-hero, dl { grid-template-columns: 1fr; } }
</style>
