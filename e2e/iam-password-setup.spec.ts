import { expect, test, type Page, type Route } from '@playwright/test'

const identifier = 'operator@example.com'
const initialAccessSecret = 'lia_initial-access-secret'
const setupToken = 'lps_setup-capability'
const permanentPassword = 'correct horse battery staple'

test.skip(process.env.VITE_DATA_MODE !== 'api', 'IAM network fixtures require the API-mode frontend adapter')

type IamFixtureState = {
  setupRequests: Array<{ authorization?: string; body: Record<string, unknown> }>
}

function json(route: Route, body: unknown, status = 200, headers?: Record<string, string>) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  })
}

async function installIamFixtures(page: Page): Promise<IamFixtureState> {
  const state: IamFixtureState = { setupRequests: [] }
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (request.method() === 'POST' && path === '/api/v1/auth/login') {
      const body = request.postDataJSON() as { identifier?: string; secret?: string }
      if (body.identifier === identifier && body.secret === initialAccessSecret) {
        return json(route, {
          kind: 'PASSWORD_SETUP_REQUIRED',
          setupToken,
          expiresAt: '2026-07-21T12:10:00.000Z',
        }, 200, { 'Cache-Control': 'no-store, no-transform' })
      }
      if (body.identifier === identifier && body.secret === permanentPassword) {
        return json(route, {
          kind: 'AUTHENTICATED',
          tokenType: 'Bearer',
          accessToken: 'cms_access-token',
          expiresIn: 900,
          refreshExpiresIn: 3_600,
          user: { id: '00000000-0000-4000-8000-000000000001', email: identifier, displayName: 'Olga Operator' },
        }, 200, { 'Cache-Control': 'no-store, no-transform' })
      }
      return json(route, { error: { code: 'AUTHENTICATION_FAILED', message: 'Authentication failed' } }, 401)
    }

    if (request.method() === 'POST' && path === '/api/v1/auth/password/setup') {
      const body = request.postDataJSON() as Record<string, unknown>
      state.setupRequests.push({ authorization: request.headers().authorization, body })
      return json(route, {
        kind: 'PASSWORD_ESTABLISHED',
        cmsUserId: '00000000-0000-4000-8000-000000000001',
        status: 'ACTIVE',
        next: 'LOGIN',
      }, 200, { 'Cache-Control': 'no-store, no-transform' })
    }

    if (request.method() === 'GET' && path === '/api/v1/admin/projects') return json(route, [])
    if (request.method() === 'GET' && path === '/api/v1/auth/me') {
      return json(route, {
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email: identifier,
          displayName: 'Olga Operator',
        },
        platformPermissionCodes: [],
        projects: [],
      })
    }

    return json(route, { message: `Unhandled IAM fixture: ${request.method()} ${path}` }, 501)
  })
  return state
}

async function enterInitialAccess(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(identifier)
  await page.getByLabel('Пароль или секрет первоначального доступа').fill(initialAccessSecret)
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/password\/setup$/)
}

async function expectSetupSecretsAbsent(page: Page) {
  const browserState = await page.evaluate(() => ({
    url: window.location.href,
    localStorage: Object.values(localStorage),
    sessionStorage: Object.values(sessionStorage),
  }))
  const serialized = JSON.stringify(browserState)
  expect(serialized).not.toContain(initialAccessSecret)
  expect(serialized).not.toContain(setupToken)
  expect(browserState.url).not.toContain('token=')
}

test('Initial Access requires password setup and a separate ordinary login', async ({ page }) => {
  const fixture = await installIamFixtures(page)
  await enterInitialAccess(page)

  await expectSetupSecretsAbsent(page)
  await page.getByLabel('Новый пароль', { exact: true }).fill(permanentPassword)
  await page.getByLabel('Повторите новый пароль').fill(permanentPassword)
  await page.getByLabel('Повторите новый пароль').press('Enter')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Пароль сохранён. Теперь войдите с новым паролем.')).toBeVisible()
  await expectSetupSecretsAbsent(page)
  expect(fixture.setupRequests).toEqual([{
    authorization: undefined,
    body: { setupToken, newPassword: permanentPassword, passwordConfirmation: permanentPassword },
  }])

  await page.getByLabel('Email', { exact: true }).fill(identifier)
  await page.getByLabel('Пароль или секрет первоначального доступа').fill(permanentPassword)
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/settings\/security$/)
})

test('cancel and browser Back clear the memory-only setup capability', async ({ page }) => {
  await installIamFixtures(page)
  await enterInitialAccess(page)
  await page.getByLabel('Новый пароль', { exact: true }).fill(permanentPassword)

  await page.getByRole('button', { name: 'Отмена' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expectSetupSecretsAbsent(page)
  await page.goForward()
  await expect(page).toHaveURL(/\/login$/)

  await enterInitialAccess(page)
  await page.goBack()
  await expect(page).toHaveURL(/\/login$/)
  await expectSetupSecretsAbsent(page)
})

test('reload forgets setup state without persisting the capability', async ({ page }) => {
  await installIamFixtures(page)
  await enterInitialAccess(page)

  await page.reload()

  await expect(page).toHaveURL(/\/login$/)
  await expectSetupSecretsAbsent(page)
})
