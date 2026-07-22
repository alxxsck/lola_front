import { describe, expect, it } from 'vitest'
import {
  canConfigureProjectActions,
  createProjectActionDraft,
  toConfigureProjectActionInput,
  validateProjectActionDraft,
} from './project-action'
import type { ProjectAction } from './project-action'

const action = {
  id: 'action-1',
  projectId: 'project-1',
  actionTypeId: 'type-1',
  actionTypeRevisionId: 'revision-1',
  code: 'OPEN_PAGE',
  nameOverride: null,
  descriptionOverride: null,
  scenarioEnabled: false,
  aiEnabled: false,
  aiUsageDescription: null,
  configuration: {},
  lifecycle: 'ACTIVE',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  actionType: { key: 'OPEN_PAGE', origin: 'SYSTEM', ownerProjectId: null },
  actionTypeRevision: {
    id: 'revision-1',
    version: 1,
    name: 'Открыть страницу',
    description: 'Открывает зарегистрированную страницу.',
    executorAdapter: 'FRONTEND_COMMAND',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    resultSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    projectConfigSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    uiSchema: { fields: [] },
    supportedSurfaces: ['SCENARIO'],
    risk: 'UI_EFFECT',
    confirmationPolicy: 'NEVER',
    multipleInstances: false,
  },
} satisfies ProjectAction

const managePermissions = ['project.actions.manage']
const allPermissions = [
  'project.actions.manage',
  'project.actions.manage_ai_exposure',
]

describe('Project Action draft', () => {
  it('keeps surface switches independent and rejects an unsupported surface', () => {
    const draft = createProjectActionDraft(action)
    draft.scenarioEnabled = true
    draft.aiEnabled = true

    expect(validateProjectActionDraft(action, draft, allPermissions)).toEqual([
      expect.objectContaining({ field: 'aiEnabled', code: 'ACTION_SURFACE_UNSUPPORTED' }),
    ])
    expect(draft.scenarioEnabled).toBe(true)
  })

  it('requires an effective description and audit reason when AI exposure is enabled', () => {
    const aiAction: ProjectAction = {
      ...action,
      actionTypeRevision: {
        ...action.actionTypeRevision,
        supportedSurfaces: ['SCENARIO', 'AI'],
      },
    }
    const draft = createProjectActionDraft(aiAction)
    draft.aiEnabled = true
    draft.aiUsageDescription = 'Open it'

    expect(validateProjectActionDraft(aiAction, draft, allPermissions)).toEqual([
      expect.objectContaining({ field: 'aiUsageDescription', code: 'AI_ACTION_DESCRIPTION_INVALID' }),
      expect.objectContaining({ field: 'auditReason', code: 'AI_ACTION_AUDIT_REASON_REQUIRED' }),
    ])
  })

  it('uses the exact manage Permission without a role fallback', () => {
    const draft = createProjectActionDraft(action)
    draft.scenarioEnabled = true

    expect(canConfigureProjectActions(managePermissions)).toBe(true)
    expect(canConfigureProjectActions([])).toBe(false)
    expect(validateProjectActionDraft(action, draft, [])).toEqual([
      expect.objectContaining({ field: 'form', code: 'PROJECT_ACTION_MANAGE_PERMISSION_REQUIRED' }),
    ])
  })

  it('requires a reason when an AI allowlist is broadened but not when it is narrowed', () => {
    const aiAction: ProjectAction = {
      ...action,
      aiEnabled: true,
      aiUsageDescription: 'Use when the user explicitly asks to open a registered page.',
      configuration: { pageCodes: ['home', 'bonuses'] },
      actionTypeRevision: { ...action.actionTypeRevision, supportedSurfaces: ['AI'] },
    }
    const narrowed = createProjectActionDraft(aiAction)
    narrowed.configuration = { pageCodes: ['home'] }
    const broadened = createProjectActionDraft(aiAction)
    broadened.configuration = { pageCodes: ['home', 'bonuses', 'support'] }

    expect(validateProjectActionDraft(aiAction, narrowed, allPermissions)).toEqual([])
    expect(validateProjectActionDraft(aiAction, broadened, allPermissions)).toEqual([
      expect.objectContaining({ field: 'auditReason', code: 'AI_ACTION_AUDIT_REASON_REQUIRED' }),
    ])
  })

  it('builds a bounded backend command and removes editor-only whitespace', () => {
    const aiAction: ProjectAction = {
      ...action,
      actionTypeRevision: { ...action.actionTypeRevision, supportedSurfaces: ['AI'] },
    }
    const draft = createProjectActionDraft(aiAction)
    draft.aiEnabled = true
    draft.aiUsageDescription = '  Use when the user explicitly asks to open bonuses.  '
    draft.auditReason = '  Enable requested bonuses navigation  '

    expect(toConfigureProjectActionInput(draft)).toEqual({
      scenarioEnabled: false,
      aiEnabled: true,
      aiUsageDescription: 'Use when the user explicitly asks to open bonuses.',
      configuration: {},
      auditReason: 'Enable requested bonuses navigation',
    })
  })
})
