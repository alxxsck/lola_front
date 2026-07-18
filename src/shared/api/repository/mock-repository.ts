import { demoActionDefinitions, demoActivity, demoConversations, demoElements, demoEvents, demoMessages, demoProject, demoScenarios, demoSessions, demoUsers } from '@/shared/api/mock-data'
import { normalizeScenarioActions } from '@/shared/lib/domain'
import { uid } from '@/shared/lib/format'
import type { ActiveSession, ActivityItem, AuditLog, CmsUser, Conversation, ConversationMessage, EndUser, EventDefinition, EventLog, Project, Scenario, ScenarioRun, UiElement, UserAttributeDefinition, UserAttributeSchema } from '@/shared/types/domain'
import type { LolaRepository } from './contracts'

const DATA_KEY = 'lola-cms-demo-data-v2'

interface DemoData {
  project: Project
  members: CmsUser[]
  elements: UiElement[]
  events: EventDefinition[]
  scenarios: Scenario[]
  users: EndUser[]
  sessions: ActiveSession[]
  activity: ActivityItem[]
  conversations: Conversation[]
  messages: ConversationMessage[]
  userAttributes: UserAttributeDefinition[]
  userAttributeRevision: number
}

const initialData = (): DemoData => structuredClone({
  project: demoProject,
  members: [{ id: 'member_1', email: 'admin@lola.demo', name: 'Алексей', role: 'OWNER' }],
  elements: demoElements,
  events: demoEvents,
  scenarios: demoScenarios,
  users: demoUsers,
  sessions: demoSessions,
  activity: demoActivity,
  conversations: demoConversations,
  messages: demoMessages,
  userAttributes: [
    { id: 'attr_1', projectId: demoProject.id, key: 'firstName', label: 'Имя', description: 'Имя пользователя в продукте', type: 'STRING', required: true, clientVisible: true, validation: { minLength: 1, maxLength: 100 }, enabled: true, position: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'attr_2', projectId: demoProject.id, key: 'depositCount', label: 'Количество пополнений', type: 'NUMBER', required: false, clientVisible: false, validation: { minimum: 0 }, enabled: true, position: 20, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ],
  userAttributeRevision: 2,
})

const readDemo = (): DemoData => {
  const raw = localStorage.getItem(DATA_KEY)
  if (!raw) return initialData()
  try {
    const data = JSON.parse(raw) as DemoData
    return { ...initialData(), ...data, members: data.members ?? initialData().members }
  } catch {
    return initialData()
  }
}

const writeDemo = (data: DemoData) => localStorage.setItem(DATA_KEY, JSON.stringify(data))
const pause = () => new Promise((resolve) => setTimeout(resolve, 180))

function mockUserAttributeSchema(data: DemoData): UserAttributeSchema {
  const definitions = [...data.userAttributes].sort((left, right) => left.position - right.position)
  const properties = Object.fromEntries(definitions.filter((item) => item.enabled).map((item) => {
    const { allowedValues, ...constraints } = item.validation
    return [item.key, {
      type: item.type === 'NUMBER' ? 'number' : item.type === 'BOOLEAN' ? 'boolean' : 'string',
      ...(item.type === 'DATETIME' ? { format: 'date-time', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2})$' } : {}),
      ...constraints,
      ...(allowedValues ? { enum: allowedValues } : {}),
    }]
  }))
  return {
    definitions,
    currentRevision: {
      id: `revision_${data.userAttributeRevision}`,
      projectId: data.project.id,
      version: data.userAttributeRevision,
      schema: { type: 'object', properties, required: definitions.filter((item) => item.enabled && item.required).map((item) => item.key), additionalProperties: false },
      clientVisibleKeys: definitions.filter((item) => item.enabled && item.clientVisible).map((item) => item.key),
      createdAt: new Date().toISOString(),
    },
  }
}

export const mockRepository: LolaRepository = {
  mode: 'mock',
  capabilities: {
    projectSettings: true,
    projectMembers: true,
    users: true,
    uiElements: true,
    eventDefinitions: true,
    scenarios: true,
    actionDefinitions: true,
    presence: true,
    activity: true,
    conversations: true,
    manualActions: true,
    operations: true,
    auditLogs: true,
    adminMessaging: true,
    userAttributes: true,
  },

  async getProject() { await pause(); return readDemo().project },
  async updateProject(_projectId, patch) {
    const data = readDemo()
    data.project = { ...data.project, ...patch, settings: { ...data.project.settings, ...patch.settings } }
    writeDemo(data); await pause(); return data.project
  },
  async getMembers() { await pause(); return readDemo().members },
  async createMember(_projectId, member) {
    const data = readDemo()
    const saved: CmsUser = { id: uid('member'), name: member.name ?? member.email, ...member }
    data.members.push(saved); writeDemo(data); await pause(); return saved
  },
  async deleteMember(_projectId, memberId) {
    const data = readDemo(); data.members = data.members.filter((item) => item.id !== memberId); writeDemo(data); await pause()
  },
  async getElements() { await pause(); return readDemo().elements },
  async createElement(projectId, value) {
    const data = readDemo()
    const saved = { config: {}, enabled: true, ...value, id: uid('ui'), projectId } as UiElement
    data.elements.push(saved)
    writeDemo(data); await pause(); return saved
  },
  async updateElement(_projectId, id, value) {
    const data = readDemo()
    const index = data.elements.findIndex((item) => item.id === id)
    if (index < 0) throw new Error('UI element not found')
    const current = data.elements[index]!
    const kind = value.kind ?? current.kind
    const bindings = kind === 'PAGE'
      ? { selector: undefined, route: value.route ?? current.route, modalName: undefined, handler: undefined }
      : kind === 'MODAL'
        ? { selector: undefined, route: undefined, modalName: value.modalName ?? current.modalName, handler: current.kind === 'MODAL' ? current.handler : undefined }
        : { selector: value.selector === undefined ? current.selector : value.selector.trim() || undefined, route: undefined, modalName: undefined, handler: undefined }
    const saved = { ...current, ...value, ...bindings, kind } as UiElement
    data.elements.splice(index, 1, saved)
    writeDemo(data); await pause(); return saved
  },
  async deleteElement(_projectId, id) {
    const data = readDemo(); data.elements = data.elements.filter((item) => item.id !== id); writeDemo(data); await pause()
  },
  async getEvents() { await pause(); return readDemo().events },
  async saveEvent(projectId, value) {
    const data = readDemo()
    const saved = { version: 1, enabled: true, ...value, id: value.id ?? uid('evt'), projectId } as EventDefinition
    const index = data.events.findIndex((item) => item.id === saved.id)
    if (index >= 0) data.events.splice(index, 1, saved); else data.events.push(saved)
    writeDemo(data); await pause(); return saved
  },
  async deleteEvent(_projectId, id) {
    const data = readDemo(); data.events = data.events.filter((item) => item.id !== id); writeDemo(data); await pause()
  },
  async getUserAttributeSchema() { await pause(); return mockUserAttributeSchema(readDemo()) },
  async createUserAttributeDefinition(projectId, value) {
    const data = readDemo()
    const now = new Date().toISOString()
    const definition: UserAttributeDefinition = { required: false, clientVisible: false, validation: {}, enabled: true, position: data.userAttributes.length * 10 + 10, ...value, id: uid('attr'), projectId, createdAt: now, updatedAt: now }
    data.userAttributes.push(definition)
    data.userAttributeRevision += 1
    writeDemo(data); await pause(); return { definition, currentRevision: mockUserAttributeSchema(data).currentRevision! }
  },
  async updateUserAttributeDefinition(_projectId, id, value) {
    const data = readDemo()
    const index = data.userAttributes.findIndex((item) => item.id === id)
    if (index < 0) throw new Error('User attribute not found')
    const { description, ...patch } = value
    const definition = { ...data.userAttributes[index]!, ...patch, ...(description === null ? { description: undefined } : description === undefined ? {} : { description }), updatedAt: new Date().toISOString() }
    data.userAttributes.splice(index, 1, definition)
    data.userAttributeRevision += 1
    writeDemo(data); await pause(); return { definition, currentRevision: mockUserAttributeSchema(data).currentRevision! }
  },
  async deleteUserAttributeDefinition(_projectId, id) {
    const data = readDemo(); const definition = data.userAttributes.find((item) => item.id === id)
    if (!definition) throw new Error('User attribute not found')
    data.userAttributes = data.userAttributes.filter((item) => item.id !== id); data.userAttributeRevision += 1
    writeDemo(data); await pause(); return { definition, currentRevision: mockUserAttributeSchema(data).currentRevision! }
  },
  async getScenarios() { await pause(); return readDemo().scenarios },
  async getActionDefinitions() { await pause(); return structuredClone(demoActionDefinitions) },
  async saveScenario(projectId, value) {
    const data = readDemo()
    const saved = { status: 'DRAFT', conversationPolicy: 'create_new', priority: 0, conditions: [], ...value, id: value.id ?? uid('scn'), projectId } as Scenario
    saved.actions = normalizeScenarioActions(saved.actions)
    const index = data.scenarios.findIndex((item) => item.id === saved.id)
    if (index >= 0) data.scenarios.splice(index, 1, saved); else data.scenarios.push(saved)
    writeDemo(data); await pause(); return saved
  },
  async deleteScenario(_projectId, id) {
    const data = readDemo(); data.scenarios = data.scenarios.filter((item) => item.id !== id); writeDemo(data); await pause()
  },
  async getUsers() { await pause(); return readDemo().users },
  async getSessions() { await pause(); return readDemo().sessions },
  async getActivity(userId) {
    await pause(); const items = readDemo().activity; return userId ? items.filter((item) => item.userId === userId) : items
  },
  async getConversations(_projectId, userId, request) {
    await pause()
    const items = readDemo().conversations.filter((item) => item.userId === userId)
    const offset = request?.cursor ? items.findIndex((item) => item.id === request.cursor) + 1 : 0
    const limit = request?.limit ?? 30
    return { items: items.slice(offset, offset + limit), nextCursor: items[offset + limit]?.id ? items[offset + limit - 1]!.id : null }
  },
  async getMessages(_projectId, _userId, conversationId, request) {
    await pause()
    const items = readDemo().messages
      .filter((item) => item.conversationId === conversationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const offset = request?.cursor ? items.findIndex((item) => item.id === request.cursor) + 1 : 0
    const limit = request?.limit ?? 50
    return { items: items.slice(offset, offset + limit), nextCursor: items[offset + limit]?.id ? items[offset + limit - 1]!.id : null }
  },
  async sendAction(session, action) {
    const data = readDemo()
    data.activity.unshift({ id: uid('log'), userId: session.userId, type: 'COMMAND', title: action.type, description: 'Команда отправлена администратором', timestamp: new Date().toISOString(), status: 'delivered' })
    writeDemo(data); await pause(); return { commandId: uid('cmd'), status: 'delivered' }
  },
  async getEventLogs(_projectId, request) {
    await pause()
    const data = readDemo()
    const logs = data.activity.filter((item) => item.type === 'EVENT').map((item, index): EventLog => ({
      id: item.id, eventCode: item.title, eventName: item.title, eventDefinitionId: data.events.find((event) => event.code === item.title)?.id ?? 'evt_1', eventVersion: 1, userId: item.userId,
      userExternalId: data.users.find((user) => user.id === item.userId)?.externalId ?? item.userId,
      source: index % 2 ? 'SERVER' : 'FRONTEND', status: item.status === 'failed' ? 'FAILED' : 'PROCESSED',
      occurredAt: item.timestamp, receivedAt: item.timestamp, payload: { demo: true }, context: { locale: 'ru' },
    }))
    const search = request?.search?.trim().toLowerCase()
    const filtered = logs.filter((item) =>
      (!request?.status || item.status === request.status)
      && (!search || [item.id, item.eventCode, item.eventName, item.userExternalId].some((value) => value.toLowerCase().includes(search))),
    )
    const page = request?.page ?? 1
    const limit = request?.limit ?? 12
    const totalPages = Math.ceil(filtered.length / limit)
    return {
      items: filtered.slice((page - 1) * limit, page * limit),
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1 && filtered.length > 0,
      },
    }
  },
  async getEventLogPage(_projectId, filters) {
    const { items } = await this.getEventLogs(_projectId, { limit: 100 })
    const filtered = items.filter((item) =>
      (!filters?.eventCode || filters.eventCode.includes(item.eventCode))
      && (!filters?.externalUserId || item.userExternalId === filters.externalUserId)
      && (!filters?.source || filters.source.includes(item.source))
      && (!filters?.status || filters.status.includes(item.status))
      && (!filters?.receivedFrom || item.receivedAt >= filters.receivedFrom)
      && (!filters?.receivedTo || item.receivedAt <= filters.receivedTo)
      && (!filters?.occurredFrom || item.occurredAt >= filters.occurredFrom)
      && (!filters?.occurredTo || item.occurredAt <= filters.occurredTo),
    )
    const offset = filters?.cursor ? Number(filters.cursor) : 0
    const limit = filters?.limit ?? 50
    return { items: filtered.slice(offset, offset + limit), nextCursor: offset + limit < filtered.length ? String(offset + limit) : null }
  },
  async getEventLog(projectId, eventId) {
    const item = (await this.getEventLogs(projectId, { limit: 100 })).items.find((event) => event.id === eventId)
    if (!item) throw new Error('Event log not found')
    return item
  },
  async getScenarioRuns() {
    await pause()
    const data = readDemo()
    return data.activity.filter((item) => item.type === 'SCENARIO').map((item): ScenarioRun => {
      const scenario = data.scenarios.find((value) => value.name === item.title) ?? data.scenarios[0]!
      const user = data.users.find((value) => value.id === item.userId)!
      return {
        id: item.id, scenarioId: scenario.id, scenarioCode: scenario.code, scenarioName: scenario.name,
        eventLogId: 'log_1', userId: user.id, userExternalId: user.externalId, status: 'RUNNING', conversationPolicy: scenario.conversationPolicy,
        startedAt: item.timestamp, currentStep: 1, steps: scenario.actions.slice(0, 3).map((action, index) => ({
          id: `step_${index}`, position: index, nodeKey: action.nodeKey ?? `step_${index}`, actionType: action.type, executor: 'FRONTEND',
          status: index === 2 ? 'WAITING_ACK' : 'SUCCEEDED',
          command: index === 2 ? { id: 'cmd_demo', type: action.type, status: 'SENT', sequence: 3, createdAt: item.timestamp } : undefined,
        })),
      }
    })
  },
  async getAuditLogs() {
    await pause()
    return [
      { id: 'audit_1', actor: { id: 'member_1', email: 'admin@lola.demo', name: 'Алексей' }, action: 'scenario.update', status: 'SUCCEEDED', resourceType: 'Scenario', resourceId: 'scn_1', metadata: {}, createdAt: new Date().toISOString() },
      { id: 'audit_2', actor: { id: 'member_1', email: 'admin@lola.demo', name: 'Алексей' }, action: 'message.send', status: 'SUCCEEDED', resourceType: 'EndUser', resourceId: 'usr_1', metadata: { channel: 'admin' }, createdAt: new Date(Date.now() - 18 * 60_000).toISOString() },
    ] satisfies AuditLog[]
  },
  async sendAdminMessage(_projectId, userId, message) {
    const data = readDemo()
    const user = data.users.find((item) => item.id === userId)
    if (!user) throw new Error('Пользователь не найден')
    const conversation = data.conversations.find((item) => item.userId === userId && item.status === 'ACTIVE')
      ?? { id: uid('conv'), userId, title: 'Сообщение администратора', status: 'ACTIVE' as const, lastMessageAt: new Date().toISOString(), messageCount: 0 }
    if (!data.conversations.some((item) => item.id === conversation.id)) data.conversations.unshift(conversation)
    const messageId = uid('msg')
    data.messages.push({ id: messageId, conversationId: conversation.id, author: 'ADMIN', text: message.text, status: 'COMPLETED', createdAt: new Date().toISOString() })
    conversation.messageCount += 1
    conversation.lastMessageAt = new Date().toISOString()
    writeDemo(data); await pause()
    return { duplicate: false, messageId, threadId: conversation.id, commandIds: message.actions?.map(() => uid('cmd')) ?? [], status: 'COMPLETED' }
  },
  async getStats(projectId) {
    const [project, scenarios, users, sessions] = await Promise.all([this.getProject(projectId), this.getScenarios(projectId), this.getUsers(projectId), this.getSessions(projectId)])
    return {
      users: project._count?.users ?? users.length,
      online: sessions.filter((item) => item.status === 'ONLINE').length,
      events: project._count?.eventLogs ?? 0,
      scenarios: scenarios.filter((item) => item.status === 'ACTIVE').length,
      conversations: 1942,
      ctaConversion: 18.6,
      integrationErrors: 0,
    }
  },
}
