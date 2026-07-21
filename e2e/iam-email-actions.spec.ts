import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'

test.skip(process.env.VITE_DATA_MODE !== 'api', 'IAM network fixtures require the API-mode frontend adapter')

const capabilities = {
  invitation: 'lia_00000000-0000-4000-8000-000000000001.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  verification: 'lev_00000000-0000-4000-8000-000000000002.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  change: 'lec_00000000-0000-4000-8000-000000000003.CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
}

type CapturedRequest = {
  method: string
  path: string
  body: unknown
  headers: Record<string, string>
  pageUrl: string
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Cache-Control': 'no-store, no-transform',
      'Referrer-Policy': 'no-referrer',
      'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify(body),
  })
}

async function installFixture(
  page: Page,
  responses: Record<string, { status?: number; body: unknown }>,
) {
  const requests: CapturedRequest[] = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    requests.push({
      method: request.method(),
      path,
      body: request.postDataJSON(),
      headers: request.headers(),
      pageUrl: page.url(),
    })
    const response = responses[`${request.method()} ${path}`]
    if (!response) return json(route, { error: { code: 'UNHANDLED_FIXTURE', message: path } }, 501)
    return json(route, response.body, response.status)
  })
  return requests
}

async function installRefreshCookie(context: BrowserContext) {
  await context.addCookies([{
    name: 'lola_cms_refresh',
    value: 'refresh-secret-that-must-not-be-sent',
    domain: '127.0.0.1',
    path: '/api/v1/auth/refresh',
    httpOnly: true,
    sameSite: 'Strict',
    secure: false,
  }])
}

async function expectCapabilityAbsent(page: Page, token: string) {
  const state = await page.evaluate(() => ({
    href: location.href,
    localStorage: Object.values(localStorage),
    sessionStorage: Object.values(sessionStorage),
  }))
  expect(JSON.stringify(state)).not.toContain(token)
  expect(state.href).not.toMatch(/#|token=/u)
}

test('verification link is inert until POST and sends no browser credentials or referrer', async ({ page, context }) => {
  await installRefreshCookie(context)
  const requests = await installFixture(page, {
    'POST /api/v1/auth/email-verifications/consume': { body: { verified: true } },
  })

  await page.goto(`/auth/email-verification#token=${capabilities.verification}`)

  await expect(page).toHaveURL('http://127.0.0.1:4173/auth/email-verification')
  await expect(page.getByRole('heading', { name: 'Подтвердите email' })).toBeVisible()
  expect(requests).toEqual([])
  await expectCapabilityAbsent(page, capabilities.verification)

  await page.getByRole('button', { name: 'Подтвердить email' }).click()
  await expect(page.getByRole('heading', { name: 'Email подтверждён' })).toBeVisible()

  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/auth/email-verifications/consume',
    body: { token: capabilities.verification },
    pageUrl: 'http://127.0.0.1:4173/auth/email-verification',
  })
  expect(requests[0]!.headers.authorization).toBeUndefined()
  expect(requests[0]!.headers.cookie).toBeUndefined()
  expect(requests[0]!.headers.referer).toBeUndefined()
  await expectCapabilityAbsent(page, capabilities.verification)
})

test('email change exposes a generic invalid-link state without refresh retry or secret echo', async ({ page }) => {
  const requests = await installFixture(page, {
    'POST /api/v1/auth/email-change/consume': {
      status: 401,
      body: { error: { code: 'EMAIL_CAPABILITY_INVALID', message: `expired ${capabilities.change}` } },
    },
  })

  await page.goto(`/auth/email-change#token=${capabilities.change}`)
  expect(requests).toEqual([])
  await page.getByRole('button', { name: 'Изменить email' }).click()

  await expect(page.getByText('Ссылка недействительна или уже использована. Запросите новое письмо.')).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(capabilities.change)
  expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
    'POST /api/v1/auth/email-change/consume',
  ])
  await expectCapabilityAbsent(page, capabilities.change)
})

test('email change success is explicit and leaves the canonical-safe completion state', async ({ page }) => {
  const requests = await installFixture(page, {
    'POST /api/v1/auth/email-change/consume': { body: { changed: true } },
  })

  await page.goto(`/auth/email-change#token=${capabilities.change}`)
  await page.getByRole('button', { name: 'Изменить email' }).click()

  await expect(page.getByRole('heading', { name: 'Email изменён' })).toBeVisible()
  expect(requests).toHaveLength(1)
  await expectCapabilityAbsent(page, capabilities.change)
})

test('emailed invitation and setup never receive the exact-path refresh cookie', async ({ page, context }) => {
  const setupToken = 'lps_setup-capability-from-email'
  const permanentPassword = 'correct horse battery staple'
  await installRefreshCookie(context)
  const requests = await installFixture(page, {
    'POST /api/v1/auth/email-invitations/consume': {
      body: {
        kind: 'PASSWORD_SETUP_REQUIRED',
        setupToken,
        expiresAt: '2026-07-22T10:00:00.000Z',
      },
    },
    'POST /api/v1/auth/password/setup': {
      body: {
        kind: 'PASSWORD_ESTABLISHED',
        cmsUserId: '00000000-0000-4000-8000-000000000001',
        status: 'ACTIVE',
        next: 'LOGIN',
      },
    },
  })

  await page.goto(`/auth/initial-access#token=${capabilities.invitation}`)
  expect(requests).toEqual([])
  await page.getByRole('button', { name: 'Продолжить настройку' }).click()

  await expect(page).toHaveURL('http://127.0.0.1:4173/password/setup')
  await expect(page.getByRole('heading', { name: 'Создайте постоянный пароль' })).toBeVisible()
  await page.getByLabel('Новый пароль', { exact: true }).fill(permanentPassword)
  await page.getByLabel('Повторите новый пароль').fill(permanentPassword)
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expect(page).toHaveURL('http://127.0.0.1:4173/login')
  const browserState = await page.evaluate(() => JSON.stringify({
    href: location.href,
    localStorage: Object.values(localStorage),
    sessionStorage: Object.values(sessionStorage),
  }))
  expect(browserState).not.toContain(capabilities.invitation)
  expect(browserState).not.toContain(setupToken)
  expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
    'POST /api/v1/auth/email-invitations/consume',
    'POST /api/v1/auth/password/setup',
  ])
  expect(requests.map(({ headers }) => headers.cookie)).toEqual([undefined, undefined])
  expect(requests.map(({ headers }) => headers.authorization)).toEqual([undefined, undefined])
})
