import { describe, expect, it } from 'vitest'

import { createDeliveryPolicyDraft, deliveryPolicySummary, deserializeDeliveryPolicy, serializeDeliveryPolicy } from './delivery-policy'

describe('Delivery Policy domain', () => {
  it.each([
    ['IMMEDIATE', { kind: 'IMMEDIATE' }],
    ['SKIP_IF_OFFLINE', { kind: 'SKIP_IF_OFFLINE' }],
    ['FAIL_IF_OFFLINE', { kind: 'FAIL_IF_OFFLINE' }],
  ] as const)('serializes %s without unrelated wait fields', (kind, expected) => {
    expect(serializeDeliveryPolicy({ ...createDeliveryPolicyDraft(), kind })).toEqual({ ok: true, value: expected })
  })

  it('serializes a finite online wait independently from Goal Deadline', () => {
    expect(serializeDeliveryPolicy({ kind: 'WAIT_UNTIL_ONLINE', expiryMs: 86_400_000, recheckEligibility: true })).toEqual({
      ok: true,
      value: { kind: 'WAIT_UNTIL_ONLINE', expiryMs: 86_400_000, recheckEligibility: true },
    })
  })

  it('rejects infinite and over-seven-day online waits', () => {
    expect(serializeDeliveryPolicy({ kind: 'WAIT_UNTIL_ONLINE', expiryMs: 0, recheckEligibility: false })).toMatchObject({ ok: false })
    expect(serializeDeliveryPolicy({ kind: 'WAIT_UNTIL_ONLINE', expiryMs: 7 * 86_400_000 + 1, recheckEligibility: false })).toMatchObject({ ok: false })
  })

  it('restores a published policy without trusting an unknown response shape', () => {
    expect(deserializeDeliveryPolicy({ kind: 'WAIT_UNTIL_ONLINE', expiryMs: 90_000, recheckEligibility: true })).toEqual({
      kind: 'WAIT_UNTIL_ONLINE', expiryMs: 90_000, recheckEligibility: true,
    })
    expect(deserializeDeliveryPolicy({ kind: 'FUTURE_POLICY', secret: true })).toEqual({ kind: 'IMMEDIATE' })
  })

  it.each([
    [1_000, '1 сек.'],
    [90_000, '1 мин. 30 сек.'],
    [5_400_000, '1 ч. 30 мин.'],
  ])('describes the exact finite wait %i without rounding it away', (expiryMs, label) => {
    expect(deliveryPolicySummary({ kind: 'WAIT_UNTIL_ONLINE', expiryMs, recheckEligibility: false })).toContain(label)
  })
})
