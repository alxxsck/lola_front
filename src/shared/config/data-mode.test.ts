import { afterEach, describe, expect, it, vi } from 'vitest'

describe('data mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('fails safe to API when the mode is missing or invalid', async () => {
    vi.stubEnv('VITE_DATA_MODE', '')
    expect((await import('./data-mode')).dataMode).toBe('api')
  })

  it('enables mock data only when explicitly requested', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    expect((await import('./data-mode')).dataMode).toBe('mock')
  })
})
