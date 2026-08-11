import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/support/settings/notifications/new-cases");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Уведомления о новых обращениях",
    }),
  ).toBeVisible();
});

test("previews, saves and publishes a project policy without changing personal settings", async ({
  page,
}) => {
  await expect(page.getByText("Зависит от подписки и браузера")).toBeVisible();
  await expect(page.getByText("Сохранение не включает доставку")).toBeVisible();

  await page.getByRole("button", { name: "Проверить влияние" }).first().click();
  await expect(page.getByText("Безопасные примеры")).toBeVisible();
  await expect(page.getByText("456", { exact: true })).toBeVisible();
  await expect(page.getByText(/Здесь нет номера обращения/)).toBeVisible();

  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Черновик сохранён.")).toBeVisible();

  await page.getByRole("button", { name: "Проверить влияние" }).first().click();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Опубликовать политику?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("Политика опубликована.")).toBeVisible();
  await expect(page.getByText("Работает", { exact: true })).toBeVisible();

  await page.getByText("Сводкой", { exact: true }).click();
  await page
    .locator('[data-field="effectiveUntil"] input')
    .fill("2026-08-20T12:00");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Черновик сохранён.")).toBeVisible();
  await page.getByRole("button", { name: "Проверить влияние" }).first().click();
  await expect(
    page.getByText("Период действия", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/до 20 авг/)).toBeVisible();
  await expect(page.getByText("21", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  const digestDialog = page.getByRole("dialog", {
    name: "Опубликовать политику?",
  });
  await expect(digestDialog).toContainText("до 20 авг");
  await digestDialog.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("Политика опубликована.")).toBeVisible();

  const personalPreferences = await page.evaluate(() => {
    const raw = sessionStorage.getItem("support-notifications-source-mock:v1");
    return raw ? JSON.parse(raw).preferences : null;
  });
  expect(personalPreferences).toBeNull();
});

test("is responsive, keyboard reachable and has no serious accessibility violations", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 1024, height: 768 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(
        "support-case-notification-" + viewport.name + ".png",
      ),
    });
  }

  const previewButton = page
    .getByRole("button", { name: "Проверить влияние" })
    .first();
  await previewButton.focus();
  await expect(previewButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Безопасные примеры")).toBeVisible();
});
