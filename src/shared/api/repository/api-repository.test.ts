import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  adminEventLogsGet,
  adminEventLogsList,
  eventsList,
  platformCreateUserAttributeDefinition,
  platformUserAttributeDefinitions,
  platformEventDefinitionRevisions,
  platformEventDefinitionRevision,
  platformUsersPage,
  scenarioRunsPage,
  platformActivitySettings,
  platformUpdateActivitySettings,
} from '@/shared/api/generated/lola-backend'
import type { EventDefinitionResponseDto, UiElementResponseDto } from '@/shared/api/generated/models'
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
  adminEventLogsGet: vi.fn(), adminEventLogsList: vi.fn(),
  platformCreateUserAttributeDefinition: vi.fn(), platformDeleteUserAttributeDefinition: vi.fn(),
  platformUpdateUserAttributeDefinition: vi.fn(), platformUserAttributeDefinitions: vi.fn(),
  platformEventDefinitionRevisions: vi.fn(), platformEventDefinitionRevision: vi.fn(),
  platformUsersPage: vi.fn(), scenarioRunsPage: vi.fn(),
  platformActivitySettings: vi.fn(), platformUpdateActivitySettings: vi.fn(),
}))

const uiResponse = {
  id: 'ui-1', projectId: 'project-1', code: 'deposit', name: 'Deposit', kind: 'BUTTON' as const,
  selector: '#deposit', config: {}, enabled: true, createdAt: 'now', updatedAt: 'now',
} as unknown as UiElementResponseDto

const eventResponse = {
  id: 'event-1', projectId: 'project-1', code: 'signup', name: 'Signup', version: 1,
  definitionKeyId: 'event-key-1', currentRevisionId: 'event-1', isCurrent: true, origin: 'CUSTOM' as const, readOnly: false,
  payloadSchema: { type: 'object' }, clientIngestible: false, countsAsActivity: false, enabled: true, createdAt: 'now', updatedAt: 'now',
} as unknown as EventDefinitionResponseDto

describe('api repository adapter', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

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
    await apiRepository.saveEvent('project-1', {
      id: 'event-1', code: 'signup', name: 'Signup updated', payloadSchema: { type: 'object' },
      clientIngestible: false, countsAsActivity: false, enabled: true,
    })

    expect(platformCreateEventDefinition).toHaveBeenCalledWith('project-1', expect.objectContaining({ code: 'signup' }))
    expect(platformUpdateEventDefinition).toHaveBeenCalledWith(
      'project-1', 'event-1', expect.not.objectContaining({ code: 'signup', version: 1 }),
    )
  })

  it('exposes revision history, cursor pages and activity settings through generated contracts', async () => {
    vi.mocked(platformEventDefinitionRevisions).mockResolvedValue({
      items: [{ ...eventResponse, compatibility: 'PINNED', pinnedScenarioRevisionCount: 2 } as never],
      nextCursor: 'revision-2' as never,
    })
    vi.mocked(platformEventDefinitionRevision).mockResolvedValue({
      ...eventResponse, compatibility: 'CURRENT', pinnedScenarioRevisionCount: 0,
    } as never)
    vi.mocked(platformUsersPage).mockResolvedValue({ items: [], nextCursor: 'user-2' as never })
    vi.mocked(scenarioRunsPage).mockResolvedValue({ items: [], nextCursor: 'run-2' })
    const settings = {
      timezone: 'Europe/Madrid', visitInactivitySeconds: 1800, reconnectGraceSeconds: 30,
      limits: { visitInactivitySeconds: { min: 60, max: 86400 }, reconnectGraceSeconds: { min: 1, max: 300 } },
      semantics: { timezone: 'activity_day', visitInactivitySeconds: 'visit_boundary', reconnectGraceSeconds: 'reconnect' },
    } as never
    vi.mocked(platformActivitySettings).mockResolvedValue(settings)
    vi.mocked(platformUpdateActivitySettings).mockResolvedValue(settings)

    await expect(apiRepository.getEventDefinitionRevisions('project-1', 'event-key-1', { limit: 25 })).resolves.toEqual({
      items: [expect.objectContaining({ compatibility: 'PINNED', pinnedScenarioRevisionCount: 2 })],
      nextCursor: 'revision-2',
    })
    await expect(apiRepository.getEventDefinitionRevision('project-1', 'event-key-1', 'event-1')).resolves.toEqual(
      expect.objectContaining({ compatibility: 'CURRENT' }),
    )
    await expect(apiRepository.getUsersPage('project-1', { cursor: 'user-1', limit: 50 })).resolves.toEqual({ items: [], nextCursor: 'user-2' })
    await expect(apiRepository.getScenarioRunsPage('project-1', { cursor: 'run-1', limit: 50 })).resolves.toEqual({ items: [], nextCursor: 'run-2' })
    await apiRepository.getActivitySettings('project-1')
    await apiRepository.updateActivitySettings('project-1', { timezone: 'Europe/Madrid', visitInactivitySeconds: 1800, reconnectGraceSeconds: 30 })

    expect(platformEventDefinitionRevisions).toHaveBeenCalledWith('project-1', 'event-key-1', { limit: 25 })
    expect(platformUsersPage).toHaveBeenCalledWith('project-1', { cursor: 'user-1', limit: 50 })
    expect(scenarioRunsPage).toHaveBeenCalledWith('project-1', { cursor: 'run-1', limit: 50 })
    expect(platformUpdateActivitySettings).toHaveBeenCalledWith('project-1', expect.objectContaining({ visitInactivitySeconds: 1800 }))
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
      status: 'DRAFT' as const, conversationPolicy: 'reuse_active' as const, priority: 0, conditions: [], cooldownSeconds: 0, actions: [
        { id: 'action-1', scenarioId: 'scenario-1', position: 0, type: 'OPEN_PAGE' as const, config: { pageId: 'home' }, createdAt: 'now', updatedAt: 'now' },
      ], createdAt: 'now', updatedAt: 'now',
    }
    vi.mocked(platformCreateScenario).mockResolvedValue(response)
    vi.mocked(platformUpdateScenario).mockResolvedValue(response)
    vi.mocked(platformDeleteScenario).mockResolvedValue(response)
    const value = { code: 'welcome', name: 'Welcome', eventDefinitionId: 'event-1', conversationPolicy: 'reuse_active' as const, actions: [{ position: 0, type: 'OPEN_PAGE' as const, config: { pageId: 'home' } }] }

    await expect(apiRepository.saveScenario('project-1', value)).resolves.toEqual(expect.objectContaining({ conversationPolicy: 'reuse_active' }))
    await apiRepository.saveScenario('project-1', { ...value, id: 'scenario-1' })
    await apiRepository.updateScenarioMetadata('project-1', 'scenario-1', { name: 'Updated metadata', priority: 5 })
    await apiRepository.deleteScenario('project-1', 'scenario-1')

    expect(platformCreateScenario).toHaveBeenCalledWith('project-1', expect.objectContaining({ code: 'welcome', conversationPolicy: 'reuse_active', actions: [{ position: 0, type: 'OPEN_PAGE', config: { pageId: 'home' } }] }))
    expect(platformUpdateScenario).toHaveBeenCalledWith('project-1', 'scenario-1', expect.objectContaining({ conversationPolicy: 'reuse_active' }))
    expect(platformUpdateScenario).toHaveBeenCalledWith('project-1', 'scenario-1', expect.not.objectContaining({ code: 'welcome' }))
    expect(platformUpdateScenario).toHaveBeenCalledWith('project-1', 'scenario-1', { name: 'Updated metadata', priority: 5 })
    expect(platformDeleteScenario).toHaveBeenCalledWith('project-1', 'scenario-1')
  })

  it('normalizes legacy non-array scenario conditions before saving', async () => {
    const legacyResponse = {
      id: 'scenario-1', projectId: 'project-1', code: 'open_deposit_modal', name: 'Open deposit modal',
      eventDefinitionId: 'event-1', status: 'DRAFT' as const, conversationPolicy: 'create_new' as const, priority: 0, conditions: {},
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

  it('uses the snapshot cursor CMS endpoint for filtered event logs and detail', async () => {
    const eventLog = {
      id: 'log-1', projectId: 'project-1', eventDefinitionId: 'event-1', endUserId: 'user-1',
      source: 'FRONTEND' as const, status: 'PROCESSED' as const, occurredAt: '2026-07-16T10:00:00.000Z',
      receivedAt: '2026-07-16T10:00:00.100Z', payload: { amount: 25 }, context: { route: '/wallet' },
      eventDefinition: { id: 'event-1', code: 'deposit', name: 'Deposit', version: 2 },
      endUser: { id: 'user-1', externalId: 'customer-1' }, externalEventId: 'browser-1',
    }
    vi.mocked(adminEventLogsList).mockResolvedValue({ items: [eventLog], pageInfo: { hasMore: true, nextCursor: 'cursor-2' } })
    vi.mocked(adminEventLogsGet).mockResolvedValue(eventLog)
    vi.mocked(eventsList).mockResolvedValue({
      items: [eventLog as never],
      pagination: { page: 2, limit: 25, total: 61, totalPages: 3, hasNextPage: true, hasPreviousPage: true },
    })

    await expect(apiRepository.getEventLogs('project-1', { page: 2, limit: 25, search: 'deposit', status: 'FAILED' })).resolves.toEqual({
      items: [expect.objectContaining({ id: 'log-1', eventCode: 'deposit' })],
      pagination: { page: 2, limit: 25, total: 61, totalPages: 3, hasNextPage: true, hasPreviousPage: true },
    })
    expect(eventsList).toHaveBeenCalledWith('project-1', { page: 2, limit: 25, search: 'deposit', status: 'FAILED' })

    await expect(apiRepository.getEventLogPage('project-1', { eventCode: ['deposit', 'purchase'], status: ['FAILED', 'PROCESSED'], cursor: 'cursor-1', limit: 25 })).resolves.toEqual({
      items: [expect.objectContaining({ id: 'log-1', eventCode: 'deposit', eventVersion: 2, externalEventId: 'browser-1' })],
      nextCursor: 'cursor-2',
    })
    await expect(apiRepository.getEventLog('project-1', 'log-1')).resolves.toEqual(expect.objectContaining({ userExternalId: 'customer-1' }))
    expect(adminEventLogsList).toHaveBeenCalledWith(
      'project-1',
      { eventCode: ['deposit', 'purchase'], status: ['FAILED', 'PROCESSED'], cursor: 'cursor-1', limit: 25 },
      { paramsSerializer: { indexes: null } },
    )
    expect(adminEventLogsGet).toHaveBeenCalledWith('project-1', 'log-1')
  })

  it('uses pagination totals for dashboard event and failure counts', async () => {
    vi.spyOn(apiRepository, 'getProject').mockResolvedValue({ _count: undefined } as never)
    vi.spyOn(apiRepository, 'getScenarios').mockResolvedValue([])
    vi.spyOn(apiRepository, 'getUsers').mockResolvedValue([])
    vi.spyOn(apiRepository, 'getSessions').mockResolvedValue([])
    const getEventLogs = vi.spyOn(apiRepository, 'getEventLogs')
      .mockResolvedValueOnce({
        items: [],
        pagination: { page: 1, limit: 1, total: 250, totalPages: 250, hasNextPage: true, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        items: [],
        pagination: { page: 1, limit: 1, total: 37, totalPages: 37, hasNextPage: true, hasPreviousPage: false },
      })
    vi.spyOn(apiRepository, 'getScenarioRuns').mockResolvedValue([
      { status: 'FAILED' },
      { status: 'COMPLETED' },
    ] as never)

    await expect(apiRepository.getStats('project-1')).resolves.toEqual(expect.objectContaining({
      events: 250,
      integrationErrors: 38,
    }))
    expect(getEventLogs).toHaveBeenNthCalledWith(1, 'project-1', { limit: 1 })
    expect(getEventLogs).toHaveBeenNthCalledWith(2, 'project-1', { status: 'FAILED', limit: 1 })
  })

  it('publishes a user attribute definition and reloads the current immutable schema', async () => {
    const definition = {
      id: 'attribute-1', projectId: 'project-1', key: 'plan', label: 'Plan', type: 'STRING' as const,
      required: true, clientVisible: false, validation: { allowedValues: ['free', 'premium'] }, enabled: true,
      position: 10, createdAt: '2026-07-16T10:00:00.000Z', updatedAt: '2026-07-16T10:00:00.000Z',
    }
    const revision = {
      id: 'revision-3', projectId: 'project-1', version: 3, schema: { type: 'object' },
      clientVisibleKeys: [], createdAt: '2026-07-16T10:00:00.000Z',
    }
    vi.mocked(platformCreateUserAttributeDefinition).mockResolvedValue({ definition, currentRevision: revision })
    vi.mocked(platformUserAttributeDefinitions).mockResolvedValue({ definitions: [definition], currentRevision: revision })

    await expect(apiRepository.createUserAttributeDefinition('project-1', {
      key: 'plan', label: 'Plan', type: 'STRING', required: true, validation: { allowedValues: ['free', 'premium'] },
    })).resolves.toEqual(expect.objectContaining({ currentRevision: expect.objectContaining({ version: 3 }), definition: expect.objectContaining({ key: 'plan' }) }))
    expect(platformCreateUserAttributeDefinition).toHaveBeenCalledWith('project-1', expect.objectContaining({ validation: { allowedValues: ['free', 'premium'] } }))
    expect(platformUserAttributeDefinitions).not.toHaveBeenCalled()
  })

  it('rejects direct actions without an active interaction session', async () => {
    await expect(apiRepository.sendAdminMessage('project-1', 'user-1', {
      text: 'Open', conversationPolicy: 'reuse_active', actions: [{ type: 'OPEN_PAGE', config: {} }],
    })).rejects.toThrow('активная сессия')
    expect(adminMessagingSend).not.toHaveBeenCalled()
  })
})
