import { expect, test, type Page, type Route } from '@playwright/test'

test.skip(
  process.env.VITE_DATA_MODE !== 'api',
  'IAM network fixtures require the API-mode frontend adapter',
)

const projectId = '00000000-0000-4000-8000-000000000110'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function installReadOnlyFixtures(
  page: Page,
  effectivePermissionCodes = [
    'project.knowledge.read',
    'project.scenarios.read',
  ],
) {
  const mutations: string[] = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      return json(route, {
        kind: 'AUTHENTICATED',
        tokenType: 'Bearer',
        accessToken: 'cms_access_read_only_restored',
        expiresIn: 900,
        refreshExpiresIn: 3600,
        user: {
          id: '00000000-0000-4000-8000-000000000101',
          email: 'reader@example.com',
          displayName: 'Reader',
        },
      })
    }
    if (request.method() === 'GET' && path === '/api/v1/auth/me') {
      return json(route, {
        user: {
          id: '00000000-0000-4000-8000-000000000101',
          email: 'reader@example.com',
          displayName: 'Reader',
        },
        platformPermissionCodes: [],
        projects: [
          {
            id: projectId,
            name: 'Read-only Project',
            slug: 'read-only-project',
            status: 'ACTIVE',
            publicKey: 'public-key',
            serverKeyPrefix: 'server-prefix',
            organizationId: '00000000-0000-4000-8000-000000000100',
            defaultLocale: 'ru',
            supportedLocales: ['ru'],
            assistantName: 'Lola',
            systemPrompt: '',
            voiceInstructions: '',
            settings: {},
            createdAt: '2026-07-20T10:00:00.000Z',
            updatedAt: '2026-07-21T10:00:00.000Z',
            membershipId: '00000000-0000-4000-8000-000000000111',
            membershipStatus: 'ACTIVE',
            membershipVersion: 1,
            // Deliberately owner-shaped: role labels must never grant authority.
            roleKeys: ['PROJECT_OWNER'],
            effectivePermissionCodes,
          },
        ],
      })
    }
    if (
      request.method() === 'GET' &&
      path === `/api/v1/admin/projects/${projectId}/knowledge/documents`
    ) {
      return json(route, { items: [], nextCursor: null })
    }
    if (
      request.method() === 'GET' &&
      path === `/api/v1/admin/projects/${projectId}/scenarios`
    ) {
      return json(route, [])
    }
    if (
      request.method() === 'GET' &&
      path === `/api/v1/admin/projects/${projectId}/telegram-channel`
    ) {
      return json(route, null)
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutations.push(`${request.method()} ${path}`)
    }
    return json(
      route,
      {
        error: {
          code: 'UNHANDLED_FIXTURE',
          message: `${request.method()} ${path}`,
        },
      },
      501,
    )
  })
  return mutations
}

async function restoreSession(page: Page) {
  await page.goto('/overview')
  await expect(page).toHaveURL(/\/overview$/)
}

test('exact Permissions control navigation, mutations and direct write URLs without role fallback', async ({
  page,
}) => {
  const mutations = await installReadOnlyFixtures(page)
  await restoreSession(page)

  const navigation = page.locator('aside.sidebar nav')
  await expect(navigation.getByRole('link', { name: 'База знаний' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Сценарии' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Проект' })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: 'События' })).toHaveCount(0)

  await navigation.getByRole('link', { name: 'База знаний' }).click()
  await expect(page).toHaveURL(/\/knowledge$/)
  await expect(page.getByRole('heading', { name: 'База знаний' })).toBeVisible()
  await expect(page.getByText('У вас доступ только для просмотра.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавить текст' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Загрузить файлы' })).toBeDisabled()

  await page.goto('/scenarios/new')
  await expect(page).toHaveURL(/\/overview$/)
  expect(mutations).toEqual([])
})

test('integration readers see only the read-only product Telegram surface', async ({
  page,
}) => {
  const mutations = await installReadOnlyFixtures(page, [
    'project.integrations.read',
  ])
  await restoreSession(page)

  const navigation = page.locator('aside.sidebar nav')
  const integrationsLink = navigation.getByRole('link', {
    name: 'Интеграции',
  })
  await expect(integrationsLink).toBeVisible()
  await integrationsLink.click()
  await expect(page).toHaveURL(/\/settings\/integrations$/)

  await expect(
    page.getByRole('heading', {
      name: 'Telegram · Пользователи продукта',
    }),
  ).toBeVisible()
  await expect(page.getByText('Slack', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Bot token', { exact: true })).toHaveCount(0)
  await expect(
    page.getByText(
      'Product Telegram пока не подключён. Для настройки нужны права управления интеграциями.',
    ),
  ).toBeVisible()
  expect(mutations).toEqual([])
})
