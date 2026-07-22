import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import type { CmsUserDetailDto, CmsUserSummaryDto } from '@/shared/api/generated/models'
import {
  availableCmsUserActions,
  useCmsUserDirectory,
  type CmsUserManagementClient,
} from './use-cms-user-directory'

const user = (overrides: Partial<CmsUserSummaryDto> = {}): CmsUserSummaryDto => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'anna@example.com',
  givenName: 'Анна',
  familyName: 'Орлова',
  displayName: 'Анна Орлова',
  status: 'ACTIVE',
  emailVerified: true,
  projectCount: 2,
  lastLoginAt: '2026-07-21T10:00:00.000Z',
  version: 3,
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  ...overrides,
})

const detail = (overrides: Partial<CmsUserDetailDto> = {}): CmsUserDetailDto => ({
  ...user(),
  platformRoleKeys: ['PLATFORM_OPERATOR'],
  platformPermissionCodes: ['platform.cms_users.read'],
  deactivatedAt: null,
  deactivationReason: null,
  ...overrides,
})

function client(): CmsUserManagementClient {
  return {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    mutate: vi.fn(),
  }
}

describe('CMS User directory state', () => {
  let api: CmsUserManagementClient

  beforeEach(() => {
    api = client()
  })

  it('drops a stale page, binds cursors to the server filter and deduplicates append results', async () => {
    let finishOld!: (value: { items: CmsUserSummaryDto[]; nextCursor: string | null }) => void
    vi.mocked(api.list)
      .mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve }))
      .mockResolvedValueOnce({ items: [user({ id: 'new' })], nextCursor: 'page-2' })
      .mockResolvedValueOnce({
        items: [user({ id: 'new', version: 4 }), user({ id: 'second' })],
        nextCursor: null,
      })
    const directory = useCmsUserDirectory(api)

    const oldRequest = directory.load()
    await directory.setStatus('SUSPENDED')
    finishOld({ items: [user({ id: 'stale' })], nextCursor: 'stale-cursor' })
    await oldRequest
    await directory.load(true)

    expect(api.list).toHaveBeenNthCalledWith(2, { limit: 50, status: 'SUSPENDED' })
    expect(api.list).toHaveBeenNthCalledWith(3, {
      limit: 50,
      cursor: 'page-2',
      status: 'SUSPENDED',
    })
    expect(directory.items.value.map((item) => item.id)).toEqual(['new', 'second'])
    expect(directory.items.value[0]?.version).toBe(4)
  })

  it('refreshes detail on a version conflict and never replays the mutation', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ givenName: 'Новая', displayName: 'Новая Орлова', version: 4 }))
    vi.mocked(api.update).mockRejectedValue(
      new ApiError(409, 'unsafe backend text', undefined, 'request-1', 'VERSION_CONFLICT'),
    )
    const directory = useCmsUserDirectory(api)
    await directory.open(user().id)

    await directory.updateProfile('Анна', 'Орлова')

    expect(api.update).toHaveBeenCalledOnce()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(directory.detail.value?.version).toBe(4)
    expect(directory.operation.value).toEqual({ kind: 'VERSION_CONFLICT' })
  })

  it('clears stale detail when opening another CMS User fails', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce(detail())
      .mockRejectedValueOnce(new Error('network'))
    const directory = useCmsUserDirectory(api)

    await directory.open(user().id)
    expect(directory.detail.value?.id).toBe(user().id)

    await directory.open('another-user')

    expect(directory.detail.value).toBeNull()
    expect(directory.detailError.value).toBe('Не удалось открыть CMS User.')
  })

  it('exposes reauthentication and ambiguous secret outcomes without retrying', async () => {
    vi.mocked(api.get).mockResolvedValue(detail())
    vi.mocked(api.mutate)
      .mockRejectedValueOnce(new ApiError(428, 'unsafe', undefined, undefined, 'REAUTHENTICATION_REQUIRED'))
      .mockRejectedValueOnce(new ApiError(0, 'network'))
    const directory = useCmsUserDirectory(api)
    await directory.open(user().id)

    await directory.execute('RESET_CREDENTIALS', 'Запрос подтверждён оператором')
    expect(directory.operation.value).toEqual({ kind: 'STEP_UP_REQUIRED' })

    await directory.execute('RESET_CREDENTIALS', 'Запрос подтверждён оператором')
    expect(directory.operation.value).toEqual({ kind: 'OUTCOME_UNKNOWN' })
    expect(api.mutate).toHaveBeenCalledTimes(2)
  })

  it('keeps a returned Initial Access Secret only until explicit acknowledgement', async () => {
    vi.mocked(api.get).mockResolvedValue(detail())
    vi.mocked(api.list).mockResolvedValue({ items: [user({ status: 'PENDING_SETUP', version: 4 })], nextCursor: null })
    vi.mocked(api.mutate).mockResolvedValue({
      cmsUserId: user().id,
      status: 'PENDING_SETUP',
      version: 4,
      initialAccessSecret: 'lia_one-time-secret',
      expiresAt: '2026-07-22T10:00:00.000Z',
    })
    const directory = useCmsUserDirectory(api)
    await directory.open(user().id)

    await directory.execute('RESET_CREDENTIALS', 'Запрос подтверждён оператором')
    expect(directory.secret.value).toEqual({
      value: 'lia_one-time-secret',
      expiresAt: '2026-07-22T10:00:00.000Z',
      status: 'PENDING_SETUP',
    })

    directory.acknowledgeSecret()
    expect(directory.secret.value).toBeNull()
    expect(JSON.stringify(directory.operation.value)).not.toContain('lia_one-time-secret')
  })
})

describe('CMS User action permissions', () => {
  it('uses exact platform Permissions, lifecycle state and self-protection', () => {
    const permissions = [
      'platform.cms_users.update',
      'platform.cms_users.deactivate',
      'platform.cms_users.reactivate',
      'platform.cms_users.reset_credentials',
    ]

    expect(availableCmsUserActions(user(), permissions, 'other-user')).toEqual([
      'EDIT',
      'SUSPEND',
      'DEACTIVATE',
      'RESET_CREDENTIALS',
    ])
    expect(availableCmsUserActions(user({ status: 'SUSPENDED' }), permissions, 'other-user')).toEqual([
      'EDIT',
      'DEACTIVATE',
      'REACTIVATE',
      'RESET_CREDENTIALS',
    ])
    expect(availableCmsUserActions(user(), permissions, user().id)).toEqual(['EDIT'])
    expect(availableCmsUserActions(user(), [], 'other-user')).toEqual([])
  })
})
