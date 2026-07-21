<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useAuthStore } from '@/features/auth/auth.store'
import {
  canManageProjectRoles,
  canReadProjectRoles,
} from '@/features/project-roles/model/project-role-permissions'
import { useProjectRoles } from '@/features/project-roles/model/use-project-roles'
import type { ProjectRoleResponseDto } from '@/shared/api/generated/models'

type DialogAction = 'CREATE' | 'UPDATE' | 'REASSIGN' | 'ARCHIVE'

const auth = useAuthStore()
const router = useRouter()
const dialogAction = ref<DialogAction | null>(null)
const target = ref<ProjectRoleResponseDto | null>(null)
const key = ref('')
const name = ref('')
const description = ref('')
const permissionCodes = ref<string[]>([])
const replacementRoleIds = ref<string[]>([])
const reason = ref('')
const impactConfirmed = ref(false)
const validationError = ref('')

let clearRoles: () => void = () => undefined
const library = useProjectRoles(undefined, {
  onCommitted: async () => {
    try {
      await auth.refreshContext()
    } catch {
      clearRoles()
      dialogAction.value = null
      await router.replace({ name: 'login' })
      return
    }
    if (
      !auth.project ||
      !canReadProjectRoles(
        auth.user?.platformPermissionCodes ?? [],
        auth.project.effectivePermissionCodes ?? [],
      )
    ) {
      clearRoles()
      dialogAction.value = null
      await router.replace({ name: 'overview' })
    }
  },
})
clearRoles = library.clear

const platformPermissions = computed(() => auth.user?.platformPermissionCodes ?? [])
const projectPermissions = computed(() => auth.project?.effectivePermissionCodes ?? [])
const canManage = computed(() =>
  canManageProjectRoles(platformPermissions.value, projectPermissions.value),
)
const canDelegatePlatform = computed(() =>
  platformPermissions.value.includes('platform.roles.manage'),
)
const delegableGroups = computed(() => {
  if (canDelegatePlatform.value) return library.groups.value
  const effective = new Set(projectPermissions.value)
  return library.groups.value
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter(({ code }) => effective.has(code)),
    }))
    .filter(({ permissions }) => permissions.length > 0)
})
const replacementOptions = computed(() =>
  library.items.value.filter(
    ({ id, status, permissionCodes: codes }) =>
      id !== target.value?.id &&
      status === 'ACTIVE' &&
      (canDelegatePlatform.value || codes.every((code) => projectPermissions.value.includes(code))),
  ),
)
const requiresImpactConfirmation = computed(() => dialogAction.value !== 'CREATE')
const dialogTitle = computed(
  () =>
    ({
      CREATE: 'Новая роль',
      UPDATE: 'Изменить роль',
      REASSIGN: 'Переназначить участников',
      ARCHIVE: 'Архивировать роль',
    })[dialogAction.value ?? 'CREATE'],
)

function resetForm(): void {
  key.value = ''
  name.value = ''
  description.value = ''
  permissionCodes.value = []
  replacementRoleIds.value = []
  reason.value = ''
  impactConfirmed.value = false
  validationError.value = ''
}

function beginCreate(): void {
  target.value = null
  resetForm()
  dialogAction.value = 'CREATE'
}

function begin(action: Exclude<DialogAction, 'CREATE'>, role: ProjectRoleResponseDto): void {
  target.value = role
  resetForm()
  key.value = role.key
  name.value = role.name
  description.value = role.description
  permissionCodes.value = [...role.permissionCodes]
  dialogAction.value = action
}

function closeDialog(): void {
  if (library.operation.value.kind === 'SUBMITTING') return
  dialogAction.value = null
  target.value = null
}

function togglePermission(code: string, checked: boolean): void {
  permissionCodes.value = checked
    ? [...new Set([...permissionCodes.value, code])]
    : permissionCodes.value.filter((value) => value !== code)
}

async function submit(): Promise<void> {
  const projectId = auth.project?.id
  const action = dialogAction.value
  if (!projectId || !action) return
  const normalizedReason = reason.value.trim().normalize('NFC')
  if (normalizedReason.length < 10 || normalizedReason.length > 500) {
    validationError.value = 'Укажите причину от 10 до 500 символов.'
    return
  }
  if (requiresImpactConfirmation.value && !impactConfirmed.value) {
    validationError.value = 'Подтвердите актуальное влияние на участников.'
    return
  }
  if ((action === 'CREATE' || action === 'UPDATE') && permissionCodes.value.length < 1) {
    validationError.value = 'Выберите хотя бы одно право.'
    return
  }
  if (action === 'CREATE' && !/^[A-Z][A-Z0-9_]{2,63}$/.test(key.value)) {
    validationError.value = 'Ключ должен быть в формате UPPER_SNAKE_CASE.'
    return
  }
  if (action === 'REASSIGN' && replacementRoleIds.value.length < 1) {
    validationError.value = 'Выберите хотя бы одну заменяющую роль.'
    return
  }
  validationError.value = ''
  if (action === 'CREATE') {
    await library.create(projectId, {
      key: key.value,
      name: name.value.trim(),
      description: description.value.trim(),
      permissionCodes: permissionCodes.value,
      reason: normalizedReason,
    })
  } else if (target.value && action === 'UPDATE') {
    await library.update(projectId, target.value, {
      name: name.value.trim(),
      description: description.value.trim(),
      permissionCodes: permissionCodes.value,
      reason: normalizedReason,
    })
  } else if (target.value && action === 'REASSIGN') {
    await library.reassign(
      projectId,
      target.value,
      replacementRoleIds.value,
      normalizedReason,
    )
  } else if (target.value && action === 'ARCHIVE') {
    await library.archive(projectId, target.value, normalizedReason)
  }
  if (
    (library.operation.value.kind === 'VERSION_CONFLICT' ||
      library.operation.value.kind === 'ROLE_IMPACT_CHANGED') &&
    library.selected.value
  ) {
    target.value = library.selected.value
    impactConfirmed.value = false
  }
  if (library.operation.value.kind === 'SUCCESS') closeDialog()
}

watch(
  () => auth.project?.id,
  (projectId) => {
    dialogAction.value = null
    target.value = null
    resetForm()
    if (projectId) void library.initialize(projectId)
    else library.clear()
  },
  { immediate: true },
)
</script>

<template>
  <section class="page project-roles-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Project IAM</div>
        <h1>Роли проекта</h1>
        <p class="subtitle">Управляйте ролями и делегируемыми правами выбранного проекта.</p>
      </div>
      <div class="header-actions">
        <Button
          v-if="canManage"
          data-testid="create-role"
          label="Создать роль"
          icon="pi pi-plus"
          @click="beginCreate"
        />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="library.loading.value || library.catalogLoading.value"
          @click="auth.project && library.initialize(auth.project.id)"
        />
      </div>
    </header>

    <Message v-if="library.listError.value" severity="error" :closable="false">{{ library.listError.value }}</Message>
    <Message v-if="library.catalogError.value" severity="error" :closable="false">{{ library.catalogError.value }}</Message>
    <Message v-if="library.operation.value.kind === 'VERSION_CONFLICT'" severity="warn" :closable="false">
      Роль уже изменена другим оператором. Загружена актуальная версия; действие не повторялось.
    </Message>
    <Message v-else-if="library.operation.value.kind === 'ROLE_IMPACT_CHANGED'" severity="warn" :closable="false">
      Число назначений изменилось. Проверьте актуальное влияние и подтвердите заново.
    </Message>
    <Message v-else-if="library.operation.value.kind === 'ROLE_IN_USE'" severity="warn" :closable="false">
      Сначала явно переназначьте участников на другую роль.
    </Message>
    <Message v-else-if="library.operation.value.kind === 'MANAGED_ROLE_PROTECTED'" severity="error" :closable="false">
      Системные роли доступны только для чтения.
    </Message>
    <Message v-else-if="library.operation.value.kind === 'PERMISSION_DENIED'" severity="error" :closable="false">
      Недостаточно прав для этой роли. Действие не повторялось.
    </Message>

    <div class="role-grid" data-testid="role-library">
      <article v-for="role in library.items.value" :key="role.id" class="role-card">
        <div class="role-card__header">
          <div>
            <div class="role-key">{{ role.key }}</div>
            <h2>{{ role.name }}</h2>
          </div>
          <Tag :value="role.managed ? 'Системная' : 'Пользовательская'" :severity="role.managed ? 'secondary' : 'info'" />
        </div>
        <p>{{ role.description }}</p>
        <div class="role-meta">
          <span>{{ role.permissionCodes.length }} прав</span>
          <span>{{ role.assignedMembershipCount }} назначений{{ role.assignedMembershipCountCapped ? '+' : '' }}</span>
          <span>v{{ role.version }}</span>
        </div>
        <div v-if="canManage && !role.managed" class="role-actions">
          <Button label="Изменить" size="small" outlined @click="begin('UPDATE', role)" />
          <Button label="Переназначить" size="small" severity="secondary" outlined @click="begin('REASSIGN', role)" />
          <Button label="Архивировать" size="small" severity="danger" outlined @click="begin('ARCHIVE', role)" />
        </div>
      </article>
    </div>

    <Dialog :visible="Boolean(dialogAction)" modal :header="dialogTitle" class="role-dialog" @update:visible="!$event && closeDialog()">
      <div class="role-form">
        <Message v-if="validationError" severity="warn" :closable="false">{{ validationError }}</Message>
        <template v-if="dialogAction === 'CREATE' || dialogAction === 'UPDATE'">
          <label v-if="dialogAction === 'CREATE'">Ключ<InputText v-model="key" data-testid="role-key" /></label>
          <label>Название<InputText v-model="name" data-testid="role-name" /></label>
          <label>Описание<Textarea v-model="description" rows="3" data-testid="role-description" /></label>
          <fieldset>
            <legend>Права из серверного каталога</legend>
            <section v-for="group in delegableGroups" :key="`${group.category}:${group.risk}`" class="permission-group">
              <strong>{{ group.category }} · {{ group.risk }}</strong>
              <label v-for="permission in group.permissions" :key="permission.code" class="permission-option">
                <input
                  type="checkbox"
                  :checked="permissionCodes.includes(permission.code)"
                  @change="togglePermission(permission.code, ($event.target as HTMLInputElement).checked)"
                />
                <span><b>{{ permission.label }}</b><small>{{ permission.description }}</small></span>
              </label>
            </section>
          </fieldset>
        </template>
        <template v-if="dialogAction === 'REASSIGN'">
          <label>Заменяющие роли
            <MultiSelect
              v-model="replacementRoleIds"
              :options="replacementOptions"
              option-label="name"
              option-value="id"
              display="chip"
              data-testid="replacement-roles"
            />
          </label>
        </template>
        <div v-if="requiresImpactConfirmation && target" class="impact-confirmation">
          <strong>Влияние: {{ target.assignedMembershipCount }} активных назначений{{ target.assignedMembershipCountCapped ? '+' : '' }}</strong>
          <label><input v-model="impactConfirmed" type="checkbox" data-testid="impact-confirmation" /> Подтверждаю это влияние и версию v{{ target.version }}</label>
        </div>
        <label>Причина<Textarea v-model="reason" rows="3" data-testid="role-reason" /></label>
      </div>
      <template #footer>
        <Button label="Отмена" text :disabled="library.operation.value.kind === 'SUBMITTING'" @click="closeDialog" />
        <Button
          data-testid="submit-role"
          label="Подтвердить"
          :severity="dialogAction === 'ARCHIVE' ? 'danger' : undefined"
          :loading="library.operation.value.kind === 'SUBMITTING'"
          @click="submit"
        />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.role-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
.role-card { border: 1px solid var(--surface-border); border-radius: 14px; padding: 1rem; background: var(--surface-card); }
.role-card__header, .role-meta, .role-actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.role-card h2 { margin: .2rem 0; font-size: 1.1rem; }
.role-key { font: 600 .75rem/1.2 monospace; color: var(--text-color-secondary); }
.role-meta { color: var(--text-color-secondary); font-size: .85rem; flex-wrap: wrap; }
.role-actions { justify-content: flex-start; margin-top: 1rem; flex-wrap: wrap; }
.role-form { display: grid; gap: 1rem; min-width: min(680px, 80vw); }
.role-form > label { display: grid; gap: .4rem; }
fieldset { border: 1px solid var(--surface-border); border-radius: 10px; display: grid; gap: 1rem; }
.permission-group, .permission-option { display: grid; gap: .4rem; }
.permission-option { grid-template-columns: auto 1fr; align-items: start; }
.permission-option span { display: grid; }
.permission-option small { color: var(--text-color-secondary); }
.impact-confirmation { display: grid; gap: .5rem; padding: .8rem; border-radius: 10px; background: var(--surface-100); }
@media (max-width: 720px) { .role-form { min-width: 0; } }
</style>
