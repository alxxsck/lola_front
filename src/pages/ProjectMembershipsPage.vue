<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useAuthStore } from '@/features/auth/auth.store'
import {
  canAttachExistingCmsUser,
  canManageProjectMemberships,
  canReadProjectMemberships,
} from '@/features/project-memberships/model/project-membership-permissions'
import {
  useProjectMemberships,
  type ProjectMembershipAction,
  type ProjectMembershipStatusFilter,
} from '@/features/project-memberships/model/use-project-memberships'
import type { ProjectMembershipResponseDto } from '@/shared/api/generated/models'

const auth = useAuthStore()
const router = useRouter()
const dialogAction = ref<ProjectMembershipAction | null>(null)
const target = ref<ProjectMembershipResponseDto | null>(null)
let clearDirectory: () => void = () => undefined
const directory = useProjectMemberships(undefined, {
  onCommitted: async (membership) => {
    if (membership.cmsUser.id !== auth.user?.id) return
    try {
      await auth.refreshContext()
    } catch {
      clearDirectory()
      dialogAction.value = null
      target.value = null
      await router.replace({ name: 'login' })
      return
    }
    const selectedProject = auth.project
    if (
      !selectedProject ||
      !canReadProjectMemberships(
        auth.user?.platformPermissionCodes ?? [],
        selectedProject.effectivePermissionCodes ?? [],
      )
    ) {
      clearDirectory()
      dialogAction.value = null
      target.value = null
      await router.replace({ name: 'overview' })
    }
  },
})
clearDirectory = directory.clear
const {
  items,
  roles,
  nextCursor,
  status,
  loading,
  loadingMore,
  rolesLoading,
  listError,
  rolesError,
  operation,
} = directory

const cmsUserId = ref('')
const roleIds = ref<string[]>([])
const reason = ref('')
const validationError = ref('')

const statusOptions: Array<{
  label: string
  value: ProjectMembershipStatusFilter
}> = [
  { label: 'Все состояния', value: 'ALL' },
  { label: 'Активные', value: 'ACTIVE' },
  { label: 'Удалённые', value: 'REMOVED' },
]
const platformPermissions = computed(
  () => auth.user?.platformPermissionCodes ?? [],
)
const projectPermissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
)
const canManage = computed(() =>
  canManageProjectMemberships(
    platformPermissions.value,
    projectPermissions.value,
  ),
)
const canAttach = computed(() =>
  canAttachExistingCmsUser(platformPermissions.value),
)
const assignableRoles = computed(() => {
  if (canAttach.value) return roles.value
  const effective = new Set(projectPermissions.value)
  return roles.value.filter((role) =>
    role.permissionCodes.every((code) => effective.has(code)),
  )
})
const dialogTitle = computed(
  () =>
    ({
      CREATE: 'Добавить администратора',
      UPDATE: 'Изменить роли',
      REMOVE: 'Удалить доступ',
      RESTORE: 'Восстановить доступ',
    })[dialogAction.value ?? 'CREATE'],
)

function beginCreate(): void {
  target.value = null
  cmsUserId.value = ''
  roleIds.value = []
  reason.value = ''
  validationError.value = ''
  dialogAction.value = 'CREATE'
}

function beginMutation(
  action: 'UPDATE' | 'REMOVE' | 'RESTORE',
  membership: ProjectMembershipResponseDto,
): void {
  target.value = membership
  cmsUserId.value = membership.cmsUser.id
  roleIds.value = membership.roles.map(({ id }) => id)
  reason.value = ''
  validationError.value = ''
  dialogAction.value = action
}

function closeDialog(): void {
  if (operation.value.kind === 'SUBMITTING') return
  dialogAction.value = null
  target.value = null
}

async function submit(): Promise<void> {
  const projectId = auth.project?.id
  const action = dialogAction.value
  const membership = target.value
  if (!projectId || !action) return
  const normalizedReason = reason.value.trim().normalize('NFC')
  if (normalizedReason.length < 10 || normalizedReason.length > 500) {
    validationError.value = 'Укажите причину от 10 до 500 символов.'
    return
  }
  if (
    action !== 'REMOVE' &&
    (roleIds.value.length < 1 || roleIds.value.length > 5)
  ) {
    validationError.value = 'Выберите от одной до пяти ролей.'
    return
  }
  if (action === 'CREATE' && !cmsUserId.value.trim()) {
    validationError.value = 'Укажите ID существующего CMS User.'
    return
  }
  validationError.value = ''
  if (action === 'CREATE') {
    await directory.create(projectId, {
      cmsUserId: cmsUserId.value.trim(),
      roleIds: roleIds.value,
      reason: normalizedReason,
    })
  } else if (action === 'RESTORE' && membership) {
    await directory.create(
      projectId,
      {
        cmsUserId: membership.cmsUser.id,
        roleIds: roleIds.value,
        version: membership.version,
        reason: normalizedReason,
      },
      'RESTORE',
    )
  } else if (action === 'UPDATE' && membership) {
    await directory.update(
      projectId,
      membership,
      roleIds.value,
      normalizedReason,
    )
  } else if (action === 'REMOVE' && membership) {
    await directory.remove(projectId, membership, normalizedReason)
  }
  if (operation.value.kind === 'SUCCESS') closeDialog()
}

function statusLabel(value: string): string {
  return value === 'ACTIVE' ? 'Активен' : 'Удалён'
}

watch(
  () => auth.project?.id,
  (projectId) => {
    if (projectId) void directory.initialize(projectId)
  },
  { immediate: true },
)
</script>

<template>
  <section class="page project-memberships-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Project access</div>
        <h1>Администраторы проекта</h1>
        <p class="subtitle">
          Роли, эффективные права и жизненный цикл доступа к выбранному проекту.
        </p>
      </div>
      <div class="header-actions">
        <Button
          v-if="canAttach"
          data-testid="add-membership"
          label="Добавить"
          icon="pi pi-user-plus"
          @click="beginCreate"
        />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="loading"
          @click="auth.project && directory.load(auth.project.id)"
        />
      </div>
    </header>

    <Message v-if="listError" severity="error" :closable="false">{{
      listError
    }}</Message>
    <Message v-if="rolesError" severity="error" :closable="false">{{
      rolesError
    }}</Message>
    <Message
      v-if="operation.kind === 'VERSION_CONFLICT'"
      severity="warn"
      :closable="false"
    >
      Доступ уже изменён другим оператором. Загружена актуальная версия;
      проверьте её перед повтором.
    </Message>
    <Message
      v-else-if="operation.kind === 'LAST_PROJECT_OWNER'"
      severity="warn"
      :closable="false"
    >
      Нельзя удалить или понизить последнего активного владельца проекта.
    </Message>
    <Message
      v-else-if="operation.kind === 'NOT_FOUND'"
      severity="warn"
      :closable="false"
    >
      Доступ или CMS User не найден. Обновите список.
    </Message>
    <Message
      v-else-if="operation.kind === 'PERMISSION_DENIED'"
      severity="error"
      :closable="false"
    >
      Недостаточно прав для этого изменения. Действие не повторялось.
    </Message>
    <Message
      v-else-if="operation.kind === 'ERROR'"
      severity="error"
      :closable="false"
    >
      {{ operation.message }}
    </Message>

    <div class="filters card">
      <label>
        <span>Состояние</span>
        <Select
          :model-value="status"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          aria-label="Состояние доступа"
          @update:model-value="
            auth.project && directory.setStatus(auth.project.id, $event)
          "
        />
      </label>
      <span>Фильтр и непрозрачный курсор обрабатываются сервером.</span>
    </div>

    <div class="card table-card">
      <div v-if="loading || rolesLoading" class="loading-list">
        <Skeleton v-for="row in 6" :key="row" height="58px" />
      </div>
      <DataTable v-else :value="items" data-key="id" row-hover>
        <template #empty>
          <div class="empty">
            <i class="pi pi-users" /><strong>Доступы не найдены</strong>
          </div>
        </template>
        <Column header="CMS User">
          <template #body="{ data }">
            <div class="identity">
              <strong>{{ data.cmsUser.displayName }}</strong>
              <small>{{ data.cmsUser.email }}</small>
              <code>{{ data.cmsUser.id }}</code>
            </div>
          </template>
        </Column>
        <Column header="Состояние">
          <template #body="{ data }">
            <Tag
              :value="statusLabel(data.status)"
              :severity="data.status === 'ACTIVE' ? 'success' : 'secondary'"
            />
          </template>
        </Column>
        <Column header="Роли">
          <template #body="{ data }">
            <div class="tag-list">
              <Tag
                v-for="role in data.roles"
                :key="role.id"
                :value="role.name"
                severity="info"
              />
            </div>
          </template>
        </Column>
        <Column header="Эффективные права" class="mobile-hide">
          <template #body="{ data }">
            <details>
              <summary>{{ data.effectivePermissionCodes.length }} прав</summary>
              <code v-for="code in data.effectivePermissionCodes" :key="code">{{
                code
              }}</code>
            </details>
          </template>
        </Column>
        <Column v-if="canManage || canAttach" header="Действия">
          <template #body="{ data }">
            <div class="row-actions">
              <Button
                v-if="data.status === 'ACTIVE' && canManage"
                :aria-label="`Изменить роли ${data.cmsUser.displayName}`"
                icon="pi pi-pencil"
                text
                rounded
                @click="beginMutation('UPDATE', data)"
              />
              <Button
                v-if="data.status === 'ACTIVE' && canManage"
                :aria-label="`Удалить доступ ${data.cmsUser.displayName}`"
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                @click="beginMutation('REMOVE', data)"
              />
              <Button
                v-if="data.status === 'REMOVED' && canAttach"
                :aria-label="`Восстановить доступ ${data.cmsUser.displayName}`"
                label="Восстановить"
                size="small"
                outlined
                @click="beginMutation('RESTORE', data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
      <div v-if="!loading && nextCursor" class="load-more">
        <Button
          label="Загрузить ещё"
          severity="secondary"
          outlined
          :loading="loadingMore"
          @click="auth.project && directory.load(auth.project.id, true)"
        />
      </div>
    </div>
  </section>

  <Dialog
    :visible="Boolean(dialogAction)"
    modal
    :closable="operation.kind !== 'SUBMITTING'"
    :header="dialogTitle"
    :style="{ width: 'min(560px, calc(100vw - 28px))' }"
    @update:visible="!$event && closeDialog()"
  >
    <div class="membership-form">
      <label v-if="dialogAction === 'CREATE'">
        <span>ID существующего CMS User</span>
        <InputText
          v-model="cmsUserId"
          data-testid="cms-user-id"
          autocomplete="off"
        />
      </label>
      <div v-else-if="target" class="target-identity">
        <strong>{{ target.cmsUser.displayName }}</strong
        ><span>{{ target.cmsUser.email }}</span>
      </div>
      <label v-if="dialogAction !== 'REMOVE'">
        <span>Роли</span>
        <MultiSelect
          v-model="roleIds"
          data-testid="membership-roles"
          :options="assignableRoles"
          option-label="name"
          option-value="id"
          display="chip"
          :max-selected-labels="3"
          placeholder="Выберите роли"
        />
      </label>
      <label>
        <span>Причина для security audit</span>
        <Textarea
          v-model="reason"
          data-testid="membership-reason"
          rows="4"
          maxlength="500"
        />
      </label>
      <small
        >{{ reason.length }}/500. Не указывайте пароли, токены и другие
        секреты.</small
      >
      <Message v-if="validationError" severity="error" :closable="false">{{
        validationError
      }}</Message>
    </div>
    <template #footer>
      <Button
        label="Отмена"
        severity="secondary"
        text
        :disabled="operation.kind === 'SUBMITTING'"
        @click="closeDialog"
      />
      <Button
        data-testid="submit-membership"
        :label="dialogAction === 'REMOVE' ? 'Удалить доступ' : 'Сохранить'"
        :severity="dialogAction === 'REMOVE' ? 'danger' : undefined"
        :loading="operation.kind === 'SUBMITTING'"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.header-actions,
.row-actions,
.tag-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.filters {
  display: flex;
  align-items: end;
  gap: 18px;
  margin: 16px 0;
  padding: 14px 16px;
}
.filters label {
  display: grid;
  gap: 6px;
  min-width: 220px;
}
.filters span {
  color: var(--muted);
  font-size: 0.68rem;
}
.table-card {
  overflow: hidden;
}
.loading-list {
  display: grid;
  gap: 9px;
  padding: 18px;
}
.identity {
  display: grid;
  gap: 3px;
}
.identity small,
.identity code {
  color: var(--muted);
  font-size: 0.66rem;
}
.identity code {
  overflow-wrap: anywhere;
}
details {
  max-width: 260px;
  font-size: 0.72rem;
}
details code {
  display: block;
  margin-top: 5px;
  overflow-wrap: anywhere;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 14px;
  border-top: 1px solid var(--line);
}
.membership-form {
  display: grid;
  gap: 14px;
}
.membership-form label {
  display: grid;
  gap: 6px;
}
.membership-form label > span,
.membership-form small,
.target-identity span {
  color: var(--muted);
  font-size: 0.7rem;
}
.membership-form textarea,
.membership-form :deep(.p-multiselect),
.membership-form input {
  width: 100%;
}
.target-identity {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-subtle);
}
@media (max-width: 700px) {
  .filters,
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
  .mobile-hide {
    display: none;
  }
}
</style>
