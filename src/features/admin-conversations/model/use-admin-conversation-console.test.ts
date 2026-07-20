import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'

const mocks = vi.hoisted(() => ({
  sendAdminMessage: vi.fn(),
  getMessages: vi.fn(),
  getConversations: vi.fn(),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    sendAdminMessage: mocks.sendAdminMessage,
    getMessages: mocks.getMessages,
    getConversations: mocks.getConversations,
  },
}))

import { useAdminConversationConsole } from './use-admin-conversation-console'

describe('панель ответа администратором', () => {
  beforeEach(() => vi.clearAllMocks())

  it('не повторяет составную операцию при двойном нажатии', async () => {
    let finish!: (value: { deliveryStatus: string }) => void
    mocks.sendAdminMessage.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    mocks.getMessages.mockResolvedValue({ items: [], nextCursor: null })
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
      updateRoute: vi.fn(),
    })
    console.selectedConversation.value = {
      id: 'conversation-1',
      userId: 'user-1',
      title: 'Диалог',
      status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z',
      messageCount: 1,
      aiSuspension: {
        mode: 'AUTOMATIC',
        lifecycle: 'NONE',
        version: '0',
        suspendedUntil: null,
        serverTime: '2026-07-20T13:00:00.000Z',
      },
    }
    console.onlineSession.value = {
      id: 'session-1',
      userId: 'user-1',
      externalId: 'external-user-1',
      userName: 'Пользователь',
      device: 'Телефон',
      status: 'ONLINE',
      startedAt: '2026-07-20T13:00:00.000Z',
      lastSeenAt: '2026-07-20T13:00:00.000Z',
    }
    console.replyText.value = 'Здравствуйте'

    const first = console.suspendAndSendReply(
      { durationSeconds: 3_600, reason: 'OPERATOR_TAKEOVER' },
      'key-1',
    )
    const duplicateRequest = console.suspendAndSendReply(
      { durationSeconds: 3_600, reason: 'OPERATOR_TAKEOVER' },
      'key-1',
    )

    await Promise.resolve()
    const requestCount = mocks.sendAdminMessage.mock.calls.length
    finish({ deliveryStatus: 'DELIVERED' })
    const [, duplicate] = await Promise.all([first, duplicateRequest])
    expect(requestCount).toBe(1)
    expect(duplicate).toBeNull()
  })

  it('игнорирует запоздалую страницу диалогов предыдущего пользователя', async () => {
    let activeUser = 'user-1'
    let finish!: (value: { items: unknown[]; nextCursor: string | null }) => void
    mocks.getConversations.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => activeUser,
      updateRoute: vi.fn(),
    })
    console.conversations.value = [{
      id: 'conversation-1', userId: 'user-1', title: 'Старый диалог', status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z', messageCount: 1,
      aiSuspension: { mode: 'AUTOMATIC', lifecycle: 'NONE', version: '0', suspendedUntil: null, serverTime: '2026-07-20T13:00:00.000Z' },
    }]
    console.nextConversationCursor.value = 'next-user-1'
    const pending = console.loadMoreConversations()

    activeUser = 'user-2'
    console.reset()
    console.conversations.value = [{
      id: 'conversation-2', userId: 'user-2', title: 'Новый диалог', status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z', messageCount: 1,
      aiSuspension: { mode: 'AUTOMATIC', lifecycle: 'NONE', version: '0', suspendedUntil: null, serverTime: '2026-07-20T13:00:00.000Z' },
    }]
    finish({
      items: [{
        id: 'conversation-old-page', userId: 'user-1', title: 'Запоздалый диалог', status: 'ACTIVE',
        lastMessageAt: '2026-07-20T13:00:00.000Z', messageCount: 1,
        aiSuspension: { mode: 'AUTOMATIC', lifecycle: 'NONE', version: '0', suspendedUntil: null, serverTime: '2026-07-20T13:00:00.000Z' },
      }],
      nextCursor: null,
    })
    await pending

    expect(console.conversations.value.map((item) => item.id)).toEqual(['conversation-2'])
  })

  it('отличает подтверждённый отказ сервера от неизвестного результата', async () => {
    mocks.sendAdminMessage.mockRejectedValue(
      new ApiError(422, 'invalid', undefined, 'request-1'),
    )
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
      updateRoute: vi.fn(),
    })
    console.selectedConversation.value = {
      id: 'conversation-1', userId: 'user-1', title: 'Диалог', status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z', messageCount: 1,
      aiSuspension: { mode: 'AUTOMATIC', lifecycle: 'NONE', version: '0', suspendedUntil: null, serverTime: '2026-07-20T13:00:00.000Z' },
    }
    console.onlineSession.value = {
      id: 'session-1', userId: 'user-1', externalId: 'external-user-1', userName: 'Пользователь',
      device: 'Телефон', status: 'ONLINE', startedAt: '2026-07-20T13:00:00.000Z', lastSeenAt: '2026-07-20T13:00:00.000Z',
    }
    console.replyText.value = 'Здравствуйте'

    const result = await console.suspendAndSendReply(
      { durationSeconds: 3_600, reason: 'OPERATOR_TAKEOVER' },
      'key-1',
    )

    expect(result).toBeNull()
    expect(console.combinedSuspensionError.value).toMatchObject({
      kind: 'INVALID',
      requestId: 'request-1',
    })
    expect(console.conversationError.value).not.toContain('неизвестен')
  })

  it('не применяет ответ составной операции после перехода к другому пользователю', async () => {
    let activeUser = 'user-1'
    let finish!: (value: Record<string, unknown>) => void
    mocks.sendAdminMessage.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => activeUser,
      updateRoute: vi.fn(),
    })
    console.selectedConversation.value = {
      id: 'conversation-1', userId: 'user-1', title: 'Старый диалог', status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z', messageCount: 1,
      aiSuspension: { mode: 'AUTOMATIC', lifecycle: 'NONE', version: '0', suspendedUntil: null, serverTime: '2026-07-20T13:00:00.000Z' },
    }
    console.onlineSession.value = {
      id: 'session-1', userId: 'user-1', externalId: 'external-user-1', userName: 'Пользователь',
      device: 'Телефон', status: 'ONLINE', startedAt: '2026-07-20T13:00:00.000Z', lastSeenAt: '2026-07-20T13:00:00.000Z',
    }
    console.replyText.value = 'Ответ старому пользователю'
    const pending = console.suspendAndSendReply(
      { durationSeconds: 3_600, reason: 'OPERATOR_TAKEOVER' },
      'key-1',
    )

    activeUser = 'user-2'
    console.reset()
    console.replyText.value = 'Черновик нового пользователя'
    finish({
      duplicate: false,
      messageId: 'message-1',
      threadId: 'conversation-1',
      commandIds: [],
      status: 'COMPLETED',
      deliveryStatus: 'DELIVERED',
    })
    await pending

    expect(console.replyText.value).toBe('Черновик нового пользователя')
    expect(mocks.getMessages).not.toHaveBeenCalled()
    expect(console.combinedSuspensionError.value).toBeNull()
  })
})
