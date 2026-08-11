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
    page.getByRole("button", { name: "Настроить область применения" }),
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
    page.locator(".classification-map").getByRole("heading", { name: "Доставка" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Добавить правило" }).click();
  const ruleDialog = page.getByRole("dialog", { name: "Новое точное правило" });
  await ruleDialog.getByLabel("Код правила").fill("DELIVERY_PHRASE");
  await ruleDialog
    .getByRole("textbox", { name: "Фраза в сообщении" })
    .fill("где мой заказ");
  await page.getByRole("button", { name: "Готово" }).click();

  await page.getByRole("button", { name: "Открыть проверку" }).click();
  const previewDialog = page.getByRole("dialog", { name: "Проверка на примере" });
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
  await expect(page.getByText("Покрытие достаточно", { exact: true })).toBeVisible();
  await expect(page.getByText("4 из 4", { exact: true })).toBeVisible();
  await sectionNavigation
    .getByRole("link", { name: "Категории и правила" })
    .click();

  await page.getByRole("button", { name: "Настроить область применения" }).click();
  const scopeDialog = page.getByRole("dialog", { name: "Область применения" });
  await scopeDialog
    .getByLabel("Для чего нужна классификация")
    .fill("Черновик на телефоне");
  await scopeDialog.getByRole("button", { name: "Готово" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Настроить область применения" }),
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
