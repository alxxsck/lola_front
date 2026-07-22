import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAuthSession,
  getAccessToken,
  getSelectedProjectId,
  storeAccessToken,
  storeSelectedProjectId,
} from './auth-session'

describe('auth session', () => {
  beforeEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
    localStorage.clear()
    clearAuthSession()
  })

  it('keeps the access token in memory and writes no auth token to browser storage', () => {
    storeAccessToken({ accessToken: 'access-secret', expiresIn: 60 })

    expect(getAccessToken()).toBe('access-secret')
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain('access-secret')
    expect(JSON.stringify(Object.values(localStorage))).not.toContain('access-secret')
  })

  it('persists only the non-secret selected Project', () => {
    storeSelectedProjectId('project-2')
    storeAccessToken({ accessToken: 'access-secret', expiresIn: 60 })

    expect(getSelectedProjectId()).toBe('project-2')
    expect(Object.values(sessionStorage)).toEqual(['project-2'])
  })

  it('drops an expired in-memory access token', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T10:00:00Z'))
    storeAccessToken({ accessToken: 'access', expiresIn: 1 })
    vi.advanceTimersByTime(1_100)

    expect(getAccessToken()).toBeNull()
  })

  it('clears project selection and scoped background-job state on logout', () => {
    storeSelectedProjectId('project-2')
    sessionStorage.setItem('lola:translation-jobs:project-2:scenario-1', '[]')

    clearAuthSession()

    expect(sessionStorage.length).toBe(0)
  })
})
