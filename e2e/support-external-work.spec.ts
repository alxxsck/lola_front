import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function openCaseIntegrations(page: Page): Promise<void> {
  await page.goto("/support/inbox/cases/case-demo-deposit?mode=cases");
  await expect(
    page.getByRole("region", { name: "Диалог: Первый депозит" }),
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) < 768)
    await page.getByRole("button", { name: "Контекст" }).click();
  await page.getByRole("tab", { name: "Интеграции" }).click();
  await expect(page.locator(".integrations-section")).toBeVisible();
}

async function resolveInitialUnknown(page: Page): Promise<void> {
  const pane = page.locator(".integrations-section");
  const action = pane.getByRole("button", { name: "Разобрать UNKNOWN" });
  if (!(await action.isVisible())) return;
  await action.click();
  const dialog = page.getByRole("dialog", {
    name: "Разобрать неизвестный результат",
  });
  await dialog.getByRole("textbox", { name: "Remote item ID" }).fill("SUP-731");
  await dialog.getByRole("button", { name: "Подтвердить решение" }).click();
  await expect(dialog).toBeHidden();
  await expect(pane.getByText("Создано.", { exact: true })).toBeVisible();
}

test("admin verifies connection and completes the versioned mapping evidence loop", async ({
  page,
}) => {
  await login(page);
  await page.goto("/support/settings/integrations");

  await expect(
    page.getByRole("heading", { level: 1, name: "Интеграции External Work" }),
  ).toBeVisible();
  await expect(
    page.getByText("JSM · Support cloud", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("HelpDesk · Tier 2", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Требуется повторный вход")).toBeVisible();

  await page.getByRole("button", { name: "Проверить connection" }).click();
  await expect(
    page.getByText(/Проверка connection подтверждена сервером/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(page.getByText(/Пройдено · 1 правил/)).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(
    page.getByText(/Schema и destination подтверждены сервером/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Показать diff" }).click();
  await expect(page.getByText(/Draft #/).last()).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("operator reconstructs compatibility and UNKNOWN command causality without duplicate create", async ({
  page,
}) => {
  await login(page);
  await page.goto("/support/external-work");

  await expect(
    page.getByRole("heading", { level: 1, name: "External Work" }),
  ).toBeVisible();
  await page.getByTestId("external-item").first().click();
  await expect(page.getByText("Correlation", { exact: true })).toBeVisible();
  await expect(page.getByText("Причинная история")).toBeVisible();
  await expect(page.getByText(/содержимое недоступно/i)).toBeVisible();

  await page.getByRole("button", { name: "Связанные объекты" }).click();
  await page.getByTestId("external-item").first().click();
  await expect(page.getByText("Результат неизвестен")).toBeVisible();
  await page.getByRole("button", { name: "Проверить доказательства" }).click();
  await expect(page.getByText(/Recovery-команда подтверждена/)).toBeVisible();
  await expect(page.getByText("Создано")).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("route-owned selection supports keyboard, Back and tablet geometry", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/support/external-work?mode=linked");

  const item = page.getByTestId("external-item").first();
  await item.focus();
  await item.press("Enter");
  await expect(page).toHaveURL(/mode=linked.*itemId=/);
  await expect(page.getByText("Correlation", { exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/mode=linked/);
  await expect(page).not.toHaveURL(/itemId=/);
  await expect(item).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
});

test("Case inspector creates governed external work and copies remote text only to draft", async ({
  page,
}) => {
  await login(page);
  await openCaseIntegrations(page);
  const pane = page.locator(".integrations-section");
  await resolveInitialUnknown(page);

  await expect(pane.getByText("HTTP 202 остаётся pending")).toBeVisible();
  await pane.getByTestId(/external-link-/).click();
  await expect(pane.getByText("В JSM").first()).toBeVisible();
  await expect(
    pane.getByText("Внутренний", { exact: true }).first(),
  ).toBeVisible();

  await pane
    .getByRole("button", { name: "Копировать в черновик ответа" })
    .first()
    .click();
  const replyDraft = page.getByRole("textbox", { name: "Ответ пользователю" });
  await expect(replyDraft).toHaveValue(
    "Reconciliation requested after provider timeout.",
  );

  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "Контекст" }).click();
    await page.getByRole("tab", { name: "Интеграции" }).click();
  }
  await pane.getByTestId("external-create-open").click();
  const dialog = page.getByRole("dialog", { name: "Создать внешнюю заявку" });
  await expect(dialog.getByText(/История чата не копируется/)).toBeVisible();
  await dialog
    .getByText("Заголовок во внешней системе")
    .locator("..")
    .getByRole("textbox")
    .fill("Provider timeout evidence");
  await dialog
    .getByText("Редактируемое описание")
    .locator("..")
    .getByRole("textbox")
    .fill("Только проверенный safe context");
  await dialog.getByRole("button", { name: "Принять в очередь" }).click();
  await expect(dialog).toBeHidden();
  await expect(pane.getByText(/В очереди\. Ждём подтверждения/)).toBeVisible();
  await expect(pane.getByTestId("external-create-open")).toBeDisabled();

  const accessibility = await new AxeBuilder({ page })
    .include(".integrations-section")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
});

test("Case inspector keeps PUBLIC explicit and confirms destructive unlink", async ({
  page,
}) => {
  await login(page);
  await openCaseIntegrations(page);
  const pane = page.locator(".integrations-section");
  await resolveInitialUnknown(page);
  await pane.getByTestId(/external-link-/).click();

  await pane.getByRole("button", { name: "Отвязать" }).click();
  const unlink = page.getByRole("dialog", { name: "Отвязать внешнюю заявку?" });
  await expect(
    unlink.getByText(/Внешний объект и его история не удаляются/),
  ).toBeVisible();
  await unlink.getByRole("button", { name: "Отмена" }).click();
  await expect(unlink).toBeHidden();

  await pane.getByRole("button", { name: "Публичный" }).click();
  await pane
    .getByRole("textbox", { name: "Текст внешнего комментария" })
    .fill("Подтверждённый публичный комментарий");
  await pane
    .getByRole("button", { name: "Отправить публичный комментарий" })
    .click();
  await expect(pane.getByText(/Подтвердите публичный/)).toBeVisible();
  await pane
    .getByText(/Подтверждаю, что текст будет виден/)
    .locator("..")
    .getByRole("checkbox")
    .check();
  await pane
    .getByRole("button", { name: "Отправить публичный комментарий" })
    .click();
  await expect(pane.getByText(/В очереди\. Ждём подтверждения/)).toBeVisible();
});
