import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
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

test("project admission settings can be inspected and saved", async ({
  page,
}) => {
  await page.goto("/project");
  await page.getByRole("button", { name: /Частота и тихие часы/ }).click();

  await expect(page.getByText("Общая частота")).toBeVisible();
  await expect(page.getByText("Тихие часы", { exact: true })).toBeVisible();
  await expect(page.getByText("Локальное время игрока")).toBeVisible();
  await expect(
    page.getByText(/Не более 3 запусков за локальные сутки/),
  ).toBeVisible();

  const dailyLimit = page.getByLabel("Максимум за локальные сутки");
  await dailyLimit.fill("4");
  await page.getByRole("button", { name: "Сохранить частоту" }).click();
  await expect(
    page.getByText(/Не более 4 запусков за локальные сутки/),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("admission decisions explain both starts and suppressions", async ({
  page,
}) => {
  await page.goto("/operations");
  await page.getByRole("tab", { name: /Решения о запуске/ }).click();

  await expect(
    page.getByText("Предупреждение о необычном входе"),
  ).toBeVisible();
  await expect(page.getByText("Предложение выходного дня")).toBeVisible();
  await expect(
    page.getByText("Не запущен: выбран более приоритетный сценарий"),
  ).toBeVisible();

  await page.getByText("Предложение выходного дня").click();
  await expect(
    page.getByText("Решение о запуске", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Run не создавался")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("scenario author sees importance and quiet-hours semantics", async ({
  page,
}) => {
  await page.route(
    "**/api/v1/admin/projects/*/scenario-authoring/catalog",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "prj_retenive_demo",
          revision: "catalog-admission-e2e",
          version: 1,
          events: [
            {
              code: "registration_completed",
              definitionId: "evt_1",
              definitionKeyId: "event-key-registration",
              name: "Регистрация завершена",
              schemaVersion: 1,
              capabilities: { eventMeasures: [] },
              fields: [],
            },
          ],
          audience: {
            version: 1,
            revision: "audience-catalog-admission-e2e",
            locales: [
              { code: "ru-RU", language: "ru", label: "Русский" },
            ],
            localeSource: {
              operators: ["eq"],
              control: "SELECT",
              authoringAvailability: "AVAILABLE",
            },
            languageSource: {
              operators: ["eq"],
              control: "SELECT",
              authoringAvailability: "AVAILABLE",
            },
            country: {
              source: "profile.country",
              valueType: "countryCode",
              semantics: "ISO_3166_1_ALPHA_2_UPPERCASE",
              operators: ["eq"],
              control: "COUNTRY_CODE",
              authoringAvailability: "AVAILABLE",
            },
            attributes: [],
            segmentSource: {
              operators: ["is_member"],
              searchEndpoint: "/segments",
              control: "SEARCH",
              authoringAvailability: "AVAILABLE",
            },
            snapshotPolicy: {
              initialEvaluation: "RUN_START",
              missingOrNull: "NO_MATCH_EXCEPT_NOT_EXISTS",
              deletedDefinition: "PINNED_SNAPSHOT_CONTINUES",
              unavailableSource: "PUBLISH_REJECTED_EXPLAIN_UNAVAILABLE",
              segmentRevision: "PINNED_REVISION",
              persistence: "SNAPSHOT_WITH_SEPARATE_LAST_RECHECK",
              recheckTrigger: "DELIVERY_RECHECK_ELIGIBILITY",
            },
          },
        }),
      }),
  );

  await page.goto("/scenarios/new");
  await expect(
    page.getByRole("heading", { name: "Настройки запуска" }),
  ).toBeVisible();
  await expect(page.getByText("Класс важности")).toBeVisible();
  await expect(page.getByText("Соблюдать тихие часы проекта")).toBeVisible();

  await page.getByLabel("Класс важности").click();
  await page.getByText("Безопасность", { exact: true }).click();
  await expect(
    page.getByText(/игнорирует частоту и тихие часы/i),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: /Условия/ }).click();
  const conditionScale = await page.evaluate(() => {
    const fontSize = (selector: string) =>
      getComputedStyle(document.querySelector(selector)!).fontSize;
    return {
      emphasis: fontSize(".rule-builder .recipe-heading strong"),
      supporting: fontSize(".rule-builder .recipe-heading small"),
      empty: fontSize(".rule-builder .group-empty span"),
      summary: fontSize(".rule-builder .builder-summary > div > strong"),
    };
  });

  await page.getByRole("button", { name: /Аудитория/ }).click();
  const audienceBuilder = page.locator(".audience-builder");
  const anyCondition = audienceBuilder.getByRole("button", {
    name: "Достаточно одного условия",
    exact: true,
  });
  await expect(
    audienceBuilder.getByRole("button", {
      name: "Должны выполняться все условия",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await anyCondition.click();
  await expect(anyCondition).toHaveAttribute("aria-pressed", "true");
  await expect(
    audienceBuilder.locator('select[aria-label^="Как учитывать условия"]'),
  ).toHaveCount(0);
  const audienceScale = await page.evaluate(() => {
    const fontSize = (selector: string) =>
      getComputedStyle(document.querySelector(selector)!).fontSize;
    return {
      emphasis: fontSize(".audience-builder .semantics-note strong"),
      supporting: fontSize(".audience-builder .semantics-note span"),
      empty: fontSize(".audience-builder .group-empty span"),
      summary: fontSize(".audience-builder .summary > div > strong"),
    };
  });
  expect(audienceScale).toEqual(conditionScale);
  await expectNoSeriousAccessibilityViolations(page);
});

test("segment editor uses the same audience logic controls", async ({ page }) => {
  await page.goto("/segments");
  await page.getByRole("link", { name: "Новый сегмент" }).click();
  await expect(
    page.getByRole("heading", { name: "Новый сегмент" }),
  ).toBeVisible();

  const audienceBuilder = page.locator(".audience-builder");
  const allConditions = audienceBuilder.getByRole("button", {
    name: "Должны выполняться все условия",
    exact: true,
  });
  const anyCondition = audienceBuilder.getByRole("button", {
    name: "Достаточно одного условия",
    exact: true,
  });

  await expect(allConditions).toHaveAttribute("aria-pressed", "true");
  await anyCondition.click();
  await expect(anyCondition).toHaveAttribute("aria-pressed", "true");
  await expect(
    audienceBuilder.locator('select[aria-label^="Как учитывать условия"]'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expectNoSeriousAccessibilityViolations(page);
});
