import { expect, test, type Page, type Route } from '@playwright/test'

test.skip(process.env.VITE_DATA_MODE !== 'api', 'IAM network fixtures require the API-mode frontend adapter')

const accessTokens = ['cms_access_login_secret', 'cms_access_restore_secret', 'cms_access_password_secret']
const refreshCapabilities = ['lrf_cookie_login_secret', 'lrf_cookie_rotated_secret', 'lrf_cookie_password_secret']
const currentSessionId = '00000000-0000-4000-8000-000000000010'
const otherSessionId = '00000000-0000-4000-8000-000000000020'

function json(route: Route, body: unknown, status = 200, headers?: Record<string, string>) {
  return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
}

function authenticated(accessToken: string) {
  return {
    kind: 'AUTHENTICATED',
    tokenType: 'Bearer',
    accessToken,
    expiresIn: 900,
    refreshExpiresIn: 86_400,
    user: { id: 'user-1', email: 'operator@example.com', displayName: 'Оператор' },
  }
}

async function installFixtures(page: Page) {
  const refreshBodies: Array<string | null> = []
  const passwordBodies: unknown[] = []
  const revokedSessionIds: string[] = []
  let refreshIndex = 0
  let loggedIn = false
  let currentRevoked = false
  let sessions = [
    {
      id: currentSessionId,
      current: true,
      device: 'Chrome · macOS',
      createdAt: '2026-07-21T10:00:00.000Z',
      lastSeenAt: '2026-07-21T10:05:00.000Z',
      expiresAt: '2026-07-22T10:00:00.000Z',
    },
    {
      id: otherSessionId,
      current: false,
      device: 'Firefox · Windows',
      createdAt: '2026-07-21T09:00:00.000Z',
      lastSeenAt: '2026-07-21T09:05:00.000Z',
      expiresAt: '2026-07-22T09:00:00.000Z',
    },
  ]
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && path === '/api/v1/auth/login') {
      loggedIn = true
      return json(route, authenticated(accessTokens[0]!), 200, {
        'Set-Cookie': `lola_cms_refresh=${refreshCapabilities[0]}; HttpOnly; Path=/api/v1/auth; SameSite=Strict`,
      })
    }
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      refreshBodies.push(request.postData())
      if (!loggedIn || currentRevoked) {
        return json(route, { error: { code: 'AUTHENTICATION_FAILED', message: 'Authentication failed' } }, 401, {
          'Set-Cookie': 'lola_cms_refresh=; HttpOnly; Path=/api/v1/auth; Max-Age=0; SameSite=Strict',
        })
      }
      const accessToken = accessTokens[Math.min(refreshIndex + 1, 1)]!
      refreshIndex += 1
      return json(route, authenticated(accessToken), 200, {
        'Set-Cookie': `lola_cms_refresh=${refreshCapabilities[1]}; HttpOnly; Path=/api/v1/auth; SameSite=Strict`,
      })
    }
    if (request.method() === 'GET' && path === '/api/v1/auth/me') {
      return json(route, {
        user: { id: 'user-1', email: 'operator@example.com', displayName: 'Оператор' },
        platformPermissionCodes: [],
        projects: [],
      })
    }
    if (request.method() === 'GET' && path === '/api/v1/auth/me/sessions') {
      return json(route, { sessions })
    }
    if (request.method() === 'GET' && path === '/api/v1/auth/me/mfa') {
      return json(route, { passkeys: [], recoveryCodesRemaining: 0 })
    }
    if (request.method() === 'DELETE' && path.startsWith('/api/v1/auth/me/sessions/')) {
      const sessionId = path.split('/').at(-1)!
      revokedSessionIds.push(sessionId)
      sessions = sessions.filter(({ id }) => id !== sessionId)
      currentRevoked ||= sessionId === currentSessionId
      return json(route, { success: true }, 200, currentRevoked ? {
        'Set-Cookie': 'lola_cms_refresh=; HttpOnly; Path=/api/v1/auth; Max-Age=0; SameSite=Strict',
      } : undefined)
    }
    if (request.method() === 'POST' && path === '/api/v1/auth/me/sessions/revoke-others') {
      sessions = sessions.filter(({ current }) => current)
      return json(route, { success: true })
    }
    if (request.method() === 'POST' && path === '/api/v1/auth/password/change') {
      passwordBodies.push(request.postDataJSON())
      sessions = sessions.filter(({ current }) => current)
      return json(route, authenticated(accessTokens[2]!), 200, {
        'Set-Cookie': `lola_cms_refresh=${refreshCapabilities[2]}; HttpOnly; Path=/api/v1/auth; SameSite=Strict`,
      })
    }
    return json(route, { error: { code: 'UNHANDLED_FIXTURE', message: `${request.method()} ${path}` } }, 501)
  })
  return { refreshBodies, passwordBodies, revokedSessionIds }
}

async function expectNoAuthSecrets(page: Page) {
  const state = await page.evaluate(() => ({
    url: location.href,
    cookie: document.cookie,
    localStorage: Object.values(localStorage),
    sessionStorage: Object.values(sessionStorage),
  }))
  const serialized = JSON.stringify(state)
  for (const secret of [...accessTokens, ...refreshCapabilities]) expect(serialized).not.toContain(secret)
  expect(state.url).not.toMatch(/token|secret/iu)
  expect(state.cookie).not.toContain('lola_cms_refresh')
}

test('cookie rotation restores reload and security actions never persist auth tokens', async ({ page, context }) => {
  const fixture = await installFixtures(page)
  page.on('dialog', (dialog) => dialog.accept())

  await page.goto('/login')
  fixture.refreshBodies.length = 0
  await page.getByLabel('Email', { exact: true }).fill('operator@example.com')
  await page.getByLabel('Пароль или секрет первоначального доступа').fill('permanent passphrase')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/settings\/security$/)
  await expectNoAuthSecrets(page)

  const [cookieAfterLogin] = await context.cookies('http://127.0.0.1:4173/api/v1/auth/refresh')
  expect(cookieAfterLogin).toMatchObject({ name: 'lola_cms_refresh', httpOnly: true, sameSite: 'Strict' })

  await page.reload()
  await expect(page).toHaveURL(/\/settings\/security$/)
  expect(fixture.refreshBodies).toEqual([null])
  const [cookieAfterRestore] = await context.cookies('http://127.0.0.1:4173/api/v1/auth/refresh')
  expect(cookieAfterRestore?.value).toBe(refreshCapabilities[1])
  await expectNoAuthSecrets(page)

  await page.goto('/settings/security')
  await expect(page.getByRole('heading', { name: 'Пароль и активные сессии' })).toBeVisible()
  await expect(page.getByText('Chrome · macOS')).toBeVisible()
  await expect(page.getByText('Firefox · Windows')).toBeVisible()

  await page.getByRole('button', { name: 'Завершить остальные' }).click()
  await expect(page.getByText('Все остальные сессии завершены.')).toBeVisible()
  await expect(page.getByText('Firefox · Windows')).toBeHidden()

  await page.locator('.password-form').getByLabel('Текущий пароль', { exact: true }).fill('old password')
  await page.getByLabel('Новый пароль', { exact: true }).fill('new secure passphrase')
  await page.getByLabel('Повторите новый пароль').fill('new secure passphrase')
  await page.getByRole('button', { name: 'Сохранить новый пароль' }).click()
  await expect(page.getByText('Пароль изменён. Остальные сессии завершены.')).toBeVisible()
  expect(fixture.passwordBodies).toEqual([{
    currentPassword: 'old password',
    newPassword: 'new secure passphrase',
    passwordConfirmation: 'new secure passphrase',
  }])
  const [cookieAfterPasswordChange] = await context.cookies('http://127.0.0.1:4173/api/v1/auth/refresh')
  expect(cookieAfterPasswordChange?.value).toBe(refreshCapabilities[2])
  await expectNoAuthSecrets(page)

  await page.getByRole('button', { name: 'Завершить текущую сессию Chrome · macOS' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(fixture.revokedSessionIds).toEqual([currentSessionId])
  await expectNoAuthSecrets(page)
})
