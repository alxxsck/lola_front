import { describe, expect, it } from 'vitest'
import { publicEmailActionHttp } from './email-action-http'

describe('public email action HTTP boundary', () => {
  it('does not attach browser credentials or an authorization default', () => {
    expect(publicEmailActionHttp.defaults.withCredentials).toBe(false)
    expect(publicEmailActionHttp.defaults.headers.common.Authorization).toBeUndefined()
  })
})
