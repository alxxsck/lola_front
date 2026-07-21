import { ref } from 'vue'
import type {
  ArchiveProjectRoleDto,
  CreateProjectRoleDto,
  ProjectPermissionCatalogResponseDto,
  ProjectRoleListResponseDto,
  ProjectRoleResponseDto,
  ReassignProjectRoleDto,
  UpdateProjectRoleDto,
} from '@/shared/api/generated/models'
import { ApiError } from '@/shared/api/http/api-error'
import { projectRoleApi } from '../api/project-role.api'

export type ProjectRoleOperation =
  | { kind: 'IDLE' }
  | { kind: 'SUBMITTING'; action: 'CREATE' | 'UPDATE' | 'REASSIGN' | 'ARCHIVE' }
  | { kind: 'SUCCESS' }
  | { kind: 'VERSION_CONFLICT' }
  | { kind: 'ROLE_IMPACT_CHANGED' }
  | { kind: 'ROLE_IN_USE' }
  | { kind: 'MANAGED_ROLE_PROTECTED' }
  | { kind: 'PERMISSION_DENIED' }
  | { kind: 'NOT_FOUND' }
  | { kind: 'ERROR'; message: string }

export interface ProjectRoleClient {
  permissions(projectId: string): Promise<ProjectPermissionCatalogResponseDto>
  list(projectId: string): Promise<ProjectRoleListResponseDto>
  get(projectId: string, roleId: string): Promise<ProjectRoleResponseDto>
  create(projectId: string, body: CreateProjectRoleDto): Promise<ProjectRoleResponseDto>
  update(projectId: string, roleId: string, body: UpdateProjectRoleDto): Promise<ProjectRoleResponseDto>
  reassign(projectId: string, roleId: string, body: ReassignProjectRoleDto): Promise<ProjectRoleResponseDto>
  archive(projectId: string, roleId: string, body: ArchiveProjectRoleDto): Promise<ProjectRoleResponseDto>
}

interface ProjectRoleOptions {
  onCommitted?: (role: ProjectRoleResponseDto) => void | Promise<void>
}

export function useProjectRoles(
  api: ProjectRoleClient = projectRoleApi,
  options: ProjectRoleOptions = {},
) {
  const items = ref<ProjectRoleResponseDto[]>([])
  const groups = ref<ProjectPermissionCatalogResponseDto['groups']>([])
  const selected = ref<ProjectRoleResponseDto | null>(null)
  const loading = ref(false)
  const catalogLoading = ref(false)
  const listError = ref('')
  const catalogError = ref('')
  const operation = ref<ProjectRoleOperation>({ kind: 'IDLE' })
  let activeProjectId: string | null = null
  let sequence = 0
  let catalogSequence = 0
  let detailSequence = 0

  async function initialize(projectId: string): Promise<void> {
    if (activeProjectId !== projectId) {
      activeProjectId = projectId
      sequence += 1
      catalogSequence += 1
      detailSequence += 1
      items.value = []
      groups.value = []
      selected.value = null
      listError.value = ''
      catalogError.value = ''
      operation.value = { kind: 'IDLE' }
    }
    await Promise.all([load(projectId), loadCatalog(projectId)])
  }

  async function load(projectId: string): Promise<void> {
    const request = ++sequence
    loading.value = true
    listError.value = ''
    try {
      const response = await api.list(projectId)
      if (request === sequence && activeProjectId === projectId) items.value = response.items
    } catch {
      if (request === sequence) listError.value = 'Не удалось загрузить роли проекта.'
    } finally {
      if (request === sequence) loading.value = false
    }
  }

  async function loadCatalog(projectId: string): Promise<void> {
    const request = ++catalogSequence
    catalogLoading.value = true
    catalogError.value = ''
    try {
      const response = await api.permissions(projectId)
      if (request === catalogSequence && activeProjectId === projectId) groups.value = response.groups
    } catch {
      if (request === catalogSequence && activeProjectId === projectId)
        catalogError.value = 'Не удалось загрузить каталог прав.'
    } finally {
      if (request === catalogSequence) catalogLoading.value = false
    }
  }

  async function open(projectId: string, roleId: string): Promise<void> {
    const request = ++detailSequence
    operation.value = { kind: 'IDLE' }
    try {
      const role = await api.get(projectId, roleId)
      if (request === detailSequence && activeProjectId === projectId) selected.value = role
    } catch (cause) {
      if (request === detailSequence && activeProjectId === projectId) handleFailure(cause)
    }
  }

  async function create(projectId: string, body: CreateProjectRoleDto): Promise<void> {
    operation.value = { kind: 'SUBMITTING', action: 'CREATE' }
    try {
      await commit(await api.create(projectId, body), projectId)
    } catch (cause) {
      if (activeProjectId === projectId) handleFailure(cause)
    }
  }

  async function update(
    projectId: string,
    role: ProjectRoleResponseDto,
    changes: Pick<UpdateProjectRoleDto, 'name' | 'description' | 'permissionCodes' | 'reason'>,
  ): Promise<void> {
    operation.value = { kind: 'SUBMITTING', action: 'UPDATE' }
    try {
      await commit(
        await api.update(projectId, role.id, {
          version: role.version,
          expectedAssignedMembershipCount: role.assignedMembershipCount,
          expectedAssignedMembershipCountCapped: role.assignedMembershipCountCapped,
          ...changes,
        }),
        projectId,
      )
    } catch (cause) {
      await handleMutationFailure(cause, projectId, role.id)
    }
  }

  async function reassign(
    projectId: string,
    role: ProjectRoleResponseDto,
    replacementRoleIds: string[],
    reason: string,
  ): Promise<void> {
    operation.value = { kind: 'SUBMITTING', action: 'REASSIGN' }
    try {
      await commit(
        await api.reassign(projectId, role.id, {
          version: role.version,
          expectedAssignedMembershipCount: role.assignedMembershipCount,
          expectedAssignedMembershipCountCapped: role.assignedMembershipCountCapped,
          replacementRoleIds,
          reason,
        }),
        projectId,
      )
    } catch (cause) {
      await handleMutationFailure(cause, projectId, role.id)
    }
  }

  async function archive(
    projectId: string,
    role: ProjectRoleResponseDto,
    reason: string,
  ): Promise<void> {
    operation.value = { kind: 'SUBMITTING', action: 'ARCHIVE' }
    try {
      await commit(
        await api.archive(projectId, role.id, {
          version: role.version,
          expectedAssignedMembershipCount: role.assignedMembershipCount,
          expectedAssignedMembershipCountCapped: role.assignedMembershipCountCapped,
          reason,
        }),
        projectId,
      )
    } catch (cause) {
      await handleMutationFailure(cause, projectId, role.id)
    }
  }

  async function commit(role: ProjectRoleResponseDto, projectId: string): Promise<void> {
    if (activeProjectId !== projectId) {
      await options.onCommitted?.(role)
      return
    }
    selected.value = role
    items.value =
      role.status === 'ACTIVE'
        ? [...items.value.filter(({ id }) => id !== role.id), role].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
        : items.value.filter(({ id }) => id !== role.id)
    operation.value = { kind: 'SUCCESS' }
    await options.onCommitted?.(role)
  }

  async function handleMutationFailure(
    cause: unknown,
    projectId: string,
    roleId: string,
  ): Promise<void> {
    if (activeProjectId !== projectId) return
    if (
      cause instanceof ApiError &&
      (cause.code === 'VERSION_CONFLICT' || cause.code === 'ROLE_IMPACT_CHANGED')
    ) {
      operation.value = { kind: cause.code }
      try {
        const winner = await api.get(projectId, roleId)
        if (activeProjectId === projectId) {
          selected.value = winner
          items.value = items.value.map((item) => (item.id === winner.id ? winner : item))
        }
      } catch {
        // Keep the original conflict actionable; never replay the mutation.
      }
      return
    }
    handleFailure(cause)
  }

  function handleFailure(cause: unknown): void {
    if (cause instanceof ApiError) {
      if (cause.code === 'ROLE_IN_USE') return void (operation.value = { kind: 'ROLE_IN_USE' })
      if (cause.code === 'MANAGED_ROLE_PROTECTED')
        return void (operation.value = { kind: 'MANAGED_ROLE_PROTECTED' })
      if (cause.code === 'PROJECT_ROLE_NOT_FOUND' || cause.status === 404)
        return void (operation.value = { kind: 'NOT_FOUND' })
      if (cause.status === 403 || cause.code === 'ROLE_DELEGATION_FORBIDDEN')
        return void (operation.value = { kind: 'PERMISSION_DENIED' })
    }
    operation.value = { kind: 'ERROR', message: 'Не удалось выполнить изменение роли.' }
  }

  function clear(): void {
    sequence += 1
    catalogSequence += 1
    detailSequence += 1
    activeProjectId = null
    items.value = []
    groups.value = []
    selected.value = null
    operation.value = { kind: 'IDLE' }
  }

  return {
    items,
    groups,
    selected,
    loading,
    catalogLoading,
    listError,
    catalogError,
    operation,
    initialize,
    load,
    loadCatalog,
    open,
    create,
    update,
    reassign,
    archive,
    clear,
  }
}
