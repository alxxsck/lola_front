import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/support/inbox");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Рабочее место оператора",
    }),
  ).toBeVisible();
});

test("opens a project conversation as a deep link without horizontal overflow", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Бонусы и программа лояльности",
    }),
  ).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    workspaceRight:
      document.querySelector(".support-workspace")?.getBoundingClientRect()
        .right ?? 0,
  }));

  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.workspaceRight).toBeLessThanOrEqual(
    geometry.clientWidth + 0.5,
  );
});

test("sends a public reply only through the selected conversation and shows the server receipt", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  const composer = page.getByRole("textbox", {
    name: "Текст ответа пользователю",
  });
  await expect(composer).toBeVisible();
  await composer.fill("Проверил обращение и вернусь с ответом сегодня.");
  await page.getByRole("button", { name: "Отправить пользователю" }).click();

  await expect(composer).toHaveValue("");
  await expect(
    page.getByText("Проверил обращение и вернусь с ответом сегодня.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Сообщение доставлено пользователю.", { exact: true }),
  ).toBeVisible();
});

test("keeps the selected operator workspace free of serious structural accessibility violations", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
});

test("moves through visible inbox rows with j/k and arrows without hijacking inputs", async ({
  page,
}) => {
  const rows = page.locator(".conversation-row");
  await expect(rows).toHaveCount(3);

  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect(page.locator(".conversation-row.selected")).toHaveCount(1);

  await page.keyboard.press("j");
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_2$/);
  await expect(page.locator(".conversation-row.selected")).toHaveCount(1);

  await page
    .getByRole("region", { name: "Статус для новых обращений" })
    .locator("select")
    .first()
    .focus();
  await page.keyboard.press("k");
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_2$/);
});

test("shows and changes only the operator's authoritative availability intent", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Моя доступность" }).click();
  const status = page.getByRole("region", {
    name: "Статус для новых обращений",
  });
  await expect(status).toBeVisible();
  await expect(
    status.getByText("Доступен", { exact: true }).first(),
  ).toBeVisible();
  await expect(status).toContainText("Получаете новые обращения");

  const selects = status.locator("select");
  await selects.nth(0).selectOption("AWAY");
  await expect(selects.nth(1)).toHaveValue("BREAK");
  await expect(status.locator('input[type="number"]')).toHaveValue("15");
  await status.getByRole("button", { name: "Сохранить статус" }).click();

  await expect(
    status.getByText("Отошёл", { exact: true }).first(),
  ).toBeVisible();
  await expect(status).toContainText("Новые обращения не назначаются");
});

test("switches between conversations and Cases without mixing their lists", async ({
  page,
}) => {
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  await expect(queue.getByRole("tab", { name: "Все диалоги" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await queue.getByRole("tab", { name: "Обращения" }).click();
  await expect(page).toHaveURL(/\/support\/inbox\?view=cases$/);
  await expect(
    queue.getByRole("heading", { name: "Обращения", level: 2 }),
  ).toBeVisible();
  await expect(queue.locator(".case-row").first()).toBeVisible();
  await expect(queue.locator(".conversation-row")).toHaveCount(0);

  await queue.locator(".case-row").first().click();
  await expect(page).toHaveURL(/\/support\/inbox\/cases\/[^?]+\?view=cases$/);
  await expect(page.locator(".conversation-header h2")).toBeVisible();
  await expect(page.locator(".context-pane")).toContainText("Обращение");
});

test("expands the workspace without leaving the operator workflow", async ({
  page,
}) => {
  await page.getByRole("button", { name: "На весь экран" }).click();
  await expect(page.locator(".support-workspace-page")).toHaveClass(
    /support-workspace-page--fullscreen/,
  );

  await page.keyboard.press("Escape");
  await expect(page.locator(".support-workspace-page")).not.toHaveClass(
    /support-workspace-page--fullscreen/,
  );
});

test("shows only the operator's server-authoritative routing offers", async ({
  page,
}) => {
  const offers = page.getByRole("region", { name: "Предложения из очереди" });

  await expect(offers).toBeVisible();
  await expect(offers).toContainText("Активных предложений сейчас нет.");
  await expect(offers.getByText(/assignmentId|offerToken|queueId/)).toHaveCount(
    0,
  );
});

test("does not substitute another conversation for an unavailable deep link", async ({
  page,
}) => {
  await page.goto("/support/inbox/conversations/conv_not_available");

  await expect(
    page.getByRole("heading", { level: 2, name: "Диалог недоступен" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Бонусы и программа лояльности",
    }),
  ).not.toBeVisible();
});

test("uses route-aware inbox and chat panes on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox");

  await expect(
    page.getByRole("heading", { level: 2, name: "Активный диалог" }),
  ).not.toBeVisible();

  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect(
    page.getByRole("button", { name: "Назад к списку диалогов" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Назад к списку диалогов" }).click();
  await expect(page).toHaveURL(/\/support\/inbox$/);
});

test("opens the selected conversation context in a mobile drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await page.getByRole("button", { name: "Контекст" }).click();

  const drawer = page.getByRole("dialog", { name: "Контекст диалога" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("dt", { hasText: "Пользователь" })).toBeVisible();
  await expect(drawer.locator("dd", { hasText: "Пользователь" })).toBeVisible();
  await expect(drawer.getByText("user_11603", { exact: true })).toHaveCount(0);
});

test("loads the profile only from the permission-gated inspector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await page.getByRole("button", { name: "Контекст" }).click();

  const drawer = page.getByRole("dialog", { name: "Контекст диалога" });
  await expect(drawer.getByText("Marco Silva", { exact: true })).toHaveCount(0);
  await drawer.getByRole("tab", { name: "Данные" }).click();
  await drawer.getByRole("button", { name: "Загрузить" }).click();
  await expect(drawer.getByText("Marco Silva", { exact: true })).toBeVisible();
  await expect(drawer.getByText("user_11603", { exact: true })).toHaveCount(0);

  await drawer.getByRole("tab", { name: "Активность" }).click();
  await expect(
    drawer.getByText(/Presence — это только краткая подсказка/),
  ).toBeVisible();
});
