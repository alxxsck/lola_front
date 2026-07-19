import { beforeEach, describe, expect, it } from 'vitest'
import { demoActionDefinitions } from '@/shared/api/mock-data'
import { mockProjectActionsRepository } from './mock-project-actions-repository'

describe('mock Project Actions repository', () => {
  beforeEach(() => {
    localStorage.removeItem('lola-cms-demo-product-actions-v2')
    localStorage.removeItem('lola-cms-demo-data-v2')
  })

  it('keeps every enabled demo Scenario action available through Project Actions', async () => {
    const actions = await mockProjectActionsRepository.listProjectActions('prj_lola_demo')
    const scenarioCodes = new Set(actions
      .filter((action) => action.lifecycle === 'ACTIVE' && action.scenarioEnabled && action.actionTypeRevision.supportedSurfaces.includes('SCENARIO'))
      .map((action) => action.code))

    expect(demoActionDefinitions.filter((definition) => definition.enabled).map((definition) => definition.type))
      .toEqual(expect.arrayContaining([...scenarioCodes]))
    expect([...scenarioCodes]).toEqual(expect.arrayContaining(
      demoActionDefinitions.filter((definition) => definition.enabled).map((definition) => definition.type),
    ))
  })

  it('compiles preview targets from UI exposure changes persisted by the mock CMS', async () => {
    localStorage.setItem('lola-cms-demo-data-v2', JSON.stringify({
      elements: [{
        id: 'ui-custom', projectId: 'prj_lola_demo', code: 'rewards', name: 'Rewards', kind: 'PAGE',
        route: '/rewards', config: {}, enabled: true, aiEnabled: true,
        aiDescription: 'The user can review available rewards.', aiAliases: [],
      }],
    }))
    const actions = await mockProjectActionsRepository.listProjectActions('prj_lola_demo')
    const openPage = actions.find((action) => action.code === 'OPEN_PAGE')!
    await mockProjectActionsRepository.configure('prj_lola_demo', openPage.id, {
      scenarioEnabled: true,
      aiEnabled: true,
      aiUsageDescription: 'Use when the user asks to open their rewards page.',
      configuration: {},
      auditReason: 'Expose the registered rewards page',
    })

    const preview = await mockProjectActionsRepository.preview('prj_lola_demo', openPage.id)
    expect(preview.tool?.parameters).toMatchObject({
      properties: { page_code: { enum: ['rewards'] } },
    })
  })
})
