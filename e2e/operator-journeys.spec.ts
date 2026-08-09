import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { ScenarioLocalizationCatalogResponseDto } from "../src/shared/api/generated/models";

const catalogRevision = "catalog-e2e-1";
const publishedAt = "2026-07-18T10:00:00.000Z";
const bilingualScenarioLocalization: ScenarioLocalizationCatalogResponseDto = {
  version: 1,
  enabled: true,
  attributeKey: "language",
  attributeContractRevision: 1,
  defaultLocale: "ru",
  localizedValueSchemaVersion: 1,
  policyModes: ["ALL_PROJECT_LOCALES", "SELECTED_LOCALES"],
  locales: [
    { code: "ru", language: "ru", default: true },
    { code: "zh", language: "zh", default: false },
  ],
  paths: [
    {
      actionType: "ASK_CHOICE",
      path: "config.message",
      maxLength: 10_000,
    },
    {
      actionType: "ASK_CHOICE",
      path: "config.options[].label",
      maxLength: 120,
    },
  ],
};

type AuthoringFixtureState = {
  currentRevisionId: string | null;
  draftVersion: number;
  savedDraft: Record<string, unknown> | null;
  calls: {
    draft: number;
    validateRule: number;
    preview: number;
    validateDraft: number;
    publish: number;
    rollback: number;
  };
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installScenarioAuthoringFixtures(
  page: Page,
  options: {
    localization?: ScenarioLocalizationCatalogResponseDto;
  } = {},
): Promise<AuthoringFixtureState> {
  const state: AuthoringFixtureState = {
    currentRevisionId: null,
    draftVersion: 0,
    savedDraft: null,
    calls: {
      draft: 0,
      validateRule: 0,
      preview: 0,
      validateDraft: 0,
      publish: 0,
      rollback: 0,
    },
  };
  await page.route(
    "**/api/v1/admin/projects/*/scenario-authoring/**",
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const scenarioMatch = path.match(
        /\/scenario-authoring\/scenarios\/([^/]+)/,
      );
      const scenarioId = scenarioMatch?.[1] ?? "scenario-e2e";
      const source = {
        catalogRevision,
        deliveryPolicy: { kind: "IMMEDIATE" },
        ...(state.savedDraft?.rule ? { rule: state.savedDraft.rule } : {}),
        graph: state.savedDraft?.graph ?? { actions: [] },
      };

      if (
        request.method() === "GET" &&
        path.endsWith("/scenario-authoring/catalog")
      ) {
        return json(route, {
          projectId: "prj_retenive_demo",
          revision: catalogRevision,
          version: 1,
          ...(options.localization
            ? { localization: options.localization }
            : {}),
          events: [
            {
              code: "registration_completed",
              definitionId: "evt_1",
              definitionKeyId: "event-key-registration",
              name: "Регистрация завершена",
              schemaVersion: 1,
              capabilities: {
                eventMeasures: [
                  { measure: "exists", resultType: "boolean" },
                  { measure: "count", resultType: "integer" },
                ],
              },
              fields: [],
            },
          ],
        });
      }
      if (
        request.method() === "POST" &&
        path.endsWith("/scenario-authoring/scenarios")
      ) {
        const body = request.postDataJSON() as {
          draft: Record<string, unknown>;
        };
        state.calls.draft += 1;
        state.draftVersion = 1;
        state.savedDraft = body.draft;
        return json(route, {
          scenarioId: "scenario-e2e",
          currentRevisionId: null,
          draft: {
            id: "draft-e2e",
            version: state.draftVersion,
            baseRevisionId: null,
            catalogRevision,
            deliveryPolicy: body.draft.deliveryPolicy,
            graph: body.draft.graph,
            ...(body.draft.rule ? { rule: body.draft.rule } : {}),
            ...(body.draft.audience ? { audience: body.draft.audience } : {}),
            localization: body.draft.localization,
            createdAt: publishedAt,
            updatedAt: publishedAt,
            updatedByAdminId: "admin-e2e",
          },
        });
      }
      if (
        request.method() === "POST" &&
        path.endsWith("/scenario-authoring/validate")
      ) {
        state.calls.validateRule += 1;
        return json(route, {
          valid: true,
          issues: [],
          dependencies: [],
          cost: {
            class: "LOW",
            leaves: 1,
            aggregateLeaves: 1,
            historyWindowDays: 3,
          },
          warnings: [],
        });
      }
      if (
        request.method() === "POST" &&
        path.endsWith("/scenario-authoring/preview")
      ) {
        state.calls.preview += 1;
        return json(route, {
          valid: true,
          matched: true,
          explanation: {
            kind: "all",
            matched: true,
            children: [{ kind: "activityDayStreak", matched: true }],
          },
          issues: [],
          dependencies: [],
          cost: {
            class: "LOW",
            leaves: 1,
            aggregateLeaves: 1,
            historyWindowDays: 3,
          },
          warnings: [],
        });
      }
      if (request.method() === "PUT" && path.endsWith("/draft")) {
        state.calls.draft += 1;
        state.draftVersion += 1;
        state.savedDraft = request.postDataJSON() as Record<string, unknown>;
        return json(route, {
          id: "draft-e2e",
          version: state.draftVersion,
          baseRevisionId: state.currentRevisionId,
          catalogRevision,
          deliveryPolicy: state.savedDraft.deliveryPolicy,
          graph: state.savedDraft.graph,
          ...(state.savedDraft.rule ? { rule: state.savedDraft.rule } : {}),
          createdAt: publishedAt,
          updatedAt: publishedAt,
          updatedByAdminId: "admin-e2e",
        });
      }
      if (request.method() === "POST" && path.endsWith("/validate")) {
        state.calls.validateDraft += 1;
        return json(route, {
          valid: true,
          issues: [],
          dependencies: [],
          cost: {
            class: "LOW",
            leaves: 1,
            aggregateLeaves: 1,
            historyWindowDays: 3,
          },
          warnings: [],
          deliveryPolicy: { kind: "IMMEDIATE" },
        });
      }
      if (request.method() === "POST" && path.endsWith("/publish")) {
        state.calls.publish += 1;
        state.currentRevisionId = "revision-e2e-2";
        return json(route, {
          conflictMetadata: {
            currentRevisionId: state.currentRevisionId,
            expectedCurrentRevisionId: null,
          },
          cost: {
            class: "LOW",
            leaves: 1,
            aggregateLeaves: 1,
            historyWindowDays: 3,
          },
          deliveryPolicy: { kind: "IMMEDIATE" },
          dependencies: {
            actionTypes: ["SHOW_ASSISTANT"],
            conditionPaths: [],
            eventDefinitionRevisionIds: ["evt_1"],
          },
          revision: {
            id: state.currentRevisionId,
            scenarioId,
            revisionNumber: 2,
            catalogRevision,
            contentHash: "hash-e2e-2",
            publishedAt,
            triggerEventDefinitionRevisionId: "evt_1",
          },
          warnings: [],
        });
      }
      if (request.method() === "GET" && path.endsWith("/revisions")) {
        return json(route, {
          items: [
            {
              id: "revision-e2e-2",
              scenarioId,
              revisionNumber: 2,
              catalogRevision,
              contentHash: "hash-e2e-2",
              publishedAt,
              publishedByAdminId: "admin-e2e",
              current: true,
              editable: true,
            },
            {
              id: "revision-e2e-1",
              scenarioId,
              revisionNumber: 1,
              catalogRevision,
              contentHash: "hash-e2e-1",
              publishedAt,
              publishedByAdminId: "admin-e2e",
              current: false,
              editable: true,
            },
          ],
          nextCursor: null,
        });
      }
      if (request.method() === "POST" && path.endsWith("/rollback")) {
        state.calls.rollback += 1;
        state.currentRevisionId = "revision-e2e-3";
        return route.fulfill({ status: 204 });
      }
      if (
        request.method() === "GET" &&
        path.includes("/scenario-authoring/scenarios/")
      ) {
        return json(route, {
          scenarioId,
          projectId: "prj_retenive_demo",
          code: "e2e_scenario",
          name: "E2E сценарий",
          status: "ACTIVE",
          triggerEventDefinitionRevisionId: "evt_1",
          currentRevisionId: state.currentRevisionId,
          editable: true,
          source,
          draft: state.draftVersion
            ? {
                id: "draft-e2e",
                version: state.draftVersion,
                baseRevisionId: state.currentRevisionId,
                ...source,
                createdAt: publishedAt,
                updatedAt: publishedAt,
                updatedByAdminId: "admin-e2e",
              }
            : null,
          createdAt: publishedAt,
          updatedAt: publishedAt,
        });
      }
      return json(
        route,
        { message: `Unhandled authoring fixture: ${request.method()} ${path}` },
        501,
      );
    },
  );
  return state;
}

async function login(page: Page) {
  await page.goto("/login");
  if (process.env.VITE_DATA_MODE === "api") {
    const login = process.env.E2E_LOGIN;
    const password = process.env.E2E_PASSWORD;
    if (!login || !password)
      throw new Error(
        "E2E_LOGIN and E2E_PASSWORD are required for test:e2e:api",
      );
    await page.getByLabel("Email", { exact: true }).fill(login);
    await page.getByLabel("Пароль").fill(password);
  }
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  // Color tokens are audited separately; this gate protects structural WCAG regressions in operator journeys.
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    result.violations.filter(
      (item) => item.impact === "critical" || item.impact === "serious",
    ),
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => login(page));

test("sidebar keeps navigation reachable across desktop and mobile heights", async ({
  page,
}) => {
  for (const height of [844, 700, 600]) {
    await page.setViewportSize({ width: 1440, height });
    await page.goto("/overview");
    const sidebarScroll = page.locator(".sidebar-scroll");
    const sidebarFooter = page.locator(".sidebar-footer");
    await expect(sidebarScroll).toBeVisible();
    const scrollState = await sidebarScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        overflowY: getComputedStyle(element).overflowY,
      };
    });
    const footerBox = await sidebarFooter.boundingBox();

    expect(scrollState.overflowY).toBe("auto");
    if (scrollState.scrollHeight > scrollState.clientHeight)
      expect(scrollState.scrollTop).toBeGreaterThan(0);
    expect(
      (footerBox?.y ?? height + 1) + (footerBox?.height ?? 0),
    ).toBeLessThanOrEqual(height);
  }

  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/overview");
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/open/);
  const mobileScroll = page.locator(".sidebar-scroll");
  const mobileFooterBox = await page.locator(".sidebar-footer").boundingBox();
  const mobileScrollTop = await mobileScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });

  expect(mobileScrollTop).toBeGreaterThan(0);
  expect(
    (mobileFooterBox?.y ?? 601) + (mobileFooterBox?.height ?? 0),
  ).toBeLessThanOrEqual(600);
});

test("theme choice survives a page reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/overview");
  const themeSwitch = page.locator(".theme-switch input");

  await themeSwitch.check();
  await expect(page.locator("html")).toHaveClass(/retenive-dark/);
  await page.reload();

  await expect(page.locator(".theme-switch input")).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/retenive-dark/);
});

test("Actions catalog stays compact and keeps the editor readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/actions");

  const card = page.getByRole("button", {
    name: "Открыть действие Задать вопрос с вариантами",
  });
  await expect(card).toBeVisible();
  const cardBox = await card.boundingBox();
  expect(cardBox?.height).toBeLessThanOrEqual(280);
  const cardLayout = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".project-action-card")].map(
      (actionCard) => {
        const cardBounds = actionCard.getBoundingClientRect();
        const surfaceStates = [
          ...actionCard.querySelectorAll<HTMLElement>(".surface-state"),
        ];
        const footerIcon =
          actionCard.querySelector<HTMLElement>(".card-footer i");
        const footerItem = footerIcon?.closest<HTMLElement>("span") ?? null;
        const iconBounds = footerIcon?.getBoundingClientRect();
        const footerBounds = footerItem?.getBoundingClientRect();

        return {
          cardFits: actionCard.scrollWidth <= actionCard.clientWidth,
          surfacesFit: surfaceStates.every((surface) => {
            const bounds = surface.getBoundingClientRect();
            return (
              surface.scrollWidth <= surface.clientWidth &&
              bounds.right <= cardBounds.right
            );
          }),
          surfacesEqualHeight:
            new Set(surfaceStates.map((surface) => surface.clientHeight))
              .size <= 1,
          footerIconCentered:
            !iconBounds ||
            !footerBounds ||
            Math.abs(
              iconBounds.top +
                iconBounds.height / 2 -
                (footerBounds.top + footerBounds.height / 2),
            ) <= 1,
        };
      },
    ),
  );
  expect(cardLayout.length).toBeGreaterThan(0);
  expect(cardLayout.every((item) => item.cardFits)).toBe(true);
  expect(cardLayout.every((item) => item.surfacesFit)).toBe(true);
  expect(cardLayout.every((item) => item.surfacesEqualHeight)).toBe(true);
  expect(cardLayout.every((item) => item.footerIconCentered)).toBe(true);
  const surfaces = await page.evaluate(() => {
    const actionCard = document.querySelector(".project-action-card");
    const actionGrid = document.querySelector(".action-grid");
    if (!actionCard || !actionGrid) return null;
    return {
      card: getComputedStyle(actionCard).backgroundColor,
      grid: getComputedStyle(actionGrid).backgroundColor,
    };
  });
  expect(surfaces?.grid).not.toBe("rgba(0, 0, 0, 0)");
  expect(surfaces?.card).not.toBe(surfaces?.grid);

  await card.click();
  const editor = page.locator(".project-action-dialog");
  await expect(editor).toBeVisible();
  const editorBox = await editor.boundingBox();
  expect(editorBox?.width).toBeLessThanOrEqual(800);
  expect(editorBox?.x).toBeGreaterThanOrEqual(16);
  expect((editorBox?.x ?? 0) + (editorBox?.width ?? 1280)).toBeLessThanOrEqual(
    1264,
  );
  expect(editorBox?.y).toBeGreaterThanOrEqual(16);
  expect((editorBox?.y ?? 0) + (editorBox?.height ?? 800)).toBeLessThanOrEqual(
    784,
  );
});

test("OWNER publishes OPEN_PAGE for AI without coupling the Scenario surface", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.removeItem("retenive-cms-demo-product-actions-v2"),
  );
  await page.goto("/interface/page");
  const bonusesTarget = page.locator("article").filter({
    hasText: "Бонусы",
  });
  await bonusesTarget.getByRole("button", { name: "Изменить" }).click();
  const targetEditor = page.getByRole("dialog", { name: "Изменить элемент" });
  await targetEditor.getByRole("switch", { name: "Разрешить Retenive" }).click();
  await targetEditor
    .getByLabel("Описание для Retenive 20–1000 символов")
    .fill(
      "Страница, где пользователь просматривает доступные бонусы и награды.",
    );
  await targetEditor
    .getByLabel("Другие названия через запятую, до 20")
    .fill("награды, бонусы");
  await targetEditor
    .getByLabel("Зачем Retenive нужен доступ обязательно")
    .fill("Разрешаем безопасную страницу бонусов для OPEN_PAGE");
  await targetEditor.getByRole("button", { name: "Сохранить" }).click();
  await expect(bonusesTarget).toContainText("Доступно Retenive");

  await page.goto("/actions");

  const card = page.getByRole("button", {
    name: "Открыть действие Открыть страницу",
  });
  await expect(card).toContainText("СценарииВключено");
  await expect(card).toContainText("Для помощникаВыключено");
  await card.click();

  const editor = page.locator(".project-action-dialog");
  await expect(editor.getByText("Действие пока недоступно Retenive")).toBeVisible();
  await editor.getByLabel("Использовать в сценариях").click();
  await editor.getByLabel("Разрешить помощнику Retenive").click();
  await editor
    .getByLabel("Подсказка для Retenive")
    .fill(
      "Используй, когда пользователь явно просит открыть страницу с бонусами.",
    );
  await editor
    .getByLabel("Зачем Retenive нужен доступ обязательно")
    .fill("Разрешаем безопасный переход на зарегистрированную страницу");
  await editor.locator('[data-test="save-project-action"]').click();

  const confirmation = page.getByRole("dialog", {
    name: "Проверьте изменения перед сохранением",
  });
  await expect(confirmation).toContainText("СценарииВыключено");
  await expect(confirmation).toContainText("Для ReteniveВключено");
  await confirmation
    .locator('[data-test="confirm-project-action-save"]')
    .click();

  await editor
    .getByText("Технические сведения для разработчика", { exact: true })
    .click();
  await expect(
    editor.getByText("retenive_open_page", { exact: true }),
  ).toBeVisible();
  await expect(editor.locator("pre")).toContainText('"bonuses_page"');
  await expect(editor.locator("pre")).not.toContainText("route");
  await expect(editor.getByLabel("Использовать в сценариях")).not.toBeChecked();
  await expect(editor.getByLabel("Разрешить помощнику Retenive")).toBeChecked();

  await editor.getByLabel("Использовать в сценариях").click();
  await editor.locator('[data-test="save-project-action"]').click();
  await page
    .getByRole("dialog", { name: "Проверьте изменения перед сохранением" })
    .locator('[data-test="confirm-project-action-save"]')
    .click();
  await expect(editor.getByLabel("Использовать в сценариях")).toBeChecked();
  await expect(editor.getByLabel("Разрешить помощнику Retenive")).toBeChecked();
});

test("core operator pages load without horizontal overflow or serious accessibility violations", async ({
  page,
}) => {
  test.slow();

  for (const path of [
    "/overview",
    "/project",
    "/profile-fields",
    "/profile-fields/new",
    "/profile-fields/integration",
    "/knowledge",
    "/interface",
    "/events",
    "/event-logs",
    "/actions",
    "/scenarios",
    "/segments",
    "/docs",
    "/docs/scenarios",
    "/users",
    "/live",
    "/operations",
  ]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expectNoSeriousAccessibilityViolations(page);
  }
});

test("content locales are configured through the Locale Attribute journey", async ({
  page,
}) => {
  await page.goto("/project");
  await expect(
    page.getByRole("heading", { name: "Языки контента", level: 2 }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Развернуть раздел «Языки контента»",
    })
    .click();
  await page.getByRole("link", { name: "Настроить языки" }).click();

  await expect(page).toHaveURL(/\/profile-fields\/new\?semanticRole=LOCALE$/);
  await expect(page.getByText("Языки контента", { exact: true })).toBeVisible();
  await page.getByLabel("Название поля *").fill("Язык контента");
  await page.getByLabel("Ключ для передачи данных *").fill("locale");
  await page
    .getByLabel("Для чего нужно это поле? *")
    .fill("Выбирать язык сообщений и сценариев для пользователя");

  const localeInput = page.getByLabel("Добавить язык контента");
  await localeInput.fill("en");
  await page.getByRole("button", { name: "Добавить язык" }).click();
  await localeInput.fill("pt-br");
  await page.getByRole("button", { name: "Добавить язык" }).click();

  await expect(page.getByText("английский", { exact: true })).toBeVisible();
  await expect(
    page.getByText("бразильский португальский", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2/20 языков", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Основной язык проекта *", { exact: true }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Добавить в черновик" }).click();
  await expect(page).toHaveURL(/\/profile-fields$/);
  await expect(
    page.getByRole("heading", { name: "Язык контента" }),
  ).toBeVisible();
});

test("EUAP workspace, Current Profiles and Segment Library expose their primary operator journeys", async ({
  page,
}, testInfo) => {
  await page.goto("/profile-fields");
  await expect(
    page.getByRole("heading", {
      name: "Поля профиля пользователей",
      level: 1,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Добавить поле" }).first().click();
  await expect(page).toHaveURL(/\/profile-fields\/new$/);
  await expect(
    page.getByRole("heading", { name: "Новое поле профиля", level: 1 }),
  ).toBeVisible();
  await page.locator('label[for="profile-field-kind-CUSTOM"]').click();
  await expect(
    page.getByText("Обязательно ли передавать поле?", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Пример для ИИ/)).toBeVisible();
  await expect(page.getByText(/Поле придёт во фронтенд/)).toBeVisible();
  const usageOptionsKeepTheirToggles = await page
    .locator(".usage-option")
    .evaluateAll((options) =>
      options.every((option) => {
        const toggle = option.querySelector(".p-toggleswitch");
        if (!toggle) return false;
        const optionBox = option.getBoundingClientRect();
        const toggleBox = toggle.getBoundingClientRect();
        return (
          toggleBox.left >= optionBox.left && toggleBox.right <= optionBox.right
        );
      }),
    );
  expect(usageOptionsKeepTheirToggles).toBe(true);
  await page.getByLabel("Название поля *").fill("Город");
  await page.getByLabel("Ключ для передачи данных *").fill("city");
  await page
    .getByLabel("Для чего нужно это поле? *")
    .fill("Показывать город в карточке пользователя");
  await page.getByRole("button", { name: "Добавить в черновик" }).click();
  await expect(page).toHaveURL(/\/profile-fields$/);
  await expect(page.getByRole("heading", { name: "Город" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Статистика после публикации" }),
  ).toBeVisible();

  await page.goto("/users");
  await expect(
    page.getByRole("heading", { name: "Профили пользователей", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.locator("tbody tr").first().click();
  const workspace = page.getByRole("dialog");
  await expect(workspace.getByText("Версия профиля")).toBeVisible();
  if (testInfo.project.name === "mobile-chromium") {
    await workspace.getByRole("button", { name: "Открыть чат" }).click();
    await expect(
      workspace.getByRole("button", { name: "К списку диалогов" }),
    ).toBeVisible();
    await expect(
      workspace.getByRole("group", { name: "Режим отображения сообщений" }),
    ).toBeVisible();
  }

  await page.goto("/segments");
  await expect(
    page.getByRole("heading", { name: "Библиотека сегментов", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Gold customers")).toBeVisible();
  await page.getByRole("link", { name: "Новый сегмент" }).click();
  await expect(
    page.getByRole("heading", { name: "Новый сегмент" }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("documentation catalog opens the scenario guide", async ({ page }) => {
  await page.goto("/overview");
  await expect(
    page.locator("a.nav-item", { hasText: "Документация" }),
  ).toHaveAttribute("href", "/docs");
  await page.goto("/docs");
  await expect(
    page.getByRole("heading", { name: "Документация Retenive", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".guide-card")).toHaveCount(3);
  await page.getByRole("link", { name: /Как работают сценарии Retenive/ }).click();
  await expect(page).toHaveURL(/\/docs\/scenarios$/);
  await expect(
    page.getByRole("heading", { name: "Как работают сценарии Retenive", level: 1 }),
  ).toBeVisible();
});

test("contextual scenario documentation is discoverable from scenarios and events", async ({
  page,
}) => {
  for (const item of [
    { path: "/scenarios", title: "Как работают сценарии Retenive" },
    { path: "/events", title: "Как события запускают сценарии" },
  ]) {
    await page.goto(item.path);
    await page
      .getByRole("link", {
        name: `Открыть руководство «${item.title}»`,
      })
      .click();
    await expect(page).toHaveURL(/\/docs\/scenarios$/);
    await expect(
      page.getByRole("heading", {
        name: "Как работают сценарии Retenive",
        level: 1,
      }),
    ).toBeVisible();
    expect(await page.locator(".guide-nav nav a").count()).toBeGreaterThan(20);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});

test("new scenario authoring journey remains usable at the active viewport", async ({
  page,
}) => {
  await installScenarioAuthoringFixtures(page);
  await page.goto("/scenarios/new");
  await expect(page.locator(".scenario-studio")).toBeVisible();
  await expect(page.getByRole("button", { name: /Запуск/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Доставка/ })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expectNoSeriousAccessibilityViolations(page);
});

test("action editor gives configuration the primary desktop area and keeps the graph below", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Desktop composition is covered on the desktop project",
  );
  await installScenarioAuthoringFixtures(page);
  await page.goto("/scenarios/new");
  await page.getByRole("button", { name: /Действия/ }).click();
  await page
    .locator('.action-empty-picker [data-testid="action-picker-trigger"]')
    .click();
  await page.getByRole("option", { name: /Озвучить текст/ }).click();
  await page
    .locator('[data-testid="action-picker-apply"]')
    .click();
  await page.waitForTimeout(350);

  const inspector = page.locator(".inspector");
  const graph = page.locator(".graph-canvas");
  await expect(inspector).toBeVisible();
  await expect(graph).toBeVisible();
  expect(
    await inspector.evaluate((element) => element.clientWidth),
  ).toBeGreaterThan(700);
  expect(
    await graph.evaluate((element) => element.clientHeight),
  ).toBeGreaterThan(200);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Настроить действие Озвучить текст" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("scenario-actions-desktop.png"),
  });
  await expectNoSeriousAccessibilityViolations(page);

  const nextActionPicker = inspector.locator(
    ".scenario-action-target-picker",
  );
  await nextActionPicker
    .locator('[data-testid="action-target-picker-trigger"]')
    .click();
  await expect(
    page.getByRole("searchbox", {
      name: "Название, ключ шага, тип или описание",
    }),
  ).toBeFocused();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: testInfo.outputPath("scenario-next-action-picker-desktop.png"),
  });
  await page.getByText("Схема сценария", { exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: /Выберите следующее действие/ }),
  ).toBeHidden();
  await nextActionPicker
    .locator('[data-testid="action-target-picker-trigger"]')
    .click();
  await page
    .getByRole("option", { name: /Задать вопрос с вариантами/ })
    .click();
  await page.locator('[data-testid="action-target-picker-apply"]').click();
  await page.waitForTimeout(350);
  await expect(
    inspector.getByRole("heading", { name: "Задать вопрос с вариантами" }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(inspector).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("scenario graph labels use the project default locale and stable branch identity", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Graph localization is covered on the desktop canvas",
  );
  const fixture = await installScenarioAuthoringFixtures(page, {
    localization: bilingualScenarioLocalization,
  });
  fixture.savedDraft = {
    deliveryPolicy: { kind: "IMMEDIATE" },
    graph: {
      actions: [
        {
          position: 0,
          nodeKey: "question",
          type: "ASK_CHOICE",
          config: {
            message: { ru: "Продолжить?", zh: "继续？" },
            timeoutMs: 30_000,
            onTimeout: "finish",
            options: [
              {
                id: "yes",
                label: { zh: "是", ru: "Да" },
                nextNodeKey: "finish",
              },
              {
                id: "no",
                label: { zh: "否", ru: "Нет" },
                nextNodeKey: "finish",
              },
            ],
          },
        },
        {
          position: 1,
          nodeKey: "finish",
          type: "COMPLETE_SCENARIO",
          nextNodeKey: null,
          config: {},
        },
      ],
    },
  };

  await page.goto("/scenarios/scn_1");
  await page.getByRole("button", { name: /Действия/ }).click();
  await page.getByRole("button", { name: "Развернуть схему сценария" }).click();
  const graph = page.locator(".graph-canvas.graph-expanded .vue-flow");
  await expect(graph).toBeVisible();
  await expect(graph.getByText("Да", { exact: true })).toBeVisible();
  await expect(graph.getByText("Нет", { exact: true })).toBeVisible();
  await expect(graph.getByText("Тайм-аут", { exact: true })).toBeVisible();
  await expect(graph.getByText("是", { exact: true })).toHaveCount(0);
  await expect(graph.getByText("Timeout", { exact: true })).toHaveCount(0);
  const sourceHandles = graph.locator(
    ".vue-flow__handle[data-branch-id]",
  );
  await expect(sourceHandles).toHaveCount(3);
  expect(
    await sourceHandles.evaluateAll((handles) => handles.map(
      (handle) => handle.getAttribute("data-branch-id"),
    )),
  ).toEqual(["choice:yes", "choice:no", "timeout"]);
  const handleCenters = await sourceHandles.evaluateAll((handles) => handles.map((handle) => {
    const box = handle.getBoundingClientRect();
    return box.x + box.width / 2;
  }));
  expect(handleCenters[0]).toBeLessThan(handleCenters[1]!);
  expect(handleCenters[1]).toBeLessThan(handleCenters[2]!);

  const labelChips = graph.locator(".scenario-edge-label");
  await expect(labelChips).toHaveCount(3);
  const labelBoxes = await labelChips.evaluateAll((labels) => labels.map((label) => {
    const box = label.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }));
  for (let left = 0; left < labelBoxes.length; left += 1) {
    for (let right = left + 1; right < labelBoxes.length; right += 1) {
      const first = labelBoxes[left]!;
      const second = labelBoxes[right]!;
      const overlaps = first.left < second.right
        && first.right > second.left
        && first.top < second.bottom
        && first.bottom > second.top;
      expect(overlaps).toBe(false);
    }
  }
  const protectedBoxes = await graph
    .locator(".vue-flow__node-scenario, .vue-flow__handle")
    .evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
  for (const label of labelBoxes) {
    for (const protectedBox of protectedBoxes) {
      const overlaps = label.left < protectedBox.right
        && label.right > protectedBox.left
        && label.top < protectedBox.bottom
        && label.bottom > protectedBox.top;
      expect(overlaps).toBe(false);
    }
  }
  const branchPaths = graph.locator(
    '.vue-flow__edge[data-id^="question-"] .vue-flow__edge-path',
  );
  const pathData = await branchPaths.evaluateAll((paths) => paths.map(
    (path) => path.getAttribute("d"),
  ));
  expect(new Set(pathData).size).toBe(3);
  const timeoutEdge = graph.locator(
    '.vue-flow__edge[data-id="question-timeout"] .vue-flow__edge-path',
  );
  expect(await timeoutEdge.evaluate((path) => getComputedStyle(path).strokeDasharray))
    .not.toBe("none");
  await expect(
    graph.locator('.scenario-edge-label[data-branch-kind="timeout"] .pi-clock'),
  ).toBeVisible();
  const edgeIdsBefore = await graph
    .locator(".vue-flow__edge")
    .evaluateAll((edges) => edges.map((edge) => edge.getAttribute("data-id")));
  await page.getByLabel("Язык подписей графа").click();
  await page.getByRole("option", { name: "китайский", exact: true }).click();
  await expect(graph.getByText("是", { exact: true })).toBeVisible();
  await expect(graph.getByText("否", { exact: true })).toBeVisible();
  const edgeIdsAfter = await graph
    .locator(".vue-flow__edge")
    .evaluateAll((edges) => edges.map((edge) => edge.getAttribute("data-id")));
  expect(edgeIdsAfter).toEqual(edgeIdsBefore);
  await expect(page.locator(".p-select-overlay")).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath("scenario-graph-localized-branches.png"),
  });

  const questionNode = graph
    .locator(".vue-flow__node-scenario")
    .filter({ hasText: "question" });
  await questionNode.focus();
  await expect(questionNode).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Задать вопрос с вариантами", level: 2 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Закрыть инспектор узла" }).click();
  await page.getByRole("button", { name: "Развернуть схему сценария" }).click();
  await page
    .locator(".graph-canvas.graph-expanded .vue-flow__node-scenario")
    .filter({ hasText: "question" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Задать вопрос с вариантами", level: 2 }),
  ).toBeVisible();
});

test("scenario graph constrains long trigger, title and summary inside measured boxes", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Rendered graph box metrics are covered on the desktop canvas",
  );
  const fixture = await installScenarioAuthoringFixtures(page);
  fixture.savedDraft = {
    deliveryPolicy: { kind: "IMMEDIATE" },
    graph: {
      actions: [
        {
          position: 0,
          nodeKey: "long_action",
          nextNodeKey: "finish",
          type: "ОЧЕНЬ_ДЛИННОЕ_НАЗВАНИЕ_ДЕЙСТВИЯ_ДЛЯ_ПРОВЕРКИ_ГРАНИЦ",
          config: {
            text: "Очень длинное описание параметров действия, которое занимает много строк и не должно выходить за измеренную карточку графа сценария",
          },
        },
        {
          position: 1,
          nodeKey: "finish",
          nextNodeKey: null,
          type: "COMPLETE_SCENARIO",
          config: {},
        },
      ],
    },
  };

  await page.goto("/scenarios/scn_1");
  await page.getByRole("button", { name: /Действия/ }).click();
  await page.getByRole("button", { name: "Развернуть схему сценария" }).click();
  const graph = page.locator(".graph-canvas.graph-expanded .vue-flow");
  const trigger = graph.locator(".vue-flow__node-input");
  const actionNode = graph.locator(".flow-node").filter({ hasText: "long_action" });
  const finishNode = graph.locator(".flow-node").filter({ hasText: "finish" });
  await expect(actionNode).toBeVisible();

  const metrics = await actionNode.evaluate((element) => {
    const title = element.querySelector<HTMLElement>(".node-title")!;
    const summary = element.querySelector<HTMLElement>(".node-summary")!;
    const style = getComputedStyle(element);
    return {
      width: element.clientWidth,
      height: element.clientHeight,
      overflow: style.overflow,
      titleOverflow: getComputedStyle(title).overflow,
      titleClamp: getComputedStyle(title).webkitLineClamp,
      summaryOverflow: getComputedStyle(summary).overflow,
      summaryClamp: getComputedStyle(summary).webkitLineClamp,
      titleIsClipped: title.scrollHeight > title.clientHeight,
      summaryIsClipped: summary.scrollHeight > summary.clientHeight,
    };
  });
  expect(metrics).toEqual({
    width: 226,
    height: 118,
    overflow: "hidden",
    titleOverflow: "hidden",
    titleClamp: "2",
    summaryOverflow: "hidden",
    summaryClamp: "2",
    titleIsClipped: true,
    summaryIsClipped: true,
  });

  await trigger.evaluate((element) => {
    const label = [...element.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    if (label) {
      label.textContent =
        "Регистрация завершена после очень длинной последовательности проверок профиля пользователя";
    }
  });
  const triggerMetrics = await trigger.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: element.clientWidth,
      height: element.clientHeight,
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      isClipped: element.scrollWidth > element.clientWidth,
    };
  });
  expect(triggerMetrics).toEqual({
    width: 205,
    height: 44,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    isClipped: true,
  });

  const [actionBox, finishBox] = await Promise.all([
    actionNode.boundingBox(),
    finishNode.boundingBox(),
  ]);
  expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0))
    .toBeLessThanOrEqual(finishBox?.y ?? 0);
  await page.screenshot({
    path: testInfo.outputPath("scenario-graph-long-label-bounds.png"),
  });
});

test("action editor uses list, full-width detail and graph views on mobile", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Mobile composition is covered on the mobile project",
  );
  await installScenarioAuthoringFixtures(page, {
    localization: bilingualScenarioLocalization,
  });
  await page.goto("/scenarios/new");
  await page.getByRole("button", { name: /Действия/ }).click();
  const mobileLibrary = page.locator(".mobile-library-picker");
  await mobileLibrary
    .locator('[data-testid="action-picker-trigger"]')
    .click();
  await expect(page.getByRole("searchbox", { name: "Название, тип или описание" })).toBeFocused();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: testInfo.outputPath("scenario-action-picker-mobile.png"),
  });
  await page.getByRole("option", { name: /Озвучить текст/ }).click();
  await page.locator('[data-testid="action-picker-apply"]').click();
  await page.waitForTimeout(350);

  const inspector = page.locator(".inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector).toBeFocused();
  expect(
    await inspector.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("scenario-actions-mobile-detail.png"),
  });

  await page.getByRole("button", { name: "Закрыть инспектор узла" }).click();
  const outline = page.getByRole("region", {
    name: "Линейный список действий и ожиданий",
  });
  await expect(outline).toBeVisible();
  await expect(
    outline.getByRole("button", { name: "Открыть узел step_1" }),
  ).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("scenario-actions-mobile-list.png"),
  });
  const openGraphButton = outline.getByRole("button", {
    name: "Открыть схему",
  });
  await openGraphButton.click();
  const expandedGraph = page.locator(".graph-canvas.graph-expanded");
  await expect(expandedGraph.locator(".vue-flow")).toBeVisible();
  await expect(expandedGraph).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Вернуться к настройке действия" }),
  ).toBeVisible();
  await expect(page.getByLabel("Язык подписей графа")).toBeVisible();
  expect(
    await expandedGraph.locator(".graph-toolbar").evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("scenario-actions-mobile-graph.png"),
  });
  await expectNoSeriousAccessibilityViolations(page);
  await page.keyboard.press("Escape");
  await expect(outline).toBeVisible();
  await expect(openGraphButton).toBeFocused();

  await outline.getByRole("button", { name: "Открыть узел step_1" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Удалить узел" }).click();
  await expect(
    outline.getByRole("button", { name: "Открыть узел step_1" }),
  ).toHaveCount(0);
  await expect(
    mobileLibrary.locator('[data-testid="action-picker-trigger"]'),
  ).toBeFocused();
});

test("scenario author can save, validate, preview, publish and safely roll back a durable draft", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The full graph journey is covered once on its desktop authoring surface",
  );
  const fixture = await installScenarioAuthoringFixtures(page);

  await page.goto("/scenarios/new");
  await page.locator("#scenario-name").fill("E2E сценарий");
  await page.getByRole("button", { name: /Действия/ }).click();
  await page
    .locator('.action-empty-picker [data-testid="action-picker-trigger"]')
    .click();
  await page
    .locator('[data-testid="action-picker-option"]', {
      hasText: "Показать Retenive",
    })
    .click();
  await page.locator('[data-testid="action-picker-apply"]').click();
  await page.getByRole("button", { name: /Условия/ }).click();
  await page.locator(".recipe-panel > summary").click();
  await page.getByRole("button", { name: /Активен 3 дня подряд/ }).click();

  await page.getByRole("button", { name: "Проверить условия" }).click();
  await expect(page.getByText("Правило прошло проверку.")).toBeVisible();
  await page.locator('input[name="preview-event-log"]').first().check();
  await page
    .getByRole("button", { name: "Проверить правило на событии" })
    .click();
  await expect(page.getByText("Условие совпало")).toBeVisible();

  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(/Черновик v1 сохранён на сервере/)).toBeVisible();
  await expect(page).toHaveURL(/\/scenarios\/[^/]+$/);

  await page.getByRole("button", { name: /Доставка/ }).click();
  await expect(page.locator(".server-review")).toBeVisible();
  await expect(page.locator(".blocked-reason")).toHaveCount(0);
  const publish = page.getByRole("button", {
    name: "Опубликовать immutable revision",
  });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(
    page.getByText(/Опубликована неизменяемая версия revision-e2e-2/),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Откатить к версии 1" }).click();
  await expect.poll(() => fixture.currentRevisionId).toBe("revision-e2e-3");
  expect(fixture.calls).toMatchObject({
    draft: 1,
    preview: 1,
    publish: 1,
    rollback: 1,
  });
  expect(fixture.calls.validateDraft).toBeGreaterThanOrEqual(2);
  expect(fixture.calls.validateRule).toBeGreaterThanOrEqual(1);
});

test("scenario authoring supports keyboard focus, narrow reflow and reduced motion", async ({
  page,
}) => {
  await installScenarioAuthoringFixtures(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/scenarios/new");
  await page.locator("#scenario-name").focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement !== document.body),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole("button", { name: /Действия/ })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("online session opens the shared live conversation workspace", async ({
  page,
}, testInfo) => {
  await page.goto("/live");
  await expect(
    page.getByRole("heading", { name: "Сейчас онлайн", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Открыть диалог с/ })
    .first()
    .click();

  const workspace = page.getByRole("dialog", {
    name: /Рабочее пространство пользователя/,
  });
  await expect(workspace).toBeVisible();
  const openChat = workspace.getByRole("button", { name: "Открыть чат" });
  if (await openChat.isVisible()) await openChat.click();
  await expect(
    workspace.getByRole("heading", { name: "Первый депозит" }),
  ).toBeVisible();
  await expect(
    workspace.getByText("Как лучше пополнить баланс?"),
  ).toBeVisible();

  const conversationsTab = workspace
    .locator(".mobile-workspace-nav button")
    .filter({ hasText: "Диалоги" });
  if (await conversationsTab.isVisible()) {
    await conversationsTab.click();
    await expect(
      workspace.getByRole("button", { name: /Первый депозит/ }),
    ).toContainText("Текущий");
    await workspace
      .locator(".mobile-workspace-nav button")
      .filter({ hasText: "Чат" })
      .click();
    await expect(
      workspace.getByRole("textbox", { name: "Ответ пользователю" }),
    ).toBeVisible();
  }

  await expectNoSeriousAccessibilityViolations(page);
  expect(
    await workspace.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);

  if (testInfo.project.name === "chromium") {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const currentChatTab = workspace
        .locator(".mobile-workspace-nav button")
        .filter({ hasText: "Чат" });
      if (await currentChatTab.isVisible()) await currentChatTab.click();
      const profileButton = workspace.getByRole("button", {
        name: "К профилю",
      });
      if (!(await profileButton.isVisible())) {
        await workspace
          .getByRole("button", { name: "К списку диалогов" })
          .click();
      }
      await profileButton.click();

      if (process.env.VITE_DATA_MODE !== "api") {
        const consumption = workspace.locator(
          '[aria-labelledby="end-user-ai-usage-title"]',
        );
        await expect(consumption).toBeVisible();
        await expect(
          consumption.getByRole("heading", { name: "AI и речь" }),
        ).toBeVisible();
        const speechUsage = consumption.locator(
          '[data-usage-category="SPEECH"]',
        );
        await expect(speechUsage).toContainText("Озвучивание текста");
        await expect(speechUsage).toContainText("1 980 символов");
        await expect(speechUsage).toContainText("4 генерации");
        await expect(
          consumption.getByTestId("end-user-tts-pricing"),
        ).toContainText(
          "История рассчитана по ставке, действовавшей в момент каждой операции",
        );
        expect(
          await consumption.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
        await consumption.scrollIntoViewIfNeeded();
        await page.screenshot({
          animations: "disabled",
          path: testInfo.outputPath(
            `operator-workspace-profile-${viewport.width}x${viewport.height}.png`,
          ),
        });
      }

      await workspace.getByRole("button", { name: "Открыть чат" }).click();
      const chatTab = workspace
        .locator(".mobile-workspace-nav button")
        .filter({ hasText: "Чат" });
      if (await chatTab.isVisible()) await chatTab.click();
      await expect(
        workspace.getByRole("textbox", { name: "Ответ пользователю" }),
      ).toBeVisible();
      await expect(
        workspace.getByRole("button", { name: "Отправить", exact: true }),
      ).toBeVisible();
      expect(
        await workspace.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(
          `operator-workspace-${viewport.width}x${viewport.height}.png`,
        ),
      });
    }
  }
});

test("приостановка AI остаётся понятной в обеих темах и на разных устройствах", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.VITE_DATA_MODE === "api",
    "Сценарий изменяет демонстрационные данные",
  );
  await page.goto("/users/usr_1?conversationId=conv_1");
  const workspace = page.getByRole("dialog", {
    name: /Рабочее пространство пользователя/,
  });
  await expect(workspace).toBeVisible();
  await expect(
    workspace.getByText("Как лучше пополнить баланс?"),
  ).toBeVisible();

  const suspensionControl = page.getByRole("button", {
    name: "Приостановить AI",
    exact: true,
  });
  const translationPanel = workspace.getByRole("region", {
    name: "Перевод диалога",
  });
  await expect(suspensionControl).toBeVisible();
  await workspace
    .getByRole("button", { name: "Другие действия с диалогом" })
    .click();
  await expect(translationPanel).toBeVisible();
  await expect(translationPanel).not.toContainText(
    "Настройки ещё не загружены",
  );
  await workspace
    .getByRole("button", { name: "Другие действия с диалогом" })
    .click();

  await suspensionControl.click();
  const startDialog = page.getByRole("dialog", {
    name: "Приостановить AI в этом диалоге",
  });
  await expect(startDialog.getByText(/Первый депозит.*conv_1/)).toBeVisible();
  await startDialog
    .getByRole("combobox", { name: "Причина" })
    .selectOption("OPERATOR_TAKEOVER");
  await startDialog.getByRole("button", { name: /Приостановить до/ }).click();
  await expect(startDialog).toBeHidden();
  await expect(workspace).toBeVisible();

  const banner = page.getByText("AI приостановлен в этом диалоге", {
    exact: true,
  });
  await expect(banner).toBeVisible();
  const mobileBack = workspace.getByRole("button", {
    name: "К списку диалогов",
  });
  if (await mobileBack.isVisible()) await mobileBack.click();
  await expect(
    page.getByRole("button", { name: /Первый депозит/ }),
  ).toContainText("AI");
  await expect(
    page.getByRole("button", { name: /Знакомство с Retenive/ }),
  ).not.toContainText("AI ⏸");
  await page.getByRole("button", { name: /Первый депозит/ }).click();

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((value) => {
      localStorage.setItem("retenive-theme", value);
      document.documentElement.classList.toggle("retenive-dark", value === "dark");
      document.documentElement.style.colorScheme = value;
    }, theme);
    await expect(page.locator("html")).toHaveClass(
      theme === "dark" ? /retenive-dark/ : /^(?!.*retenive-dark)/,
    );
    await expect(workspace).toBeVisible();
    expect(
      await workspace.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`conversation-ai-suspension-${theme}.png`),
    });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expectNoSeriousAccessibilityViolations(page);
  }

  await page.getByRole("button", { name: "Продлить" }).click();
  const extendDialog = page.getByRole("dialog", {
    name: "Продлить приостановку AI",
  });
  await extendDialog.getByText("+15 минут", { exact: true }).click();
  await extendDialog
    .getByRole("button", { name: "Продлить", exact: true })
    .click();
  await expect(banner).toBeVisible();

  await page.getByRole("button", { name: "Возобновить AI" }).click();
  const resumeDialog = page.getByRole("dialog", {
    name: "Возобновить ответы AI в этом диалоге?",
  });
  await expect(
    resumeDialog.getByText(
      "Следующее сообщение пользователя снова сможет получить автоматический ответ.",
    ),
  ).toBeVisible();
  await resumeDialog.getByRole("button", { name: "Возобновить AI" }).click();
  await expect(banner).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Приостановить AI", exact: true }),
  ).toBeVisible();
});
