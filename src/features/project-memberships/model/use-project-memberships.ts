import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import type {
  CreateProjectMembershipDto,
  AssignableProjectRoleCatalogResponseDto,
  ProjectMembershipListParams,
  ProjectMembershipListResponseDto,
  ProjectMembershipResponseDto,
  RemoveProjectMembershipDto,
  UpdateProjectMembershipDto,
} from '@/shared/api/generated/models'
import { ApiError } from '@/shared/api/http/api-error'
import { projectMembershipApi } from '../api/project-membership.api'

export type ProjectMembershipStatusFilter = 'ALL' | 'ACTIVE' | 'REMOVED'
export type ProjectMembershipAction = 'CREATE' | 'UPDATE' | 'REMOVE' | 'RESTORE'
export type ProjectMembershipOperation =
  | { kind: 'IDLE' }
  | { kind: 'SUBMITTING'; action: ProjectMembershipAction }
  | { kind: 'SUCCESS' }
  | { kind: 'VERSION_CONFLICT' }
  | { kind: 'LAST_PROJECT_OWNER' }
  | { kind: 'NOT_FOUND' }
  | { kind: 'PERMISSION_DENIED' }
  | { kind: 'ERROR'; message: string }

export interface ProjectMembershipClient {
  list(
    projectId: string,
    params: ProjectMembershipListParams,
  ): Promise<ProjectMembershipListResponseDto>
  roles(projectId: string): Promise<AssignableProjectRoleCatalogResponseDto>
  get(
    projectId: string,
    membershipId: string,
  ): Promise<ProjectMembershipResponseDto>
  create(
    projectId: string,
    body: CreateProjectMembershipDto,
  ): Promise<ProjectMembershipResponseDto>
  update(
    projectId: string,
    membershipId: string,
    body: UpdateProjectMembershipDto,
  ): Promise<ProjectMembershipResponseDto>
  remove(
    projectId: string,
    membershipId: string,
    body: RemoveProjectMembershipDto,
  ): Promise<ProjectMembershipResponseDto>
}

interface ProjectMembershipOptions {
  onCommitted?: (
    membership: ProjectMembershipResponseDto,
  ) => void | Promise<void>
}

export function useProjectMemberships(
  api: ProjectMembershipClient = projectMembershipApi,
  options: ProjectMembershipOptions = {},
) {
  const items = ref<ProjectMembershipResponseDto[]>([])
  const roles = ref<AssignableProjectRoleCatalogResponseDto['items']>([])
  const nextCursor = ref<string | null>(null)
  const status = ref<ProjectMembershipStatusFilter>('ALL')
  const loading = ref(false)
  const loadingMore = ref(false)
  const rolesLoading = ref(false)
  const listError = ref('')
  const rolesError = ref('')
  const selected = ref<ProjectMembershipResponseDto | null>(null)
  const operation = ref<ProjectMembershipOperation>({ kind: 'IDLE' })
  let activeProjectId: string | null = null
  let listSequence = 0
  let rolesSequence = 0
  let disposed = false

  async function load(projectId: string, append = false): Promise<void> {
    if (append && (!nextCursor.value || activeProjectId !== projectId)) return
    if (activeProjectId !== projectId) {
      activeProjectId = projectId
      items.value = []
      nextCursor.value = null
      operation.value = { kind: 'IDLE' }
    }
    const request = ++listSequence
    if (append) loadingMore.value = true
    else loading.value = true
    listError.value = ''
    const filter = status.value
    try {
      const page = await api.list(projectId, {
        limit: 50,
        ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}),
        ...(filter === 'ALL' ? {} : { status: filter }),
      })
      if (
        disposed ||
        request !== listSequence ||
        activeProjectId !== projectId ||
        filter !== status.value
      )
        return
      items.value = append
        ? mergeMemberships(items.value, page.items)
        : page.items
      nextCursor.value = page.nextCursor
    } catch {
      if (request === listSequence && activeProjectId === projectId) {
        listError.value = 'Не удалось загрузить доступы к проекту.'
      }
    } finally {
      if (request === listSequence) {
        loading.value = false
        loadingMore.value = false
      }
    }
  }

  async function loadRoles(projectId: string): Promise<void> {
    const request = ++rolesSequence
    rolesLoading.value = true
    rolesError.value = ''
    try {
      const response = await api.roles(projectId)
      if (
        !disposed &&
        request === rolesSequence &&
        activeProjectId === projectId
      ) {
        roles.value = response.items
      }
    } catch {
      if (request === rolesSequence)
        rolesError.value = 'Не удалось загрузить роли проекта.'
    } finally {
      if (request === rolesSequence) rolesLoading.value = false
    }
  }

  async function initialize(projectId: string): Promise<void> {
    const list = load(projectId)
    await Promise.all([list, loadRoles(projectId)])
  }

  async function setStatus(
    projectId: string,
    next: ProjectMembershipStatusFilter,
  ): Promise<void> {
    status.value = next
    items.value = []
    nextCursor.value = null
    await load(projectId)
  }

  async function open(projectId: string, membershipId: string): Promise<void> {
    operation.value = { kind: 'IDLE' }
    try {
      selected.value = await api.get(projectId, membershipId)
    } catch (cause) {
      handleFailure(cause)
    }
  }

  async function create(
    projectId: string,
    input: CreateProjectMembershipDto,
    action: 'CREATE' | 'RESTORE' = 'CREATE',
  ): Promise<void> {
    operation.value = { kind: 'SUBMITTING', action }
    try {
      await commit(await api.create(projectId, input))
    } catch (cause) {
      await handleMutationFailure(cause, projectId)
    }
  }

  async function update(
    projectId: string,
    membership: ProjectMembershipResponseDto,
    roleIds: string[],
    reason: string,
  ): Promise<void> {
    operation.value = { kind: 'SUBMITTING', action: 'UPDATE' }
    try {
      await commit(
        await api.update(projectId, membership.id, {
          version: membership.version,
          roleIds,
          reason,
        }),
      )
    } catch (cause) {
      await handleMutationFailure(cause, projectId, membership.id)
    }
  }

  async function remove(
    projectId: string,
    membership: ProjectMembershipResponseDto,
    reason: string,
  ): Promise<void> {
    operation.value = { kind: 'SUBMITTING', action: 'REMOVE' }
    try {
      await commit(
        await api.remove(projectId, membership.id, {
          version: membership.version,
          reason,
        }),
      )
    } catch (cause) {
      await handleMutationFailure(cause, projectId, membership.id)
    }
  }

  async function commit(
    membership: ProjectMembershipResponseDto,
  ): Promise<void> {
    selected.value = membership
    const visible = status.value === 'ALL' || status.value === membership.status
    items.value = visible
      ? mergeMemberships(items.value, [membership], true)
      : items.value.filter(({ id }) => id !== membership.id)
    operation.value = { kind: 'SUCCESS' }
    await options.onCommitted?.(membership)
  }

  async function handleMutationFailure(
    cause: unknown,
    projectId: string,
    membershipId?: string,
  ): Promise<void> {
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT') {
      operation.value = { kind: 'VERSION_CONFLICT' }
      if (membershipId) {
        try {
          const latest = await api.get(projectId, membershipId)
          selected.value = latest
          items.value = mergeMemberships(items.value, [latest])
        } catch {
          // The conflict remains actionable if the winning state cannot be refreshed.
        }
      }
      return
    }
    handleFailure(cause)
  }

  function handleFailure(cause: unknown): void {
    if (cause instanceof ApiError) {
      if (cause.code === 'LAST_PROJECT_OWNER') {
        operation.value = { kind: 'LAST_PROJECT_OWNER' }
        return
      }
      if (
        cause.code === 'PROJECT_MEMBERSHIP_NOT_FOUND' ||
        cause.code === 'CMS_USER_NOT_AVAILABLE' ||
        cause.status === 404
      ) {
        operation.value = { kind: 'NOT_FOUND' }
        return
      }
      if (
        cause.code === 'PERMISSION_DENIED' ||
        cause.code === 'ROLE_DELEGATION_FORBIDDEN' ||
        cause.code === 'CONTROL_PLANE_VISIBILITY_REQUIRED' ||
        cause.status === 403
      ) {
        operation.value = { kind: 'PERMISSION_DENIED' }
        return
      }
    }
    operation.value = {
      kind: 'ERROR',
      message:
        'Не удалось изменить доступ. Обновите данные и повторите действие.',
    }
  }

  function dispose(): void {
    disposed = true
    listSequence += 1
    rolesSequence += 1
  }

  function clear(): void {
    activeProjectId = null
    listSequence += 1
    rolesSequence += 1
    items.value = []
    roles.value = []
    nextCursor.value = null
    selected.value = null
    loading.value = false
    loadingMore.value = false
    rolesLoading.value = false
    listError.value = ''
    rolesError.value = ''
    operation.value = { kind: 'IDLE' }
  }

  if (getCurrentInstance()) onBeforeUnmount(dispose)

  return {
    items,
    roles,
    nextCursor,
    status,
    loading,
    loadingMore,
    rolesLoading,
    listError,
    rolesError,
    selected,
    operation,
    initialize,
    load,
    loadRoles,
    setStatus,
    open,
    create,
    update,
    remove,
    clear,
    dispose,
  }
}

function mergeMemberships(
  current: ProjectMembershipResponseDto[],
  incoming: ProjectMembershipResponseDto[],
  prepend = false,
): ProjectMembershipResponseDto[] {
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  if (!prepend) return [...byId.values()]
  const incomingIds = new Set(incoming.map(({ id }) => id))
  return [...incoming, ...current.filter(({ id }) => !incomingIds.has(id))]
}
