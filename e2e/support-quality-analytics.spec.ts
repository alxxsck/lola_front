import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Продолжить/ }).click();
  await page.waitForURL("**/overview");
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

test("completes the Quality queue, review and feedback workflow", async ({ page }) => {
  await signIn(page);
  await page.goto("/support/quality");
  await expect(page.getByRole("heading", { name: "Контроль качества" })).toBeVisible();
  await expect(page.getByText("Случайная выборка")).toBeVisible();
  await expect(page.getByText("Риск-выборка", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/support\/quality\/reviews\/review-001$/);
  await expect(page.getByRole("heading", { name: "Кейс case-4790" })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Черновик сохранён")).toBeVisible();
  await page.getByRole("button", { name: "Отправить оператору" }).click();
  await expect(page.getByText("Оценка отправлена оператору")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText("Обратная связь подтверждена")).toBeVisible();
  await page.getByRole("button", { name: "Открыть апелляцию" }).click();
  await page.getByPlaceholder("Что необходимо пересмотреть").fill("Проверить критерий ясности");
  await page.getByRole("dialog").getByRole("button", { name: "Открыть апелляцию" }).click();
  await expect(page.getByText("Ответ сохранён")).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto("/support/quality");
  await page.getByRole("button", { name: "Взять проверку" }).click();
  await expect(page).toHaveURL(/\/support\/quality\/reviews\/review-/);
  await expect(page.getByText("Черновик", { exact: true })).toBeVisible();

  for (const [path, title] of [
    ["/support/quality/scorecards", "Карты оценки"],
    ["/support/quality/calibrations", "Калибровки"],
    ["/support/quality/disputes", "Апелляции"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expectNoPageOverflow(page);
  }

  await page.goto("/support/quality/calibrations");
  await page.getByRole("button", { name: "Открыть сессию" }).click();
  await expect(page.getByRole("heading", { name: "Согласованность оценок" })).toBeVisible();
  await expect(page.getByText("Результат скрыт").first()).toBeVisible();
  await expectNoPageOverflow(page);
});

test("renders curated analytics, fail-closed readiness and result receipt", async ({ page }) => {
  await signIn(page);
  for (const [path, title] of [
    ["/support/analytics", "Аналитика поддержки"],
    ["/support/analytics/flow", "Поток обращений"],
    ["/support/analytics/quality", "Качество поддержки"],
    ["/support/analytics/team", "Команда и нагрузка"],
    ["/support/analytics/automation", "Автоматизация"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expectNoPageOverflow(page);
  }

  await page.goto("/support/analytics/flow");
  await expect(page.getByRole("heading", { name: /источник ещё не готов/ })).toBeVisible();
  await expect(page.getByText(/не показываем искусственные нули/)).toBeVisible();

  await page.goto("/support/analytics/quality");
  await expect(page.getByRole("img", { name: /Проверенные диалоги/ })).toBeVisible();
  await page.getByRole("button", { name: "Квитанция" }).click();
  await expect(page.getByRole("heading", { name: "Квитанция результата" })).toBeVisible();
  await expect(page.getByText("COMPLETE", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Сохранить отчёт" }).click();
  await expect(page.getByRole("dialog", { name: "Сохранить Support-отчёт" })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить и опубликовать" }).click();
  await expect(page.getByText("Отчёт сохранён и опубликован.")).toBeVisible();
  const reportHref = await page.getByRole("link", { name: "Открыть отчёт" }).getAttribute("href");
  expect(reportHref).toMatch(/^\/support\/analytics\/reports\//);

  await page.getByRole("button", { name: "CSV" }).click();
  await expect(page.getByText(/CSV-экспорт поставлен в очередь/)).toBeVisible();
  await page.getByRole("button", { name: "PDF" }).click();
  await expect(page.getByText(/PDF-экспорт поставлен в очередь/)).toBeVisible();
  await page.getByRole("button", { name: "Ежедневно" }).click();
  await expect(page.getByText(/Расписание активно/)).toBeVisible();
  await page.getByRole("button", { name: "Пауза" }).click();
  await expect(page.getByText(/Расписание приостановлено/)).toBeVisible();
  await page.getByRole("button", { name: "Архивировать" }).click();
  await expect(page.getByText(/Расписание архивировано/)).toBeVisible();
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(page.getByText(/Экспорт отменён/)).toBeVisible();

  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/support\/analytics\/dashboards\//);
  await expect(page.getByText("Personal dashboard")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Дашборд:/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByPlaceholder("CMS User ID").fill("cms-user-2");
  await page.getByRole("button", { name: "Выдать доступ" }).click();
  await expect(page.getByText(/Доступ выдан/)).toBeVisible();
  await page.getByRole("button", { name: "Отозвать доступ" }).click();
  await expect(page.getByText("Доступ отозван.")).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto(reportHref!);
  await expect(page.getByText("Saved report")).toBeVisible();
  await expect(page.getByText("immutable query hash")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Дублировать" }).click();
  await expect(page.getByText(/Копия создана/)).toBeVisible();
  await expectNoPageOverflow(page);
});

test("has no serious accessibility violations on the primary Ticket 33 routes", async ({ page }) => {
  await signIn(page);
  for (const path of [
    "/support/quality",
    "/support/quality/reviews/review-001",
    "/support/analytics/quality",
  ]) {
    await page.goto(path);
    await page.locator("main").last().waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter(({ impact }) => impact === "critical" || impact === "serious"),
      `Axe violations at ${path}`,
    ).toEqual([]);
  }
});
