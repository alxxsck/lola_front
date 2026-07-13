import { describe, expect, it } from 'vitest'
import type { AuditLogResponseDto, EndUserResponseDto, EventDefinitionResponseDto, EventLogResponseDto, ProjectResponseDto, ScenarioRunResponseDto, UiElementResponseDto } from '@/shared/api/generated/models'
import { mapActiveSessions, mapAuditLog, mapConversation, mapConversationMessage, mapEndUser, mapEventDefinition, mapEventLog, mapProject, mapScenarioRun, mapUiElement, toCreateEventDefinitionDto, toUpdateProjectDto } from './mappers'

describe('repository domain mappers', () => {
  it('maps the project contract without leaking backend-only fields', () => {
    const dto: ProjectResponseDto = {
      id: 'project-1', organizationId: 'org-1', name: 'Lola', slug: 'lola', status: 'ACTIVE',
      publicKey: 'public', serverKeyPrefix: 'secret-prefix', defaultLocale: 'ru', supportedLocales: ['ru'],
      assistantName: 'Lola', systemPrompt: 'Help', settings: { timezone: 'UTC' }, createdAt: 'now', updatedAt: 'now',
    }
    expect(mapProject(dto)).toEqual(expect.objectContaining({ id: 'project-1', settings: { timezone: 'UTC' } }))
    expect(mapProject(dto)).not.toHaveProperty('serverKeyPrefix')
  })

  it('only sends editable project fields', () => {
    expect(toUpdateProjectDto({
      id: 'immutable', slug: 'immutable', publicKey: 'immutable', name: 'Updated', settings: { description: 'New' },
    })).toEqual({ name: 'Updated', settings: { description: 'New' } })
  })

  it('normalizes nullable response fields and preserves JSON payloads', () => {
    const ui = mapUiElement({
      id: 'ui-1', projectId: 'project-1', code: 'home', name: 'Home', kind: 'PAGE',
      selector: null, route: '/home', handler: null, config: { direct: true }, enabled: true, createdAt: 'now', updatedAt: 'now',
    } as unknown as UiElementResponseDto)
    const eventDto = {
      id: 'event-1', projectId: 'project-1', code: 'signup', name: 'Signup', description: null, version: 1,
      payloadSchema: { type: 'object' }, enabled: true, createdAt: 'now', updatedAt: 'now',
    } as EventDefinitionResponseDto
    const user = mapEndUser({
      id: 'user-1', projectId: 'project-1', externalId: 'external', isGuest: false, locale: null, segment: null,
      profile: {}, attributes: {}, preferences: {}, lastSeenAt: 'now', createdAt: 'now', updatedAt: 'now',
    } as EndUserResponseDto)

    expect(ui).toMatchObject({ route: '/home', selector: undefined, config: { direct: true } })
    expect(mapEventDefinition(eventDto)).toMatchObject({ description: undefined, payloadSchema: { type: 'object' } })
    expect(user).toMatchObject({ locale: undefined, segment: undefined })
    expect(toCreateEventDefinitionDto(mapEventDefinition(eventDto))).toEqual({
      code: 'signup', name: 'Signup', version: 1, payloadSchema: { type: 'object' }, enabled: true,
    })
  })

  it('maps operational DTOs into page-safe domain models', () => {
    const event = mapEventLog({
      id: 'log-1', projectId: 'project-1', eventDefinitionId: 'event-1', endUserId: 'user-1', source: 'SERVER',
      payload: { amount: 12 }, context: {}, occurredAt: 'now', receivedAt: 'now', status: 'PROCESSED',
      eventDefinition: { id: 'event-1', projectId: 'project-1', code: 'deposit', name: 'Deposit' },
      endUser: { id: 'user-1', externalId: 'customer-42' },
    } as unknown as EventLogResponseDto)
    const run = mapScenarioRun({
      id: 'run-1', projectId: 'project-1', scenarioId: 'scenario-1', eventLogId: 'log-1', endUserId: 'user-1',
      status: 'RUNNING', context: {}, startedAt: 'now', currentStep: 0,
      scenario: { id: 'scenario-1', code: 'welcome', name: 'Welcome' }, endUser: { id: 'user-1', externalId: 'customer-42' },
      steps: [{ id: 'step-1', position: 0, actionType: 'OPEN_PAGE', config: {}, status: 'WAITING_ACK', command: { id: 'command-1', type: 'OPEN_PAGE', payload: {}, sequence: 1, status: 'SENT', createdAt: 'now' } }],
    } as ScenarioRunResponseDto)
    const audit = mapAuditLog({ id: 'audit-1', action: 'scenario.update', status: 'SUCCEEDED', metadata: {}, createdAt: 'now', adminUser: { id: 'admin-1', login: 'owner@lola.dev', displayName: null } } as AuditLogResponseDto)

    expect(event).toMatchObject({ eventCode: 'deposit', userExternalId: 'customer-42', payload: { amount: 12 } })
    expect(run.steps[0]).toMatchObject({ status: 'WAITING_ACK', command: { id: 'command-1', sequence: 1 } })
    expect(audit.actor).toEqual({ id: 'admin-1', email: 'owner@lola.dev', name: undefined })
  })

  it('deduplicates multiple connections of the same active session by latest heartbeat', () => {
    const sessions = mapActiveSessions({
      id: 'user-1', externalId: 'customer-1', isGuest: false, presence: 'online', profile: {},
      lastSeenAt: '2026-07-11T10:00:00.000Z', activeConnectionCount: 2, activeSessionCount: 1,
      connections: [
        { id: 'connection-1', sessionId: 'session-1', transport: 'SOCKET_IO', connectedAt: '2026-07-11T09:00:00.000Z', lastHeartbeatAt: '2026-07-11T09:58:00.000Z' },
        { id: 'connection-2', sessionId: 'session-1', transport: 'ANY_CABLE', connectedAt: '2026-07-11T09:05:00.000Z', lastHeartbeatAt: '2026-07-11T10:00:00.000Z' },
      ],
    })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ id: 'session-1', userName: 'customer-1', device: 'AnyCable', status: 'ONLINE' })
  })

  it('maps admin conversation history into the UI domain', () => {
    expect(mapConversation({
      id: 'conversation-1', projectId: 'project-1', endUserId: 'user-1', title: null, status: 'CLOSED',
      createdAt: '2026-07-13T08:00:00.000Z', updatedAt: '2026-07-13T09:00:00.000Z', _count: { messages: 2 },
      messages: [{ id: 'message-2', role: 'ASSISTANT', text: 'Last', createdAt: '2026-07-13T08:59:00.000Z' }],
    })).toEqual(expect.objectContaining({ title: 'Диалог без названия', status: 'ARCHIVED', messageCount: 2, lastMessageAt: '2026-07-13T08:59:00.000Z' }))
    expect(mapConversationMessage({
      id: 'message-1', threadId: 'conversation-1', role: 'ASSISTANT', status: 'COMPLETED', text: 'Hello',
      createdAt: '2026-07-13T08:00:00.000Z', updatedAt: '2026-07-13T08:00:00.000Z',
    })).toEqual(expect.objectContaining({ conversationId: 'conversation-1', author: 'ASSISTANT', text: 'Hello' }))
  })
})
