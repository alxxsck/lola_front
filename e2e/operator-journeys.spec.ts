import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const catalogRevision = 'catalog-e2e-1'
const publishedAt = '2026-07-18T10:00:00.000Z'

type AuthoringFixtureState = {
  currentRevisionId: string | null
  draftVersion: number
  savedDraft: Record<string, unknown> | null
  calls: { draft: number; validateRule: number; preview: number; validateDraft: number; publish: number; rollback: number }
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function installScenarioAuthoringFixtures(page: Page): Promise<AuthoringFixtureState> {
  const state: AuthoringFixtureState = {
    currentRevisionId: null,
    draftVersion: 0,
    savedDraft: null,
    calls: { draft: 0, validateRule: 0, preview: 0, validateDraft: 0, publish: 0, rollback: 0 },
  }
  await page.route('**/api/v1/admin/projects/*/scenario-authoring/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const scenarioMatch = path.match(/\/scenario-authoring\/scenarios\/([^/]+)/)
    const scenarioId = scenarioMatch?.[1] ?? 'scenario-e2e'
    const source = {
      catalogRevision,
      deliveryPolicy: { kind: 'IMMEDIATE' },
      ...(state.savedDraft?.rule ? { rule: state.savedDraft.rule } : {}),
      graph: state.savedDraft?.graph ?? { actions: [] },
    }

    if (request.method() === 'GET' && path.endsWith('/scenario-authoring/catalog')) {
      return json(route, {
        projectId: 'prj_lola_demo',
        revision: catalogRevision,
        version: 1,
        events: [{
          code: 'registration_completed',
          definitionId: 'evt_1',
          definitionKeyId: 'event-key-registration',
          name: 'Регистрация завершена',
          schemaVersion: 1,
          capabilities: { eventMeasures: [{ measure: 'exists', resultType: 'boolean' }, { measure: 'count', resultType: 'integer' }] },
          fields: [],
        }],
      })
    }
    if (request.method() === 'POST' && path.endsWith('/scenario-authoring/validate')) {
      state.calls.validateRule += 1
      return json(route, {
        valid: true,
        issues: [],
        dependencies: [],
        cost: { class: 'LOW', leaves: 1, aggregateLeaves: 1, historyWindowDays: 3 },
        warnings: [],
      })
    }
    if (request.method() === 'POST' && path.endsWith('/scenario-authoring/preview')) {
      state.calls.preview += 1
      return json(route, {
        valid: true,
        matched: true,
        explanation: { kind: 'all', matched: true, children: [{ kind: 'activityDayStreak', matched: true }] },
        issues: [],
        dependencies: [],
        cost: { class: 'LOW', leaves: 1, aggregateLeaves: 1, historyWindowDays: 3 },
        warnings: [],
      })
    }
    if (request.method() === 'PUT' && path.endsWith('/draft')) {
      state.calls.draft += 1
      state.draftVersion += 1
      state.savedDraft = request.postDataJSON() as Record<string, unknown>
      return json(route, {
        id: 'draft-e2e',
        version: state.draftVersion,
        baseRevisionId: state.currentRevisionId,
        catalogRevision,
        deliveryPolicy: state.savedDraft.deliveryPolicy,
        graph: state.savedDraft.graph,
        ...(state.savedDraft.rule ? { rule: state.savedDraft.rule } : {}),
        createdAt: publishedAt,
        updatedAt: publishedAt,
        updatedByAdminId: 'admin-e2e',
      })
    }
    if (request.method() === 'POST' && path.endsWith('/validate')) {
      state.calls.validateDraft += 1
      return json(route, {
        valid: true,
        issues: [],
        dependencies: [],
        cost: { class: 'LOW', leaves: 1, aggregateLeaves: 1, historyWindowDays: 3 },
        warnings: [],
        deliveryPolicy: { kind: 'IMMEDIATE' },
      })
    }
    if (request.method() === 'POST' && path.endsWith('/publish')) {
      state.calls.publish += 1
      state.currentRevisionId = 'revision-e2e-2'
      return json(route, {
        conflictMetadata: { currentRevisionId: state.currentRevisionId, expectedCurrentRevisionId: null },
        cost: { class: 'LOW', leaves: 1, aggregateLeaves: 1, historyWindowDays: 3 },
        deliveryPolicy: { kind: 'IMMEDIATE' },
        dependencies: { actionTypes: ['SHOW_ASSISTANT'], conditionPaths: [], eventDefinitionRevisionIds: ['evt_1'] },
        revision: {
          id: state.currentRevisionId,
          scenarioId,
          revisionNumber: 2,
          catalogRevision,
          contentHash: 'hash-e2e-2',
          publishedAt,
          triggerEventDefinitionRevisionId: 'evt_1',
        },
        warnings: [],
      })
    }
    if (request.method() === 'GET' && path.endsWith('/revisions')) {
      return json(route, {
        items: [
          { id: 'revision-e2e-2', scenarioId, revisionNumber: 2, catalogRevision, contentHash: 'hash-e2e-2', publishedAt, publishedByAdminId: 'admin-e2e', current: true, editable: true },
          { id: 'revision-e2e-1', scenarioId, revisionNumber: 1, catalogRevision, contentHash: 'hash-e2e-1', publishedAt, publishedByAdminId: 'admin-e2e', current: false, editable: true },
        ],
        nextCursor: null,
      })
    }
    if (request.method() === 'POST' && path.endsWith('/rollback')) {
      state.calls.rollback += 1
      state.currentRevisionId = 'revision-e2e-3'
      return route.fulfill({ status: 204 })
    }
    if (request.method() === 'GET' && path.includes('/scenario-authoring/scenarios/')) {
      return json(route, {
        scenarioId,
        projectId: 'prj_lola_demo',
        code: 'e2e_scenario',
        name: 'E2E сценарий',
        status: 'ACTIVE',
        triggerEventDefinitionRevisionId: 'evt_1',
        currentRevisionId: state.currentRevisionId,
        editable: true,
        source,
        draft: state.draftVersion ? {
          id: 'draft-e2e', version: state.draftVersion, baseRevisionId: state.currentRevisionId, ...source,
          createdAt: publishedAt, updatedAt: publishedAt, updatedByAdminId: 'admin-e2e',
        } : null,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      })
    }
    return json(route, { message: `Unhandled authoring fixture: ${request.method()} ${path}` }, 501)
  })
  return state
}

async function login(page: Page) {
  await page.goto('/login')
  if (process.env.VITE_DATA_MODE === 'api') {
    const login = process.env.E2E_LOGIN
    const password = process.env.E2E_PASSWORD
    if (!login || !password) throw new Error('E2E_LOGIN and E2E_PASSWORD are required for test:e2e:api')
    await page.getByLabel('Email или имя пользователя').fill(login)
    await page.getByLabel('Пароль').fill(password)
  }
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/overview$/)
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  // Color tokens are audited separately; this gate protects structural WCAG regressions in operator journeys.
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()
  expect(result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')).toEqual([])
}

test.beforeEach(async ({ page }) => login(page))

test('sidebar keeps navigation reachable across desktop and mobile heights', async ({ page }) => {
  for (const height of [844, 700, 600]) {
    await page.setViewportSize({ width: 1440, height })
    await page.goto('/overview')
    const sidebarScroll = page.locator('.sidebar-scroll')
    const sidebarFooter = page.locator('.sidebar-footer')
    await expect(sidebarScroll).toBeVisible()
    const scrollState = await sidebarScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        overflowY: getComputedStyle(element).overflowY,
      }
    })
    const footerBox = await sidebarFooter.boundingBox()

    expect(scrollState.overflowY).toBe('auto')
    if (scrollState.scrollHeight > scrollState.clientHeight) expect(scrollState.scrollTop).toBeGreaterThan(0)
    expect((footerBox?.y ?? height + 1) + (footerBox?.height ?? 0)).toBeLessThanOrEqual(height)
  }

  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto('/overview')
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click()
  await expect(page.locator('.sidebar')).toHaveClass(/open/)
  const mobileScroll = page.locator('.sidebar-scroll')
  const mobileFooterBox = await page.locator('.sidebar-footer').boundingBox()
  const mobileScrollTop = await mobileScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop
  })

  expect(mobileScrollTop).toBeGreaterThan(0)
  expect((mobileFooterBox?.y ?? 601) + (mobileFooterBox?.height ?? 0)).toBeLessThanOrEqual(600)
})

test('theme choice survives a page reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 })
  await page.goto('/overview')
  const themeSwitch = page.locator('.theme-switch input')

  await themeSwitch.check()
  await expect(page.locator('html')).toHaveClass(/lola-dark/)
  await page.reload()

  await expect(page.locator('.theme-switch input')).toBeChecked()
  await expect(page.locator('html')).toHaveClass(/lola-dark/)
})

test('core operator pages load without horizontal overflow or serious accessibility violations', async ({ page }) => {
  for (const path of ['/overview', '/project', '/project/user-attributes', '/knowledge', '/interface', '/events', '/event-logs', '/actions', '/scenarios', '/docs', '/docs/scenarios', '/users', '/live', '/operations']) {
    await page.goto(path)
    await expect(page.locator('main').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await expectNoSeriousAccessibilityViolations(page)
  }
})

test('documentation catalog opens the scenario guide', async ({ page }) => {
  await page.goto('/overview')
  await expect(page.locator('a.nav-item', { hasText: 'Документация' })).toHaveAttribute('href', '/docs')
  await page.goto('/docs')
  await expect(page.getByRole('heading', { name: 'Документация Lola', level: 1 })).toBeVisible()
  await expect(page.locator('.guide-card')).toHaveCount(1)
  await page.getByRole('link', { name: /Как работают сценарии Lola/ }).click()
  await expect(page).toHaveURL(/\/docs\/scenarios$/)
  await expect(page.getByRole('heading', { name: 'Как работают сценарии Lola', level: 1 })).toBeVisible()
})

test('contextual scenario documentation is discoverable from scenarios and events', async ({ page }) => {
  for (const path of ['/scenarios', '/events']) {
    await page.goto(path)
    await page.getByRole('link', { name: 'Открыть руководство «Как работают сценарии Lola»' }).click()
    await expect(page).toHaveURL(/\/docs\/scenarios$/)
    await expect(page.getByRole('heading', { name: 'Как работают сценарии Lola', level: 1 })).toBeVisible()
    expect(await page.locator('.guide-nav nav a').count()).toBeGreaterThan(20)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
})

test('new scenario authoring journey remains usable at the active viewport', async ({ page }) => {
  await page.goto('/scenarios/new')
  await expect(page.locator('.scenario-studio')).toBeVisible()
  await expect(page.getByRole('button', { name: /Запуск/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Доставка/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await expectNoSeriousAccessibilityViolations(page)
})

test('scenario author can save, validate, preview, publish and safely roll back a durable draft', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The full graph journey is covered once on its desktop authoring surface')
  const fixture = await installScenarioAuthoringFixtures(page)

  await page.goto('/scenarios/new')
  await page.locator('#scenario-name').fill('E2E сценарий')
  await page.getByRole('button', { name: /Действия/ }).click()
  await page.getByRole('button', { name: /Показать Lola/ }).click()
  await page.getByRole('button', { name: /Условия/ }).click()
  await page.getByRole('button', { name: 'Активен 3 дня подряд' }).click()

  await page.getByRole('button', { name: 'Проверить сейчас' }).click()
  await expect(page.getByText('Правило прошло проверку.')).toBeVisible()
  await page.locator('input[name="preview-event-log"]').first().check()
  await page.getByRole('button', { name: 'Запустить preview правила' }).click()
  await expect(page.getByText('Условие совпало')).toBeVisible()

  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText(/Черновик v1 сохранён на сервере/)).toBeVisible()
  await expect(page).toHaveURL(/\/scenarios\/[^/]+$/)

  await page.getByRole('button', { name: /Доставка/ }).click()
  await expect(page.locator('.server-review')).toBeVisible()
  await expect(page.locator('.blocked-reason')).toHaveCount(0)
  const publish = page.getByRole('button', { name: 'Опубликовать immutable revision' })
  await expect(publish).toBeEnabled()
  await publish.click()
  await expect(page.getByText(/Опубликована неизменяемая версия revision-e2e-2/)).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Откатить к версии 1' }).click()
  await expect.poll(() => fixture.currentRevisionId).toBe('revision-e2e-3')
  expect(fixture.calls).toMatchObject({ draft: 1, preview: 1, publish: 1, rollback: 1 })
  expect(fixture.calls.validateDraft).toBeGreaterThanOrEqual(2)
  expect(fixture.calls.validateRule).toBeGreaterThanOrEqual(1)
})

test('scenario authoring supports keyboard focus, narrow reflow and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/scenarios/new')
  await page.locator('#scenario-name').focus()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByRole('button', { name: /Действия/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
