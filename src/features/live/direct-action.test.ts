import { describe, expect, it } from 'vitest'
import { buildDirectActions, resolveIdempotencyAttempt } from './direct-action'

const input = { type: 'COMMAND', label: '', action: 'OPEN_PAGE', target: 'home', animation: 'greeting' }

describe('direct admin action contract', () => {
  it('uses backend target keys for page and modal commands', () => {
    expect(buildDirectActions(input)).toEqual([{ type: 'OPEN_PAGE', config: { pageId: 'home' } }])
    expect(buildDirectActions({ ...input, action: 'OPEN_MODAL', target: 'deposit' }))
      .toEqual([{ type: 'OPEN_MODAL', config: { modalId: 'deposit' } }])
  })

  it('uses lowercase CTA action and its matching target key', () => {
    expect(buildDirectActions({ ...input, type: 'BUTTON', label: ' Open ', action: 'OPEN_PAGE' }))
      .toEqual([{ type: 'SHOW_CTA', config: { label: 'Open', action: 'open_page', pageId: 'home' } }])
    expect(buildDirectActions({ ...input, type: 'BUTTON', label: 'Open', action: 'OPEN_MODAL', target: 'deposit' }))
      .toEqual([{ type: 'SHOW_CTA', config: { label: 'Open', action: 'open_modal', modalId: 'deposit' } }])
    expect(buildDirectActions({ ...input, type: 'BUTTON', label: 'Open', action: 'HIGHLIGHT_ELEMENT' })).toBeUndefined()
  })

  it('retains a key for an uncertain retry and rotates it after the payload changes', () => {
    const first = resolveIdempotencyAttempt('payload-a', null, () => 'key-a')
    expect(resolveIdempotencyAttempt('payload-a', first, () => 'must-not-run')).toBe(first)
    expect(resolveIdempotencyAttempt('payload-b', first, () => 'key-b')).toEqual({ fingerprint: 'payload-b', key: 'key-b' })
  })
})
