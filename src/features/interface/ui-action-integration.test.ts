import { describe, expect, it } from 'vitest'
import { buildUiActionIntegrationGuide, isUiElementInSection } from './ui-action-integration'

describe('UI action integration guide', () => {
  it('groups legacy buttons and new elements in the Elements section', () => {
    expect(isUiElementInSection('BUTTON', 'ELEMENT')).toBe(true)
    expect(isUiElementInSection('ELEMENT', 'ELEMENT')).toBe(true)
    expect(isUiElementInSection('PAGE', 'ELEMENT')).toBe(false)
  })

  it('describes the concrete page callback values and shared router handler', () => {
    const guide = buildUiActionIntegrationGuide({
      code: 'account_page',
      kind: 'PAGE',
      route: '/account?source=lola',
    })

    expect(guide).toContain('pageCode: "account_page"')
    expect(guide).toContain('route: "/account?source=lola"')
    expect(guide).toContain('openPage: async ({ route }) =>')
    expect(guide).toContain('await router.push(route)')
    expect(guide).toContain('один раз для всех страниц')
  })

  it('describes the concrete modal callback values and warns against function lookup', () => {
    const guide = buildUiActionIntegrationGuide({
      code: 'deposit_modal',
      kind: 'MODAL',
      modalName: 'deposit',
    })

    expect(guide).toContain('modalCode: "deposit_modal"')
    expect(guide).toContain('modalName: "deposit"')
    expect(guide).toContain('openModal: ({ modalName }) => modalRegistry.open(modalName)')
    expect(guide).toContain('Не используйте `eval`')
  })

  it('does not produce misleading instructions without a canonical binding', () => {
    expect(buildUiActionIntegrationGuide({ code: 'legacy_modal', kind: 'MODAL' })).toBeNull()
    expect(buildUiActionIntegrationGuide({ code: 'deposit_element', kind: 'ELEMENT' })).toBeNull()
  })
})
