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
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useAuthStore } from '@/features/auth/auth.store'
import { cmsUserManagementApi } from '@/features/cms-user-management/api/cms-user-management.api'
import { normalizeApiError } from '@/shared/api/http/api-error'
import InitialAccessSecretDialog from '@/features/cms-user-management/ui/InitialAccessSecretDialog.vue'
import {
  availableCmsUserActions,
  useCmsUserDirectory,
  type CmsUserAction,
  type CmsUserStatusFilter,
} from '@/features/cms-user-management/model/use-cms-user-directory'
import type {
  CmsUserProvisioningDtoDeliveryMode,
  CmsSessionSummaryDto,
  CmsUserPlatformRoleAssignmentResponseDto,
  PlatformRoleResponseDto,
  CmsUserSummaryDto,
  ProjectResponseDto,
  ProjectRoleResponseDto,
} from '@/shared/api/generated/models'

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
const createVisible = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const createNotice = ref('')
const provisioningKey = ref('')
const provisioningOutcomeUnknown = ref(false)
const projectsLoading = ref(false)
const projects = ref<ProjectResponseDto[]>([])
const rolesByProject = ref<Record<string, ProjectRoleResponseDto[]>>({})
const platformRoles = ref<PlatformRoleResponseDto[]>([])
const platformRoleAssignment = ref<CmsUserPlatformRoleAssignmentResponseDto | null>(null)
const platformRoleLoading = ref(false)
const platformRoleEditing = ref(false)
const platformRoleSubmitting = ref(false)
const selectedPlatformRoleIds = ref<string[]>([])
const platformRoleReason = ref('')
const platformRoleReasonError = ref('')
const platformRoleState = ref<
  'IDLE' | 'ERROR' | 'VERSION_CONFLICT' | 'STEP_UP_REQUIRED' | 'LAST_PLATFORM_OPERATOR'
>('IDLE')
const userSessions = ref<CmsSessionSummaryDto[]>([])
const userSessionsLoading = ref(false)
const userSessionsError = ref('')
const pendingSessionRevoke = ref<CmsSessionSummaryDto | null>(null)
const sessionRevokeReason = ref('')
const sessionRevokeError = ref('')
const sessionRevokeSubmitting = ref(false)
const sessionRevokeStepUp = ref(false)
const provisionedSecret = ref<{ value: string; expiresAt: string; status: string } | null>(null)
const createForm = ref({
  email: '',
  givenName: '',
  familyName: '',
  deliveryMode: 'EMAIL_LINK' as CmsUserProvisioningDtoDeliveryMode,
  assignments: [newAssignment()],
})
const canCreate = computed(() => permissions.value.includes('platform.cms_users.create'))
const deliveryOptions = [
  { label: 'Отправить ссылку на email', value: 'EMAIL_LINK' },
  { label: 'Показать секрет один раз', value: 'RETURN_ONCE' },
]

const statusOptions: Array<{ label: string; value: CmsUserStatusFilter }> = [
  { label: 'Все состояния', value: 'ALL' },
  { label: 'Ожидает настройки', value: 'PENDING_SETUP' },
  { label: 'Активен', value: 'ACTIVE' },
  { label: 'Приостановлен', value: 'SUSPENDED' },
  { label: 'Деактивирован', value: 'DEACTIVATED' },
]

const permissions = computed(() => auth.user?.platformPermissionCodes ?? [])
const canReadPlatformRoles = computed(() =>
  permissions.value.includes('platform.cms_users.read')
  && permissions.value.includes('platform.roles.read'),
)
const canManagePlatformRoles = computed(() => permissions.value.includes('platform.roles.manage'))
const canRevokeSessions = computed(() => permissions.value.includes('platform.cms_users.update'))
const renderedPlatformRoleKeys = computed(() =>
  platformRoleAssignment.value?.roleKeys ?? detail.value?.platformRoleKeys ?? [],
)
const renderedPlatformPermissionCodes = computed(() =>
  platformRoleAssignment.value?.effectivePermissionCodes
  ?? detail.value?.platformPermissionCodes
  ?? [],
)
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
  userSessions.value = []
  userSessionsError.value = ''
  userSessionsLoading.value = false
  await directory.open(user.id)
  if (detail.value?.id === user.id) {
    await Promise.all([loadPlatformAuthority(user.id), loadUserSessions(user.id)])
    await router.replace({
      name: 'platform-cms-users',
      params: { cmsUserId: user.id },
    })
  }
}

function closeDetail(): void {
  directory.close()
  editing.value = false
  platformRoleEditing.value = false
  platformRoleAssignment.value = null
  platformRoleState.value = 'IDLE'
  userSessions.value = []
  userSessionsError.value = ''
  userSessionsLoading.value = false
  pendingSessionRevoke.value = null
  sessionRevokeReason.value = ''
  sessionRevokeError.value = ''
  sessionRevokeStepUp.value = false
  void router.replace({ name: 'platform-cms-users' })
}

function beginSessionRevoke(session: CmsSessionSummaryDto): void {
  pendingSessionRevoke.value = session
  sessionRevokeReason.value = ''
  sessionRevokeError.value = ''
  sessionRevokeStepUp.value = false
}

async function submitSessionRevoke(): Promise<void> {
  const cmsUserId = detail.value?.id
  const session = pendingSessionRevoke.value
  if (!cmsUserId || !session || sessionRevokeSubmitting.value) return
  const normalizedReason = sessionRevokeReason.value.trim().normalize('NFC')
  if (normalizedReason.length < 10 || normalizedReason.length > 500) {
    sessionRevokeError.value = 'Укажите причину от 10 до 500 символов.'
    return
  }
  sessionRevokeError.value = ''
  sessionRevokeStepUp.value = false
  sessionRevokeSubmitting.value = true
  try {
    await cmsUserManagementApi.revokeSession(cmsUserId, session.id, normalizedReason)
    userSessions.value = userSessions.value.filter(({ id }) => id !== session.id)
    pendingSessionRevoke.value = null
    sessionRevokeReason.value = ''
  } catch (cause) {
    const error = normalizeApiError(cause)
    sessionRevokeStepUp.value =
      error.status === 428 ||
      error.code === 'REAUTHENTICATION_REQUIRED' ||
      error.code === 'MFA_REQUIRED'
    sessionRevokeError.value = sessionRevokeStepUp.value
      ? 'Требуется свежий вход с MFA. Действие не повторялось.'
      : 'Не удалось завершить сессию. Действие не повторялось.'
  } finally {
    sessionRevokeSubmitting.value = false
  }
}

async function loadUserSessions(cmsUserId: string): Promise<void> {
  userSessionsLoading.value = true
  userSessionsError.value = ''
  try {
    const response = await cmsUserManagementApi.sessions(cmsUserId)
    if (detail.value?.id === cmsUserId) userSessions.value = response.sessions
  } catch {
    if (detail.value?.id === cmsUserId) {
      userSessions.value = []
      userSessionsError.value = 'Не удалось загрузить активные сессии пользователя.'
    }
  } finally {
    if (detail.value?.id === cmsUserId) userSessionsLoading.value = false
  }
}

async function loadPlatformAuthority(cmsUserId: string): Promise<void> {
  if (!canReadPlatformRoles.value) return
  platformRoleLoading.value = true
  platformRoleState.value = 'IDLE'
  try {
    const [assignment, catalog] = await Promise.all([
      cmsUserManagementApi.platformRoleAssignment(cmsUserId),
      platformRoles.value.length
        ? Promise.resolve({ items: platformRoles.value })
        : cmsUserManagementApi.platformRoles(),
    ])
    platformRoleAssignment.value = assignment
    platformRoles.value = catalog.items.filter((role) => role.status === 'ACTIVE')
  } catch {
    platformRoleState.value = 'ERROR'
  } finally {
    platformRoleLoading.value = false
  }
}

function beginPlatformRoleEdit(): void {
  if (!canManagePlatformRoles.value || !platformRoleAssignment.value) return
  selectedPlatformRoleIds.value = [...platformRoleAssignment.value.roleIds]
  platformRoleReason.value = ''
  platformRoleReasonError.value = ''
  platformRoleState.value = 'IDLE'
  platformRoleEditing.value = true
}

async function submitPlatformRoles(): Promise<void> {
  const assignment = platformRoleAssignment.value
  const cmsUserId = detail.value?.id
  if (!canManagePlatformRoles.value || !assignment || !cmsUserId || platformRoleSubmitting.value)
    return
  const normalizedReason = platformRoleReason.value.trim().normalize('NFC')
  if (normalizedReason.length < 10) {
    platformRoleReasonError.value = 'Укажите причину минимум 10 символов.'
    return
  }
  if (normalizedReason.length > 500) {
    platformRoleReasonError.value = 'Причина должна быть не длиннее 500 символов.'
    return
  }
  platformRoleReasonError.value = ''
  platformRoleState.value = 'IDLE'
  platformRoleSubmitting.value = true
  try {
    const updated = await cmsUserManagementApi.replacePlatformRoles(
      cmsUserId,
      assignment.version,
      [...selectedPlatformRoleIds.value],
      normalizedReason,
    )
    platformRoleAssignment.value = updated
    const currentDetail = detail.value
    if (!currentDetail) return
    detail.value = {
      ...currentDetail,
      platformRoleKeys: updated.roleKeys,
      platformPermissionCodes: updated.effectivePermissionCodes,
      version: updated.version,
    }
    platformRoleEditing.value = false
  } catch (cause) {
    const error = normalizeApiError(cause)
    if (error.code === 'LAST_PLATFORM_OPERATOR') {
      platformRoleState.value = 'LAST_PLATFORM_OPERATOR'
    } else if (error.status === 409) {
      platformRoleState.value = 'VERSION_CONFLICT'
      try {
        platformRoleAssignment.value = await cmsUserManagementApi.platformRoleAssignment(cmsUserId)
      } catch {
        // Keep the conflict state; the operator must explicitly reload before retrying.
      }
    } else if (error.status === 428) {
      platformRoleState.value = 'STEP_UP_REQUIRED'
    } else {
      platformRoleState.value = 'ERROR'
    }
    platformRoleEditing.value = false
  } finally {
    platformRoleSubmitting.value = false
  }
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

function newAssignment() {
  return { id: crypto.randomUUID(), projectId: '', roleIds: [] as string[] }
}

function resetCreateForm(): void {
  createForm.value = {
    email: '',
    givenName: '',
    familyName: '',
    deliveryMode: 'EMAIL_LINK',
    assignments: [newAssignment()],
  }
  createError.value = ''
}

function normalizeProjects(value: unknown): ProjectResponseDto[] {
  if (Array.isArray(value)) return value as ProjectResponseDto[]
  if (value && typeof value === 'object' && 'items' in value && Array.isArray(value.items))
    return value.items as ProjectResponseDto[]
  return []
}

async function openCreate(): Promise<void> {
  if (!canCreate.value) return
  resetCreateForm()
  createNotice.value = ''
  provisioningKey.value = crypto.randomUUID()
  provisioningOutcomeUnknown.value = false
  createVisible.value = true
  if (projects.value.length) return
  projectsLoading.value = true
  try {
    projects.value = normalizeProjects(await cmsUserManagementApi.projects())
  } catch {
    createError.value = 'Не удалось загрузить проекты. Повторите попытку.'
  } finally {
    projectsLoading.value = false
  }
}

async function selectAssignmentProject(index: number, projectId: string): Promise<void> {
  const assignment = createForm.value.assignments[index]
  if (!assignment) return
  assignment.projectId = projectId
  assignment.roleIds = []
  if (!projectId || rolesByProject.value[projectId]) return
  try {
    const response = await cmsUserManagementApi.roles(projectId)
    rolesByProject.value = { ...rolesByProject.value, [projectId]: response.items }
  } catch {
    createError.value = 'Не удалось загрузить роли выбранного проекта.'
  }
}

function addAssignment(): void {
  createForm.value.assignments.push(newAssignment())
}

function removeAssignment(index: number): void {
  createForm.value.assignments.splice(index, 1)
}

async function submitProvisioning(): Promise<void> {
  if (!canCreate.value || createSubmitting.value || provisioningOutcomeUnknown.value) return
  const email = createForm.value.email.trim()
  const givenNameValue = createForm.value.givenName.trim()
  const familyNameValue = createForm.value.familyName.trim()
  const assignments = createForm.value.assignments
  if (!/^\S+@\S+\.\S+$/.test(email) || !givenNameValue || !familyNameValue) {
    createError.value = 'Укажите имя, фамилию и корректный email.'
    return
  }
  if (
    assignments.some((item) => !item.projectId || item.roleIds.length === 0) ||
    new Set(assignments.map((item) => item.projectId)).size !== assignments.length
  ) {
    createError.value = 'Для каждого уникального проекта выберите хотя бы одну роль.'
    return
  }
  createSubmitting.value = true
  createError.value = ''
  try {
    const response = await cmsUserManagementApi.provision({
      email,
      givenName: givenNameValue,
      familyName: familyNameValue,
      deliveryMode: createForm.value.deliveryMode,
      projectAssignments: assignments.map(({ projectId, roleIds }) => ({ projectId, roleIds })),
    }, provisioningKey.value)
    createVisible.value = false
    if ('initialAccessSecret' in response) {
      provisionedSecret.value = {
        value: response.initialAccessSecret,
        expiresAt: response.expiresAt,
        status: response.status,
      }
    } else if (response.replayed) {
      createNotice.value = 'Запрос уже был обработан. Секрет повторно не раскрывается; при необходимости сбросьте учётные данные пользователя.'
    } else {
      createNotice.value = 'CMS User создан. Ссылка первоначального доступа отправлена на email.'
    }
    await directory.load()
  } catch (cause) {
    const error = normalizeApiError(cause)
    provisioningOutcomeUnknown.value = error.status === 0
    if (provisioningOutcomeUnknown.value) {
      createError.value = 'Результат запроса неизвестен. Не создавайте пользователя повторно: обновите список и, если пользователь появился, используйте «Сбросить доступ».'
    } else if (error.code === 'EMAIL_ALREADY_IN_USE') {
      createError.value = 'Этот email уже используется.'
    } else if (error.status === 403 || error.code === 'PERMISSION_DENIED') {
      createError.value = 'Недостаточно прав для создания пользователя с выбранными назначениями.'
    } else if (error.status === 400 || error.status === 422) {
      createError.value = 'Проверьте данные пользователя и назначения проектов.'
    } else {
      createError.value = 'Не удалось создать пользователя. Исправьте данные или повторите попытку.'
    }
  } finally {
    createSubmitting.value = false
  }
}

function acknowledgeProvisionedSecret(): void {
  provisionedSecret.value = null
  resetCreateForm()
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
  if (typeof cmsUserId === 'string') {
    await directory.open(cmsUserId)
    if (detail.value?.id === cmsUserId) {
      await Promise.all([
        loadPlatformAuthority(cmsUserId),
        loadUserSessions(cmsUserId),
      ])
    }
  }
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
      <div class="header-actions">
        <Button v-if="canCreate" label="Создать CMS User" icon="pi pi-user-plus" @click="openCreate" />
        <Button label="Обновить" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="directory.load()" />
      </div>
    </header>

    <Message v-if="createNotice" severity="success" :closable="true" @close="createNotice = ''">{{ createNotice }}</Message>

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

      <section class="detail-section">
        <div class="section-heading">
          <h3>Platform authority</h3>
          <Button
            v-if="canManagePlatformRoles && canReadPlatformRoles && platformRoleAssignment && !platformRoleEditing"
            data-testid="edit-platform-roles"
            label="Изменить роли"
            text
            size="small"
            @click="beginPlatformRoleEdit"
          />
        </div>
        <Skeleton v-if="platformRoleLoading" height="64px" />
        <template v-else>
          <Message v-if="platformRoleState === 'VERSION_CONFLICT'" severity="warn" :closable="false">Роли уже изменились другим оператором. Загружена актуальная версия; действие не повторялось.</Message>
          <Message v-else-if="platformRoleState === 'STEP_UP_REQUIRED'" severity="warn" :closable="false"><div class="message-action"><span><strong>Требуется свежий вход.</strong> Изменение ролей не повторялось.</span><Button label="Войти заново" size="small" @click="requireFreshLogin" /></div></Message>
          <Message v-else-if="platformRoleState === 'LAST_PLATFORM_OPERATOR'" severity="warn" :closable="false">Нельзя снять роль у последнего активного Platform Operator. Сначала назначьте её другому активному пользователю.</Message>
          <Message v-else-if="platformRoleState === 'ERROR'" severity="error" :closable="false">Не удалось безопасно загрузить или изменить платформенные роли.</Message>
          <form v-if="platformRoleEditing" class="platform-role-form" @submit.prevent="submitPlatformRoles">
            <label>
              <span>Платформенные роли</span>
              <MultiSelect
                v-model="selectedPlatformRoleIds"
                :options="platformRoles"
                option-label="name"
                option-value="id"
                display="chip"
                placeholder="Без платформенных ролей"
              />
            </label>
            <label>
              <span>Причина изменения</span>
              <Textarea v-model="platformRoleReason" data-testid="platform-role-reason" rows="3" maxlength="500" :aria-invalid="Boolean(platformRoleReasonError)" />
            </label>
            <Message v-if="platformRoleReasonError" severity="error" :closable="false">{{ platformRoleReasonError }}</Message>
            <div class="form-actions">
              <Button type="button" label="Отмена" severity="secondary" text :disabled="platformRoleSubmitting" @click="platformRoleEditing = false" />
              <Button type="submit" label="Сохранить роли" :loading="platformRoleSubmitting" />
            </div>
          </form>
          <template v-else>
            <div class="tag-list"><Tag v-for="role in renderedPlatformRoleKeys" :key="role" :value="role" severity="info" /><span v-if="!renderedPlatformRoleKeys.length">Роли не назначены</span></div>
            <ul class="permission-list"><li v-for="permission in renderedPlatformPermissionCodes" :key="permission"><code>{{ permission }}</code></li></ul>
          </template>
        </template>
      </section>

      <section v-if="detail.deactivationReason" class="detail-section"><h3>Деактивация</h3><p>{{ detail.deactivationReason }}</p><small>{{ formatDate(detail.deactivatedAt) }}</small></section>

      <section class="detail-section">
        <h3>Активные сессии</h3>
        <Skeleton v-if="userSessionsLoading" height="64px" />
        <Message v-else-if="userSessionsError" severity="error" :closable="false">{{ userSessionsError }}</Message>
        <p v-else-if="userSessions.length === 0">Активных сессий нет.</p>
        <ul v-else class="session-list">
          <li v-for="session in userSessions" :key="session.id">
            <div>
              <strong>{{ session.device }}</strong>
              <small>Последняя активность: {{ formatDate(session.lastSeenAt) }}</small>
              <small>Истекает: {{ formatDate(session.expiresAt) }}</small>
            </div>
            <Button
              v-if="canRevokeSessions && !(detail.id === auth.user?.id && session.current)"
              :data-testid="`revoke-session-${session.id}`"
              label="Завершить"
              severity="danger"
              outlined
              size="small"
              :aria-label="`Завершить сессию ${session.device}`"
              @click="beginSessionRevoke(session)"
            />
          </li>
        </ul>
      </section>

      <section v-if="actions.some((action) => action !== 'EDIT')" class="detail-section"><h3>Управление доступом</h3><div class="action-grid"><Button v-for="action in actions.filter((item) => item !== 'EDIT')" :key="action" :data-action="action" :label="actionLabel(action)" :severity="action === 'DEACTIVATE' || action === 'RESET_CREDENTIALS' ? 'danger' : 'secondary'" outlined @click="beginLifecycle(action as Exclude<CmsUserAction, 'EDIT'>)" /></div></section>
      <Message v-else-if="detail.id === auth.user?.id" severity="info" :closable="false">Собственный доступ нельзя приостановить, деактивировать или сбросить через operator flow.</Message>
    </div>
  </Drawer>

  <Dialog :visible="Boolean(pendingAction)" modal :closable="operation.kind !== 'SUBMITTING'" :header="reasonTitle" :style="{ width: 'min(520px, calc(100vw - 28px))' }" @update:visible="!$event && (pendingAction = null)">
    <div class="reason-dialog"><p>Причина попадёт в security audit. Не указывайте пароли, токены и другие секреты.</p><label><span>Причина</span><Textarea v-model="reason" data-testid="audit-reason" rows="4" maxlength="500" autofocus :aria-invalid="Boolean(reasonError)" /></label><small>{{ reason.length }}/500</small><Message v-if="reasonError" severity="error" :closable="false">{{ reasonError }}</Message></div>
    <template #footer><Button label="Отмена" severity="secondary" text :disabled="operation.kind === 'SUBMITTING'" @click="pendingAction = null" /><Button data-testid="submit-lifecycle" :label="pendingAction ? actionLabel(pendingAction) : 'Продолжить'" :severity="pendingAction === 'DEACTIVATE' || pendingAction === 'RESET_CREDENTIALS' ? 'danger' : undefined" :loading="operation.kind === 'SUBMITTING'" @click="submitLifecycle" /></template>
  </Dialog>

  <Dialog
    :visible="Boolean(pendingSessionRevoke)"
    modal
    :closable="!sessionRevokeSubmitting"
    header="Завершить сессию?"
    :style="{ width: 'min(520px, calc(100vw - 28px))' }"
    @update:visible="!$event && (pendingSessionRevoke = null)"
  >
    <div class="reason-dialog">
      <p>{{ pendingSessionRevoke?.device }}</p>
      <label><span>Причина</span><Textarea v-model="sessionRevokeReason" data-testid="session-revoke-reason" rows="4" maxlength="500" /></label>
      <Message v-if="sessionRevokeError" :severity="sessionRevokeStepUp ? 'warn' : 'error'" :closable="false">{{ sessionRevokeError }}</Message>
      <Button v-if="sessionRevokeStepUp" label="Войти заново" size="small" @click="requireFreshLogin" />
    </div>
    <template #footer>
      <Button label="Отмена" severity="secondary" text :disabled="sessionRevokeSubmitting" @click="pendingSessionRevoke = null" />
      <Button data-testid="submit-session-revoke" label="Завершить сессию" severity="danger" :loading="sessionRevokeSubmitting" @click="submitSessionRevoke" />
    </template>
  </Dialog>

  <Dialog
    :visible="createVisible"
    modal
    :closable="!createSubmitting"
    header="Новый CMS User"
    :style="{ width: 'min(760px, calc(100vw - 28px))' }"
    @update:visible="!$event && (createVisible = false)"
  >
    <form id="cms-user-create-form" class="create-form" @submit.prevent="submitProvisioning">
      <div class="identity-fields">
        <label><span>Имя</span><InputText v-model="createForm.givenName" maxlength="100" autocomplete="off" /></label>
        <label><span>Фамилия</span><InputText v-model="createForm.familyName" maxlength="100" autocomplete="off" /></label>
        <label><span>Email</span><InputText v-model="createForm.email" type="email" maxlength="320" autocomplete="off" /></label>
        <label><span>Первоначальный доступ</span><Select v-model="createForm.deliveryMode" :options="deliveryOptions" option-label="label" option-value="value" /></label>
      </div>
      <section class="assignment-section">
        <div class="section-heading"><div><h3>Проекты и роли</h3><p>Необязательно. Без назначений будет создан platform-only пользователь; платформенную роль назначьте после создания.</p></div><Button type="button" label="Добавить проект" icon="pi pi-plus" severity="secondary" outlined size="small" @click="addAssignment" /></div>
        <div v-if="projectsLoading" class="loading-list"><Skeleton v-for="row in 2" :key="row" height="58px" /></div>
        <div v-else class="assignment-list">
          <div v-for="(assignment, index) in createForm.assignments" :key="assignment.id" class="assignment-row">
            <label><span>Проект</span><Select :model-value="assignment.projectId" :options="projects" option-label="name" option-value="id" placeholder="Выберите проект" @update:model-value="selectAssignmentProject(index, $event)" /></label>
            <label><span>Роли</span><MultiSelect v-model="assignment.roleIds" :options="rolesByProject[assignment.projectId] ?? []" option-label="name" option-value="id" display="chip" placeholder="Выберите роли" :disabled="!assignment.projectId" /></label>
            <Button type="button" icon="pi pi-trash" severity="danger" text rounded :aria-label="`Удалить назначение ${index + 1}`" @click="removeAssignment(index)" />
          </div>
          <Message v-if="createForm.assignments.length === 0" severity="info" :closable="false">Пользователь будет создан без доступа к проектам.</Message>
        </div>
      </section>
      <Message v-if="createError" :severity="provisioningOutcomeUnknown ? 'warn' : 'error'" :closable="false">{{ createError }}</Message>
    </form>
    <template #footer>
      <Button label="Отмена" severity="secondary" text :disabled="createSubmitting" @click="createVisible = false" />
      <Button form="cms-user-create-form" type="submit" label="Создать пользователя" icon="pi pi-user-plus" :loading="createSubmitting" :disabled="projectsLoading || provisioningOutcomeUnknown" />
    </template>
  </Dialog>

  <InitialAccessSecretDialog v-if="secret" :secret="secret.value" :expires-at="secret.expiresAt" :status="secret.status" @acknowledged="directory.acknowledgeSecret" />
  <InitialAccessSecretDialog v-if="provisionedSecret" :secret="provisionedSecret.value" :expires-at="provisionedSecret.expiresAt" :status="provisionedSecret.status" @acknowledged="acknowledgeProvisionedSecret" />
</template>

<style scoped>
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.create-form { display: grid; gap: 18px; }
.identity-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
.identity-fields label, .assignment-row label { display: grid; gap: 6px; min-width: 0; }
.identity-fields label > span, .assignment-row label > span { color: var(--muted); font-size: .68rem; }
.assignment-section { display: grid; gap: 12px; }
.assignment-section .section-heading p { margin: 4px 0 0; color: var(--muted); font-size: .72rem; }
.assignment-list { display: grid; gap: 10px; }
.assignment-row { display: grid; grid-template-columns: minmax(180px, .8fr) minmax(240px, 1.2fr) auto; gap: 10px; align-items: end; padding: 12px; border: 1px solid var(--line); border-radius: 12px; }
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
.profile-form label, .platform-role-form label, .reason-dialog label { display: grid; gap: 6px; }
.profile-form label span, .platform-role-form label span, .reason-dialog label span { color: var(--muted); font-size: .68rem; font-weight: 700; }
.profile-form > div { display: flex; justify-content: flex-end; gap: 8px; }
.platform-role-form { display: grid; gap: 12px; margin-top: 12px; }
.platform-role-form .form-actions { display: flex; justify-content: flex-end; gap: 8px; }
.tag-list, .action-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.permission-list { display: grid; gap: 6px; margin: 13px 0 0; padding-left: 18px; font-size: .7rem; }
.session-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.session-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px; border-radius: 10px; background: var(--surface-subtle); }
.session-list li > div { display: grid; gap: 4px; }
.session-list small { color: var(--muted); }
.reason-dialog { display: grid; gap: 10px; }
.reason-dialog p, .reason-dialog small { margin: 0; color: var(--muted); font-size: .72rem; line-height: 1.45; }
.reason-dialog textarea { width: 100%; }
@media (max-width: 700px) { .filters { align-items: stretch; flex-direction: column; } .filters label { min-width: 0; } .detail-hero, dl, .identity-fields, .assignment-row { grid-template-columns: 1fr; } .assignment-row > .p-button { justify-self: end; } }
</style>
