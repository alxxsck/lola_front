import { describe, expect, it } from 'vitest'
import { buildEventLogFilters, eventPayloadHighlights } from './event-logs'

describe('event log presentation', () => {
  it('builds bounded API filters and omits empty values', () => {
    const filters = buildEventLogFilters({ eventCode: 'deposit', externalUserId: ' user-1 ', source: 'FRONTEND', status: '', receivedFrom: '', receivedTo: '', occurredFrom: '', occurredTo: '', limit: 25 })
    expect(filters).toEqual({ eventCode: 'deposit', externalUserId: 'user-1', source: 'FRONTEND', limit: 25 })
  })

  it('keeps arbitrary payloads compact in the list', () => {
    expect(eventPayloadHighlights({ amount: 25, route: '/wallet', nested: { source: 'banner' }, hidden: true })).toEqual([
      { key: 'amount', value: '25' },
      { key: 'route', value: '/wallet' },
      { key: 'nested', value: '{"source":"banner"}' },
    ])
  })
})
