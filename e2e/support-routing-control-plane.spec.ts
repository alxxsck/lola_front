import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE === "api",
  "Visual routing fixtures run only in deterministic mock mode; the real API has a dedicated release journey.",
);

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function expectNoOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("shows the complete routing path on all six routes", async ({ page }) => {
  for (const [path, visible] of [
    ["/support/settings/routing", "Шкала готовности"],
    ["/support/settings/teams-skills", "Команды и навыки"],
    ["/support/settings/workforce", "Покрытие и ёмкость"],
    ["/support/settings/queues", "Редактор очереди"],
    ["/support/settings/routing/policies", "Политика назначения"],
    ["/support/settings/routing/decisions", "Решения маршрутизации"],
  ] as const) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: "Маршрутизация обращений" }),
    ).toBeVisible();
    await expect(
      page.getByText(visible, { exact: true }).first(),
    ).toBeVisible();
    await expectNoOverflow(page);
  }
});

test("creates identities, edits queue and policy, runs shadow and opens explain", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.goto("/support/settings/teams-skills");
  await page.getByRole("button", { name: "Новая команда" }).click();
  await page.getByPlaceholder("priority_support").fill("second_line");
  await page.getByPlaceholder("Приоритетная поддержка").fill("Вторая линия");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Создать" })
    .click();
  await expect(page.getByText("Вторая линия", { exact: true })).toBeVisible();

  await page.goto("/support/settings/queues");
  await page.getByRole("combobox", { name: "Тип условия" }).first().click();
  await page.getByRole("option", { name: "Любое условие" }).click();
  await page
    .getByRole("button", { name: "Добавить вложенное условие" })
    .click();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Опубликовать" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Проверить выборку" }).click();
  await expect(page.getByText(/Сервер нашёл 1284 обращений/)).toBeVisible();
  await page.getByRole("button", { name: "История" }).click();
  await expect(
    page.getByRole("dialog", { name: "История и изменения" }),
  ).toBeVisible();
  await expect(page.getByText(/Сравнение версий 2 → 3/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Выше" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Приоритет маршрута" }),
  ).toHaveValue("9");

  await page.goto("/support/settings/routing/policies");
  const attempts = page.getByRole("spinbutton", { name: "Число попыток" });
  await attempts.fill("5");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Отдельный черновик")).toBeVisible();

  await page.goto("/support/settings/routing");
  await page.getByRole("button", { name: "Выключить назначение" }).click();
  await expect(
    page.getByRole("button", { name: "Выключить назначение" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Проверочный запуск" }).click();
  await expect(page.getByText("Проверочный запуск завершён")).toBeVisible();
  await page.getByRole("button", { name: "Включить назначение" }).click();
  await expect(
    page.getByRole("dialog", { name: "Включить назначение" }),
  ).toBeVisible();
  await expect(page.getByText("Версия 3", { exact: true })).toBeVisible();
  await page
    .getByRole("dialog", { name: "Включить назначение" })
    .locator(".field")
    .filter({ hasText: "Целевой режим" })
    .getByRole("combobox")
    .click();
  await page.getByRole("option", { name: "Автоматическое назначение" }).click();
  await page
    .getByRole("button", { name: "Подтвердить автоназначение" })
    .click();
  await expect(
    page.getByRole("button", { name: "Выключить назначение" }),
  ).toBeVisible();

  await page.goto("/support/settings/routing/decisions");
  await page.getByRole("button", { name: /1042/ }).click();
  await expect(
    page.getByRole("heading", { name: "Оператор выбран" }),
  ).toBeVisible();
  await expect(page.getByText("Анна Крылова").last()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Открыть обращение" }),
  ).toHaveAttribute("href", /support\/inbox\/cases\/1042/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /1038/ }).click();
  await expect(
    page.getByRole("heading", { name: "Нет подходящего оператора" }),
  ).toBeVisible();
  await expect(page.getByText(/нет свободной ёмкости/)).toBeVisible();
});

test("supports keyboard navigation, reduced motion and serious accessibility checks", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  for (const path of [
    "/support/settings/routing",
    "/support/settings/teams-skills",
    "/support/settings/workforce",
    "/support/settings/queues",
    "/support/settings/routing/policies",
    "/support/settings/routing/decisions",
  ]) {
    await page.goto(path);
    await page.locator("main.routing-page").waitFor();
    await page.keyboard.press("Tab");
    const results = await new AxeBuilder({ page })
      .include("main.routing-page")
      .analyze();
    expect(
      results.violations.filter(
        ({ impact }) => impact === "critical" || impact === "serious",
      ),
      path,
    ).toEqual([]);
    await expectNoOverflow(page);
  }
});
