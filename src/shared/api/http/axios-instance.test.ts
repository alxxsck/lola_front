import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthSession, storeTokens } from './auth-session'
import { axiosInstance, beginAuthTeardown, endAuthTeardown, registerRefreshHandler } from './axios-instance'

function response(config: InternalAxiosRequestConfig, status: number): AxiosResponse {
  return { data: status === 200 ? { ok: true } : { message: 'Unauthorized' }, status, statusText: '', headers: {}, config }
}

function reject(config: InternalAxiosRequestConfig, status: number): never {
  throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, response(config, status))
}

describe('axios auth lifecycle', () => {
  beforeEach(() => {
    endAuthTeardown()
    sessionStorage.clear()
    clearAuthSession()
  })

  it('uses one refresh for parallel 401 responses and retries with the new token', async () => {
    storeTokens({ accessToken: 'stale', expiresIn: 60, refreshToken: 'refresh', refreshExpiresIn: 120 })
    let refreshCount = 0
    registerRefreshHandler(async () => {
      refreshCount += 1
      await Promise.resolve()
      storeTokens({ accessToken: 'fresh', expiresIn: 60, refreshToken: 'rotated', refreshExpiresIn: 120 })
    })
    const attempts = new Map<string, number>()
    const retryAuthorizations: string[] = []
    axiosInstance.defaults.adapter = async (config) => {
      const key = config.url ?? ''
      const attempt = (attempts.get(key) ?? 0) + 1
      attempts.set(key, attempt)
      if (attempt === 1) reject(config, 401)
      retryAuthorizations.push(String(AxiosHeaders.from(config.headers).get('Authorization') ?? ''))
      return response(config, 200)
    }

    await Promise.all([axiosInstance.get('/first'), axiosInstance.get('/second')])

    expect(refreshCount).toBe(1)
    expect(retryAuthorizations).toEqual(['Bearer fresh', 'Bearer fresh'])
  })

  it('retries a request at most once', async () => {
    storeTokens({ accessToken: 'stale', expiresIn: 60, refreshToken: 'refresh', refreshExpiresIn: 120 })
    const refresh = vi.fn(async () => {
      storeTokens({ accessToken: 'fresh', expiresIn: 60, refreshToken: 'rotated', refreshExpiresIn: 120 })
    })
    registerRefreshHandler(refresh)
    let attempts = 0
    axiosInstance.defaults.adapter = async (config) => {
      attempts += 1
      return reject(config, 401)
    }

    await expect(axiosInstance.get('/protected')).rejects.toMatchObject({ status: 401 })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(attempts).toBe(2)
  })

  it('does not enter a refresh loop for the refresh endpoint', async () => {
    storeTokens({ accessToken: 'stale', expiresIn: 60, refreshToken: 'refresh', refreshExpiresIn: 120 })
    const refresh = vi.fn()
    registerRefreshHandler(refresh)
    axiosInstance.defaults.adapter = async (config) => reject(config, 401)

    await expect(axiosInstance.post('/api/v1/auth/refresh')).rejects.toMatchObject({ status: 401 })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does not refresh or retry requests while logout teardown is active', async () => {
    storeTokens({ accessToken: 'stale', expiresIn: 60, refreshToken: 'refresh', refreshExpiresIn: 120 })
    const refresh = vi.fn()
    registerRefreshHandler(refresh)
    let attempts = 0
    axiosInstance.defaults.adapter = async (config) => {
      attempts += 1
      return reject(config, 401)
    }
    beginAuthTeardown()

    await expect(axiosInstance.post('/api/v1/auth/logout')).rejects.toMatchObject({ status: 401 })

    expect(refresh).not.toHaveBeenCalled()
    expect(attempts).toBe(1)
  })
})
