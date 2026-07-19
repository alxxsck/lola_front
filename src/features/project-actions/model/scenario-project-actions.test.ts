import { describe, expect, it } from 'vitest'
import type { ScenarioActionDefinition } from '@/shared/types/domain'
import type { ProjectAction } from './project-action'
import {
  scenarioEligibleActionDefinitions,
  scenarioProjectActionAvailabilityIssue,
} from './scenario-project-actions'

const definition = (type: string): ScenarioActionDefinition => ({
  id: type, projectId: 'project-1', type, name: type, description: null, executor: 'FRONTEND',
  serverHandler: null, commandType: type, configSchema: { type: 'object', properties: {}, required: [] },
  uiSchema: { fields: [] }, enabled: true, builtIn: true, createdAt: 'now', updatedAt: 'now',
})

const projectAction = (code: string, overrides: Partial<ProjectAction> = {}): ProjectAction => ({
  id: `action-${code}`, projectId: 'project-1', actionTypeId: `type-${code}`, actionTypeRevisionId: `revision-${code}`,
  code, nameOverride: null, descriptionOverride: null, scenarioEnabled: true, aiEnabled: false,
  aiUsageDescription: null, configuration: {}, lifecycle: 'ACTIVE', createdAt: 'now', updatedAt: 'now',
  actionType: { key: code, origin: 'SYSTEM', ownerProjectId: null },
  actionTypeRevision: {
    id: `revision-${code}`, version: 1, name: code, description: code, executorAdapter: 'FRONTEND_COMMAND',
    inputSchema: {}, resultSchema: {}, projectConfigSchema: {}, uiSchema: {}, supportedSurfaces: ['SCENARIO'],
    risk: 'UI_EFFECT', confirmationPolicy: 'NEVER', multipleInstances: false,
  },
  ...overrides,
})

describe('Scenario Project Action projection', () => {
  it('admits only active scenario-enabled pinned actions and fails closed for unknown or AI-only types', () => {
    const definitions = ['OPEN_PAGE', 'AI_ONLY', 'DISABLED', 'UNKNOWN'].map(definition)
    const actions = [
      projectAction('OPEN_PAGE'),
      projectAction('AI_ONLY', { actionTypeRevision: { ...projectAction('AI_ONLY').actionTypeRevision, supportedSurfaces: ['AI'] } }),
      projectAction('DISABLED', { scenarioEnabled: false }),
    ]

    expect(scenarioEligibleActionDefinitions(definitions, actions).map((item) => item.type)).toEqual(['OPEN_PAGE'])
    expect(definitions.map((item) => item.type)).toEqual(['OPEN_PAGE', 'AI_ONLY', 'DISABLED', 'UNKNOWN'])
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
