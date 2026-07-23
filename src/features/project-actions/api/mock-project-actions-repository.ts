import { demoElements, demoProject, demoScenarioActionCatalog } from '@/shared/api/mock-data'
import type {
  ActionTypeCatalogItem,
  AiCapabilityPreview,
  ConfigureProjectActionInput,
  ProjectAction,
} from '../model/project-action'
import type { ProjectActionsRepository } from './project-actions-repository'
import { ASSISTANT_ANIMATIONS } from '@/shared/domain/assistant-animations'

const STORAGE_KEY = 'lola-cms-demo-product-actions-v2'
const DEMO_DATA_KEY = 'lola-cms-demo-data-v2'
const now = '2026-07-19T12:00:00.000Z'

interface DemoProductActionDefinition {
  code: string
  name: string
  description: string
  surfaces: Array<'SCENARIO' | 'AI'>
  inputSchema: Record<string, unknown>
  uiSchema: Record<string, unknown>
  ai: boolean
}

const curatedDefinitions: DemoProductActionDefinition[] = [
  {
    code: 'SHOW_ASSISTANT', name: 'Показать Lola', description: 'Показывает или восстанавливает виджет Lola.',
    surfaces: ['SCENARIO', 'AI'], inputSchema: closedSchema(), uiSchema: { fields: [] }, ai: false,
  },
  {
    code: 'PLAY_ANIMATION', name: 'Проиграть анимацию', description: 'Запускает поддерживаемую клиентом анимацию Lola.',
    surfaces: ['SCENARIO', 'AI'], inputSchema: closedSchema({ animation: { type: 'string', enum: [...ASSISTANT_ANIMATIONS] } }, ['animation']), uiSchema: { fields: [{ key: 'animation', label: 'Анимация', control: 'select', options: [...ASSISTANT_ANIMATIONS] }] }, ai: false,
  },
  {
    code: 'HIGHLIGHT_ELEMENT', name: 'Подсветить элемент', description: 'Визуально подсвечивает зарегистрированный элемент продукта.',
    surfaces: ['SCENARIO', 'AI'], inputSchema: closedSchema({ target: { type: 'string' } }, ['target']), uiSchema: { fields: [{ key: 'target', label: 'Элемент', control: 'target', targetKinds: ['ELEMENT', 'BUTTON'] }] }, ai: false,
  },
  {
    code: 'OPEN_PAGE', name: 'Открыть страницу', description: 'Переходит на зарегистрированную страницу продукта.',
    surfaces: ['SCENARIO', 'AI'], inputSchema: closedSchema({ page_code: { type: 'string' } }, ['page_code']), uiSchema: { fields: [{ key: 'page_code', label: 'Страница', control: 'target', targetKinds: ['PAGE'] }] }, ai: false,
  },
  {
    code: 'OPEN_MODAL', name: 'Открыть модальное окно', description: 'Открывает зарегистрированное модальное окно продукта.',
    surfaces: ['SCENARIO', 'AI'], inputSchema: closedSchema({ modal_code: { type: 'string' } }, ['modal_code']), uiSchema: { fields: [{ key: 'modal_code', label: 'Модальное окно', control: 'target', targetKinds: ['MODAL'] }] }, ai: false,
  },
  {
    code: 'SAY', name: 'Сказать текст', description: 'Добавляет реплику ассистента в сценарий.',
    surfaces: ['SCENARIO'], inputSchema: closedSchema({ text: { type: 'string', minLength: 1, maxLength: 10000 } }, ['text']), uiSchema: { fields: [{ key: 'text', label: 'Текст', control: 'textarea' }] }, ai: false,
  },
]

const curatedCodes = new Set(curatedDefinitions.map((definition) => definition.code))
const scenarioCatalogItemByCode = new Map(demoScenarioActionCatalog.map((item) => [item.type, item]))
const definitions: DemoProductActionDefinition[] = [
  ...curatedDefinitions,
  ...demoScenarioActionCatalog
    .filter((item) => !curatedCodes.has(item.type))
    .map((item) => ({
      code: item.type,
      name: item.name,
      description: item.description ?? `Системное действие ${item.type}.`,
      surfaces: ['SCENARIO' as const],
      inputSchema: item.configSchema as unknown as Record<string, unknown>,
      uiSchema: item.uiSchema as unknown as Record<string, unknown>,
      ai: false,
    })),
]

const catalog: ActionTypeCatalogItem[] = definitions.map((definition, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  key: definition.code,
  origin: 'SYSTEM',
  ownerProjectId: null,
  activeRevisionId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  activeRevision: revision(definition, index),
}))

function initialActions(): ProjectAction[] {
  return catalog.map((type, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    projectId: demoProject.id,
    actionTypeId: type.id,
    actionTypeRevisionId: type.activeRevision!.id,
    code: type.key,
    nameOverride: null,
    descriptionOverride: null,
    scenarioEnabled: true,
    aiEnabled: definitions[index]!.ai,
    aiUsageDescription: definitions[index]!.ai
      ? 'Use when the user explicitly asks to open the bonuses page or review available rewards.'
      : null,
    configuration: {},
    lifecycle: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    actionType: { key: type.key, origin: 'SYSTEM', ownerProjectId: null },
    actionTypeRevision: type.activeRevision!,
  }))
}

export const mockProjectActionsRepository: ProjectActionsRepository = {
  async listActionTypes() {
    return structuredClone(catalog)
  },
  async listProjectActions() {
    return readActions()
  },
  async configure(_projectId, actionId, input) {
    const actions = readActions()
    const index = actions.findIndex((action) => action.id === actionId)
    if (index < 0) throw new Error('Действие проекта не найдено')
    const current = actions[index]!
    assertDemoInput(current, input)
    const saved: ProjectAction = {
      ...current,
      ...input,
      aiUsageDescription: input.aiUsageDescription === undefined ? current.aiUsageDescription : input.aiUsageDescription,
      configuration: input.configuration ?? current.configuration,
      updatedAt: new Date().toISOString(),
    }
    actions.splice(index, 1, saved)
    writeActions(actions)
    return structuredClone(saved)
  },
  async archive(_projectId, actionId) {
    const actions = readActions()
    const index = actions.findIndex((action) => action.id === actionId)
    if (index < 0) throw new Error('Действие проекта не найдено')
    const saved: ProjectAction = { ...actions[index]!, lifecycle: 'ARCHIVED', scenarioEnabled: false, aiEnabled: false, updatedAt: new Date().toISOString() }
    actions.splice(index, 1, saved)
    writeActions(actions)
    return structuredClone(saved)
  },
  async preview(_projectId, actionId) {
    const action = readActions().find((item) => item.id === actionId)
    if (!action) throw new Error('Действие проекта не найдено')
    if (!action.aiEnabled) return { tool: null, issues: [{ code: 'AI_ACTION_DISABLED', message: 'AI surface is disabled' }] }
    const parameters = demoParameters(action)
    if (!parameters) return { tool: null, issues: [{ code: 'AI_ACTION_TARGETS_UNAVAILABLE', message: 'No safe AI targets are enabled' }] }
    return {
      tool: {
        type: 'function',
        name: `lola_${action.code.toLowerCase()}`,
        description: action.aiUsageDescription!,
        parameters,
        strict: true,
      },
      issues: [],
    } satisfies AiCapabilityPreview
  },
}

function readActions(): ProjectAction[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return structuredClone(initialActions())
  try { return JSON.parse(raw) as ProjectAction[] } catch { return structuredClone(initialActions()) }
}

function writeActions(actions: ProjectAction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(actions))
}

function assertDemoInput(action: ProjectAction, input: ConfigureProjectActionInput) {
  if (input.aiEnabled && !action.actionTypeRevision.supportedSurfaces.includes('AI')) throw new Error('AI surface не поддерживается')
  if (input.scenarioEnabled && !action.actionTypeRevision.supportedSurfaces.includes('SCENARIO')) throw new Error('Scenario surface не поддерживается')
  if (input.aiEnabled && (input.aiUsageDescription?.trim().length ?? 0) < 20) throw new Error('Описание для AI слишком короткое')
  if (!action.aiEnabled && input.aiEnabled && (input.auditReason?.trim().length ?? 0) < 10) throw new Error('Нужна причина включения AI')
}

function demoParameters(action: ProjectAction): Record<string, unknown> | null {
  const schema = structuredClone(action.actionTypeRevision.inputSchema)
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
  if (!properties) return schema
  const targetField = Object.keys(properties).find((key) => key.endsWith('_code') || key === 'target')
  if (!targetField) return schema
  const targets = persistedDemoElements().filter((item) => item.enabled && item.aiEnabled)
  if (!targets.length) return null
  properties[targetField] = { ...properties[targetField], enum: targets.map((item) => item.code) }
  return schema
}

function persistedDemoElements(): typeof demoElements {
  const raw = localStorage.getItem(DEMO_DATA_KEY)
  if (!raw) return demoElements
  try {
    const parsed = JSON.parse(raw) as { elements?: typeof demoElements }
    return Array.isArray(parsed.elements) ? parsed.elements : demoElements
  } catch {
    return demoElements
  }
}

function revision(definition: DemoProductActionDefinition, index: number) {
  const scenarioCatalogItem = scenarioCatalogItemByCode.get(definition.code)
  const serverAction = scenarioCatalogItem?.executor === 'SERVER'
  return {
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    version: 1,
    name: definition.name,
    description: definition.description,
    executorAdapter: serverAction ? 'SERVER_HANDLER' as const : 'FRONTEND_COMMAND' as const,
    inputSchema: definition.inputSchema,
    resultSchema: closedSchema({ status: { type: 'string' } }, ['status']),
    projectConfigSchema: closedSchema(),
    uiSchema: definition.uiSchema,
    supportedSurfaces: [...definition.surfaces],
    risk: mockRisk(definition.code, serverAction),
    confirmationPolicy: definition.code === 'START_VOICE_CONVERSATION' ? 'WHEN_REQUIRED' : 'NEVER',
    multipleInstances: false,
    publishedAt: now,
  }
}

function mockRisk(code: string, serverAction: boolean): string {
  if (!serverAction) return 'UI_EFFECT'
  if (code === 'SAY' || code === 'START_VOICE_CONVERSATION') return 'CONVERSATION_EFFECT'
  if (code === 'TRACK') return 'EVENT_WRITE'
  return 'SCENARIO_CONTROL'
}

function closedSchema(properties: Record<string, unknown> = {}, required: string[] = []) {
  return { type: 'object', properties, required, additionalProperties: false }
}
