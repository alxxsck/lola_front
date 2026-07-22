import { expect, test, type Page, type Route } from '@playwright/test'

test.skip(process.env.VITE_DATA_MODE !== 'api', 'IAM network fixtures require the API-mode frontend adapter')

const identifier = 'platform-operator@example.com'
const password = 'a permanent platform passphrase'
const loginCapability = 'lmf_login-memory-only'
const optionsCapability = 'lmf_enrollment-options'
const authCapability = 'lmf_authentication-memory-only'
const recoveryCodes = ['lrc_one-time-one', 'lrc_one-time-two']

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store, no-transform' },
    body: JSON.stringify(body),
  })
}

async function installMfaFixtures(page: Page) {
  let enrolled = false
  let credentialId = ''
  const completions: unknown[] = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && path === '/api/v1/auth/login') {
      return json(route, enrolled ? {
        kind: 'MFA_REQUIRED',
        ceremonyToken: authCapability,
        expiresAt: '2026-07-21T22:15:00.000Z',
        recoveryAvailable: true,
        publicKey: {
          challenge: 'YXV0aGVudGljYXRpb24tY2hhbGxlbmdl',
          rpId: 'localhost',
          allowCredentials: [{ id: credentialId, type: 'public-key' }],
          timeout: 60_000,
          userVerification: 'required',
        },
      } : {
        kind: 'MFA_ENROLLMENT_REQUIRED',
        ceremonyToken: loginCapability,
        expiresAt: '2026-07-21T22:10:00.000Z',
      })
    }
    if (request.method() === 'POST' && path === '/api/v1/auth/mfa/passkeys/enrollment/options') {
      expect(request.postDataJSON()).toEqual({ ceremonyToken: loginCapability })
      return json(route, {
        kind: 'MFA_ENROLLMENT_REQUIRED',
        ceremonyToken: optionsCapability,
        expiresAt: '2026-07-21T22:10:00.000Z',
        publicKey: {
          challenge: 'cmVnaXN0cmF0aW9uLWNoYWxsZW5nZQ',
          rp: { id: 'localhost', name: 'Lola' },
          user: {
            id: 'cGxhdGZvcm0tb3BlcmF0b3I',
            name: identifier,
            displayName: 'Platform Operator',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          timeout: 60_000,
          attestation: 'none',
          authenticatorSelection: {
            residentKey: 'required',
            requireResidentKey: true,
            userVerification: 'required',
          },
        },
      })
    }
    if (request.method() === 'POST' && path === '/api/v1/auth/mfa/passkeys/enrollment/complete') {
      const body = request.postDataJSON() as { ceremonyToken: string; credential: { id: string } }
      completions.push(body)
      expect(body.ceremonyToken).toBe(optionsCapability)
      credentialId = body.credential.id
      enrolled = true
      return json(route, { kind: 'MFA_ENROLLED', passkeyId: 'passkey-1', recoveryCodes })
    }
    if (request.method() === 'POST' && path === '/api/v1/auth/mfa/passkeys/authentication/complete') {
      const body = request.postDataJSON() as { ceremonyToken: string; credential: { id: string } }
      completions.push(body)
      expect(body.ceremonyToken).toBe(authCapability)
      expect(body.credential.id).toBe(credentialId)
      return json(route, {
        kind: 'AUTHENTICATED', tokenType: 'Bearer', accessToken: 'cms_access_mfa',
        expiresIn: 900, refreshExpiresIn: 3600,
        user: { id: 'operator-1', email: identifier, displayName: 'Platform Operator' },
      })
    }
    if (request.method() === 'GET' && path === '/api/v1/auth/me') {
      return json(route, {
        user: { id: 'operator-1', email: identifier, displayName: 'Platform Operator' },
        platformPermissionCodes: ['platform.projects.read'],
        projects: [],
      })
    }
    return json(route, { error: { code: 'UNHANDLED_FIXTURE', message: `${request.method()} ${path}` } }, 501)
  })
  return completions
}

async function login(page: Page) {
  await page.goto('http://localhost:4173/login')
  await page.getByLabel('Email', { exact: true }).fill(identifier)
  await page.getByLabel('Пароль или секрет первоначального доступа').fill(password)
  await page.getByRole('button', { name: 'Продолжить' }).click()
}

test('virtual WebAuthn authenticator completes mandatory enrollment and phishing-resistant login', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  const completions = await installMfaFixtures(page)

  await login(page)
  await expect(page).toHaveURL(/\/auth\/mfa$/)
  await page.getByRole('button', { name: 'Создать passkey' }).click()
  await expect(page.getByRole('heading', { name: 'Сохраните recovery-коды' })).toBeVisible()
  await expect(page.getByTestId('mfa-recovery-codes')).toContainText(recoveryCodes[0]!)

  const enrollmentState = await page.evaluate(() => JSON.stringify({
    url: location.href,
    localStorage: Object.values(localStorage),
    sessionStorage: Object.values(sessionStorage),
  }))
  for (const secret of [loginCapability, optionsCapability, ...recoveryCodes]) {
    expect(enrollmentState).not.toContain(secret)
  }

  await page.getByLabel('Я сохранил коды в надёжном месте').check()
  await page.getByRole('button', { name: 'Вернуться ко входу' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('Email', { exact: true }).fill(identifier)
  await page.getByLabel('Пароль или секрет первоначального доступа').fill(password)
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/auth\/mfa$/)
  await page.getByRole('button', { name: 'Продолжить с passkey' }).click()
  await expect(page).toHaveURL(/\/settings\/security$/)
  expect(completions).toHaveLength(2)

  const authenticatedState = await page.evaluate(() => JSON.stringify({
    localStorage: Object.values(localStorage),
    sessionStorage: Object.values(sessionStorage),
  }))
  expect(authenticatedState).not.toContain(authCapability)
  expect(authenticatedState).not.toContain('cms_access_mfa')
})
