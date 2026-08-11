import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/support/settings/case-intelligence/detection");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Категории и правила обращений",
    }),
  ).toBeVisible();
});

test("edits, checks, saves and publishes classification rules", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Категории", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Настроить охват" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Открыть проверку" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Проверка на примере" }),
  ).toBeHidden();

  await page.getByRole("button", { name: "Добавить категорию" }).click();
  const categoryDialog = page.getByRole("dialog", { name: "Новая категория" });
  await expect(categoryDialog).toBeVisible();
  await categoryDialog.getByLabel("Код категории").fill("DELIVERY");
  await categoryDialog.getByLabel("Название категории").fill("Доставка");
  await page
    .getByLabel("Какие обращения сюда относятся")
    .fill("Доставка и сроки получения заказа");
  await page
    .getByRole("textbox", { name: "Подходящие примеры", exact: true })
    .fill("Где мой заказ?\nКогда будет доставка?");
  await page
    .getByRole("textbox", {
      name: "Похожие, но неподходящие примеры",
      exact: true,
    })
    .fill("Как оформить заказ?");
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(categoryDialog).toBeHidden();
  await expect(
    page
      .locator(".classification-map")
      .getByRole("heading", { name: "Доставка" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Добавить правило" }).click();
  const ruleDialog = page.getByRole("dialog", { name: "Новое точное правило" });
  await ruleDialog.getByLabel("Код правила").fill("DELIVERY_PHRASE");
  await ruleDialog
    .getByRole("textbox", { name: "Фраза в сообщении" })
    .fill("где мой заказ");
  await page.getByRole("button", { name: "Готово" }).click();

  await page.getByRole("button", { name: "Открыть проверку" }).click();
  const previewDialog = page.getByRole("dialog", {
    name: "Проверка на примере",
  });
  await expect(previewDialog).toBeVisible();
  await page.getByLabel("Текст сообщения 1").fill("Где мой заказ?");
  await page.getByRole("button", { name: "Проверить диалог" }).click();
  await expect(
    page.getByText("Создать обращение", { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.locator(".test-result").getByText("DELIVERY_PHRASE"),
  ).toBeVisible();
  await previewDialog
    .getByRole("button", { name: "Закрыть" })
    .filter({ hasText: "Закрыть" })
    .click();

  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Черновик правил сохранён.")).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Опубликовать изменения?" });
  await dialog
    .getByLabel("Причина изменения")
    .fill("Добавлена категория доставки");
  await dialog.getByRole("button", { name: "Опубликовать" }).click();
  await expect(
    page.getByText(
      "Правила категорий опубликованы и готовы для следующей общей рабочей версии.",
    ),
  ).toBeVisible();
});

test("keeps the permanent settings navigation responsive and accessible", async ({
  page,
}) => {
  const sectionNavigation = page.getByRole("navigation", {
    name: "Разделы правил обращений",
  });
  await sectionNavigation.getByRole("link", { name: "Обзор" }).click();
  await expect(
    page.getByText("Общая рабочая версия ещё не собрана", { exact: true }),
  ).toBeVisible();
  await sectionNavigation
    .getByRole("link", { name: "Модель и лимиты" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ограничения расходов" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Проверить покрытие" }).click();
  await expect(
    page.getByText("Покрытие достаточно", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("4 из 4", { exact: true })).toBeVisible();
  await sectionNavigation
    .getByRole("link", { name: "Категории и правила" })
    .click();

  await page.getByRole("button", { name: "Настроить охват" }).click();
  const scopeDialog = page.getByRole("dialog", { name: "Охват классификации" });
  await expect(
    scopeDialog.getByText("Язык здесь — не переключатель понимания Lola"),
  ).toBeVisible();
  await expect(
    scopeDialog.getByText(/Сообщение на другом языке не пропадёт/),
  ).toBeVisible();
  await scopeDialog.locator(".p-multiselect").click();
  await page
    .getByRole("option", { name: "Английский · en", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(scopeDialog.getByLabel("Запасной язык")).toBeEnabled();
  await scopeDialog
    .getByLabel("Зачем проекту нужна классификация")
    .fill("Черновик на телефоне");
  await scopeDialog.getByRole("button", { name: "Готово" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Настроить охват" }),
  ).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);

  const accessibility = await new AxeBuilder({ page })
    .include(".intelligence-page")
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  await page.evaluate(() => localStorage.setItem("retenive-theme", "dark"));
  await page.reload();
  await expect(page.locator(".intelligence-page")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Категории и правила обращений",
    }),
  ).toBeVisible();
  const darkAccessibility = await new AxeBuilder({ page })
    .include(".intelligence-page")
    .analyze();
  expect(
    darkAccessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("edits and simulates Human Escalation without dispatching work", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "Разделы правил обращений" })
    .getByRole("link", { name: "Передача оператору" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Передача оператору" }),
  ).toBeVisible();
  await expect(
    page.getByText("Безопасность нельзя отключить в проекте"),
  ).toBeVisible();
  await expect(
    page.getByText("Обязательные правила платформы · только просмотр"),
  ).toBeVisible();
  await expect(page.getByText("Безопасность готова")).toBeVisible();

  const explicitRule = page.getByRole("button", { name: /HUMAN_REQUEST_RU/ });
  await explicitRule.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/escalationPanel=rule/u);
  const editor = page.getByRole("dialog", { name: "Явная просьба человека" });
  await expect(editor).toBeVisible();
  await expect(editor.getByText(/всегда создаёт передачу/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(page).not.toHaveURL(/escalationPanel=rule/u);
  await expect(explicitRule).toBeFocused();

  await page.getByRole("button", { name: "Добавить просьбу" }).click();
  const newEditor = page.getByRole("dialog", {
    name: "Явная просьба человека",
  });
  const phrases = newEditor.getByLabel("Фразы");
  await expect(phrases).toHaveAttribute("aria-invalid", "true");
  await expect(newEditor.getByText("Добавьте от 1 до 50 фраз.")).toBeVisible();
  await expect(
    newEditor.getByRole("button", { name: "Готово" }),
  ).toBeDisabled();
  await newEditor.getByRole("button", { name: "Отмена" }).click();

  await page.getByRole("button", { name: "Проверить сценарий" }).click();
  await expect(page).toHaveURL(/escalationPanel=simulator/u);
  const simulator = page.getByRole("dialog", {
    name: "Проверка сценария передачи",
  });
  await expect(simulator.getByText("Без реальных действий")).toBeVisible();
  await simulator.getByRole("button", { name: "Явная просьба" }).click();
  await simulator
    .getByRole("button", { name: "Повторить то же событие" })
    .first()
    .click();
  await simulator.getByRole("button", { name: "Запустить проверку" }).click();
  await expect(page).toHaveURL(/escalationPanel=result/u);
  await expect(simulator.getByText("Без записи")).toBeVisible();
  await expect(simulator.getByText(/Повтор шага 1/)).toBeVisible();
  await expect(
    simulator.getByText(/Передаём обращение команде поддержки/).first(),
  ).toBeVisible();
  await expect(
    simulator.getByText(/Состояние решения зафиксировано/),
  ).toBeVisible();
  await expect(
    simulator.getByText(/Решение зафиксировано/).first(),
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 1000) <= 600) {
    await expect(simulator.locator(".step-builder")).toBeHidden();
    await expect(simulator.locator(".simulation-result")).toBeVisible();
    await simulator.getByRole("button", { name: "1. События" }).click();
    await expect(simulator.locator(".step-builder")).toBeVisible();
    await simulator.getByRole("button", { name: "2. Результат" }).click();
  }
  await page.goBack();
  await expect(page).toHaveURL(/escalationPanel=simulator/u);
  if ((page.viewportSize()?.width ?? 1000) <= 600)
    await expect(simulator.locator(".step-builder")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/escalationPanel=result/u);

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);

  await page.keyboard.press("Escape");
  const accessibility = await new AxeBuilder({ page })
    .include(".escalation-page")
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("renders the complete Human Escalation transition and Safety states", async ({
  page,
}) => {
  test.skip(
    (page.viewportSize()?.width ?? 1000) <= 600,
    "The mobile route stack is covered by the primary simulator journey.",
  );
  await page
    .getByRole("navigation", { name: "Разделы правил обращений" })
    .getByRole("link", { name: "Передача оператору" })
    .click();
  await page.getByRole("button", { name: "Проверить сценарий" }).click();
  const simulator = page.getByRole("dialog", {
    name: "Проверка сценария передачи",
  });
  const run = async () => {
    await simulator.getByRole("button", { name: "Запустить проверку" }).click();
    await expect(page).toHaveURL(/escalationPanel=result/u);
    await expect(simulator.getByText("Без записи")).toBeVisible();
  };
  const editEvent = async (
    index: number,
    eventName?: string,
    safetyName?: string,
    delayMinutes?: number,
  ) => {
    await simulator.locator(".step-summary").nth(index).click();
    const dialog = page.getByRole("dialog", { name: "Параметры события" });
    if (eventName) {
      await dialog.getByRole("combobox").first().click();
      await page.getByRole("option", { name: eventName, exact: true }).click();
    }
    if (safetyName) {
      await dialog
        .locator("label")
        .filter({ hasText: "Проверка безопасности" })
        .getByRole("combobox")
        .click();
      await page.getByRole("option", { name: safetyName, exact: true }).click();
    }
    if (delayMinutes !== undefined)
      await dialog
        .locator("label")
        .filter({ hasText: "Через сколько минут от начала" })
        .getByRole("spinbutton")
        .fill(String(delayMinutes));
    await dialog.getByRole("button", { name: "Готово" }).click();
  };

  await simulator.getByRole("button", { name: "Предложение принято" }).click();
  await run();
  await expect(simulator.getByText(/Оператор предложен/).first()).toBeVisible();
  await expect(
    simulator.getByText(/CASE_INTELLIGENCE_OFFER_ACCEPTED/),
  ).toBeVisible();

  await editEvent(1, "Пользователь отказался");
  await run();
  await expect(
    simulator.getByText(/Пауза перед новым предложением/).first(),
  ).toBeVisible();
  await expect(simulator.getByText(/Повтор после/).first()).toBeVisible();

  await editEvent(1, "Пользователь не ответил", undefined, 6);
  await run();
  await expect(
    simulator.getByText(/CASE_INTELLIGENCE_OFFER_TIMEOUT/),
  ).toBeVisible();

  await simulator.getByRole("button", { name: "Повторные неудачи" }).click();
  await run();
  await expect(simulator.getByText("Неудачи 1 → 2")).toBeVisible();
  await expect(
    simulator.getByText("Lola не дала ответа: 2").first(),
  ).toBeVisible();
  await expect(
    simulator.getByText(/CASE_INTELLIGENCE_NO_ANSWER_LIMIT/),
  ).toBeVisible();

  await editEvent(1, "Решение подтверждено");
  await run();
  await expect(simulator.getByText("Неудачи 1 → 0")).toBeVisible();

  await simulator.getByRole("button", { name: "Явная просьба" }).click();
  await editEvent(0, "Правила сменились");
  await run();
  await expect(simulator.getByText("Смена правил: применена")).toBeVisible();
  await expect(
    simulator.getByText(/Решение зафиксировано/).first(),
  ).toBeVisible();

  await simulator.getByRole("button", { name: "Срочный риск" }).click();
  await run();
  const urgentResult = simulator.locator(".timeline > li").first();
  await expect(
    urgentResult.getByText("Требуется немедленное действие"),
  ).toBeVisible();
  await expect(
    urgentResult.getByText(/CASE_INTELLIGENCE_SAFETY_CASE_ESCALATION/),
  ).toBeVisible();

  await simulator.getByRole("button", { name: "Повторные неудачи" }).click();
  await editEvent(0, undefined, "Проверка продолжается");
  await run();
  const pendingResult = simulator.locator(".timeline > li").first();
  await expect(pendingResult.getByText("Проверка продолжается")).toBeVisible();
  await expect(
    pendingResult.getByText(/Проверка будет повторена/),
  ).toBeVisible();
  await expect(
    pendingResult.getByText(/Ответственная команда получит оповещение/),
  ).toHaveCount(0);

  await editEvent(0, undefined, "Проверка не завершилась");
  await run();
  const failedResult = simulator.locator(".timeline > li").first();
  await expect(failedResult.getByText("Проверка не завершилась")).toBeVisible();
  await expect(
    failedResult.getByText(/Ответственная команда получит оповещение/),
  ).toBeVisible();
});

test("links exact budget errors to their fields and blocks an invalid draft", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "Разделы правил обращений" })
    .getByRole("link", { name: "Модель и лимиты" })
    .click();

  const softLimit = page.getByLabel("Предупреждение по токенам в день");
  const hardLimit = page.getByLabel("Максимум токенов в день");
  await hardLimit.fill("100");
  await softLimit.fill("200");

  await expect(softLimit).toHaveAttribute("aria-invalid", "true");
  await expect(softLimit).toHaveAttribute(
    "aria-describedby",
    "token-soft-error",
  );
  await expect(page.locator("#token-soft-error")).toHaveText(
    "Предупреждение должно срабатывать раньше жёсткого лимита.",
  );
  await expect(
    page.getByRole("button", { name: "Сохранить черновик" }),
  ).toBeDisabled();
});
