import type {
  ActionConfigSchema,
  ActionExecutor,
  ActionUiField,
  ActiveSession,
  ActivityItem,
  Conversation,
  ConversationMessage,
  EndUser,
  EventDefinition,
  Project,
  Scenario,
  ScenarioActionDefinition,
  UiElement,
} from '@/shared/types/domain'

const now = Date.now()
const isoAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

export const demoProject: Project = {
  id: 'prj_lola_demo', name: 'Lucky Stars', slug: 'lucky_stars', status: 'ACTIVE',
  publicKey: 'lola_pub_demo_7f3b9', defaultLocale: 'ru', supportedLocales: ['ru', 'en'],
  assistantName: 'Lola', systemPrompt: 'Помогай пользователю коротко, дружелюбно и по существу.',
  settings: {
    description: 'AI-ассистент для онбординга и поддержки пользователей',
    timezone: 'Europe/Madrid',
    apiBaseUrl: 'https://api.lola.ai/api/v1',
    wsUrl: 'wss://api.lola.ai/assistant',
    allowedOrigins: ['https://luckystars.example'],
  },
  organization: { id: 'org_1', name: 'Lucky Group', slug: 'lucky_group' },
  _count: { users: 1284, scenarios: 4, eventLogs: 18742 },
}

const definitionDate = '2026-07-12T12:00:00.000Z'
const timeoutProperty = { type: 'integer' as const, minimum: 1000, maximum: 300000 }
const timeoutField: ActionUiField = { key: 'timeoutMs', label: 'Таймаут, мс', control: 'number' }

function demoActionDefinition(
  type: string,
  name: string,
  executor: ActionExecutor,
  properties: ActionConfigSchema['properties'] = {},
  required: string[] = [],
  fields: ActionUiField[] = [],
  description: string | null = null,
): ScenarioActionDefinition {
  const frontend = executor === 'FRONTEND'
  return {
    id: `action_definition_${type.toLowerCase()}`,
    projectId: demoProject.id,
    type,
    name,
    description,
    executor,
    serverHandler: executor === 'SERVER' ? type.toLowerCase() : null,
    commandType: frontend ? type : null,
    configSchema: {
      type: 'object',
      properties: frontend ? { ...properties, timeoutMs: timeoutProperty } : properties,
      required,
      additionalProperties: false,
    },
    uiSchema: { fields: frontend ? [...fields, timeoutField] : fields },
    enabled: true,
    builtIn: true,
    createdAt: definitionDate,
    updatedAt: definitionDate,
  }
}

export const demoActionDefinitions: ScenarioActionDefinition[] = [
  demoActionDefinition('ASK_CHOICE', 'Задать вопрос с вариантами', 'SERVER', {
    message: { type: 'string', minLength: 1, maxLength: 10000 },
    options: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object' } },
    timeoutMs: { type: 'integer', minimum: 1000, maximum: 86400000, default: 30000 },
    onTimeout: { type: 'string' },
    reminders: { type: 'array', maxItems: 10, items: { type: 'object' }, default: [] },
  }, ['message', 'options', 'timeoutMs', 'onTimeout'], [
    { key: 'message', label: 'Вопрос', control: 'textarea', supportsTemplates: true },
    { key: 'options', label: 'Варианты и ветки', control: 'json' },
    { key: 'timeoutMs', label: 'Timeout, мс', control: 'number' },
    { key: 'onTimeout', label: 'Ветка при timeout', control: 'text' },
    { key: 'reminders', label: 'Напоминания', control: 'json' },
  ], 'Показывает вопрос и переводит сценарий в выбранную ветку.'),
  demoActionDefinition('CONDITION', 'Условие', 'SERVER', {
    branches: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object' } },
    fallbackNodeKey: { type: 'string' },
  }, ['branches', 'fallbackNodeKey'], [
    { key: 'branches', label: 'Ветки', control: 'json' },
    { key: 'fallbackNodeKey', label: 'Fallback-ветка', control: 'text' },
  ], 'Выбирает первую совпавшую runtime-ветку.'),
  demoActionDefinition('SHOW_ASSISTANT', 'Показать Lola', 'FRONTEND', {}, [], [], 'Показывает виджет ассистента.'),
  demoActionDefinition('HIDE_ASSISTANT', 'Скрыть Lola', 'FRONTEND', {}, [], [], 'Скрывает виджет ассистента.'),
  demoActionDefinition('OPEN_CHAT', 'Открыть чат', 'FRONTEND'),
  demoActionDefinition('CLOSE_CHAT', 'Закрыть чат', 'FRONTEND'),
  demoActionDefinition('SAY', 'Сказать текст', 'SERVER',
    { text: { type: 'string', minLength: 1 } }, ['text'],
    [{ key: 'text', label: 'Сообщение от Lola', control: 'textarea', supportsTemplates: true }]),
  demoActionDefinition('PLAY_ANIMATION', 'Проиграть анимацию', 'FRONTEND',
    { animation: { type: 'string', enum: ['greeting', 'excited', 'win_small', 'spin', 'pointing'] } }, ['animation'],
    [{ key: 'animation', label: 'Анимация', control: 'select', allowCustom: true, options: ['greeting', 'excited', 'win_small', 'spin', 'pointing'] }]),
  demoActionDefinition('HIGHLIGHT_ELEMENT', 'Подсветить элемент', 'FRONTEND',
    { target: { type: 'string', minLength: 1 }, style: { type: 'string', enum: ['pulse', 'glow', 'outline'] }, durationMs: { type: 'integer', minimum: 0 } }, ['target'],
    [
      { key: 'target', label: 'Элемент', control: 'target', targetKinds: ['ELEMENT', 'BUTTON'] },
      { key: 'style', label: 'Стиль', control: 'select' },
      { key: 'durationMs', label: 'Длительность, мс', control: 'number' },
    ]),
  demoActionDefinition('REMOVE_HIGHLIGHT', 'Убрать подсветку', 'FRONTEND',
    { target: { type: 'string', minLength: 1 } }, ['target'],
    [{ key: 'target', label: 'Элемент', control: 'target', targetKinds: ['ELEMENT', 'BUTTON'] }]),
  demoActionDefinition('SHOW_CTA', 'Показать кнопку', 'FRONTEND',
    {
      label: { type: 'string', minLength: 1 },
      action: { type: 'string', enum: ['none', 'open_page', 'open_modal'] },
      pageId: { type: 'string' },
      modalId: { type: 'string' },
    },
    ['label', 'action'],
    [
      { key: 'label', label: 'Текст кнопки', control: 'text' },
      { key: 'action', label: 'Действие по клику', control: 'select', options: ['none', 'open_page', 'open_modal'] },
      { key: 'pageId', label: 'Страница', control: 'target', targetKinds: ['PAGE'], visibleWhen: { action: 'open_page' } },
      { key: 'modalId', label: 'Модальное окно', control: 'target', targetKinds: ['MODAL'], visibleWhen: { action: 'open_modal' } },
    ]),
  demoActionDefinition('OPEN_PAGE', 'Открыть страницу', 'FRONTEND',
    { pageId: { type: 'string', minLength: 1 } }, ['pageId'],
    [{ key: 'pageId', label: 'Страница', control: 'target', targetKinds: ['PAGE'] }]),
  demoActionDefinition('OPEN_MODAL', 'Открыть модальное окно', 'FRONTEND',
    { modalId: { type: 'string', minLength: 1 } }, ['modalId'],
    [{ key: 'modalId', label: 'Модальное окно', control: 'target', targetKinds: ['MODAL'] }]),
  demoActionDefinition('WAIT_FOR', 'Подождать', 'SERVER',
    { durationMs: { type: 'integer', minimum: 0 } }, ['durationMs'],
    [{ key: 'durationMs', label: 'Длительность, мс', control: 'number' }]),
  demoActionDefinition('TRACK', 'Записать событие', 'SERVER',
    { eventCode: { type: 'string', minLength: 1 }, payload: { type: 'object' } }, ['eventCode'],
    [{ key: 'eventCode', label: 'Код события', control: 'event' }, { key: 'payload', label: 'Данные', control: 'json' }]),
  demoActionDefinition('COMPLETE_SCENARIO', 'Завершить сценарий', 'SERVER',
    { result: { type: 'string' } }, [], [{ key: 'result', label: 'Результат завершения', control: 'text' }]),
]

export const demoElements: UiElement[] = [
  { id: 'ui_1', projectId: demoProject.id, code: 'deposit_button', name: 'Кнопка пополнения', kind: 'BUTTON', selector: "[data-lola-action='deposit']", config: { actions: ['highlight', 'scroll_to'] }, enabled: true },
  { id: 'ui_2', projectId: demoProject.id, code: 'verification_button', name: 'Пройти верификацию', kind: 'BUTTON', selector: "[data-lola-action='verification']", config: {}, enabled: true },
  { id: 'ui_3', projectId: demoProject.id, code: 'bonuses_page', name: 'Бонусы', kind: 'PAGE', route: '/bonuses', config: { direct: true }, enabled: true },
  { id: 'ui_4', projectId: demoProject.id, code: 'account_page', name: 'Личный кабинет', kind: 'PAGE', route: '/account', config: { direct: true }, enabled: true },
  { id: 'ui_5', projectId: demoProject.id, code: 'deposit_modal', name: 'Пополнение баланса', kind: 'MODAL', handler: 'openDepositModal', config: { fallback: '/account?lola_modal=deposit' }, enabled: true },
]

export const demoEvents: EventDefinition[] = [
  { id: 'evt_1', projectId: demoProject.id, code: 'registration_completed', name: 'Регистрация завершена', description: 'Пользователь завершил регистрацию', version: 1, payloadSchema: { type: 'object', properties: { language: { type: 'string' }, country: { type: 'string' } }, required: ['language'] }, enabled: true },
  { id: 'evt_2', projectId: demoProject.id, code: 'deposit_failed', name: 'Ошибка пополнения', description: 'Пополнение не прошло', version: 1, payloadSchema: { type: 'object', properties: { reason: { type: 'string' }, amount: { type: 'number' } }, required: ['reason'] }, enabled: true },
  { id: 'evt_3', projectId: demoProject.id, code: 'email_confirmation_required', name: 'Нужно подтвердить почту', version: 1, payloadSchema: { type: 'object', properties: { email: { type: 'string' } }, required: [] }, enabled: false },
]

export const demoScenarios: Scenario[] = [
  { id: 'scn_1', projectId: demoProject.id, code: 'after_registration', name: 'После регистрации', description: 'Помочь сделать первый депозит', eventDefinitionId: 'evt_1', status: 'ACTIVE', priority: 100, conditions: [], cooldownSeconds: 86400, maxRunsPerUser: 1, actions: [
    { id: 'act_1', position: 0, type: 'SHOW_ASSISTANT', config: {} },
    { id: 'act_2', position: 1, type: 'PLAY_ANIMATION', config: { animation: 'greeting' } },
    { id: 'act_3', position: 2, type: 'SAY', config: { text: 'Регистрация завершена. Давайте сделаем следующий шаг.' } },
    { id: 'act_4', position: 3, type: 'HIGHLIGHT_ELEMENT', config: { target: 'deposit_button' } },
    { id: 'act_5', position: 4, type: 'SHOW_CTA', config: { label: 'Пополнить баланс', action: 'open_modal', modalId: 'deposit_modal' } },
  ] },
  { id: 'scn_2', projectId: demoProject.id, code: 'deposit_recovery', name: 'Помощь при ошибке оплаты', description: 'Подсказать альтернативный способ', eventDefinitionId: 'evt_2', status: 'DRAFT', priority: 80, conditions: [], actions: [
    { position: 0, type: 'SAY', config: { text: 'Похоже, платеж не прошел. Помочь разобраться?' } },
    { position: 1, type: 'SHOW_CTA', config: { label: 'Посмотреть инструкцию', action: 'open_page', pageId: 'bonuses_page' } },
  ] },
]

export const demoUsers: EndUser[] = [
  { id: 'usr_1', projectId: demoProject.id, externalId: 'user_89421', isGuest: false, locale: 'ru', segment: 'new_user', profile: { name: 'Анна Смирнова', email: 'anna@example.com', country: 'ES' }, attributes: { depositCount: 0 }, preferences: {}, lastSeenAt: isoAgo(0), createdAt: isoAgo(8400) },
  { id: 'usr_2', projectId: demoProject.id, externalId: 'user_11603', isGuest: false, locale: 'en', segment: 'vip', profile: { name: 'Marco Silva', email: 'marco@example.com', country: 'PT' }, attributes: { depositCount: 12 }, preferences: {}, lastSeenAt: isoAgo(2), createdAt: isoAgo(28000) },
  { id: 'usr_3', projectId: demoProject.id, externalId: 'guest_7721', isGuest: true, locale: 'ru', segment: 'guest', profile: { name: 'Гость #7721', country: 'DE' }, attributes: {}, preferences: {}, lastSeenAt: isoAgo(18), createdAt: isoAgo(90) },
  { id: 'usr_4', projectId: demoProject.id, externalId: 'user_53187', isGuest: false, locale: 'ru', segment: 'returning', profile: { name: 'Иван Петров', email: 'ivan@example.com', country: 'RU' }, attributes: { depositCount: 2 }, preferences: {}, lastSeenAt: isoAgo(1440), createdAt: isoAgo(55000) },
]

export const demoSessions: ActiveSession[] = [
  { id: 'ses_1', userId: 'usr_1', externalId: 'user_89421', userName: 'Анна Смирнова', currentPage: '/account', device: 'Chrome · macOS', startedAt: isoAgo(24), lastSeenAt: isoAgo(0), status: 'ONLINE' },
  { id: 'ses_2', userId: 'usr_2', externalId: 'user_11603', userName: 'Marco Silva', currentPage: '/bonuses', device: 'Safari · iOS', startedAt: isoAgo(11), lastSeenAt: isoAgo(2), status: 'ONLINE' },
  { id: 'ses_3', userId: 'usr_3', externalId: 'guest_7721', userName: 'Гость #7721', currentPage: '/', device: 'Chrome · Android', startedAt: isoAgo(26), lastSeenAt: isoAgo(18), status: 'STALE' },
]

export const demoActivity: ActivityItem[] = [
  { id: 'log_1', userId: 'usr_1', type: 'EVENT', title: 'registration_completed', description: 'language: ru, country: ES', timestamp: isoAgo(8), status: 'accepted' },
  { id: 'log_2', userId: 'usr_1', type: 'SCENARIO', title: 'После регистрации', description: 'Сценарий запущен событием регистрации', timestamp: isoAgo(7), status: 'running' },
  { id: 'log_3', userId: 'usr_1', type: 'MESSAGE', title: 'Сообщение Lola', description: 'Регистрация завершена. Давайте сделаем следующий шаг.', timestamp: isoAgo(6), status: 'delivered' },
  { id: 'log_4', userId: 'usr_2', type: 'COMMAND', title: 'PLAY_ANIMATION', description: 'Анимация celebrating', timestamp: isoAgo(3), status: 'delivered' },
]

export const demoConversations: Conversation[] = [
  { id: 'conv_1', userId: 'usr_1', title: 'Первый депозит', status: 'ACTIVE', lastMessageAt: isoAgo(5), messageCount: 5 },
  { id: 'conv_2', userId: 'usr_1', title: 'Знакомство с Lola', status: 'ARCHIVED', lastMessageAt: isoAgo(1200), messageCount: 4 },
  { id: 'conv_3', userId: 'usr_2', title: 'Бонусы и программа лояльности', status: 'ACTIVE', lastMessageAt: isoAgo(26), messageCount: 3 },
]

export const demoMessages: ConversationMessage[] = [
  { id: 'msg_1', conversationId: 'conv_1', author: 'SCENARIO', text: 'Регистрация завершена. Давайте сделаем следующий шаг.', status: 'COMPLETED', createdAt: isoAgo(7) },
  { id: 'msg_2', conversationId: 'conv_1', author: 'USER', text: 'Как лучше пополнить баланс?', status: 'COMPLETED', createdAt: isoAgo(6) },
  { id: 'msg_3', conversationId: 'conv_1', author: 'ASSISTANT', text: 'Откройте личный кабинет и выберите удобный способ. Я могу подсветить нужную кнопку.', status: 'COMPLETED', createdAt: isoAgo(5) },
  { id: 'msg_4', conversationId: 'conv_1', author: 'ADMIN', text: 'Анна, нужна помощь с первым шагом?', status: 'COMPLETED', createdAt: isoAgo(1) },
  { id: 'msg_5', conversationId: 'conv_2', author: 'ASSISTANT', text: 'Привет! Я Lola и помогу быстро освоиться.', status: 'COMPLETED', createdAt: isoAgo(1200) },
  { id: 'msg_6', conversationId: 'conv_3', author: 'USER', text: 'Какие бонусы доступны сегодня?', status: 'COMPLETED', createdAt: isoAgo(28) },
  { id: 'msg_7', conversationId: 'conv_3', author: 'ASSISTANT', text: 'Сейчас проверю активные предложения для вашего сегмента.', status: 'COMPLETED', createdAt: isoAgo(27) },
]
