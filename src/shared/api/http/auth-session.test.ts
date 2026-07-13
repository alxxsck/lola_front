import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  getSelectedProjectId,
  storeSelectedProjectId,
  storeTokens,
} from './auth-session'

describe('auth session', () => {
  beforeEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
    clearAuthSession()
  })

  it('keeps access token in memory and refresh token in session storage', () => {
    storeTokens({ accessToken: 'access', expiresIn: 60, refreshToken: 'refresh', refreshExpiresIn: 120 })

    expect(getAccessToken()).toBe('access')
    expect(getRefreshToken()).toBe('refresh')
    expect(sessionStorage.getItem('lola-cms-auth-v1')).not.toContain('access')
  })

  it('preserves the selected project when tokens rotate', () => {
    storeTokens({ accessToken: 'a1', expiresIn: 60, refreshToken: 'r1', refreshExpiresIn: 120 })
    storeSelectedProjectId('project-2')
    storeTokens({ accessToken: 'a2', expiresIn: 60, refreshToken: 'r2', refreshExpiresIn: 120 })

    expect(getSelectedProjectId()).toBe('project-2')
    expect(getRefreshToken()).toBe('r2')
  })

  it('drops an expired refresh session', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T10:00:00Z'))
    storeTokens({ accessToken: 'access', expiresIn: 1, refreshToken: 'refresh', refreshExpiresIn: 1 })
    vi.advanceTimersByTime(1_100)

    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
})
