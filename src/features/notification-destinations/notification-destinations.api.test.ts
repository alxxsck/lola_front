import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  notificationDestinationCreate,
  notificationDestinationList,
  notificationDestinationTest,
  notificationDestinationUpdate,
} from '@/shared/api/generated/lola-backend'
import { notificationDestinationsApi } from './notification-destinations.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  notificationDestinationCreate: vi.fn(),
  notificationDestinationList: vi.fn(),
  notificationDestinationTest: vi.fn(),
  notificationDestinationUpdate: vi.fn(),
}))

describe('notification destinations API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    vi.mocked(notificationDestinationList).mockResolvedValue({ items: [] })
    vi.mocked(notificationDestinationCreate).mockResolvedValue({} as never)
    vi.mocked(notificationDestinationUpdate).mockResolvedValue({} as never)
    vi.mocked(notificationDestinationTest).mockResolvedValue({} as never)
  })

  it('uses generated project-scoped contracts and fresh idempotency keys for side effects', async () => {
    await notificationDestinationsApi.list('project-1')
    await notificationDestinationsApi.createSlack('project-1', {
      displayName: 'Поддержка',
      webhookUrl: 'https://hooks.slack.com/services/T/B/secret',
    })
    await notificationDestinationsApi.updateSlack('project-1', 'destination-1', {
      expectedVersion: 3,
      desiredStatus: 'ACTIVE',
    })
    await notificationDestinationsApi.testSlack('project-1', 'destination-1', 4)

    expect(notificationDestinationList).toHaveBeenCalledWith('project-1')
    expect(notificationDestinationCreate).toHaveBeenCalledWith(
      'project-1',
      {
        displayName: 'Поддержка',
        webhookUrl: 'https://hooks.slack.com/services/T/B/secret',
      },
      { headers: { 'Idempotency-Key': '11111111-1111-4111-8111-111111111111' } },
    )
    expect(notificationDestinationUpdate).toHaveBeenCalledWith(
      'project-1',
      'destination-1',
      { expectedVersion: 3, desiredStatus: 'ACTIVE' },
    )
    expect(notificationDestinationTest).toHaveBeenCalledWith(
      'project-1',
      'destination-1',
      { expectedVersion: 4 },
      { headers: { 'Idempotency-Key': '22222222-2222-4222-8222-222222222222' } },
    )
  })
})
