import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  platformCreateEventDefinition,
  platformCreateScenario,
  platformCreateUi,
  platformDeleteUi,
  platformDeleteScenario,
  platformUpdateEventDefinition,
  platformUpdateProject,
  platformUpdateScenario,
  platformUpdateUi,
  platformScenarios,
  adminMessagingSend,
  presenceList,
  platformActionDefinitions,
  adminConversationsList,
  adminConversationsListMessages,
} from '@/shared/api/generated/lola-backend'
import type { UiElementResponseDto } from '@/shared/api/generated/models'
import { apiRepository } from './api-repository'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  platformCreateEventDefinition: vi.fn(), platformCreateMember: vi.fn(), platformCreateScenario: vi.fn(),
  platformCreateUi: vi.fn(), platformDeleteEventDefinition: vi.fn(), platformDeleteMember: vi.fn(),
  platformDeleteScenario: vi.fn(), platformDeleteUi: vi.fn(), platformEventDefinitions: vi.fn(),
  platformGetProject: vi.fn(), platformMembers: vi.fn(), platformScenarios: vi.fn(), platformUiElements: vi.fn(),
  platformActionDefinitions: vi.fn(),
  platformUpdateEventDefinition: vi.fn(), platformUpdateProject: vi.fn(), platformUpdateScenario: vi.fn(),
  platformUpdateUi: vi.fn(), platformUsers: vi.fn(),
  adminMessagingSend: vi.fn(), auditList: vi.fn(), eventsList: vi.fn(), scenarioRunsList: vi.fn(),
  presenceList: vi.fn(),
  adminConversationsList: vi.fn(), adminConversationsListMessages: vi.fn(),
}))

const uiResponse = {
  id: 'ui-1', projectId: 'project-1', code: 'deposit', name: 'Deposit', kind: 'BUTTON' as const,
  selector: '#deposit', config: {}, enabled: true, createdAt: 'now', updatedAt: 'now',
} as unknown as UiElementResponseDto

const eventResponse = {
  id: 'event-1', projectId: 'project-1', code: 'signup', name: 'Signup', version: 1,
  payloadSchema: { type: 'object' }, enabled: true, createdAt: 'now', updatedAt: 'now',
}

describe('api repository adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes UI create, update and delete through the generated client', async () => {
    vi.mocked(platformCreateUi).mockResolvedValue(uiResponse)
    vi.mocked(platformUpdateUi).mockResolvedValue(uiResponse)
    vi.mocked(platformDeleteUi).mockResolvedValue(uiResponse)

    await apiRepository.createElement('project-1', { code: 'deposit', name: 'Deposit', kind: 'ELEMENT', selector: '#deposit' })
    await apiRepository.updateElement('project-1', 'ui-1', { name: 'Deposit updated' })
    await apiRepository.deleteElement('project-1', 'ui-1')

    expect(platformCreateUi).toHaveBeenCalledWith('project-1', expect.objectContaining({ code: 'deposit', selector: '#deposit' }))
    expect(platformUpdateUi).toHaveBeenCalledWith('project-1', 'ui-1', { name: 'Deposit updated' })
    expect(platformDeleteUi).toHaveBeenCalledWith('project-1', 'ui-1')
  })

  it('keeps immutable event code out of update payloads', async () => {
    vi.mocked(platformCreateEventDefinition).mockResolvedValue(eventResponse)
    vi.mocked(platformUpdateEventDefinition).mockResolvedValue(eventResponse)

    await apiRepository.saveEvent('project-1', { code: 'signup', name: 'Signup', payloadSchema: { type: 'object' } })
    await apiRepository.saveEvent('project-1', { ...eventResponse, name: 'Signup updated' })

    expect(platformCreateEventDefinition).toHaveBeenCalledWith('project-1', expect.objectContaining({ code: 'signup' }))
    expect(platformUpdateEventDefinition).toHaveBeenCalledWith(
      'project-1', 'event-1', expect.not.objectContaining({ code: 'signup', version: 1 }),
    )
  })

  it('sends only backend-editable project settings', async () => {
    vi.mocked(platformUpdateProject).mockResolvedValue({
      id: 'project-1', organizationId: 'org-1', name: 'Updated', slug: 'lola', status: 'ACTIVE', publicKey: 'public',
      serverKeyPrefix: 'secret', defaultLocale: 'ru', supportedLocales: ['ru'], assistantName: 'Lola', systemPrompt: 'Help',
      voiceInstructions: '', settings: {}, createdAt: 'now', updatedAt: 'now',
    })
    await apiRepository.updateProject('project-1', { id: 'ignored', slug: 'ignored', name: 'Updated' })
    expect(platformUpdateProject).toHaveBeenCalledWith('project-1', { name: 'Updated' })
  })

  it('routes scenario CRUD through generated endpoints with backend DTOs', async () => {
    const response = {
      id: 'scenario-1', projectId: 'project-1', code: 'welcome', name: 'Welcome', eventDefinitionId: 'event-1',
      status: 'DRAFT' as const, priority: 0, conditions: [], cooldownSeconds: 0, actions: [
        { id: 'action-1', scenarioId: 'scenario-1', position: 0, type: 'OPEN_PAGE' as const, config: { pageId: 'home' }, createdAt: 'now', updatedAt: 'now' },
      ], createdAt: 'now', updatedAt: 'now',
    }
    vi.mocked(platformCreateScenario).mockResolvedValue(response)
    vi.mocked(platformUpdateScenario).mockResolvedValue(response)
    vi.mocked(platformDeleteScenario).mockResolvedValue(response)
    const value = { code: 'welcome', name: 'Welcome', eventDefinitionId: 'event-1', actions: [{ position: 0, type: 'OPEN_PAGE' as const, config: { pageId: 'home' } }] }

    await apiRepository.saveScenario('project-1', value)
    await apiRepository.saveScenario('project-1', { ...value, id: 'scenario-1' })
    await apiRepository.deleteScenario('project-1', 'scenario-1')

    expect(platformCreateScenario).toHaveBeenCalledWith('project-1', expect.objectContaining({ code: 'welcome', actions: [{ position: 0, type: 'OPEN_PAGE', config: { pageId: 'home' } }] }))
    expect(platformUpdateScenario).toHaveBeenCalledWith('project-1', 'scenario-1', expect.not.objectContaining({ code: 'welcome' }))
    expect(platformDeleteScenario).toHaveBeenCalledWith('project-1', 'scenario-1')
  })

  it('normalizes legacy non-array scenario conditions before saving', async () => {
    const legacyResponse = {
      id: 'scenario-1', projectId: 'project-1', code: 'open_deposit_modal', name: 'Open deposit modal',
      eventDefinitionId: 'event-1', status: 'DRAFT' as const, priority: 0, conditions: {},
      cooldownSeconds: 0, actions: [], createdAt: 'now', updatedAt: 'now',
    }
    vi.mocked(platformScenarios).mockResolvedValue([legacyResponse as never])
    vi.mocked(platformUpdateScenario).mockResolvedValue({ ...legacyResponse, conditions: [] })

    const [scenario] = await apiRepository.getScenarios('project-1')
    expect(scenario.conditions).toEqual([])

    await apiRepository.saveScenario('project-1', scenario)
    expect(platformUpdateScenario).toHaveBeenCalledWith(
      'project-1', 'scenario-1', expect.objectContaining({ conditions: [] }),
    )
  })

  it('loads and parses project action definitions', async () => {
    vi.mocked(platformActionDefinitions).mockResolvedValue([{
      id: 'definition-1', projectId: 'project-1', type: 'WAIT_FOR', name: 'Wait', description: null,
      executor: 'SERVER', serverHandler: 'waitFor', commandType: null, enabled: true, builtIn: true,
      configSchema: { type: 'object', properties: { durationMs: { type: 'integer' } }, required: ['durationMs'] },
      uiSchema: { fields: [{ key: 'durationMs', label: 'Duration', control: 'number' }] },
      createdAt: 'now', updatedAt: 'now',
    } as never])

    await expect(apiRepository.getActionDefinitions('project-1')).resolves.toEqual([
      expect.objectContaining({ type: 'WAIT_FOR', executor: 'SERVER', configSchema: expect.objectContaining({ required: ['durationMs'] }) }),
    ])
    expect(platformActionDefinitions).toHaveBeenCalledWith('project-1')
  })

  it('sends admin messages with a UUID idempotency header and a bounded API payload', async () => {
    vi.mocked(adminMessagingSend).mockResolvedValue({
      duplicate: true,
      commandIds: ['command-1'],
      message: { id: 'message-1', threadId: 'thread-1', status: 'COMPLETED' },
    } as never)

    const result = await apiRepository.sendAdminMessage('project-1', 'user-1', {
      text: 'Welcome', conversationPolicy: 'reuse_active', interactionSessionId: 'session-1',
      actions: [{ type: 'OPEN_PAGE', config: { pageId: 'home' } }],
      idempotencyKey: '2d77b597-1bc0-4b0f-a783-77597bb71483',
    })

    expect(adminMessagingSend).toHaveBeenCalledWith('project-1', 'user-1', {
      text: 'Welcome', conversationPolicy: 'reuse_active', interactionSessionId: 'session-1',
      actions: [{ type: 'OPEN_PAGE', config: { pageId: 'home' } }],
    }, { headers: { 'Idempotency-Key': '2d77b597-1bc0-4b0f-a783-77597bb71483' } })
    expect(result).toMatchObject({ duplicate: true, messageId: 'message-1', commandIds: ['command-1'] })
  })

  it('maps active backend users to selectable interaction sessions', async () => {
    vi.mocked(presenceList).mockResolvedValue([{
      id: 'user-1', externalId: 'customer-1', isGuest: false, presence: 'online', profile: { name: 'Анна' },
      lastSeenAt: '2026-07-11T10:00:00.000Z', activeConnectionCount: 2, activeSessionCount: 1,
      connections: [
        { id: 'connection-old', sessionId: 'session-1', transport: 'SOCKET_IO', connectedAt: '2026-07-11T09:00:00.000Z', lastHeartbeatAt: '2026-07-11T09:59:00.000Z' },
        { id: 'connection-new', sessionId: 'session-1', transport: 'ANY_CABLE', connectedAt: '2026-07-11T09:30:00.000Z', lastHeartbeatAt: '2026-07-11T10:00:00.000Z' },
      ],
    }])

    await expect(apiRepository.getSessions('project-1')).resolves.toEqual([expect.objectContaining({
      id: 'session-1', userId: 'user-1', userName: 'Анна', device: 'AnyCable', connectionCount: 2,
    })])
    expect(presenceList).toHaveBeenCalledWith('project-1')
  })

  it('loads conversations and messages through cursor-paginated CMS endpoints', async () => {
    vi.mocked(adminConversationsList).mockResolvedValue({
      items: [{
        id: 'conversation-1', projectId: 'project-1', endUserId: 'user-1', title: 'Deposit', status: 'OPEN',
        createdAt: '2026-07-13T08:00:00.000Z', updatedAt: '2026-07-13T09:00:00.000Z',
        _count: { messages: 42 }, messages: [{ id: 'message-last', role: 'ASSISTANT', text: 'Done', createdAt: '2026-07-13T09:00:00.000Z' }],
      }],
      nextCursor: 'conversation-1',
    })
    vi.mocked(adminConversationsListMessages).mockResolvedValue({
      items: [{
        id: 'message-1', threadId: 'conversation-1', role: 'USER', status: 'COMPLETED', text: 'Hello',
        createdAt: '2026-07-13T08:59:00.000Z', updatedAt: '2026-07-13T08:59:00.000Z',
      }],
      nextCursor: 'message-1',
    })

    await expect(apiRepository.getConversations('project-1', 'user-1', { cursor: 'previous', limit: 20 })).resolves.toEqual({
      items: [expect.objectContaining({ id: 'conversation-1', messageCount: 42, status: 'ACTIVE' })],
      nextCursor: 'conversation-1',
    })
    await expect(apiRepository.getMessages('project-1', 'user-1', 'conversation-1', { cursor: 'older' })).resolves.toEqual({
      items: [expect.objectContaining({ id: 'message-1', author: 'USER', conversationId: 'conversation-1' })],
      nextCursor: 'message-1',
    })
    expect(adminConversationsList).toHaveBeenCalledWith('project-1', 'user-1', { cursor: 'previous', limit: 20 })
    expect(adminConversationsListMessages).toHaveBeenCalledWith('project-1', 'user-1', 'conversation-1', { cursor: 'older', limit: 50 })
  })

  it('rejects direct actions without an active interaction session', async () => {
    await expect(apiRepository.sendAdminMessage('project-1', 'user-1', {
      text: 'Open', conversationPolicy: 'reuse_active', actions: [{ type: 'OPEN_PAGE', config: {} }],
    })).rejects.toThrow('активная сессия')
    expect(adminMessagingSend).not.toHaveBeenCalled()
  })
})
