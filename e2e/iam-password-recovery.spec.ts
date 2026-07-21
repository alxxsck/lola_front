import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'

test.skip(process.env.VITE_DATA_MODE !== 'api', 'IAM network fixtures require the API-mode frontend adapter')

const resetToken = 'lpr_00000000-0000-4000-8000-000000000004.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'
const refreshSecret = 'refresh-secret-that-must-only-reach-refresh'

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
    value: refreshSecret,
    domain: '127.0.0.1',
    path: '/api/v1/auth/refresh',
    httpOnly: true,
    sameSite: 'Strict',
    secure: false,
  }])
}

async function browserState(page: Page) {
  return page.evaluate(() => ({
    href: location.href,
    body: document.body.innerText,
    localStorage: Object.values(localStorage),
    sessionStorage: Object.values(sessionStorage),
  }))
}

test('request UI is enumeration-neutral and sends no session credential or referrer', async ({ page, context }) => {
  await installRefreshCookie(context)
  const externalOrigins = new Set<string>()
  page.on('request', (request) => {
    const origin = new URL(request.url()).origin
    if (origin !== 'http://127.0.0.1:4173' && origin !== 'http://127.0.0.1:3000') externalOrigins.add(origin)
  })
  const requests = await installFixture(page, {
    'POST /api/v1/auth/password-reset/requests': { status: 202, body: { accepted: true } },
  })
  const successCopies: string[] = []

  for (const email of ['known@example.com', 'unknown@example.com']) {
    await page.goto('/forgot-password')
    expect(requests).toHaveLength(successCopies.length)
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Отправить ссылку' }).click()
    const success = page.getByText('Если аккаунт подходит для восстановления, письмо отправлено.')
    await expect(success).toBeVisible()
    successCopies.push(await success.innerText())
    expect((await browserState(page)).body).not.toContain(email)
  }

  expect(successCopies[0]).toBe(successCopies[1])
  expect(requests).toHaveLength(2)
  for (const request of requests) {
    expect(request).toMatchObject({
      method: 'POST',
      path: '/api/v1/auth/password-reset/requests',
      pageUrl: 'http://127.0.0.1:4173/forgot-password',
    })
    expect(request.headers.authorization).toBeUndefined()
    expect(request.headers.cookie).toBeUndefined()
    expect(request.headers.referer).toBeUndefined()
  }
  expect(externalOrigins).toEqual(new Set())
})

test('reset GET is inert and completion keeps capability, passwords, and refresh cookie isolated', async ({ page, context }) => {
  const password = 'correct horse battery staple'
  await installRefreshCookie(context)
  const requests = await installFixture(page, {
    'POST /api/v1/auth/password-reset/complete': {
      body: { kind: 'PASSWORD_RESET_COMPLETED', next: 'LOGIN' },
    },
  })

  await page.goto(`/auth/password-reset#token=${resetToken}`)

  await expect(page).toHaveURL('http://127.0.0.1:4173/auth/password-reset')
  await expect(page.getByRole('heading', { name: 'Создайте новый пароль' })).toBeVisible()
  expect(requests).toEqual([])
  expect(JSON.stringify(await browserState(page))).not.toContain(resetToken)

  await page.getByLabel('Новый пароль', { exact: true }).fill(password)
  await page.getByLabel('Повторите новый пароль').fill(password)
  await page.getByRole('button', { name: 'Изменить пароль' }).click()

  await expect(page).toHaveURL('http://127.0.0.1:4173/login?passwordReset=success')
  await expect(page.getByText('Пароль изменён. Войдите с новым паролем.')).toBeVisible()
  const completion = requests.find(({ path }) => path === '/api/v1/auth/password-reset/complete')
  expect(completion).toMatchObject({
    method: 'POST',
    path: '/api/v1/auth/password-reset/complete',
    body: { token: resetToken, newPassword: password, passwordConfirmation: password },
    pageUrl: 'http://127.0.0.1:4173/auth/password-reset',
  })
  expect(completion?.headers.authorization).toBeUndefined()
  expect(completion?.headers.cookie).toBeUndefined()
  expect(completion?.headers.referer).toBeUndefined()

  expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
    'POST /api/v1/auth/password-reset/complete',
  ])
  const state = JSON.stringify(await browserState(page))
  expect(state).not.toContain(resetToken)
  expect(state).not.toContain(password)
  expect(state).not.toContain(refreshSecret)
})

test('invalid reset capability produces one generic state without secret echo or refresh retry', async ({ page, context }) => {
  const password = 'correct horse battery staple'
  await installRefreshCookie(context)
  const requests = await installFixture(page, {
    'POST /api/v1/auth/password-reset/complete': {
      status: 401,
      body: {
        error: {
          code: 'PASSWORD_RESET_CAPABILITY_INVALID',
          message: `expired ${resetToken} for password ${password}`,
        },
      },
    },
  })

  await page.goto(`/auth/password-reset#token=${resetToken}`)
  await page.getByLabel('Новый пароль', { exact: true }).fill(password)
  await page.getByLabel('Повторите новый пароль').fill(password)
  await page.getByRole('button', { name: 'Изменить пароль' }).click()

  await expect(page.getByText('Ссылка недействительна или уже использована. Запросите новое письмо.')).toBeVisible()
  const state = JSON.stringify(await browserState(page))
  expect(state).not.toContain(resetToken)
  expect(state).not.toContain(password)
  expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
    'POST /api/v1/auth/password-reset/complete',
  ])
  expect(requests[0]?.headers.cookie).toBeUndefined()
  expect(requests[0]?.headers.authorization).toBeUndefined()
  expect(requests[0]?.headers.referer).toBeUndefined()
})
