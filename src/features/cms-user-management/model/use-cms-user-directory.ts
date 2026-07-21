import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import type {
  CmsUserDetailDto,
  CmsUserLifecycleListParams,
  CmsUserListResponseDto,
  CmsUserReactivationResponseDto,
  CmsUserResetResponseDto,
  CmsUserSummaryDto,
  UpdateCmsUserProfileDto,
} from '@/shared/api/generated/models'
import { ApiError } from '@/shared/api/http/api-error'
import {
  cmsUserManagementApi,
  type CmsUserLifecycleAction,
} from '../api/cms-user-management.api'

export type CmsUserAction = CmsUserLifecycleAction | 'EDIT'
export type CmsUserStatusFilter = 'ALL' | NonNullable<CmsUserLifecycleListParams['status']>

export interface CmsUserManagementClient {
  list(params: CmsUserLifecycleListParams): Promise<CmsUserListResponseDto>
  get(cmsUserId: string): Promise<CmsUserDetailDto>
  update(cmsUserId: string, body: UpdateCmsUserProfileDto): Promise<CmsUserDetailDto>
  mutate(
    cmsUserId: string,
    action: CmsUserLifecycleAction,
    version: number,
    reason: string,
  ): Promise<CmsUserDetailDto | CmsUserReactivationResponseDto | CmsUserResetResponseDto>
}

export type CmsUserOperation =
  | { kind: 'IDLE' }
  | { kind: 'SUBMITTING'; action: CmsUserLifecycleAction | 'EDIT' }
  | { kind: 'SUCCESS' }
  | { kind: 'VERSION_CONFLICT' }
  | { kind: 'STEP_UP_REQUIRED' }
  | { kind: 'MFA_REQUIRED' }
  | { kind: 'OUTCOME_UNKNOWN' }
  | { kind: 'ERROR'; message: string }

export interface OneTimeInitialAccess {
  value: string
  expiresAt: string
  status: string
}

export function availableCmsUserActions(
  user: Pick<CmsUserSummaryDto, 'id' | 'status'>,
  permissions: readonly string[],
  actorCmsUserId: string | undefined,
): CmsUserAction[] {
  const result: CmsUserAction[] = []
  const has = (permission: string) => permissions.includes(permission)
  if (has('platform.cms_users.update')) result.push('EDIT')
  if (user.id === actorCmsUserId) return result
  if (has('platform.cms_users.deactivate')) {
    if (user.status === 'ACTIVE') result.push('SUSPEND')
    if (user.status !== 'DEACTIVATED') result.push('DEACTIVATE')
  }
  if (
    has('platform.cms_users.reactivate') &&
    (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED')
  ) {
    result.push('REACTIVATE')
  }
  if (has('platform.cms_users.reset_credentials')) result.push('RESET_CREDENTIALS')
  return result
}

export function useCmsUserDirectory(
  api: CmsUserManagementClient = cmsUserManagementApi,
) {
  const items = ref<CmsUserSummaryDto[]>([])
  const nextCursor = ref<string | null>(null)
  const status = ref<CmsUserStatusFilter>('ALL')
  const loading = ref(false)
  const loadingMore = ref(false)
  const listError = ref('')
  const detail = ref<CmsUserDetailDto | null>(null)
  const detailLoading = ref(false)
  const detailError = ref('')
  const operation = ref<CmsUserOperation>({ kind: 'IDLE' })
  const secret = ref<OneTimeInitialAccess | null>(null)
  let listSequence = 0
  let detailSequence = 0
  let disposed = false

  async function load(append = false): Promise<void> {
    if (append && !nextCursor.value) return
    const request = ++listSequence
    if (append) loadingMore.value = true
    else loading.value = true
    listError.value = ''
    const filter = status.value
    try {
      const page = await api.list({
        limit: 50,
        ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}),
        ...(filter === 'ALL' ? {} : { status: filter }),
      })
      if (disposed || request !== listSequence || filter !== status.value) return
      items.value = append ? mergeUsers(items.value, page.items) : page.items
      nextCursor.value = page.nextCursor
    } catch {
      if (request === listSequence) listError.value = 'Не удалось загрузить CMS Users.'
    } finally {
      if (request === listSequence) {
        loading.value = false
        loadingMore.value = false
      }
    }
  }

  async function setStatus(next: CmsUserStatusFilter): Promise<void> {
    if (status.value === next && items.value.length) return
    status.value = next
    items.value = []
    nextCursor.value = null
    await load()
  }

  async function open(cmsUserId: string): Promise<void> {
    const request = ++detailSequence
    detailLoading.value = true
    detailError.value = ''
    operation.value = { kind: 'IDLE' }
    try {
      const response = await api.get(cmsUserId)
      if (!disposed && request === detailSequence) detail.value = response
    } catch {
      if (request === detailSequence) detailError.value = 'Не удалось открыть CMS User.'
    } finally {
      if (request === detailSequence) detailLoading.value = false
    }
  }

  function close(): void {
    detailSequence += 1
    detail.value = null
    detailError.value = ''
    operation.value = { kind: 'IDLE' }
    acknowledgeSecret()
  }

  async function updateProfile(givenName: string, familyName: string): Promise<void> {
    const current = detail.value
    if (!current) return
    operation.value = { kind: 'SUBMITTING', action: 'EDIT' }
    try {
      detail.value = await api.update(current.id, {
        givenName: givenName.trim().normalize('NFC'),
        familyName: familyName.trim().normalize('NFC'),
        version: current.version,
      })
      operation.value = { kind: 'SUCCESS' }
      await load()
    } catch (cause) {
      await handleMutationFailure(cause, current.id, false)
    }
  }

  async function execute(action: CmsUserLifecycleAction, reason: string): Promise<void> {
    const current = detail.value
    if (!current) return
    operation.value = { kind: 'SUBMITTING', action }
    try {
      const response = await api.mutate(current.id, action, current.version, reason)
      if ('id' in response) detail.value = response
      else {
        detail.value = {
          ...current,
          status: response.status,
          version: response.version,
        }
      }
      const initialAccessSecret =
        'initialAccessSecret' in response ? response.initialAccessSecret : undefined
      if (typeof initialAccessSecret === 'string' && initialAccessSecret) {
        secret.value = {
          value: initialAccessSecret,
          expiresAt:
            'expiresAt' in response
              ? response.expiresAt
              : 'initialAccessExpiresAt' in response
                ? response.initialAccessExpiresAt ?? ''
                : '',
          status: response.status,
        }
      }
      operation.value = { kind: 'SUCCESS' }
      await load()
    } catch (cause) {
      await handleMutationFailure(
        cause,
        current.id,
        action === 'RESET_CREDENTIALS' || action === 'REACTIVATE',
      )
    }
  }

  async function handleMutationFailure(
    cause: unknown,
    cmsUserId: string,
    secretBearing: boolean,
  ): Promise<void> {
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT') {
      operation.value = { kind: 'VERSION_CONFLICT' }
      await openLatestWithoutResettingOperation(cmsUserId)
      return
    }
    if (
      cause instanceof ApiError &&
      (cause.status === 428 || cause.code === 'REAUTHENTICATION_REQUIRED')
    ) {
      operation.value = { kind: 'STEP_UP_REQUIRED' }
      return
    }
    if (cause instanceof ApiError && cause.code === 'MFA_REQUIRED') {
      operation.value = { kind: 'MFA_REQUIRED' }
      return
    }
    if (
      secretBearing &&
      (!(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500)
    ) {
      operation.value = { kind: 'OUTCOME_UNKNOWN' }
      return
    }
    operation.value = { kind: 'ERROR', message: cmsUserSafeError(cause) }
  }

  async function openLatestWithoutResettingOperation(cmsUserId: string): Promise<void> {
    try {
      detail.value = await api.get(cmsUserId)
    } catch {
      // The conflict remains actionable even if refreshing the winning state fails.
    }
  }

  function acknowledgeSecret(): void {
    secret.value = null
  }

  function dispose(): void {
    disposed = true
    listSequence += 1
    detailSequence += 1
    acknowledgeSecret()
  }

  if (getCurrentInstance()) onBeforeUnmount(dispose)

  return {
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
    load,
    setStatus,
    open,
    close,
    updateProfile,
    execute,
    acknowledgeSecret,
    dispose,
  }
}

function mergeUsers(
  current: CmsUserSummaryDto[],
  incoming: CmsUserSummaryDto[],
): CmsUserSummaryDto[] {
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()]
}

export function cmsUserSafeError(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'Не удалось выполнить действие. Попробуйте ещё раз.'
  const messages: Record<string, string> = {
    LAST_PLATFORM_OPERATOR: 'Нельзя остановить последнего Platform Operator с правом восстановления.',
    PERMISSION_DENIED: 'У вас больше нет права выполнять это действие.',
    INVALID_STATUS_TRANSITION: 'Состояние CMS User уже изменилось. Обновите данные.',
    SELF_LIFECYCLE_CHANGE_FORBIDDEN: 'Нельзя остановить собственный доступ этим действием.',
    SELF_CREDENTIAL_RESET_FORBIDDEN: 'Собственный пароль изменяется в настройках безопасности.',
    CMS_USER_NOT_FOUND: 'CMS User больше недоступен.',
    RATE_LIMITED: 'Слишком много попыток. Подождите и повторите действие.',
  }
  return (cause.code && messages[cause.code]) || 'Не удалось выполнить действие. Попробуйте ещё раз.'
}
