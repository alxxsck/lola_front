import { describe, expect, it } from 'vitest'
import type { ProjectAction } from './project-action'
import {
  projectScenarioActionCatalog,
  scenarioAvailableActions,
  scenarioProjectActionAvailabilityIssue,
} from './scenario-project-actions'

const projectAction = (code: string, overrides: Partial<ProjectAction> = {}): ProjectAction => ({
  id: `action-${code}`, projectId: 'project-1', actionTypeId: `type-${code}`, actionTypeRevisionId: `revision-${code}`,
  code, nameOverride: null, descriptionOverride: null, scenarioEnabled: true, aiEnabled: false,
  aiUsageDescription: null, configuration: {}, lifecycle: 'ACTIVE', createdAt: 'now', updatedAt: 'now',
  actionType: { key: code, origin: 'SYSTEM', ownerProjectId: null },
  actionTypeRevision: {
    id: `revision-${code}`, version: 1, name: code, description: code, executorAdapter: 'FRONTEND_COMMAND',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    resultSchema: {}, projectConfigSchema: {}, uiSchema: { fields: [] }, supportedSurfaces: ['SCENARIO'],
    risk: 'UI_EFFECT', confirmationPolicy: 'NEVER', multipleInstances: false,
  },
  ...overrides,
})

describe('Scenario Project Action projection', () => {
  it('projects pinned Project Action revisions into the scenario editor catalog', () => {
    const actions = [
      projectAction('SHOW_ASSISTANT', {
        nameOverride: 'Показать помощника',
      }),
      projectAction('SAY', {
        actionTypeRevision: {
          ...projectAction('SAY').actionTypeRevision,
          executorAdapter: 'SERVER_HANDLER',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
          uiSchema: {
            fields: [{ key: 'text', label: 'Текст', control: 'textarea' }],
          },
        },
      }),
    ]

    expect(projectScenarioActionCatalog(actions).catalog).toEqual([
      expect.objectContaining({
        id: 'revision-SHOW_ASSISTANT',
        type: 'SHOW_ASSISTANT',
        name: 'Показать помощника',
        executor: 'FRONTEND',
        enabled: true,
        configSchema: expect.objectContaining({ properties: {} }),
        uiSchema: { fields: [] },
      }),
      expect.objectContaining({
        id: 'revision-SAY',
        type: 'SAY',
        executor: 'SERVER',
        configSchema: expect.objectContaining({ required: ['text'] }),
      }),
    ])
  })

  it('admits only active scenario-enabled pinned actions and fails closed for unknown or AI-only types', () => {
    const actions = [
      projectAction('OPEN_PAGE'),
      projectAction('AI_ONLY', {
        actionTypeRevision: {
          ...projectAction('AI_ONLY').actionTypeRevision,
          inputSchema: {
            type: 'object',
            properties: { prompt: { type: 'string' } },
            required: ['prompt'],
          },
          supportedSurfaces: ['AI'],
        },
      }),
      projectAction('DISABLED', { scenarioEnabled: false }),
    ]

    const catalog = projectScenarioActionCatalog(actions).catalog
    expect(catalog.map((item) => item.type))
      .toEqual(['OPEN_PAGE', 'DISABLED'])
    expect(scenarioAvailableActions(catalog).map((item) => item.type))
      .toEqual(['OPEN_PAGE'])
  })

  it('returns an explicit projection error instead of throwing into page rendering', () => {
    const actions = [
      projectAction('BROKEN', {
        actionTypeRevision: {
          ...projectAction('BROKEN').actionTypeRevision,
          inputSchema: {
            type: 'object',
            properties: { target: { type: 'string' } },
            required: ['target'],
          },
          uiSchema: { fields: [] },
        },
      }),
    ]

    expect(projectScenarioActionCatalog(actions)).toMatchObject({
      catalog: [],
      error: expect.objectContaining({
        message: expect.stringContaining('missing fields: target'),
      }),
    })
  })

  it('explains why an existing node is unavailable without deleting it', () => {
    const actions = [
      projectAction('OPEN_PAGE'),
      projectAction('AI_ONLY', { actionTypeRevision: { ...projectAction('AI_ONLY').actionTypeRevision, supportedSurfaces: ['AI'] } }),
      projectAction('DISABLED', { scenarioEnabled: false }),
      projectAction('ARCHIVED', { lifecycle: 'ARCHIVED' }),
    ]

    expect(scenarioProjectActionAvailabilityIssue('OPEN_PAGE', actions)).toBeNull()
    expect(scenarioProjectActionAvailabilityIssue('AI_ONLY', actions)).toContain('не поддерживает сценарии')
    expect(scenarioProjectActionAvailabilityIssue('DISABLED', actions)).toContain('выключено для сценариев')
    expect(scenarioProjectActionAvailabilityIssue('ARCHIVED', actions)).toContain('архивировано')
    expect(scenarioProjectActionAvailabilityIssue('UNKNOWN', actions)).toContain('не зарегистрировано')
  })
})
