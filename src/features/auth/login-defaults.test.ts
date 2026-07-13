import { describe, expect, it } from 'vitest'
import { loginDefaults } from './login-defaults'

describe('login defaults', () => {
  it('prefills demo credentials only in explicit mock mode', () => {
    expect(loginDefaults('mock')).toEqual({ login: 'admin@lola.ai', password: 'demo-owner' })
    expect(loginDefaults('api')).toEqual({ login: '', password: '' })
  })
})
