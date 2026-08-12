import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Продолжить/ }).click();
  await page.waitForURL("**/overview");
}

async function expectNoPageOverflow(page: Page) {
  const loadingSwap = page.locator('.page-loading-swap').last();
  if (await loadingSwap.count()) {
    await expect(loadingSwap).toHaveAttribute('aria-busy', 'false');
    await expect(loadingSwap.locator('.page-loading-swap__layer')).toHaveCount(1);
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

test("completes the Quality queue, review and feedback workflow", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signIn(page);
  await page.goto("/support/quality");
  await expect(
    page.getByRole("heading", { name: "Контроль качества" }),
  ).toBeVisible();
  await expect(page.getByText("Случайная выборка")).toBeVisible();
  await expect(page.getByText("Риск-выборка", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/support\/quality\/reviews\/review-001$/);
  await expect(
    page.getByRole("heading", { name: "Проверка обращения" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Открыть кейс" })).toHaveAttribute(
    "href",
    "/support/inbox/cases/case-4790",
  );
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Черновик сохранён")).toBeVisible();
  await page.getByRole("button", { name: "Отправить оператору" }).click();
  await expect(page.getByText("Оценка отправлена оператору")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText("Обратная связь подтверждена")).toBeVisible();
  await page.getByRole("button", { name: "Открыть апелляцию" }).click();
  await page
    .getByPlaceholder("Что необходимо пересмотреть")
    .fill("Проверить критерий ясности");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Открыть апелляцию" })
    .click();
  await expect(
    page.getByRole("article").filter({
      hasText: "Проверить критерий ясности",
    }),
  ).toBeVisible();
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
    await expect(
      page.getByRole("heading", { name: title, level: 1 }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
  }

  await page.goto("/support/quality/calibrations");
  await page.getByRole("button", { name: "Открыть сессию" }).click();
  await expect(
    page.getByRole("heading", { name: "Согласованность оценок" }),
  ).toBeVisible();
  await expect(page.getByText("Результат скрыт").first()).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto("/support/quality/scorecards");
  await page.getByRole("button", { name: "Настроить выборку" }).click();
  await expect(
    page.getByRole("dialog", { name: "Детерминированная выборка проверок" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Создать политику" }).click();
  await expect(page.getByText("Политика выборки создана")).toBeVisible();
  await page
    .getByRole("button", { name: "Выбрать обращения за 7 дней" })
    .click();
  await expect(page.getByText(/проверок добавлено в очередь/)).toBeVisible();
});

test("creates, edits and submits an independent calibration review", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/support/quality/calibrations");
  await page.getByRole("button", { name: "Открыть сессию" }).click();
  await expect(page.getByText("Результат скрыт").first()).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Приветствие и тон", exact: true })
    .check();
  await page.getByLabel("Баллы: Приветствие и тон").fill("4");
  await page.getByLabel("Баллы: Ясность решения").fill("8");
  await page.getByLabel("Баллы: Точность ответа").fill("9");
  await page.getByText(/Оператор · сообщение 12/).click();
  await page.getByRole("button", { name: "Начать независимую оценку" }).click();
  await expect(page).toHaveURL(/\/support\/quality\/reviews\/review-cal-/);
  await expect(page.getByText("Черновик", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Черновик сохранён")).toBeVisible();
  await page.getByRole("button", { name: "Отправить оператору" }).click();
  await expect(page.getByText("Оценка отправлена оператору")).toBeVisible();
  await page.getByRole("button", { name: "К очереди" }).click();
  await page.getByRole("link", { name: "Калибровки" }).click();
  await page.getByRole("button", { name: "Открыть сессию" }).click();
  await expect(page.getByText("Оценка доступна").first()).toBeVisible();
  await expectNoPageOverflow(page);
});

test("renders curated analytics, fail-closed readiness and result receipt", async ({
  page,
}) => {
  await signIn(page);
  for (const [path, title] of [
    ["/support/analytics", "Аналитика поддержки"],
    ["/support/analytics/flow", "Поток обращений"],
    ["/support/analytics/quality", "Качество поддержки"],
    ["/support/analytics/team", "Команда и нагрузка"],
    ["/support/analytics/automation", "Автоматизация"],
  ] as const) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: title, level: 1 }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
  }

  await page.goto("/support/analytics/flow");
  await expect(page.getByRole("heading", { name: "Поток обращений" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Первый ответ/ }),
  ).toBeVisible();

  await page.goto("/support/analytics/quality");
  await expect(
    page.getByRole("group", { name: /Проверенные диалоги/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Таблица" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "График", exact: true }).click();
  await page.getByRole("button", { name: "Квитанция" }).click();
  await expect(
    page.getByRole("heading", { name: "Квитанция результата" }),
  ).toBeVisible();
  await expect(page.getByText("Полные данные", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Сохранить отчёт" }).click();
  await expect(
    page.getByRole("dialog", { name: "Сохранить Support-отчёт" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText(/Черновик отчёта сохранён/)).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать отчёт" }).click();
  await expect(page.getByText("Отчёт опубликован.")).toBeVisible();
  const reportHref = await page
    .getByRole("link", { name: "Открыть отчёт" })
    .getAttribute("href");
  expect(reportHref).toMatch(/^\/support\/analytics\/reports\//);

  await page.getByRole("button", { name: "CSV" }).click();
  await expect(page.getByText(/CSV-экспорт поставлен в очередь/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать" }).click();
  await download;
  await page.getByRole("button", { name: "Отозвать" }).click();
  await expect(page.getByText(/Доступ к экспорту отозван/)).toBeVisible();
  await page.getByRole("button", { name: "Расписание" }).click();
  await page.getByLabel("Время").fill("08:30");
  await page.getByRole("button", { name: "Создать расписание" }).click();
  await expect(page.getByText(/Расписание создано и активно/)).toBeVisible();
  await page.getByRole("button", { name: "Доставки" }).click();
  await expect(
    page.getByRole("dialog", { name: "Расписания и доставки" }),
  ).toBeVisible();
  await expect(page.getByText(/Ежедневно:/)).toBeVisible();
  await page
    .getByRole("dialog", { name: "Расписания и доставки" })
    .getByRole("button", { name: "Закрыть", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Пауза" }).click();
  await expect(page.getByText(/Расписание приостановлено/)).toBeVisible();
  await page.getByRole("button", { name: "Архивировать" }).click();
  await expect(page.getByText(/Расписание перенесено в архив/)).toBeVisible();
  await page.getByRole("button", { name: "Черновик панели" }).click();
  await page.getByRole("button", { name: "Опубликовать панель" }).click();
  await expect(page).toHaveURL(/\/support\/analytics\/dashboards\//);
  await expect(page.getByText("Личная панель")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Дашборд:/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.locator(".drilldown-link").first().click();
  await expect(page.getByText("Проверки качества", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Путь детализации" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Участник проекта").click();
  await page.getByRole("option", { name: "Марина Соколова" }).click();
  await page.getByRole("button", { name: "Выдать доступ" }).click();
  await expect(page.getByText(/Доступ выдан/)).toBeVisible();
  await page.getByRole("button", { name: "Отозвать доступ" }).click();
  await expect(page.getByText("Доступ отозван.")).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto(reportHref!);
  await expect(page.getByText("Сохранённый отчёт")).toBeVisible();
  await expect(page.getByText("неизменяемый отпечаток запроса")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Дублировать" }).click();
  await expect(page.getByText(/Копия отчёта создана/)).toBeVisible();
  await expectNoPageOverflow(page);
});

test("has no serious accessibility violations on the primary Ticket 33 routes", async ({
  page,
}) => {
  await signIn(page);
  for (const path of [
    "/support/quality",
    "/support/quality/reviews/review-001",
    "/support/quality/scorecards",
    "/support/quality/calibrations",
    "/support/quality/disputes",
    "/support/analytics",
    "/support/analytics/flow",
    "/support/analytics/quality",
    "/support/analytics/team",
    "/support/analytics/automation",
  ]) {
    await page.goto(path);
    await page.locator("main").last().waitFor();
    await expectNoPageOverflow(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter(
        ({ impact }) => impact === "critical" || impact === "serious",
      ),
      `Axe violations at ${path}`,
    ).toEqual([]);
  }
});

test("keeps the operational hierarchy at 200% zoom and reduced motion", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "One desktop zoom proof is sufficient.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await page.goto("/support/analytics/quality");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(
    page.getByRole("heading", { name: "Качество поддержки" }),
  ).toBeVisible();
  await expect(page.locator(".curated-widget").first()).toBeVisible();
  await expectNoPageOverflow(page);
});

test("keeps long operational values readable in the dark theme", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "One exact desktop visual proof is sufficient.",
  );
  await signIn(page);
  await page.goto("/support/analytics");
  const themeSwitch = page.getByRole("checkbox", {
    name: /Включить тёмную тему/,
  });
  if (await themeSwitch.isVisible()) await themeSwitch.check();
  await expect(page.locator("html")).toHaveClass(/retenive-dark/);
  await page
    .locator(".curated-widget")
    .first()
    .evaluate((element) => {
      const context = element.querySelector(".widget-context");
      const value = element.querySelector(".widget-value");
      if (context)
        context.textContent =
          "Очень длинное проверяемое описание операционного показателя без потери смысла";
      if (value) value.textContent = "9 999 999 999,9";
    });
  await expectNoPageOverflow(page);
  await expect(page.getByText("9 999 999 999,9")).toBeVisible();
});
