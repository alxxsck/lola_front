import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'

const mocks = vi.hoisted(() => ({
  sendAdminMessage: vi.fn(),
  getMessages: vi.fn(),
  getConversations: vi.fn(),
  getConversation: vi.fn(),
  getSessions: vi.fn(),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    sendAdminMessage: mocks.sendAdminMessage,
    getMessages: mocks.getMessages,
    getConversations: mocks.getConversations,
    getConversation: mocks.getConversation,
    getSessions: mocks.getSessions,
  },
}))

import { useAdminConversationConsole } from './use-admin-conversation-console'

function conversation(
  id: string,
  status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE',
  isCurrent = false,
) {
  return {
    id,
    userId: 'user-1',
    title: `Диалог ${id}`,
    status,
    lastMessageAt: '2026-07-20T13:00:00.000Z',
    messageCount: 1,
    isCurrent,
    currentInteractionSessionCount: isCurrent ? 1 : 0,
    aiSuspension: {
      mode: 'AUTOMATIC' as const,
      lifecycle: 'NONE' as const,
      version: '0',
      suspendedUntil: null,
      serverTime: '2026-07-20T13:00:00.000Z',
    },
  }
}

describe('панель ответа администратором', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSessions.mockResolvedValue([])
    mocks.getConversations.mockResolvedValue({ items: [], nextCursor: null })
    mocks.getMessages.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('не повторяет составную операцию при двойном нажатии', async () => {
    let finish!: (value: { deliveryStatus: string }) => void
    mocks.sendAdminMessage.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
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
      isCurrent: true,
      currentInteractionSessionCount: 1,
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
    let finish!: (value: {
      items: unknown[]
      nextCursor: string | null
    }) => void
    mocks.getConversations.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => activeUser,
      updateRoute: vi.fn(),
    })
    console.conversations.value = [
      {
        id: 'conversation-1',
        userId: 'user-1',
        title: 'Старый диалог',
        status: 'ACTIVE',
        lastMessageAt: '2026-07-20T13:00:00.000Z',
        messageCount: 1,
        isCurrent: true,
        currentInteractionSessionCount: 1,
        aiSuspension: {
          mode: 'AUTOMATIC',
          lifecycle: 'NONE',
          version: '0',
          suspendedUntil: null,
          serverTime: '2026-07-20T13:00:00.000Z',
        },
      },
    ]
    console.nextConversationCursor.value = 'next-user-1'
    const pending = console.loadMoreConversations()

    activeUser = 'user-2'
    console.reset()
    console.conversations.value = [
      {
        id: 'conversation-2',
        userId: 'user-2',
        title: 'Новый диалог',
        status: 'ACTIVE',
        lastMessageAt: '2026-07-20T13:00:00.000Z',
        messageCount: 1,
        isCurrent: true,
        currentInteractionSessionCount: 1,
        aiSuspension: {
          mode: 'AUTOMATIC',
          lifecycle: 'NONE',
          version: '0',
          suspendedUntil: null,
          serverTime: '2026-07-20T13:00:00.000Z',
        },
      },
    ]
    finish({
      items: [
        {
          id: 'conversation-old-page',
          userId: 'user-1',
          title: 'Запоздалый диалог',
          status: 'ACTIVE',
          lastMessageAt: '2026-07-20T13:00:00.000Z',
          messageCount: 1,
          isCurrent: false,
          currentInteractionSessionCount: 0,
          aiSuspension: {
            mode: 'AUTOMATIC',
            lifecycle: 'NONE',
            version: '0',
            suspendedUntil: null,
            serverTime: '2026-07-20T13:00:00.000Z',
          },
        },
      ],
      nextCursor: null,
    })
    await pending

    expect(console.conversations.value.map((item) => item.id)).toEqual([
      'conversation-2',
    ])
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
      id: 'conversation-1',
      userId: 'user-1',
      title: 'Диалог',
      status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z',
      messageCount: 1,
      isCurrent: true,
      currentInteractionSessionCount: 1,
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
    mocks.sendAdminMessage.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => activeUser,
      updateRoute: vi.fn(),
    })
    console.selectedConversation.value = {
      id: 'conversation-1',
      userId: 'user-1',
      title: 'Старый диалог',
      status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z',
      messageCount: 1,
      isCurrent: true,
      currentInteractionSessionCount: 1,
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

  it('по умолчанию открывает текущий диалог и первую страницу сообщений', async () => {
    const oldConversation = {
      id: 'old',
      userId: 'user-1',
      title: 'Старый',
      status: 'ACTIVE' as const,
      lastMessageAt: '2026-07-20T12:00:00.000Z',
      messageCount: 1,
      isCurrent: false,
      currentInteractionSessionCount: 0,
      aiSuspension: {
        mode: 'AUTOMATIC' as const,
        lifecycle: 'NONE' as const,
        version: '0',
        suspendedUntil: null,
        serverTime: '2026-07-20T13:00:00.000Z',
      },
    }
    const current = {
      ...oldConversation,
      id: 'current',
      title: 'Текущий',
      isCurrent: true,
      currentInteractionSessionCount: 2,
    }
    mocks.getConversations.mockResolvedValue({
      items: [oldConversation, current],
      nextCursor: 'next-page',
    })
    mocks.getSessions.mockResolvedValue([
      {
        id: 'session-1',
        userId: 'user-1',
        status: 'ONLINE',
        currentConversationId: 'current',
      },
    ])
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: 'message-2',
          conversationId: 'current',
          author: 'USER',
          status: 'COMPLETED',
          text: 'Новое',
          createdAt: '2026-07-20T13:00:00.000Z',
        },
      ],
      nextCursor: 'older',
    })
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })

    await console.loadConversations('user-1')

    expect(console.selectedConversation.value?.id).toBe('current')
    expect(console.onlineSession.value?.id).toBe('session-1')
    expect(console.nextConversationCursor.value).toBe('next-page')
    expect(mocks.getMessages).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      'current',
      { limit: 50 },
    )
  })

  it('добавляет предыдущую страницу в начало, сортирует и убирает дубликаты', async () => {
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })
    console.selectedConversation.value = {
      id: 'conversation-1',
      userId: 'user-1',
      title: 'Диалог',
      status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z',
      messageCount: 2,
      isCurrent: true,
      currentInteractionSessionCount: 1,
      aiSuspension: {
        mode: 'AUTOMATIC',
        lifecycle: 'NONE',
        version: '0',
        suspendedUntil: null,
        serverTime: '2026-07-20T13:00:00.000Z',
      },
    }
    console.messages.value = [
      {
        id: 'new',
        conversationId: 'conversation-1',
        author: 'USER',
        status: 'COMPLETED',
        text: 'Новое',
        createdAt: '2026-07-20T13:00:00.000Z',
      },
    ]
    console.nextMessageCursor.value = 'older-cursor'
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: 'new',
          conversationId: 'conversation-1',
          author: 'USER',
          status: 'COMPLETED',
          text: 'Дубликат',
          createdAt: '2026-07-20T13:00:00.000Z',
        },
        {
          id: 'old',
          conversationId: 'conversation-1',
          author: 'ASSISTANT',
          status: 'COMPLETED',
          text: 'Старое',
          createdAt: '2026-07-20T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    })

    await expect(console.loadOlderMessages()).resolves.toBe(1)
    expect(console.messages.value.map((message) => message.id)).toEqual([
      'old',
      'new',
    ])
    expect(console.nextMessageCursor.value).toBeNull()
  })

  it('обновляет live-сообщение по id без повторного счётчика', () => {
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })
    console.selectedConversation.value = {
      id: 'conversation-1',
      userId: 'user-1',
      title: 'Диалог',
      status: 'ACTIVE',
      lastMessageAt: '2026-07-20T12:00:00.000Z',
      messageCount: 0,
      isCurrent: true,
      currentInteractionSessionCount: 1,
      aiSuspension: {
        mode: 'AUTOMATIC',
        lifecycle: 'NONE',
        version: '0',
        suspendedUntil: null,
        serverTime: '2026-07-20T13:00:00.000Z',
      },
    }
    const writing = {
      id: 'message-1',
      conversationId: 'conversation-1',
      author: 'ASSISTANT' as const,
      status: 'WRITING' as const,
      text: '',
      createdAt: '2026-07-20T13:00:00.000Z',
    }
    expect(console.upsertMessage(writing)).toBe(true)
    console.upsertMessage({ ...writing, status: 'COMPLETED', text: 'Готово' })

    expect(console.messages.value).toEqual([
      { ...writing, status: 'COMPLETED', text: 'Готово' },
    ])
    expect(console.selectedConversation.value.messageCount).toBe(1)
    expect(console.newMessageCount.value).toBe(1)
  })

  it('создаёт отдельный диалог только через явную политику create_new', async () => {
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })
    console.onlineSession.value = {
      id: 'session-1',
      userId: 'user-1',
      status: 'ONLINE',
    } as typeof console.onlineSession.value
    mocks.sendAdminMessage.mockResolvedValue({ threadId: 'conversation-new' })
    mocks.getConversation.mockResolvedValue(conversation('conversation-new'))

    await expect(console.sendNewConversation(' Новый вопрос ')).resolves.toBe(
      'conversation-new',
    )
    expect(mocks.sendAdminMessage).toHaveBeenCalledWith('project-1', 'user-1', {
      text: 'Новый вопрос',
      conversationPolicy: 'create_new',
      interactionSessionId: 'session-1',
      idempotencyKey: expect.any(String),
    })
    expect(console.conversations.value[0]?.id).toBe('conversation-new')
    expect(console.selectedConversation.value?.id).toBe('conversation-new')
    expect(mocks.getConversations).not.toHaveBeenCalled()
  })

  it('повторяет неизвестный результат обычной отправки с тем же idempotency key', async () => {
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })
    console.selectedConversation.value = {
      id: 'conversation-1',
      userId: 'user-1',
      title: 'Диалог',
      status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z',
      messageCount: 1,
      isCurrent: true,
      currentInteractionSessionCount: 1,
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
      status: 'ONLINE',
    } as typeof console.onlineSession.value
    console.replyText.value = 'Повторяемый ответ'
    mocks.sendAdminMessage
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce({ threadId: 'conversation-1' })

    await console.sendReply()
    await console.sendReply()

    expect(mocks.sendAdminMessage).toHaveBeenCalledTimes(2)
    expect(mocks.sendAdminMessage.mock.calls[0]?.[2].idempotencyKey).toBe(
      mocks.sendAdminMessage.mock.calls[1]?.[2].idempotencyKey,
    )
  })

  it('не позволяет запоздалому WRITING отменить подтверждённый COMPLETED', () => {
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })
    console.selectedConversation.value = {
      id: 'conversation-1',
      userId: 'user-1',
      title: 'Диалог',
      status: 'ACTIVE',
      lastMessageAt: '2026-07-20T13:00:00.000Z',
      messageCount: 1,
      isCurrent: true,
      currentInteractionSessionCount: 1,
      aiSuspension: {
        mode: 'AUTOMATIC',
        lifecycle: 'NONE',
        version: '0',
        suspendedUntil: null,
        serverTime: '2026-07-20T13:00:00.000Z',
      },
    }
    const completed = {
      id: 'message-1',
      conversationId: 'conversation-1',
      author: 'ASSISTANT' as const,
      status: 'COMPLETED' as const,
      text: 'Готово',
      createdAt: '2026-07-20T13:00:00.000Z',
      updatedAt: '2026-07-20T13:01:00.000Z',
    }
    expect(console.upsertMessage(completed)).toBe(true)

    expect(
      console.upsertMessage({
        ...completed,
        status: 'WRITING',
        text: '',
        updatedAt: '2026-07-20T13:00:30.000Z',
      }),
    ).toBe(false)
    expect(console.messages.value[0]?.status).toBe('COMPLETED')
  })

  it('открывает текущий диалог online-сессии, даже если он вне первой страницы', async () => {
    const firstPage = conversation('first-page')
    const current = { ...conversation('current-outside', 'ACTIVE', true) }
    mocks.getConversations.mockResolvedValue({
      items: [firstPage],
      nextCursor: 'next-page',
    })
    mocks.getSessions.mockResolvedValue([
      {
        id: 'session-1',
        userId: 'user-1',
        status: 'ONLINE',
        currentConversationId: current.id,
      },
    ])
    mocks.getConversation.mockResolvedValue(current)
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })

    await console.loadConversations('user-1')

    expect(mocks.getConversation).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      'current-outside',
    )
    expect(console.selectedConversation.value?.id).toBe('current-outside')
    expect(console.conversations.value.map((item) => item.id)).toEqual([
      'current-outside',
      'first-page',
    ])
  })

  it('догружает и поднимает все текущие диалоги нескольких online-сессий', async () => {
    mocks.getConversations.mockResolvedValue({
      items: [conversation('regular')],
      nextCursor: 'next-page',
    })
    mocks.getSessions.mockResolvedValue([
      {
        id: 'session-1',
        userId: 'user-1',
        status: 'ONLINE',
        currentConversationId: 'current-a',
      },
      {
        id: 'session-2',
        userId: 'user-1',
        status: 'ONLINE',
        currentConversationId: 'current-b',
      },
    ])
    mocks.getConversation.mockImplementation(
      (_projectId, _endUserId, conversationId: string) =>
        Promise.resolve(conversation(conversationId, 'ACTIVE', true)),
    )
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })

    await console.loadConversations('user-1')

    expect(console.conversations.value.map((item) => item.id)).toEqual([
      'current-b',
      'current-a',
      'regular',
    ])
    expect(
      console.conversations.value
        .filter((item) => item.isCurrent)
        .map((item) => item.id),
    ).toEqual(['current-b', 'current-a'])
  })

  it('переходит к безопасному fallback при устаревшем deep-link', async () => {
    mocks.getConversations.mockResolvedValue({
      items: [conversation('active')],
      nextCursor: null,
    })
    mocks.getConversation.mockRejectedValue(new Error('not found'))
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })

    await console.loadConversations('user-1', 'deleted-conversation')

    expect(console.selectedConversation.value?.id).toBe('active')
    expect(console.conversationError.value).toBe('')
  })

  it('очищает старый Current при переносе active session в другой диалог', async () => {
    mocks.getConversations.mockResolvedValue({
      items: [
        conversation('conversation-a', 'ACTIVE', true),
        conversation('conversation-b'),
      ],
      nextCursor: null,
    })
    mocks.getSessions.mockResolvedValueOnce([
      {
        id: 'session-1',
        userId: 'user-1',
        status: 'ONLINE',
        currentConversationId: 'conversation-a',
      },
    ])
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })
    await console.loadConversations('user-1')
    mocks.getConversations.mockResolvedValue({
      items: [
        conversation('conversation-a'),
        conversation('conversation-b', 'ACTIVE', true),
      ],
      nextCursor: null,
    })
    mocks.getSessions.mockResolvedValue([
      {
        id: 'session-1',
        userId: 'user-1',
        status: 'ONLINE',
        currentConversationId: 'conversation-b',
      },
    ])

    await console.refreshPresence()

    expect(
      console.conversations.value.map((item) => ({
        id: item.id,
        isCurrent: item.isCurrent,
        count: item.currentInteractionSessionCount,
      })),
    ).toEqual([
      { id: 'conversation-b', isCurrent: true, count: 1 },
      { id: 'conversation-a', isCurrent: false, count: 0 },
    ])
  })

  it('сохраняет REST Current baseline при временно отсутствующем presence connection', async () => {
    mocks.getConversations.mockResolvedValue({
      items: [conversation('rest-current', 'ACTIVE', true)],
      nextCursor: null,
    })
    mocks.getSessions.mockResolvedValue([])
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })

    await console.loadConversations('user-1')

    expect(console.conversations.value[0]).toMatchObject({
      id: 'rest-current',
      isCurrent: true,
      currentInteractionSessionCount: 1,
    })
  })

  it('предпочитает последний активный диалог архивному при отсутствии current', async () => {
    mocks.getConversations.mockResolvedValue({
      items: [conversation('archived', 'ARCHIVED'), conversation('active')],
      nextCursor: null,
    })
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })

    await console.loadConversations('user-1')

    expect(console.selectedConversation.value?.id).toBe('active')
  })

  it('не теряет live-сообщение, пришедшее во время загрузки REST-истории', async () => {
    let resolveMessages!: (value: { items: never[]; nextCursor: null }) => void
    mocks.getMessages.mockReturnValue(
      new Promise((resolve) => {
        resolveMessages = resolve
      }),
    )
    const selected = conversation('conversation-1', 'ACTIVE', true)
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })
    const loading = console.loadMessages(selected)
    const liveMessage = {
      id: 'live-message',
      conversationId: selected.id,
      author: 'USER' as const,
      status: 'COMPLETED' as const,
      text: 'Сообщение из WebSocket',
      createdAt: '2026-07-20T13:01:00.000Z',
    }

    expect(console.upsertMessage(liveMessage)).toBe(true)
    resolveMessages({ items: [], nextCursor: null })
    await loading

    expect(console.messages.value).toEqual([liveMessage])
  })

  it('начинает REST snapshot только после подтверждения realtime watch', async () => {
    const order: string[] = []
    mocks.getMessages.mockImplementation(() => {
      order.push('rest-get')
      return Promise.resolve({ items: [], nextCursor: null })
    })
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
      beforeLoadMessages: async () => {
        order.push('watch-ack')
      },
    })

    await console.loadMessages(conversation('conversation-1'))

    expect(order).toEqual(['watch-ack', 'rest-get'])
  })

  it('сохраняет новый текст, набранный пока предыдущий ответ отправлялся', async () => {
    let finishSend!: (value: { threadId: string }) => void
    mocks.sendAdminMessage.mockReturnValue(
      new Promise((resolve) => {
        finishSend = resolve
      }),
    )
    mocks.getConversation.mockResolvedValue(
      conversation('conversation-1', 'ACTIVE', true),
    )
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })
    console.selectedConversation.value = conversation(
      'conversation-1',
      'ACTIVE',
      true,
    )
    console.onlineSession.value = {
      id: 'session-1',
      userId: 'user-1',
      status: 'ONLINE',
    } as typeof console.onlineSession.value
    console.replyText.value = 'Первый ответ'
    const sending = console.sendReply()
    await Promise.resolve()
    console.replyText.value = 'Следующий черновик'

    finishSend({ threadId: 'conversation-1' })
    await sending

    expect(console.replyText.value).toBe('Следующий черновик')
  })

  it('учитывает черновик в невыбранном диалоге при закрытии workspace', async () => {
    const first = conversation('first', 'ACTIVE', true)
    const second = conversation('second')
    const console = useAdminConversationConsole({
      projectId: () => 'project-1',
      endUserId: () => 'user-1',
    })
    await console.loadMessages(first)
    console.replyText.value = 'Незавершённый ответ'
    await console.loadMessages(second)

    expect(console.hasAnyDraft()).toBe(true)
  })
})
